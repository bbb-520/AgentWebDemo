import { SUGGESTIONS } from '../types';

export default function EmptyState({ onAsk }: { onAsk: (q: string) => void }) {
  return (
    <div className="empty-wrap">
      <div className="hero">
        <div className="hero-kicker"><span className="hero-kicker-dot" /> bobo</div>
        <h1>今天想让哪张照片继续生长？</h1>
        <p>上传一张照片，再说说你想保留、改变或重新想象的部分。</p>
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
