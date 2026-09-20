import { SUGGESTIONS } from '../types';

export default function EmptyState({ onAsk }: { onAsk: (q: string) => void }) {
  return (
    <div className="empty-wrap">
      <div className="hero">
        <div className="hero-kicker"><span className="hero-kicker-dot" /> bobo</div>
        <h1>今天想一起去哪里？</h1>
        <p>从天气、灵感到完整行程，让我帮你把想法变成下一站。</p>
      </div>
      <div className="sugg-grid">
        {SUGGESTIONS.map((s) => (
          <button key={s.title} className="sugg-card" onClick={() => onAsk(s.ask)}>
            <span className="sugg-ic">{s.icon}</span>
            <span style={{ minWidth: 0 }}>
              <div className="sugg-t">{s.title}</div>
              <div className="sugg-d">{s.desc}</div>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
