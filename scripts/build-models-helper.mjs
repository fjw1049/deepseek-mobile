import { build } from "esbuild";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(
  process.env.RUNTIME_SOURCE || resolve(root, "../deepseek-tui-py-main"),
);
const output = resolve(
  process.env.MODELS_HELPER_OUTPUT ||
    resolve(root, ".runtime/models-helper.mjs"),
);
await build({
  stdin: {
    contents: `
    import { fetchOpenAiCompatibleModelIds } from ${JSON.stringify(resolve(source, "packages/workbench/src/main/upstream-models.ts"))};
    try {
      let raw = ''; for await (const chunk of process.stdin) {raw += chunk; if(raw.length > 65536) throw new Error('Invalid request');}
      const input = JSON.parse(raw);
      const result = await fetchOpenAiCompatibleModelIds(input.baseUrl, input.apiKey);
      console.log(JSON.stringify(result.ok ? result : {ok: false}));
    } catch { console.log(JSON.stringify({ok: false})); process.exitCode = 1; }
  `,
    resolveDir: root,
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: output,
  logLevel: "silent",
});
console.log(
  "Model catalog helper built from existing Workbench implementation",
);
