// Real local Supabase + gateway smoke. Creates/deletes two temporary accounts.
// All turns run through the original Engine's offline provider.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const root = resolve(import.meta.dirname, '..');
const config = JSON.parse(readFileSync(resolve(root, '.runtime/account/gateway.json'), 'utf8'));
assert(['127.0.0.1', 'localhost'].includes(new URL(config.auth_url).hostname));
const status = spawnSync(resolve(root, 'node_modules/.bin/supabase'), ['status', '-o', 'json'], { cwd: root, encoding: 'utf8' });
assert.equal(status.status, 0, 'Local Supabase must be running');
const values = JSON.parse(status.stdout);
const secret = values.SERVICE_ROLE_KEY || values.SECRET_KEY || values.keys?.secret;
assert(secret, 'Expected local service credential');
const admin = createClient(config.auth_url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const gateway = 'http://127.0.0.1:17881';
const users = [];
const authClients = [];
async function request(token, path, method = 'GET', body) {
  return fetch(gateway + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20000) });
}
try {
  for (const suffix of ['a', 'b']) {
    const credentials = { email: `smoke-${randomBytes(8).toString('hex')}-${suffix}@example.test`, password: randomBytes(24).toString('base64url') };
    const { data, error } = await admin.auth.admin.createUser({ ...credentials, email_confirm: true });
    assert.ifError(error); users.push(data.user.id);
    const auth = createClient(config.auth_url, config.public_key, { auth: { persistSession: false, autoRefreshToken: false } });
    authClients.push(auth);
    const signed = await auth.auth.signInWithPassword(credentials); assert.ifError(signed.error);
    const token = signed.data.session.access_token;
    const me = await request(token, '/v1/me'); assert.equal(me.status, 200);
    const identity = await me.json(); assert.equal(identity.workspaces.length, 1);
    users[users.length - 1] = { id: data.user.id, token, space: identity.workspaces[0].id };
    const rows = await auth.from('workspaces').select('id'); assert.ifError(rows.error);
    assert.deepEqual(rows.data.map(r => r.id), [identity.workspaces[0].id], 'RLS exposes only own workspace');
  }
  const [a, b] = users;
  for (const [actor, target] of [[a, b], [b, a]]) {
    for (const path of ['/v1/threads', '/v1/threads/missing/events?since_seq=0', '/v1/approvals/pending']) {
      assert.equal((await request(actor.token, `/spaces/${target.space}${path}`)).status, 404);
    }
    const foreign = await authClients[actor === a ? 0 : 1].from('workspaces').select('id').eq('id', target.space);
    assert.ifError(foreign.error); assert.deepEqual(foreign.data, []);
  }
  const base = `/spaces/${a.space}`;
  const created = await request(a.token, base + '/v1/threads', 'POST', { title: 'Account smoke' });
  assert.equal(created.status, 201); const thread = await created.json();
  assert.equal((await request(b.token, `/spaces/${b.space}/v1/threads/${thread.id}`)).status, 404);
  const path = base + '/v1/threads/' + thread.id;
  assert.equal((await request(a.token, path, 'PATCH', { model: 'offline-alternate', auto_approve: true })).status, 200);
  assert.equal((await request(a.token, path + '/turns', 'POST', { prompt: 'account-isolation-smoke' })).status, 201);
  let detail;
  for (let i = 0; i < 100; i++) {
    detail = await (await request(a.token, path)).json();
    if (detail.turns.at(-1)?.status === 'completed') break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(detail.turns.at(-1)?.status, 'completed');
  assert.equal(detail.thread.model, 'offline-alternate');
  assert.equal(detail.thread.auto_approve, true);
  assert(detail.items.some(item => item.detail?.includes('Offline Runtime (offline-alternate)')));
  assert.equal((await request(a.token, base + '/v1/threads', 'POST', { workspace: '/etc' })).status, 400);
  assert.equal((await request(a.token, base + '/legacy/app', 'POST', { op: 'settings' })).status, 403);
  assert.equal((await request('invalid', '/v1/me')).status, 401);
  assert.equal((await request(a.token, path + '/context')).status, 200);
  assert((await request(a.token, path, 'DELETE')).ok);
  assert.equal((await request(a.token, path)).status, 404);
  console.log('PASS: real local Auth, RLS, cross-account denial, offline turn, shared settings.');
} finally {
  for (const auth of authClients) await auth.auth.signOut({ scope: 'local' });
  for (const user of users) {
    const { error } = await admin.auth.admin.deleteUser(typeof user === 'string' ? user : user.id);
    if (error) console.error('Temporary account cleanup failed; inspect local Auth.');
  }
}
