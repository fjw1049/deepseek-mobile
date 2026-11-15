import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleAsr, readConfiguredAsr } from './asr-bridge.mjs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('status never calls provider and never discloses config', async () => {
  const api = { transcribeAudio: () => { throw new Error('must not call'); } };
  const config = { apiKey: 'local-secret', baseUrl: 'https://private-endpoint', model: 'model' };
  const status = await handleAsr(api, config, { action: 'status' });
  assert.deepEqual(status, {configured: true, max_duration_ms: 30000, max_bytes: 1000044});
  assert.equal((await handleAsr(api, {...config, apiKey: ''}, { action: 'transcribe' })).code, 'not_configured');
});
test('uses only computer config and delegates actual provider behavior', async () => {
  const config = { apiKey: 'computer-asr-key', baseUrl: 'https://computer-asr', model: 'asr-model' };
  const result = await handleAsr({transcribeAudio: async input => {
    assert.equal(input.apiKey, config.apiKey); assert.equal(input.baseUrl, config.baseUrl);
    assert.equal(input.model, config.model); assert.equal(input.fileName, 'recording.wav');
    assert.deepEqual(input.audio, Buffer.from('recording')); return {ok: true, text: 'hello'};
  }}, config, {action: 'transcribe', audio: Buffer.from('recording').toString('base64'), apiKey: 'mobile-key', baseUrl: 'https://mobile-endpoint'});
  assert.deepEqual(result, {ok: true, text: 'hello'});
});
test('config adapter uses existing parser without modifying config', async () => {
  const home = await mkdtemp(join(tmpdir(), 'mobile-asr-config-'));
  try {
    const content = '[asr]\nmodel = "offline"\n';
    await writeFile(join(home, 'config.toml'), content);
    assert.equal(await readConfiguredAsr({parseAsrSettingsFromToml: text => text}, home), content);
  } finally { await rm(home, {recursive: true, force: true}); }
});
