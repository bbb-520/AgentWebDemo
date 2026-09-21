import { useState } from 'react';
import type { AuthUser } from '../lib/auth';
import { login, register } from '../lib/auth';

interface Props {
  baseUrl: string;
  onLoggedIn: (user: AuthUser) => void;
}

export default function LoginSheet({ baseUrl, onLoggedIn }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError('');
    if (mode === 'register' && password !== confirm) {
      setError('两次输入的密码不一致');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'register') await register(baseUrl, username, password);
      const user = await login(baseUrl, username, password);
      onLoggedIn(user);
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-mask">
      <div className="sheet auth-sheet">
        <div className="sheet-head"><h2>{mode === 'login' ? '登录 bobo' : '创建账号'}</h2></div>
        <div className="sheet-sub">登录后才能使用自己的 Qwen 与 Tavily API 密钥</div>
        <div className="set-sec">
          <div className="field">
            <label>用户名</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
          </div>
          <div className="field">
            <label>密码（至少 8 位）</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          </div>
          {mode === 'register' && (
            <div className="field">
              <label>确认密码</label>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
            </div>
          )}
          {error && <div className="check-line"><b className="bad">✕</b> {error}</div>}
          <button className="btn-primary" disabled={busy || !username || !password} onClick={() => void submit()}>
            {busy ? '处理中…' : mode === 'login' ? '登录' : '注册并登录'}
          </button>
          <button className="btn-ghost" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
            {mode === 'login' ? '没有账号？注册' : '已有账号？登录'}
          </button>
        </div>
      </div>
    </div>
  );
}
