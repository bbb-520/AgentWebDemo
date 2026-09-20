import { Fragment, type ReactNode } from 'react';

/**
 * 轻量 Markdown 渲染（不引入第三方依赖）。
 * 支持：代码块、行内代码、粗体/斜体、链接、标题、无序/有序列表、引用、分隔线。
 * 安全策略：所有文本都以 React 文本节点渲染（React 会自动转义，无需手写 esc()，
 * 手动转义反而会造成 `&lt;` 这类实体字面量双转义）；仅链接 href 用 safeUrl 白名单校验。
 */

function safeUrl(u: string): string {
  return /^(https?:|mailto:)/i.test(u.trim()) ? u.trim() : '#';
}

/* ---------- 行内解析：**粗体** `代码` *斜体* [文字](链接) ---------- */

const INLINE_RE = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*|\[[^\]\n]+\]\([^)\n]+\))/g;
const LINK_RE = /^\[([^\]\n]+)\]\(([^)\n]+)\)$/;
const BOLD_RE = /^\*\*(.+)\*\*$/s;
const ITALIC_RE = /^\*(.+)\*$/s;

function renderInline(text: string, keyBase: string): ReactNode[] {
  const parts = text.split(INLINE_RE);
  const nodes: ReactNode[] = [];
  parts.forEach((part, i) => {
    const key = `${keyBase}-${i}`;
    if (!part) return;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      nodes.push(<strong key={key}>{renderInline(part.replace(BOLD_RE, '$1'), key + 'b')}</strong>);
    } else if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      nodes.push(
        <code key={key} className="md-code">
          {part.slice(1, -1)}
        </code>,
      );
    } else if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      nodes.push(<em key={key}>{renderInline(part.replace(ITALIC_RE, '$1'), key + 'i')}</em>);
    } else {
      const m = part.match(LINK_RE);
      if (m) {
        nodes.push(
          <a key={key} href={safeUrl(m[2])} target="_blank" rel="noreferrer">
            {renderInline(m[1], key + 'a')}
          </a>,
        );
      } else {
        // 纯文本需要转义（node 渲染后为字符串，无法用 dangerouslySetInnerHTML）
        nodes.push(<Fragment key={key}>{part}</Fragment>);
      }
    }
  });
  return nodes;
}

/* ---------- 纯文本段落渲染（React 文本节点自带 HTML 转义，防 XSS） ---------- */
function PlainText({ text }: { text: string }) {
  return <>{text}</>;
}

/* ---------- 块级渲染 ---------- */

interface BlockProps {
  lines: string[];
  kind: 'p' | 'ul' | 'ol' | 'quote';
  groupKey: string;
}

function Block({ lines, kind, groupKey }: BlockProps) {
  if (kind === 'ul' || kind === 'ol') {
    const items = lines.map((l) =>
      kind === 'ul' ? l.replace(/^[-*•]\s+/, '') : l.replace(/^\d+[.、)]\s*/, ''),
    );
    const Tag = kind === 'ul' ? 'ul' : 'ol';
    return (
      <Tag className={`md-${kind}`}>
        {items.map((item, i) => (
          <li key={`${groupKey}-li-${i}`}>{renderInline(item, `${groupKey}-li-${i}`)}</li>
        ))}
      </Tag>
    );
  }
  if (kind === 'quote') {
    return (
      <blockquote key={groupKey} className="md-quote">
        {lines.map((l, i) => (
          <Fragment key={i}>
            <PlainText text={l.replace(/^>\s?/, '')} />
            {i < lines.length - 1 && <br />}
          </Fragment>
        ))}
      </blockquote>
    );
  }
  return (
    <p key={groupKey} className="md-p">
      {lines.map((l, i) => (
        <Fragment key={i}>
          {renderInline(l, `${groupKey}-p-${i}`)}
          {i < lines.length - 1 && <br />}
        </Fragment>
      ))}
    </p>
  );
}

/* ---------- 组件入口 ---------- */

export default function Markdown({ content }: { content: string }) {
  // 1) 先抽出代码块
  const segs: { kind: 'code' | 'md'; lang?: string; text: string }[] = [];
  const fenceRe = /```([\w+#-]*)\r?\n([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(content))) {
    if (m.index > last) segs.push({ kind: 'md', text: content.slice(last, m.index) });
    segs.push({ kind: 'code', lang: m[1] || 'text', text: m[2].replace(/\n$/, '') });
    last = m.index + m[0].length;
  }
  if (last < content.length) segs.push({ kind: 'md', text: content.slice(last) });

  const out: ReactNode[] = [];
  let globalKey = 0;
  const mkKey = () => `md-${globalKey++}`;

  segs.forEach((seg) => {
    if (seg.kind === 'code') {
      out.push(
        <pre key={mkKey()} className="md-pre">
          <div className="md-pre-head">
            <span className="md-dots">
              <i />
              <i />
              <i />
            </span>
            <span className="md-lang">{seg.lang}</span>
          </div>
          <code>{seg.text}</code>
        </pre>,
      );
      return;
    }

    // 2) 按空行切段，段内再按行分类
    const groups: { kind: 'p' | 'ul' | 'ol' | 'quote' | 'h' | 'hr'; level?: number; lines: string[] }[] = [];
    for (const rawPara of seg.text.split(/\n\s*\n/)) {
      const para = rawPara.replace(/^\n+|\n+$/g, '');
      if (!para.trim()) continue;
      const lines = para.split('\n');
      let buf: string[] = [];
      let bufKind: 'p' | 'ul' | 'ol' | 'quote' | null = null;

      const flush = () => {
        if (buf.length && bufKind) groups.push({ kind: bufKind, lines: buf });
        buf = [];
        bufKind = null;
      };

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        // 标题 / 分隔线
        const h = line.match(/^(#{1,6})\s+(.+)$/);
        if (h) {
          flush();
          groups.push({ kind: 'h', level: h[1].length, lines: [h[2]] });
          continue;
        }
        if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
          flush();
          groups.push({ kind: 'hr', lines: [] });
          continue;
        }

        let kind: 'ul' | 'ol' | 'quote' | 'p';
        if (/^[-*•]\s+/.test(line)) kind = 'ul';
        else if (/^\d+[.、)]\s+/.test(line)) kind = 'ol';
        else if (line.startsWith('>')) kind = 'quote';
        else kind = 'p';

        if (bufKind === null) bufKind = kind;
        else if (bufKind !== kind && !(kind === 'p' && bufKind === 'quote')) {
          flush();
          bufKind = kind;
        }
        buf.push(line);
      }
      flush();
    }

    groups.forEach((g) => {
      const key = mkKey();
      if (g.kind === 'h') {
        const level = Math.min(Math.max(g.level ?? 2, 2), 4);
        const Tag = (`h${level}` in { h2: 1, h3: 1, h4: 1 } ? `h${level}` : 'h3') as 'h2' | 'h3' | 'h4';
        out.push(
          <Tag key={key} className="md-h">
            {renderInline(g.lines[0], key + '-h')}
          </Tag>,
        );
      } else if (g.kind === 'hr') {
        out.push(<hr key={key} className="md-hr" />);
      } else {
        out.push(<Block key={key} lines={g.lines} kind={g.kind} groupKey={key} />);
      }
    });
  });

  return <div className="md">{out}</div>;
}
