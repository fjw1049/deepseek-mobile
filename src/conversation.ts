import type { Item, Turn } from "./protocol";

export const isRunning = (status?: string) =>
  ["in_progress", "queued", "running"].includes(status ?? "");
export const messageText = (item: Item) => (item.detail || item.summary || "").trim();
export function answerText(item: Item): string {
  const text = messageText(item);
  const rawNote = item.metadata?.completion_note;
  const note = typeof rawNote === "string" ? rawNote.trim() : "";
  return note && text.endsWith(note) ? text.slice(0, -note.length).trim() : text;
}
export function failureGuidance(error: string): string {
  if (error.includes("fixed model/output/input boundary")) return "电脑服务的请求限制拦截了本次消息。请更新并重启电脑服务后再发送；连续重试无法解决。";
  if (error.includes("请求上限")) return "消息、历史和附件合计超过电脑服务的请求上限。请减少附件，或新建会话后发送。";
  if (error.includes("输入上限")) return "请求超过开发预览的输入上限。日常使用请连接个人服务。";
  if (error.includes("输出额度")) return "输出额度与电脑服务配置不一致，请检查电脑端模型配置。";
  if (error.includes("仅支持 deepseek-flash")) return "当前电脑服务仅支持 deepseek-flash，请选择该模型后再发送。";
  return "本次执行未完成。请展开执行过程查看原因；确认已有结果后再决定是否重新发送。";
}
const isAnswer = (item: Item) => ["agent_message", "assistant_message"].includes(item.kind);
const isTool = (item: Item) => ["tool_call", "command_execution", "file_change"].includes(item.kind);

export function groupConversation(items: Item[], turns: Turn[]) {
  const groups = new Map<string, { id: string; items: Item[]; turn?: Turn }>();
  const byId = new Map(turns.map((turn) => [turn.id, turn]));
  for (const item of items) {
    const id = item.turn_id || item.id;
    if (!groups.has(id)) groups.set(id, { id, items: [], turn: byId.get(id) });
    groups.get(id)!.items.push(item);
  }
  for (const turn of turns) {
    if (!groups.has(turn.id)) groups.set(turn.id, { id: turn.id, items: [], turn });
  }
  return [...groups.values()];
}

export function presentTurn(items: Item[], turn?: Turn) {
  const users = items.filter((item) => item.kind === "user_message");
  const messages = items.filter((item) => isAnswer(item) && answerText(item));
  let answers = messages.filter((item) => item.metadata?.agent_segment === "final_answer" ||
    (!item.metadata?.agent_segment && item.metadata?.external_history === true));
  // Older histories have no segment marker. Only unmarked text after the last
  // tool can be the answer; never promote a known preface to a final response.
  if (!answers.length) {
    const lastTool = items.reduce((last, item, index) => isTool(item) ? index : last, -1);
    answers = messages.filter((item) => !item.metadata?.agent_segment && !item.metadata?.process_intent && !isRunning(item.status) && items.indexOf(item) > lastTool);
  }
  const live = !answers.length && isRunning(turn?.status)
    ? [...messages].reverse().find((item) => isRunning(item.status))
    : undefined;
  const process = items.filter((item) => item.kind !== "user_message" && !answers.includes(item) && item !== live && (!isAnswer(item) || !!messageText(item)));
  return { users, answers, live, process, toolCount: process.filter(isTool).length };
}

const toolNames: Record<string, string> = {
  request_user_input: "确认需求", search_skills: "查找可用技能", load_skill: "读取技能说明",
  browser_use: "浏览网页", browser: "浏览网页", web_search: "搜索网页", web_fetch: "读取网页",
  read_file: "读取文件", write_file: "写入文件", edit_file: "修改文件", apply_patch: "修改文件",
  list_files: "查看文件", search_files: "搜索文件", grep: "搜索文件", glob: "查找文件",
  shell: "执行命令", bash: "执行命令", exec_command: "执行命令", run_command: "执行命令",
};
export function processLabel(item: Item): string {
  if (isAnswer(item) && !answerText(item) && item.metadata?.completion_note) return "系统核验记录";
  if (isAnswer(item)) return "进度说明";
  if (item.kind === "agent_reasoning") return "思考过程";
  if (item.kind === "error") return "执行遇到问题";
  const name = typeof item.metadata?.tool_name === "string" ? item.metadata.tool_name : item.summary.match(/^([\w.-]+)(?=[:\s])/)?.[1];
  if (name && toolNames[name]) return toolNames[name];
  if (item.kind === "command_execution") return "执行命令";
  if (item.kind === "file_change") return "更新文件";
  if (item.kind === "context_compaction") return "整理上下文";
  if (item.kind === "tool_call") return "调用工具";
  return "执行记录";
}
