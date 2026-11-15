// Thin transport adapter: all ASR endpoint/config/provider behavior comes from Workbench.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

export async function readConfiguredAsr(api, home = process.env.DEEPSEEK_HOME || join(homedir(), '.deepseek')) {
  let content = '';
  try { content = await readFile(join(home, 'config.toml'), 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  // Use the pure parser: readAsrConfigFile also normalizes/writes personal config.
  return api.parseAsrSettingsFromToml(content);
}

export async function handleAsr(api, config, input) {
  if (input.action === 'status') return { configured: !!config.apiKey.trim(), max_duration_ms: 30000, max_bytes: 1000044 };
  if (input.action !== 'transcribe') throw new Error('Unsupported ASR operation');
  if (!config.apiKey.trim()) return { ok: false, code: 'not_configured', message: '电脑尚未配置 ASR，请在电脑设置中配置独立的语音识别服务。' };
  const audio = Buffer.from(input.audio, 'base64');
  return api.transcribeAudio({ ...config, audio, fileName: 'recording.wav', mimeType: 'audio/wav' });
}

export async function runAsr(api) {
  try {
    let raw = '';
    for await (const chunk of process.stdin) { raw += chunk; if (raw.length > 1400000) throw new Error('Audio exceeds limit'); }
    const config = await readConfiguredAsr(api);
    const result = await handleAsr(api, config, JSON.parse(raw));
    // Provider errors might contain credentials; only pass safe generic failure text.
    console.log(JSON.stringify(result.ok === false && result.code !== 'not_configured'
      ? { ok: false, message: '语音识别失败，请检查电脑的 ASR 配置、额度和网络。' } : result));
  } catch {
    console.log(JSON.stringify({ ok: false, message: '电脑语音服务暂不可用，请检查服务部署。' }));
    process.exitCode = 1;
  }
}
