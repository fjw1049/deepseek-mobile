import {companionEnvironment} from "./companion-env.mjs";
import { spawn } from "node:child_process";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(
  process.env.RUNTIME_SOURCE || resolve(root, "../deepseek-tui-py-main"),
);
const python =
  process.env.RUNTIME_PYTHON || resolve(source, ".venv/bin/python");
const url = "http://127.0.0.1:5178/";
const runtimeUrl = "http://127.0.0.1:17879";
const token = "mobile-live-review"; // Only for this loopback-only, temporary test Runtime.
async function probe(target, auth = false) {
  try {
    return (
      await fetch(target, {
        headers: auth ? { Authorization: `Bearer ${token}` } : {},
        signal: AbortSignal.timeout(1500),
      })
    ).ok;
  } catch {
    return false;
  }
}
const [frontend, runtime] = await Promise.all([
  probe(url),
  probe(runtimeUrl + "/v1/threads", true),
]);
if (process.argv.includes("--check")) {
  console.log(
    JSON.stringify({ url, frontend, runtime, ready: frontend && runtime }),
  );
  process.exit(frontend && runtime ? 0 : 1);
}
function show() {
  console.log(
    `\n打开 ${url}\n服务地址 /runtime\n访问令牌 ${token}\n官方模型 deepseek-flash；每次预览最多 12 次生成请求，每次最多 1024 输出 token。\n模型密钥只在内存，关闭终端后需重新输入。\n`,
  );
  spawn("open", [url], { stdio: "ignore" }).unref();
}
if (frontend && runtime) {
  show();
  process.exit(0);
}
if (frontend || runtime)
  throw new Error(
    "预览只启动了一部分；请先关闭自己上一次的预览终端，再运行。不会覆盖已有服务。",
  );
if (
  !existsSync(python) ||
  !existsSync(resolve(source, "src/deepseek_tui/server/app.py"))
)
  throw new Error(
    "请设置 RUNTIME_SOURCE 为原 Runtime 路径，RUNTIME_PYTHON 为其 Python 解释器。",
  );
const children = [];
function stop() {
  for (const child of children)
    if (child.exitCode === null) child.kill("SIGTERM");
}
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"])
  process.on(signal, () => {
    stop();
    process.exit(0);
  });
async function waitFor(target, child, auth = false) {
  for (let i = 0; i < 300; i++) {
    if (child.exitCode !== null)
      throw new Error("服务启动失败，请查看终端中的错误。");
    if (await probe(target, auth)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("服务启动超时。");
}
try {
  const data = mkdtempSync(resolve(tmpdir(), "deepseek-mobile-live-"));
  console.log(
    "将启动独立真实验证环境，不修改你现有的 7878 Runtime。请输入官方 DeepSeek API Key；输入不会回显或保存。",
  );
  const backend = spawn(
    python,
    [
      resolve(root, "scripts/live-preview.py"),
      "--runtime-source",
      source,
      "--data-dir",
      data,
    ],
    { stdio: "inherit", cwd: root, env:companionEnvironment() },
  );
  children.push(backend);
  await waitFor(runtimeUrl + "/v1/threads", backend, true);
  const web = spawn(
    process.execPath,
    [resolve(root, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1"],
    {
      stdio: "inherit",
      cwd: root,
      env: { ...process.env, RUNTIME_URL: runtimeUrl },
    },
  );
  children.push(web);
  await waitFor(url, web);
  show();
  await Promise.race(
    children.map(
      (child) => new Promise((resolve) => child.on("exit", resolve)),
    ),
  );
  stop();
} catch (error) {
  stop();
  console.error(error.message);
  process.exitCode = 1;
}
