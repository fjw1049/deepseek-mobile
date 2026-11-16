import {companionEnvironment} from "./companion-env.mjs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
const source = resolve(process.env.RUNTIME_SOURCE || "../deepseek-tui-py-main");
const python =
  process.env.RUNTIME_PYTHON || resolve(source, ".venv/bin/python");
if (!existsSync(resolve(source, "src/deepseek_tui/server/app.py")))
  throw new Error("Set RUNTIME_SOURCE to the existing Runtime repository");
const child = spawn(
  python,
  ["scripts/runtime-fixture.py", "--runtime-source", source, "--port", process.env.FIXTURE_PORT || "17878"],
  { stdio: "inherit",env:companionEnvironment() },
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 1));
child.on("error", (e) => {
  console.error(e.message);
  process.exit(1);
});
