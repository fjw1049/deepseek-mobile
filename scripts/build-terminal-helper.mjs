import { build } from "esbuild";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cp, mkdir } from "node:fs/promises";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(
  process.env.RUNTIME_SOURCE || resolve(root, "../deepseek-tui-py-main"),
);
const output = resolve(
  process.env.TERMINAL_HELPER_OUTPUT ||
    resolve(root, ".runtime/terminal-helper.cjs"),
);
await mkdir(dirname(output), { recursive: true });
for (const part of [
  "package.json",
  "lib",
  `prebuilds/${process.platform}-${process.arch}`,
]) {
  const target = resolve(dirname(output), "node_modules/node-pty", part);
  await mkdir(dirname(target), { recursive: true });
  await cp(
    resolve(source, "packages/workbench/node_modules/node-pty", part),
    target,
    {
      recursive: true,
      dereference: true,
      filter: (path) =>
        !/ \d+(\.|$)/.test(path) && !/\.test\.|\.map$/.test(path),
    },
  );
}
await build({
  stdin: {
    contents: `
    import { createTerminalCore } from ${JSON.stringify(resolve(source, "packages/workbench/src/main/services/terminal-core.ts"))};
    import { runTerminalBridge } from ${JSON.stringify(resolve(root, "scripts/terminal-bridge.mjs"))};
    runTerminalBridge(createTerminalCore);
  `,
    resolveDir: root,
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["node-pty"],
  outfile: output,
  logLevel: "silent",
});
console.log("Terminal helper built from shared Workbench PTY core");
