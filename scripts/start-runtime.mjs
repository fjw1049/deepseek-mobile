import {companionEnvironment} from "./companion-env.mjs";
// Launch the existing service entry point. This file contains no backend logic.
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
const source = resolve(process.env.RUNTIME_SOURCE || "../deepseek-tui-py-main");
const python =
  process.env.RUNTIME_PYTHON || resolve(source, ".venv/bin/python");
const workspace = resolve(process.env.RUNTIME_WORKSPACE || source);
const host = process.env.RUNTIME_BIND || "127.0.0.1";
const port = process.env.RUNTIME_PORT || "7878";
if (!existsSync(resolve(source, "src/deepseek_tui/server/app.py")))
  throw new Error(
    "RUNTIME_SOURCE must point to the existing Runtime repository",
  );
if (!process.env.DEEPSEEK_RUNTIME_TOKEN)
  throw new Error("Set DEEPSEEK_RUNTIME_TOKEN before starting the service");
const probe = await fetch(`http://127.0.0.1:${port}/health`, {
  signal: AbortSignal.timeout(1000),
}).catch(() => null);
if (probe)
  throw new Error(
    `A service already listens on port ${port}; connect to it or stop it first`,
  );
const child = spawn(
  python,
  [
    "-m",
    "deepseek_tui",
    "serve",
    "--http",
    "--host",
    host,
    "--port",
    port,
    "--cors-origin",
    "capacitor://localhost",
    "--cors-origin",
    "http://localhost",
    "--cors-origin",
    "https://localhost",
  ],
  {
    cwd: workspace,
    stdio: "inherit",
    env: { ...companionEnvironment(), PYTHONPATH: resolve(source, "src") },
  },
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 1));
child.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
