import { useState } from "react";
import { BrowserTurnEntry, isBrowserItem } from "./browser-turn-entry";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, ChevronRight, CircleAlert, MoreHorizontal } from "lucide-react";
import { CodeBlock, CopyButton } from "./composer-tools";
import { answerText as modelAnswerText, failureGuidance, groupConversation, isRunning, messageText, presentTurn, processLabel } from "./conversation";
import type { Item, Turn } from "./protocol";

const statusNames: Record<string, string> = {
  completed: "已完成", in_progress: "进行中", queued: "等待中", running: "进行中",
  failed: "失败", interrupted: "已停止", canceled: "已取消",
};

export function ProcessItem({ item }: { item: Item }) {
  const failed = item.kind === "error" || item.status === "failed";
  return <details className={`process-item${failed ? " failed" : ""}`}>
    <summary>
      {isRunning(item.status) ? <span className="loader" /> : failed ? <CircleAlert size={15} /> : <Check size={15} />}
      <span>{processLabel(item)}</span><small>{statusNames[item.status] ?? "记录"}</small>
    </summary>
    {item.kind === "tool_call" ? <p className="muted">{failed ? "操作未完成" : isRunning(item.status) ? "执行中" : ""}</p> : <pre>{messageText(item)}</pre>}
    {item.kind === "tool_call" && <details className="technical-details"><summary>技术详情</summary><pre>{item.kind === "tool_call" ? messageText(item) : ""}{item.metadata ? "\n\n" + JSON.stringify(item.metadata, null, 2) : ""}</pre></details>}
  </details>;
}

type MessageActions = { threadId?: string; openBrowser?: () => void; reuse: (text: string) => void; edit: (item: Item) => void; editDisabled: boolean; openChanges: (turnId: string) => void };

function UserMessage({ item, reuse, edit, editDisabled }: { item: Item } & MessageActions) {
  const body = messageText(item);
  if (!body) return null;
  return <div className="user-message">
    {body.length > 600 ? <><span>{body.slice(0, 240)}…</span><details><summary>展开完整消息与附件正文</summary><div>{body}</div></details></> : body}
    <details className="user-message-menu">
      <summary aria-label="消息操作"><MoreHorizontal size={17} /></summary>
      <button className="reuse-message" disabled={editDisabled} onClick={(event) => {
        event.currentTarget.closest("details")?.removeAttribute("open");
        edit(item);
      }}>编辑并重新发送</button>
      <button className="reuse-message" onClick={(event) => {
        event.currentTarget.closest("details")?.removeAttribute("open");
        reuse(body);
      }}>复制到输入框</button>
    </details>
  </div>;
}

function Reply({ items, turn, waiting, ...actions }: { items: Item[]; turn?: Turn; waiting?: string } & MessageActions) {
  const { users, answers, live, process, toolCount } = presentTurn(items, turn);
  const browserItems = items.filter(isBrowserItem);
  const browserKey = `hidden-browser-entry:${actions.threadId}:${turn?.id || items[0]?.turn_id}`;
  const [browserHidden, setBrowserHidden] = useState(() => {
    try { return localStorage.getItem(browserKey) === "1"; } catch { return false; }
  });
  const hideBrowser = (hidden: boolean) => {
    setBrowserHidden(hidden);
    try { if (hidden) localStorage.setItem(browserKey, "1"); else localStorage.removeItem(browserKey); } catch { /* UI still works without persistence. */ }
  };
  const running = isRunning(turn?.status);
  const failed = turn?.status === "failed";
  const stopped = ["interrupted", "canceled"].includes(turn?.status ?? "");
  const latestWork = [...process].reverse().find((item) => isRunning(item.status));
  const summary = waiting || (running ? latestWork ? processLabel(latestWork) : "正在处理" : failed ? "查看执行详情" : stopped ? "已停止" : "执行过程");
  const answerText = answers.map(modelAnswerText).join("\n\n");
  const notes = items.filter(item => typeof item.metadata?.completion_note === "string" && answers.includes(item));
  const errorText = turn?.error || process.filter(item => item.kind === "error" || item.metadata?.completion_note).map(messageText).join("\n");
  const hasProcess = process.length > 0 || notes.length > 0 || !!turn?.error;
  return <section className="conversation-turn" aria-label="一轮对话">
    {users.map((item) => <UserMessage key={item.id} item={item} {...actions} />)}
    {failed && <div className="turn-failure-guidance" role="status">
      <strong>本次未完成</strong>
      <p>{failureGuidance(errorText)}</p>
      {toolCount > 0 && <p>重试前请核对已执行的操作。</p>}
      {users.length > 0 && <button disabled={actions.editDisabled} onClick={() => actions.edit(users[users.length - 1])}>编辑消息</button>}
    </div>}
    {hasProcess && <details className={`turn-process${failed ? " failed" : ""}`}>
      <summary>
        {running && !waiting ? <span className="loader" /> : failed ? <CircleAlert size={16} /> : <ChevronRight className="process-chevron" size={16} />}
        <span>{summary}</span>{toolCount > 0 && <small>{toolCount} 项操作</small>}
        {!running && process.some((item) => item.status === "failed" || item.kind === "error") && !failed && <small>含异常记录</small>}
      </summary>
      {browserHidden && browserItems.length > 0 && <button className="restore-browser-entry" onClick={() => hideBrowser(false)}>显示本轮网页入口</button>}
      <div className="process-timeline">{process.map((item) => <ProcessItem key={item.id} item={item} />)}
        {notes.map(item => <details className="turn-error" key={`note-${item.id}`}><summary>系统核验记录</summary><pre>{String(item.metadata?.completion_note)}</pre></details>)}
        {turn?.error && <details className="turn-error"><summary>本次执行的错误原因</summary><pre>{turn.error}</pre></details>}
      </div>
    </details>}
    {running && !process.length && !live && <p className="reply-status" role="status"><span className="loader" />{waiting || "正在回复…"}</p>}
    {(!!answerText || live) && <article className="assistant-message">
      <Markdown remarkPlugins={[remarkGfm]} components={{ pre: CodeBlock }}>{answerText || modelAnswerText(live!)}</Markdown>
      {!!answerText && !running && <div className="reply-actions"><CopyButton text={answerText} showLabel /></div>}
    </article>}
    {!!browserItems.length && !browserHidden && actions.openBrowser && <BrowserTurnEntry items={browserItems} running={running} openBrowser={actions.openBrowser} hide={() => hideBrowser(true)} />}
    {!!turn?.diff_snapshot?.files.length && <button className="turn-changes-link" onClick={() => actions.openChanges(turn.id)}>查看本轮 {turn.diff_snapshot.files.length} 个文件变更<ChevronRight size={16} /></button>}
    {stopped && !hasProcess && <p className={`reply-status${failed ? " failed" : ""}`} role="status">{failed ? "本次执行未完成" : "本次执行已停止"}{process.length ? "，可展开执行过程查看详情。" : "。"}</p>}
  </section>;
}

export function ConversationView({ items, turns, waiting, ...actions }: { items: Item[]; turns: Turn[]; waiting?: string } & MessageActions) {
  const groups = groupConversation(items, turns);
  return <>{groups.map((group, index) => <Reply key={`${actions.threadId}:${group.id}`} items={group.items} turn={group.turn} waiting={index === groups.length - 1 ? waiting : undefined} {...actions} />)}</>;
}
