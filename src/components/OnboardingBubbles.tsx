import { useEffect, useState } from 'react';
import { IconClose } from './icons';

const KEY_PREFIX = 'bobo.onboarding.chat.v1';

function storageKey(scope: string) {
  const safe = scope.trim().replace(/[^a-zA-Z0-9_.@-]/g, '_') || 'guest';
  return `${KEY_PREFIX}.${safe}`;
}

interface Props {
  scope: string;
  onOpenProfile: () => void;
}

export default function OnboardingBubbles({ scope, onOpenProfile }: Props) {
  const [step, setStep] = useState<1 | 2 | null>(() => {
    try { return localStorage.getItem(storageKey(scope)) === 'done' ? null : 1; } catch { return 1; }
  });

  useEffect(() => {
    if (step === null) return;
    try { localStorage.setItem(storageKey(scope), 'active'); } catch { /* private mode */ }
  }, [scope, step]);

  if (step === null) return null;

  const finish = () => {
    try { localStorage.setItem(storageKey(scope), 'done'); } catch { /* private mode */ }
    setStep(null);
  };

  return (
    <div className="onboarding-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) finish(); }}>
      <section className="onboarding-bubble" role="dialog" aria-modal="false" aria-labelledby="onboarding-title">
        <button type="button" className="onboarding-close" onClick={finish} aria-label="关闭引导"><IconClose size={15} /></button>
        <span className="profile-kicker">BOBO / {step} OF 2</span>
        <h3 id="onboarding-title">{step === 1 ? '把照片变成新的记忆' : 'API Key 在用户页配置'}</h3>
        <p>{step === 1 ? '上传一张图片，再写下你想要的二次创作方向。生成结果可以下载，也可以主动加入 Bobo’s World。' : '打开右上角用户名进入用户页，在那里保存或更新阿里云 API Key，也能管理你发布的作品。'}</p>
        <div className="onboarding-actions">
          {step === 2 && <button type="button" className="onboarding-link" onClick={() => { finish(); onOpenProfile(); }}>打开用户页</button>}
          <button type="button" className="setup-primary" onClick={() => step === 1 ? setStep(2) : finish()}>{step === 1 ? '下一步' : '知道了'}</button>
        </div>
      </section>
    </div>
  );
}
