import { useEffect, useState } from 'react';
import { accountAuth, accountRuntime } from './account-auth';
import type { RuntimeClient } from './protocol';

export function AccountLogin({ connect, autoRestore = true }: { connect: (client: RuntimeClient) => Promise<void>; autoRestore?: boolean }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!autoRestore) { setBusy(false); return; }
    let cancelled = false;
    void accountAuth!.auth.getSession().then(async ({ data, error }) => {
      if (error) throw error;
      if (data.session && !cancelled) {
        const client = await accountRuntime();
        if (!cancelled) await connect(client);
      }
    }).catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, []);
  return <main className="connection">
    <h1>登录工作空间</h1>
    <p>使用同一账号连接你的桌面与手机。</p>
    <form className="sheet-form" onSubmit={async (event) => {
      event.preventDefault(); setBusy(true); setError('');
      try {
        const { error } = await accountAuth!.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        setPassword('');
        await connect(await accountRuntime());
      } catch (e) { setError(e instanceof Error ? e.message : '登录失败'); }
      finally { setBusy(false); }
    }}>
      <label>邮箱<input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label>密码<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
      <button className="primary" disabled={busy}>{busy ? '正在连接…' : '登录'}</button>
      {error && <p role="alert">{error}</p>}
    </form>
    <small>开发账号由本地启动器创建；此环境使用离线模型验证。</small>
  </main>;
}
