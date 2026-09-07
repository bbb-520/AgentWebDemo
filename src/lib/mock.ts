import type { ChatEvent } from '../types';
import { EVENT } from '../types';
import { estimateTokens } from './format';

/**
 * 演示模式：本地模拟一个「旅行助手 Agent」。
 *
 * 与真实后端协议完全一致（FRONTEND_SSE_LIVE_REQUIREMENTS.md §3）：
 * 输出 SESSION_INFO → REASONING → TOOL_CALL_STARTED → (RESULT | FAILED)
 * → DATA… → USAGE → STOP 的完整“直播”事件序列，不含任何网络请求。
 * 这样演示模式与直连后端共用同一套直播 UI 与状态机。
 */

export interface MockCallbacks {
  onEvent: (e: ChatEvent) => void;
}

export type MockResult = { kind: 'done' } | { kind: 'aborted' };

interface CityWeather {
  weather: string;
  temp: number;
  range: string;
  humidity: number;
  wind: string;
  advice: string;
  attractions: { name: string; reason: string; best: string }[];
}

const WEATHER_KIND: Record<string, { text: string; emoji: string }> = {
  晴: { text: '晴', emoji: '☀️' },
  多云: { text: '多云', emoji: '⛅' },
  阴: { text: '阴', emoji: '☁️' },
  小雨: { text: '小雨', emoji: '🌦️' },
  雷阵雨: { text: '雷阵雨', emoji: '⛈️' },
};

const CITIES: Record<string, CityWeather> = {
  北京: {
    weather: '晴', temp: 26, range: '18 ~ 29°C', humidity: 41, wind: '西北风 3 级',
    advice: '秋高气爽，昼夜温差较大，早晚记得加一件薄外套。',
    attractions: [
      { name: '故宫博物院', reason: '历史底蕴深厚，秋日红墙金瓦光影极佳', best: '晴' },
      { name: '八达岭长城', reason: '能见度高，登高望远视野开阔', best: '晴' },
      { name: '颐和园', reason: '昆明湖畔微风不燥，适合散步与游船', best: '晴或多云' },
      { name: '奥林匹克森林公园', reason: '城市绿肺，骑行与慢跑都很舒服', best: '晴' },
    ],
  },
  上海: {
    weather: '多云', temp: 28, range: '22 ~ 31°C', humidity: 62, wind: '东南风 2 级',
    advice: '体感偏闷热，建议穿透气衣物并随身带伞。',
    attractions: [
      { name: '外滩', reason: '傍晚看陆家嘴天际线亮灯最佳', best: '多云或晴' },
      { name: '上海迪士尼乐园', reason: '多云天气排队体验相对友好', best: '晴或小雨' },
      { name: '武康路', reason: '梧桐树荫下的老洋房citywalk路线', best: '多云' },
    ],
  },
  杭州: {
    weather: '多云', temp: 27, range: '21 ~ 30°C', humidity: 55, wind: '东风 2 级',
    advice: '天气舒适，适合户外活动，午后偶有薄云。',
    attractions: [
      { name: '西湖', reason: '「晴西湖不如雨西湖」各有风味，环湖骑行很惬意', best: '晴或多云' },
      { name: '灵隐寺', reason: '林木清幽，适合静心游览', best: '晴' },
      { name: '西溪湿地', reason: '坐摇橹船穿行芦苇荡，别有意境', best: '多云' },
    ],
  },
  成都: {
    weather: '小雨转阴', temp: 23, range: '19 ~ 25°C', humidity: 78, wind: '微风',
    advice: '空气湿润，出门记得带伞，穿防滑鞋。',
    attractions: [
      { name: '大熊猫繁育研究基地', reason: '清晨熊猫最活跃，建议尽早入园', best: '阴或小雨' },
      { name: '宽窄巷子', reason: '雨天逛巷子别有情调，茶馆里喝盖碗茶', best: '任意' },
      { name: '都江堰', reason: '雨后的青山云雾缭绕，气势更足', best: '小雨或阴' },
    ],
  },
  广州: {
    weather: '晴', temp: 31, range: '26 ~ 34°C', humidity: 68, wind: '南风 2 级',
    advice: '炎热，注意防晒补水，午后尽量避免暴晒。',
    attractions: [
      { name: '广州塔', reason: '登塔看珠江夜景，晴夜视野最好', best: '晴' },
      { name: '沙面岛', reason: '欧陆风情建筑群，绿荫浓密适合漫步', best: '晴或多云' },
      { name: '永庆坊', reason: '老西关与新潮文化碰撞，适合拍照', best: '多云' },
    ],
  },
  深圳: {
    weather: '多云', temp: 30, range: '26 ~ 33°C', humidity: 70, wind: '东南风 3 级',
    advice: '较热但海风怡人，去海边注意防晒。',
    attractions: [
      { name: '大梅沙海滨公园', reason: '沙滩细软，晴天海水更蓝', best: '晴' },
      { name: '深圳湾公园', reason: '骑行道沿海而建，傍晚看日落绝佳', best: '晴或多云' },
      { name: '世界之窗', reason: '一站式看世界地标，适合亲子', best: '多云' },
    ],
  },
  西安: {
    weather: '晴', temp: 25, range: '17 ~ 28°C', humidity: 45, wind: '东北风 2 级',
    advice: '干燥少雨，注意补水，昼夜温差明显。',
    attractions: [
      { name: '秦始皇帝陵博物院(兵马俑)', reason: '世界奇迹，建议请讲解更震撼', best: '任意' },
      { name: '城墙', reason: '傍晚租自行车骑行一圈，看古城落日', best: '晴' },
      { name: '大唐不夜城', reason: '夜晚灯火辉煌，汉服体验人气高', best: '任意' },
    ],
  },
  厦门: {
    weather: '晴', temp: 29, range: '24 ~ 32°C', humidity: 72, wind: '东南风 3 级',
    advice: '海岛气候，紫外线强，做好防晒、备好薄外套。',
    attractions: [
      { name: '鼓浪屿', reason: '万国建筑与海浪声，慢慢逛最舒服', best: '晴或多云' },
      { name: '环岛路', reason: '骑行看海，椰风寨一带风景尤佳', best: '晴' },
      { name: '沙坡尾', reason: '文艺渔港与创意小店聚集地', best: '多云' },
    ],
  },
  重庆: {
    weather: '多云', temp: 27, range: '22 ~ 31°C', humidity: 66, wind: '北风 1 级',
    advice: '山地城市步行较多，穿舒适的鞋。',
    attractions: [
      { name: '洪崖洞', reason: '夜景「千与千寻」同款，人从众但值得一看', best: '任意' },
      { name: '长江索道', reason: '飞渡长江看两江交汇，晴天视野佳', best: '晴' },
      { name: '磁器口古镇', reason: '石板路与麻花香味，老重庆味道', best: '多云' },
    ],
  },
  三亚: {
    weather: '晴', temp: 32, range: '27 ~ 34°C', humidity: 75, wind: '东南风 3 级',
    advice: '炎热潮湿，注意防晒，下水前留意浪况。',
    attractions: [
      { name: '亚龙湾', reason: '沙质细腻海水清澈，度假首选', best: '晴' },
      { name: '蜈支洲岛', reason: '潜水与水上项目丰富，晴天下海水更透', best: '晴' },
      { name: '天涯海角', reason: '地标打卡，傍晚看日落浪漫', best: '晴或多云' },
    ],
  },
};

