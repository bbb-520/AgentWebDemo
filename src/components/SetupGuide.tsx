import { useState } from 'react';
import type { AuthUser } from '../lib/auth';
import { login, register } from '../lib/auth';
import { IconClose } from './icons';

interface Props {
  baseUrl: string;
  onLoggedIn: (user: AuthUser) => void;
  onClose: () => void;
}

export default function SetupGuide({ baseUrl, onLoggedIn, onClose }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError('');
    if (!username.trim() || !password) { setError('请填写用户名和密码'); return; }
    if (mode === 'register' && password !== confirm) { setError('两次输入的密码不一致'); return; }
    setBusy(true);
    try {
      if (mode === 'register') await register(baseUrl, username.trim(), password);
      const user = await login(baseUrl, username.trim(), password);
      onLoggedIn(user);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '登录失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="setup-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="setup-guide" role="dialog" aria-modal="true" aria-label={mode === 'login' ? '登录' : '注册'}>
        <div className="setup-guide-orb" aria-hidden="true" />
        <button className="icon-btn light setup-close" onClick={onClose} aria-label="关闭"><IconClose size={17} /></button>
        <div className="setup-kicker">WELCOME TO BOBO</div>
        <h2>{mode === 'login' ? '登录 bobo' : '创建 bobo 账号'}</h2>
        <p className="setup-sub">只需用户名和密码即可进入。创作图片前，可在用户页配置阿里云 API Key。</p>
        <div className="setup-fields">
          <div className="field"><label>用户名</label><input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="你的 bobo 账号" /></div>
          <div className="field"><label>密码</label><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="至少 8 位" /></div>
          {mode === 'register' && <div className="field"><label>确认密码</label><input type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" /></div>}
          {error && <div className="setup-error" role="alert">{error}</div>}
          <button className="setup-primary" type="button" disabled={busy} onClick={() => void submit()}>{busy ? '处理中…' : mode === 'login' ? '登录' : '注册并登录'}</button>
          <button className="setup-secondary" type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
            {mode === 'login' ? '没有账号？立即注册' : '已有账号？返回登录'}
          </button>
        </div>
      </section>
    </div>
  );
}
