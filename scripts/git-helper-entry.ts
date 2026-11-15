// Bundled against the installed desktop source; no copied Git implementation.
import * as git from "runtime-git-service";
import { realpath } from "node:fs/promises";
const chunks: Buffer[] = [];
let size = 0;
for await (const chunk of process.stdin) {
  size += chunk.length;
  if (size > 32768) throw new Error("Git request is too large");
  chunks.push(chunk);
}
try {
  const req = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  const root = await realpath(req.workspace);
  const branches = await git.getGitBranches(root, false);
  if (!branches.ok) throw new Error(branches.message);
  if (await realpath(branches.repositoryRoot) !== root)
    throw new Error("Mobile Git requires the conversation workspace to be the repository root.");
  let result: unknown;
  switch (req.action) {
    case "branches": result = branches; break;
    case "changes": result = await git.getGitWorkingChanges(root, req.scope ?? "working-tree"); break;
    case "diff": result = await git.getGitFileDiff({workspaceRoot: root, path: req.path, scope: req.scope ?? "working-tree", untracked: req.untracked === true}); break;
    case "stage": result = await git.stageGitChanges(root, req.paths); break;
    case "unstage": result = await git.unstageGitChanges(root, req.paths); break;
    case "commit": result = await git.commitGitChanges(root, req.message); break;
    case "switch": result = await git.switchGitBranch(root, req.branch); break;
    case "createBranch": result = await git.createAndSwitchGitBranch(root, req.branch); break;
    case "pull": result = await git.pullGitBranch(root); break;
    case "push": result = await git.pushGitBranch(root); break;
    default: throw new Error("Unsupported Git action");
  }
  process.stdout.write(JSON.stringify(result));
} catch (error) {
  process.stdout.write(JSON.stringify({ok:false, message:error instanceof Error ? error.message : String(error)}));
  process.exitCode = 1;
}