/** 记忆：同一会话内记住最近聊过的城市，支持“那它适合玩几天”这类指代追问 */
const memory = new Map<string, string>();

const CITY_KEYS = Object.keys(CITIES);

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('aborted', 'AbortError'));
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException('aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function pickCity(question: string, sessionId: string): string | null {
  for (const c of CITY_KEYS) {
    if (question.includes(c)) {
      memory.set(sessionId, c);
      return c;
    }
  }
  return memory.get(sessionId) ?? null;
}

function normalize(weather: string): { text: string; emoji: string } {
  const key = (Object.keys(WEATHER_KIND) as string[]).find((k) => weather.includes(k));
  if (key) return WEATHER_KIND[key];
  return { text: weather, emoji: '🌤️' };
}

function weatherText(city: string, w: CityWeather): string {
  const k = normalize(w.weather);
  return `${k.emoji} ${city}今日${k.text}，气温 ${w.range}（当前约 ${w.temp}°C），湿度 ${w.humidity}%，${w.wind}。${w.advice}`;
}

function chunkText(text: string, size = 12): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

function buildAnswer(question: string, city: string | null, wantWeather: boolean, wantTrip: boolean): string {
  if (!city) {
    return (
      '我还没有掌握这座城市的实时数据（演示模式仅内置部分城市示例 🌰）。\n\n' +
      '你可以试试问我：**北京今天天气怎么样？**、**杭州适合去哪玩？** 或 **帮我规划西安两日游** 等。'
    );
  }
  const w = CITIES[city];
  const lines: string[] = [];
  if (wantWeather) {
    lines.push(`为你查到 **${city}** 的实时天气（模拟数据）：`);
    lines.push('');
    lines.push(`> ${weatherText(city, w)}`);
  }
  if (wantTrip) {
    lines.push('');
    if (!wantWeather) lines.push(`来，关于 **${city}** 的玩法，我按当前天气帮你筛好了：`);
    else lines.push(`\n结合 ${city} 当前天气，推荐这几个地方：`);
    lines.push('');
    const pool = w.attractions.slice(0, 3);
    pool.forEach((a, i) => {
      const badge = normalize(a.best).emoji;
      lines.push(`${i + 1}. **${a.name}** — ${a.reason}（适合${a.best}${badge}）`);
    });
    lines.push('');
    lines.push('— —');
    lines.push('');
    lines.push(
      `💡 小贴士：${w.advice} 建议把需要户外观光的安排在上午，中午炎热时段安排室内或用餐。`,
    );
  }
  if (lines.length === 0) {
    lines.push(`关于 **${city}**：今天天气不错，适合出门走走（演示模式）。`);
  }
  return lines.join('\n');
}

