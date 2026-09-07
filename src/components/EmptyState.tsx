import { SUGGESTIONS } from '../types';

export default function EmptyState({ onAsk }: { onAsk: (q: string) => void }) {
  return (
    <div className="empty-wrap">
      <div className="hero">
        <h1>
          嗨，我是你的<span className="grad-text">AgentDemo</span>
        </h1>
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
