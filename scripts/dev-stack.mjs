import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stateDir = resolve(root, '.runtime/account');
mkdirSync(stateDir, { recursive: true, mode: 0o700 });
const cli = resolve(root, 'node_modules/.bin/supabase');
const source = resolve(process.env.RUNTIME_SOURCE || resolve(root, '../deepseek-tui-py-main'));
const python = process.env.RUNTIME_PYTHON || resolve(source, '.venv/bin/python');
const credentialsFile = resolve(stateDir, 'dev-account.json');
const exclusions = 'storage-api,realtime,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor';
function privateJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  chmodSync(path, 0o600);
}
function command(args, capture = false) {
  const result = spawnSync(cli, args, { cwd: root, encoding: 'utf8', stdio: 'pipe', maxBuffer: 16 * 1024 * 1024 });
  // The CLI prints administrative keys on success. Keep its output private.
  if (!capture) {
    const log = resolve(stateDir, `supabase-${args[0]}.log`);
    writeFileSync(log, (result.stdout || '') + (result.stderr || ''), { mode: 0o600 });
    chmodSync(log, 0o600);
  }
  if (result.status !== 0) throw new Error(`Supabase ${args[0]} failed; inspect .runtime/account/supabase-${args[0]}.log locally.`);
  return result.stdout;
}
const children = [];
function stop() { for (const child of children) if (child.exitCode === null) child.kill('SIGTERM'); }
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stop(); process.exit(0); });
async function waitFor(url, child) {
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error('Development service exited before becoming ready.');
    try { if ((await fetch(url, { signal: AbortSignal.timeout(500) })).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('Development service startup timed out.');
}
try {
  if (!existsSync(python)) throw new Error('Set RUNTIME_SOURCE/RUNTIME_PYTHON to the existing Runtime installation.');
  if (spawnSync('docker', ['info'], { stdio: 'ignore' }).status !== 0) throw new Error('Start Docker Desktop or OrbStack first.');
  console.log('Starting local Supabase; first launch downloads official images.');
  command(['start', '--exclude', exclusions]);
  command(['migration', 'up', '--local']);
  const status = JSON.parse(command(['status', '-o', 'json'], true));
  const authUrl = status.API_URL || status.api?.url;
  const publicKey = status.ANON_KEY || status.PUBLISHABLE_KEY || status.keys?.publishable;
  const secret = status.SERVICE_ROLE_KEY || status.SECRET_KEY || status.keys?.secret;
  if (!authUrl || !publicKey || !secret) throw new Error('Unsupported Supabase status format; no credentials were written.');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(authUrl).hostname)) throw new Error('Development seeding only supports local Supabase.');
  const admin = createClient(authUrl, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  let credentials;
  if (existsSync(credentialsFile)) {
    credentials = JSON.parse(readFileSync(credentialsFile, 'utf8'));
    const { data, error } = await admin.auth.admin.getUserById(credentials.id);
    if (error || data.user.email !== credentials.email) throw new Error('Saved development account is missing; inspect local data before resetting it.');
  } else {
    credentials = { email: 'dev@example.test', password: randomBytes(24).toString('base64url') };
    const { data, error } = await admin.auth.admin.createUser({ ...credentials, email_confirm: true });
    if (error) throw error;
    credentials.id = data.user.id;
    privateJson(credentialsFile, credentials);
  }
  const configFile = resolve(stateDir, 'gateway.json');
  privateJson(configFile, { auth_url: authUrl, public_key: publicKey, runtime_source: source,
    data_dir: resolve(stateDir, 'spaces'), python });
  if (process.argv.includes('--setup-only')) {
    console.log(`Development account prepared. Credentials: ${credentialsFile}`);
    process.exit(0);
  }
  for (const port of [17881, 5178]) {
    const probe = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(500) }).catch(() => null);
    if (probe) throw new Error(`Port ${port} is already in use. Existing services were not stopped.`);
  }
  const backend = spawn(python, ['-m', 'server.serve', '--config', configFile], { cwd: root, stdio: 'inherit' });
  children.push(backend);
  await waitFor('http://127.0.0.1:17881/health', backend);
  const web = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1'], {
    cwd: root, stdio: 'inherit', env: { ...process.env,
      VITE_SUPABASE_URL: authUrl, VITE_SUPABASE_PUBLISHABLE_KEY: publicKey,
      VITE_ACCOUNT_API_URL: 'http://127.0.0.1:17881' },
  });
  children.push(web);
  await waitFor('http://127.0.0.1:5178', web);
  console.log(`Account preview: http://127.0.0.1:5178\nCredentials: ${credentialsFile}\nOffline models only. Supabase data persists after this process exits.`);
  await Promise.race(children.map(child => new Promise(resolve => child.once('exit', resolve))));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally { stop(); }