/** 事件发送小助手：发送后返回小延时，保证 UI 逐帧“直播”呈现 */
type Emitter = (eventType: number, eventData: unknown) => Promise<void>;

/**
 * 跑一段模拟的 Agent 直播流（输出与真实后端同构的事件序列）。
 * 触发词：城市 + 天气/景点类问题；含 “模拟失败” 关键字可演示 1008 工具失败兜底。
 */
export async function runMockAgent(
  sessionId: string,
  question: string,
  signal: AbortSignal,
  cb: MockCallbacks,
): Promise<MockResult> {
  const startedAt = Date.now();
  const city = pickCity(question, sessionId);
  const wantWeather = /天气|气温|温度|冷不冷|热不热|下雨|穿衣|适不适合出门|湿度/.test(question);
  const wantTrip =
    !wantWeather ||
    /景点|去哪玩|好玩|推荐|旅游|旅行|行程|安排|攻略|两日|三日|路线|度假|海边/.test(question);
  const simFail = /模拟失败|测试失败|演示失败/.test(question) && !!city;

  const emit: Emitter = async (eventType, eventData) => {
    cb.onEvent({ eventType, eventData });
    await delay(30, signal);
  };

  try {
    // 首帧：会话元信息
    await emit(EVENT.SESSION_INFO, {
      conversationId: `chat-${sessionId}`,
      timestamp: Date.now(),
    });
    await delay(320, signal);

    // —— 工具执行阶段 ——
    if (city && (wantWeather || wantTrip)) {
      const w = CITIES[city];

      if (wantWeather) {
        await emit(EVENT.REASONING, `需要先获取 ${city} 的实时天气数据。`);
        await emit(EVENT.TOOL_CALL_STARTED, {
          toolCallId: `mock-${Date.now()}`,
          toolName: 'getWeather',
          arguments: JSON.stringify({ city }),
        });
        if (simFail) {
          await delay(820, signal);
          await emit(EVENT.TOOL_CALL_FAILED, {
            toolName: 'getWeather',
            error: '气象服务暂时不可用（本地演示的失败场景）',
          });
        } else {
          await delay(900, signal);
          await emit(EVENT.TOOL_CALL_RESULT, {
            toolName: 'getWeather',
            result: weatherText(city, w),
          });
        }
      }

      if (wantTrip) {
        const kind = normalize(w.weather).text;
        if (wantWeather) {
          if (simFail) {
            await emit(EVENT.REASONING, '实时接口不可用，改用本地缓存天气继续筛选。');
          } else {
            await emit(EVENT.REASONING, `当前 ${city} 天气为「${kind}」，据此筛选适合的景点。`);
          }
        }
        await emit(EVENT.TOOL_CALL_STARTED, {
          toolCallId: `mock-${Date.now()}`,
          toolName: 'getAttraction',
          arguments: JSON.stringify({ city, weather: kind }),
        });
        if (simFail) {
          await delay(760, signal);
          await emit(EVENT.TOOL_CALL_FAILED, {
            toolName: 'getAttraction',
            error: '景点检索服务超时（本地演示的失败场景）',
          });
        } else {
          await delay(940, signal);
          const names = w.attractions.slice(0, 3).map((a) => a.name).join('、');
          await emit(EVENT.TOOL_CALL_RESULT, {
            toolName: 'getAttraction',
            result: `已从 ${w.attractions.length} 个候选中按天气筛出 3 个：${names}。`,
          });
        }
      }
    } else if (city) {
      await emit(EVENT.REASONING, `问题不涉及实时数据，直接基于常识回答。`);
    }

    // —— 最终回答：流式增量 ——
    const base = buildAnswer(question, city, wantWeather, wantTrip);
    const answer = simFail
      ? `⚠️ 刚才有工具调用失败，我改用备用方案为你整理：\n\n${base}`
      : base;
    for (const t of chunkText(answer)) {
      if (signal.aborted) throw new DOMException('aborted', 'AbortError');
      await emit(EVENT.DATA, t);
      await delay(16 + Math.random() * 24, signal);
    }

    // —— 用量 + 正常收尾 ——
    const completion = estimateTokens(answer);
    const usage = {
      promptTokens: 86 + estimateTokens(question) * 2,
      completionTokens: completion,
      totalTokens: 86 + estimateTokens(question) * 2 + completion,
      durationMs: Date.now() - startedAt,
    };
    await emit(EVENT.USAGE, usage);
    await emit(EVENT.STOP, null);
    return { kind: 'done' };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return { kind: 'aborted' };
    throw err;
  }
}
