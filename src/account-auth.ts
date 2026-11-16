import { createClient } from '@supabase/supabase-js';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { ApiError, RuntimeClient, runtimeBase } from './protocol';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const publicKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const gateway = import.meta.env.VITE_ACCOUNT_API_URL as string | undefined;
export const accountMode = !!(url && publicKey && gateway);
const secure = registerPlugin<{
  save(options: { value: string; account: true }): Promise<void>;
  load(options: { account: true }): Promise<{ value: string | null }>;
  clear(options: { account: true }): Promise<void>;
}>('NativeCredentials');
const native = Capacitor.isNativePlatform();
// Web sessions stay in memory; native sessions use a separate secure slot.
const storage = {
  async getItem(key: string) {
    const { value } = await secure.load({ account: true });
    if (!value) return null;
    try {
      const record = JSON.parse(value);
      return record.kind === 'supabase-session' && record.key === key ? record.value : null;
    } catch { return null; }
  },
  async setItem(key: string, value: string) {
    await secure.save({ account: true, value: JSON.stringify({ kind: 'supabase-session', key, value }) });
  },
  async removeItem(key: string) {
    // The SDK also removes migration keys such as "-user". Do not erase the
    // current session when it is removing a different key.
    if (await storage.getItem(key) !== null) await secure.clear({ account: true });
  },
};
export const accountAuth = accountMode ? createClient(url!, publicKey!, {
  auth: { persistSession: native, autoRefreshToken: true, detectSessionInUrl: false,
    storage: native ? storage : undefined, flowType: 'pkce' },
}) : null;

export async function accountRuntime(): Promise<RuntimeClient> {
  if (!accountAuth) throw new Error('账号服务未配置');
  const { data, error } = await accountAuth.auth.getUser();
  if (error || !data.user) throw new Error('请重新登录');
  const userId = data.user.id;
  const token = async () => {
    const { data: { session }, error } = await accountAuth.auth.getSession();
    if (error || !session || session.user.id !== userId) throw new ApiError(401, '账号已退出或发生切换，请重新登录');
    return session.access_token;
  };
  const base = runtimeBase(gateway!);
  const bootstrap = new RuntimeClient(base, token);
  const identity = await bootstrap.request<{ user_id: string; workspaces: { id: string; name: string }[] }>('/v1/me');
  if (identity.user_id !== userId || !identity.workspaces.length) throw new Error('个人空间尚未准备完成');
  const workspace = identity.workspaces[0].id;
  return new RuntimeClient(`${base}/spaces/${encodeURIComponent(workspace)}`, token, {
    scope: `${base}:${userId}:${workspace}`,
    account: true,
    logout: async () => {
      const { error } = await accountAuth.auth.signOut({ scope: 'local' });
      if (error) throw error;
    },
  });
}
