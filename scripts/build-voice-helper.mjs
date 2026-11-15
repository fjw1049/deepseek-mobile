import { build } from 'esbuild';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(process.env.RUNTIME_SOURCE || resolve(root, '../deepseek-tui-py-main'));
const output = resolve(process.env.ASR_HELPER_OUTPUT || resolve(root, '.runtime/asr-helper.mjs'));
await build({
  stdin: { contents: `
    import { transcribeAudio } from ${JSON.stringify(resolve(source, 'packages/workbench/src/main/services/asr-transcription-service.ts'))};
    import { parseAsrSettingsFromToml } from ${JSON.stringify(resolve(source, 'packages/workbench/src/shared/asr-config.ts'))};
    import { runAsr } from ${JSON.stringify(resolve(root, 'scripts/asr-bridge.mjs'))};
    await runAsr({transcribeAudio, parseAsrSettingsFromToml});
  `, resolveDir: root, loader: 'ts' },
  bundle: true, platform: 'node', format: 'esm', outfile: output, logLevel: 'silent',
});
console.log('ASR helper built from existing Workbench implementation');
