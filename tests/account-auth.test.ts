import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  native: true, record: null as string | null, options: null as any,
  user: 'a', token: 'token-a', clear: vi.fn(),
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => state.native },
  registerPlugin: () => ({
    load: vi.fn(async (options) => { expect(options.account).toBe(true); return { value: state.record }; }),
    save: vi.fn(async (options) => { expect(options.account).toBe(true); state.record = options.value; }),
    clear: state.clear,
  }),
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn((_url, _key, options) => {
    state.options = options;
    return { auth: {
      getUser: async () => ({ data: { user: { id: state.user } } }),
      getSession: async () => ({ data: { session: { user: { id: state.user }, access_token: state.token } } }),
      signOut: async () => ({ error: null }),
    } };
  }),
}));
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  state.native = true; state.record = null; state.user = 'a'; state.token = 'token-a';
  vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:54321');
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'public');
  vi.stubEnv('VITE_ACCOUNT_API_URL', 'http://127.0.0.1:17881/');
});

it('isolates native storage and does not clear a session for SDK migration keys', async () => {
  await import('../src/account-auth');
  const storage = state.options.auth.storage;
  await storage.setItem('session', 'saved');
  expect(await storage.getItem('session')).toBe('saved');
  expect(await storage.getItem('session-user')).toBeNull();
  await storage.removeItem('session-user');
  expect(state.clear).not.toHaveBeenCalled();
  await storage.removeItem('session');
  expect(state.clear).toHaveBeenCalledWith({ account: true });
});

it('uses fresh tokens, normalizes the gateway URL and refuses cross-account reuse', async () => {
  const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ user_id: 'a', workspaces: [{ id: 'space' }] })));
  vi.stubGlobal('fetch', fetcher);
  const { accountRuntime } = await import('../src/account-auth');
  const client = await accountRuntime();
  expect(client.base).toBe('http://127.0.0.1:17881/spaces/space');
  state.token = 'refreshed';
  await client.request('/v1/threads');
  expect(new Headers(fetcher.mock.calls.at(-1)?.[1]?.headers).get('Authorization')).toBe('Bearer refreshed');
  const calls = fetcher.mock.calls.length;
  state.user = 'b';
  await expect(client.request('/v1/threads')).rejects.toMatchObject({ status: 401 });
  expect(fetcher.mock.calls.length).toBe(calls);
  vi.unstubAllGlobals();
});

it('keeps browser credentials out of persistent storage', async () => {
  state.native = false;
  await import('../src/account-auth');
  expect(state.options.auth.persistSession).toBe(false);
  expect(state.options.auth.storage).toBeUndefined();
});
