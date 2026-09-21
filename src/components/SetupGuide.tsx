import { useEffect, useState } from 'react';
import type { AuthUser, KeyStatus } from '../lib/auth';
import { getKeyStatus, login, register, saveKeys } from '../lib/auth';
import { IconClose } from './icons';

interface Props {
  baseUrl: string;
  user: AuthUser | null;
  keyStatus: KeyStatus | null;
  onLoggedIn: (user: AuthUser) => void;
  onKeysSaved: (status: KeyStatus) => void;
  onClose: () => void;
  onUseOffline: () => void;
}

export default function SetupGuide({
  baseUrl,
  user,
  keyStatus,
  onLoggedIn,
  onKeysSaved,
  onClose,
  onUseOffline,
}: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [step, setStep] = useState(user ? 2 : 1);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [qwen, setQwen] = useState('');
  const [tavily, setTavily] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    void getKeyStatus(baseUrl).then(onKeysSaved).catch(() => undefined);
  }, [baseUrl, user, onKeysSaved]);

  const submitAuth = async () => {
    setError('');
    if (!username.trim() || !password) return setError('请填写用户名和密码');
    if (mode === 'register' && password !== confirm) return setError('两次输入的密码不一致');
    setBusy(true);
    try {
      if (mode === 'register') await register(baseUrl, username.trim(), password);
      const nextUser = await login(baseUrl, username.trim(), password);
      onLoggedIn(nextUser);
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : '登录失败，请检查后端是否启动');
    } finally {
      setBusy(false);
    }
  };

  const submitKeys = async () => {
    if ((!qwen.trim() && !keyStatus?.qwenConfigured) || (!tavily.trim() && !keyStatus?.tavilyConfigured)) {
      setError('请同时配置 Qwen 和 Tavily 密钥后再启用在线模式');
      return;
    }
    setError('');
    setBusy(true);
    try {
      await saveKeys(baseUrl, qwen.trim(), tavily.trim());
      const status = await getKeyStatus(baseUrl);
      onKeysSaved(status);
      if (!status.qwenConfigured || !status.tavilyConfigured) {
        setError('请同时配置 Qwen 和 Tavily 密钥后再启用在线模式');
        return;
      }
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : '密钥保存失败');
    } finally {
      setBusy(false);
    }
  };

  const steps = ['登录账号', '配置密钥', '开始工作'];
  const activeStep = user ? step : 1;

  return (
    <div className="setup-backdrop" onClick={onClose}>
      <section className="setup-guide" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="开始使用引导">
        <div className="setup-guide-orb" aria-hidden="true" />
        <button className="icon-btn light setup-close" onClick={onClose} aria-label="关闭引导"><IconClose size={17} /></button>
        <div className="setup-kicker">WELCOME TO BOBO</div>
        <h2>{activeStep === 1 ? '先把账号准备好' : activeStep === 2 ? '连接你的智能工具' : '工作台已准备好'}</h2>
        <p className="setup-sub">{activeStep === 1 ? '登录后即可保存会话，并在自己的设备上管理密钥。' : activeStep === 2 ? '配置后会绑定到当前账号；暂不配置也可以先使用离线模式。' : '现在可以使用 Qwen 与 Tavily 的实时能力了。'}</p>

        <div className="setup-steps" aria-label="设置步骤">
          {steps.map((label, index) => {
            const number = index + 1;
            const done = number < activeStep;
            return <div className={`setup-step${number === activeStep ? ' active' : ''}${done ? ' done' : ''}`} key={label}>
              <span>{done ? '✓' : number}</span><em>{label}</em>
              {number < steps.length && <i />}
            </div>;
          })}
        </div>

        {activeStep === 1 && (
          <div className="setup-fields">
            <div className="field"><label>用户名</label><input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" placeholder="你的 bobo 账号" /></div>
            <div className="field"><label>密码</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="至少 8 位" /></div>
            {mode === 'register' && <div className="field"><label>确认密码</label><input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" /></div>}
            {error && <div className="setup-error">{error}</div>}
            <button className="setup-primary" disabled={busy} onClick={() => void submitAuth()}>{busy ? '处理中…' : mode === 'login' ? '登录并继续' : '注册并继续'}</button>
            <button className="setup-secondary" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>{mode === 'login' ? '没有账号？注册一个' : '已有账号？返回登录'}</button>
          </div>
        )}

        {activeStep === 2 && (
          <div className="setup-fields">
            <div className="field"><label>Qwen API Key {keyStatus?.qwenConfigured ? '（已配置，可留空）' : ''}</label><input type="password" value={qwen} onChange={(e) => setQwen(e.target.value)} autoComplete="off" placeholder="sk-…" /></div>
            <div className="field"><label>Tavily API Key {keyStatus?.tavilyConfigured ? '（已配置，可留空）' : ''}</label><input type="password" value={tavily} onChange={(e) => setTavily(e.target.value)} autoComplete="off" placeholder="tvly-…" /></div>
            {error && <div className="setup-error">{error}</div>}
            <button className="setup-primary" disabled={busy} onClick={() => void submitKeys()}>{busy ? '保存中…' : '保存密钥并启用在线模式'}</button>
            <button className="setup-secondary" onClick={onUseOffline}>先用离线模式</button>
          </div>
        )}

        {activeStep === 3 && (
          <div className="setup-finished">
            <div className="setup-check">✓</div><strong>在线模式已启用</strong><span>你也可以随时在右上角设置里切回离线模式。</span>
            <button className="setup-primary" onClick={onClose}>进入聊天</button>
          </div>
        )}
        <button className="setup-offline-link" onClick={onUseOffline}>暂不登录，继续离线体验</button>
      </section>
    </div>
  );
}
