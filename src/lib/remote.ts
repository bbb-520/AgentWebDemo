import type { ChatMsg, RemoteMessage } from '../types';
import { uid } from './storage';

/**
 * 把后端 Redis 二级记忆的结构化消息（GET /messages 分页 / /messages/all）
 * 转为前端消息列表（纯函数，无副作用）。
 *
 * 规则（FRONTEND_REQUIREMENTS.md §4.5 / §7.5）：
 * - USER/ASSISTANT 按时间升序保留为普通对话消息；
 * - SYSTEM 且 metadata.summary=true 的压缩摘要：仅取最新一条（信息覆盖最全），
 *   作为 role='system' 的摘要卡置顶展示，避免多条摘要内容重复堆叠；
 * - TOOL / 非摘要 SYSTEM：本项目不入库，忽略。
 *
 * @returns 无任何可展示内容时返回 null（此时调用方应回退到旧文本 /history 接口）。
 */
export function remoteToChatMsgs(
  records: RemoteMessage[],
): { msgs: ChatMsg[]; chatCount: number; hasSummary: boolean } | null {
  const chats: ChatMsg[] = [];
  let summaryRec: RemoteMessage | null = null;

  for (const r of records) {
    if (!r || typeof r.messageType !== 'string') continue;
    const parsed = Date.parse(r.timestamp);
    const createdAt = Number.isNaN(parsed) ? Date.now() : parsed;
    const content = typeof r.content === 'string' ? r.content : '';

    if (r.messageType === 'USER') {
      chats.push({
        id: uid(),
        role: 'user',
        content,
        status: 'done',
        createdAt,
        seq: r.seq, // 透传后端序号：搜索跳转 data-seq 定位的地基（API.md §7.2 F2）
      });
    } else if (r.messageType === 'ASSISTANT') {
      chats.push({
        id: uid(),
        role: 'assistant',
        content,
        status: 'done',
        createdAt,
        seq: r.seq,
      });
    } else if (
      r.messageType === 'SYSTEM' &&
      r.metadata != null &&
      r.metadata.summary === true
    ) {
      // 摘要消息：时间戳越新覆盖范围越全，记录最新一条
      const ts = Number.isNaN(parsed) ? -1 : parsed;
      if (!summaryRec || ts >= (Date.parse(summaryRec.timestamp) || 0)) {
        summaryRec = r;
      }
    }
  }

  if (chats.length === 0 && !summaryRec) return null;

  let summary: ChatMsg | null = null;
  if (summaryRec) {
    const md = summaryRec.metadata ?? {};
    const ts = Date.parse(summaryRec.timestamp);
    summary = {
      id: uid(),
      role: 'system',
      content: typeof summaryRec.content === 'string' ? summaryRec.content : '',
      status: 'done',
      createdAt: Number.isNaN(ts) ? (chats[0]?.createdAt ?? Date.now()) - 1 : ts,
      seq: summaryRec.seq, // 摘要消息同样透传 seq（API.md §7.2 F2）
      summaryMeta: {
        summarizedCount:
          typeof md.summarizedCount === 'number' ? md.summarizedCount : undefined,
        rangeStart: typeof md.rangeStart === 'string' ? md.rangeStart : undefined,
        rangeEnd: typeof md.rangeEnd === 'string' ? md.rangeEnd : undefined,
      },
    };
  }

  return {
    msgs: summary ? [summary, ...chats] : chats,
    chatCount: chats.length,
    hasSummary: summary != null,
  };
}

/**
 * 把一次「搜索跳转补拉」得到的分页消息（remoteToChatMsgs 产物）合并进现有本地列表。
 *
 * 规则（API.md §7.2 F6 / A7）：
 * - 摘要卡（role='system'）全局至多保留最新一张（seq/createdAt 更大者胜），置顶；
 * - 普通消息按 seq 去重（补拉页与本地窗口重叠的部分不重复展示，以后端权威内容为准）；
 * - 排序：带 seq 的消息按 seq 升序（时间正序），本地新发、尚无 seq 的消息按 createdAt 升序排在末尾。
 */
export function mergeRemoteMsgs(existing: ChatMsg[], patch: ChatMsg[]): ChatMsg[] {
  if (!patch.length) return existing;
  if (!existing.length) return patch;

  const sumA = existing.find((m) => m.role === 'system') ?? null;
  const sumB = patch.find((m) => m.role === 'system') ?? null;
  let summary: ChatMsg | null = sumA;
  if (sumB) {
    const aSeq = typeof sumA?.seq === 'number';
    const bSeq = typeof sumB.seq === 'number';
    const bNewer =
      !sumA ||
      (aSeq && bSeq ? (sumB.seq as number) > (sumA.seq as number) : sumB.createdAt >= sumA.createdAt);
    if (bNewer) summary = sumB;
  }

  const body: ChatMsg[] = [];
  for (const m of [...existing, ...patch]) {
    if (m.role === 'system') continue;
    const key = typeof m.seq === 'number' ? `s:${m.seq}` : `id:${m.id}`;
    const idx = body.findIndex((x) => (typeof x.seq === 'number' ? `s:${x.seq}` : `id:${x.id}`) === key);
    if (idx >= 0) body[idx] = m; // 同 seq 以后端（patch）内容为准
    else body.push(m);
  }
  body.sort((x, y) => {
    const xk = typeof x.seq === 'number' ? 0 : 1;
    const yk = typeof y.seq === 'number' ? 0 : 1;
    if (xk !== yk) return xk - yk;
    if (typeof x.seq === 'number' && typeof y.seq === 'number') return x.seq - y.seq;
    return x.createdAt - y.createdAt;
  });

  return summary ? [summary, ...body] : body;
}
