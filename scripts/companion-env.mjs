import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export function companionEnvironment(){return {
 ...process.env,
 DEEPSEEK_MOBILE_ASR_HELPER:process.env.DEEPSEEK_MOBILE_ASR_HELPER||resolve(root,'.runtime/asr-helper.mjs'),
 DEEPSEEK_MOBILE_GIT_HELPER:process.env.DEEPSEEK_MOBILE_GIT_HELPER||resolve(root,'.runtime/git-helper.mjs'),
 DEEPSEEK_MOBILE_TERMINAL_HELPER:process.env.DEEPSEEK_MOBILE_TERMINAL_HELPER||resolve(root,'.runtime/terminal-helper.cjs'),
 DEEPSEEK_MOBILE_MODELS_HELPER:process.env.DEEPSEEK_MOBILE_MODELS_HELPER||resolve(root,'.runtime/models-helper.mjs'),
 MOBILE_NODE_BINARY:process.execPath,
};}
