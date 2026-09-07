import { useEffect, useState } from 'react';

/** 通用“等待中”指示：打字机小圆点 + 文案 */
export function Thinking({ label }: { label: string }) {
  return (
    <div className="thinking">
      <span className="typing-dots">
        <i />
        <i />
        <i />
      </span>
      <span>{label}</span>
    </div>
  );
}

const STAGE_TEXT = ['正在理解你的需求…', '正在连接智能体…', '正在准备执行…'];

/**
 * 助手首条事件到达前的占位状态（发送中 → 收到 SESSION_INFO/REASONING 前）。
 * 收到直播内容（思考/工具卡片）后由 LiveBlocks 接管，不再展示。
 */
export function WaitingState() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % STAGE_TEXT.length), 1700);
    return () => clearInterval(t);
  }, []);
  return <Thinking label={STAGE_TEXT[idx]} />;
}
