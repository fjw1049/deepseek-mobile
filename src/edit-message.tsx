import { useRef, useState } from "react";
import { RuntimeClient, type Item, type Turn } from "./protocol";
import { messageText } from "./conversation";

type Preview = { turns: number; files: string[]; conflicts: string[]; skipped: string[]; missing_roots?: string[]; no_checkpoint: number };
type Outcome = { restored_files?: string[]; merged_files?: string[]; conflicted_files?: string[]; skipped_files?: string[]; missing_roots?: string[] };
export function EditMessage({ client, threadId, item, options, isCurrent, onChanged, onSent, onKeepDraft, onBusy }: {
  client: RuntimeClient; threadId: string; item: Item; options: Record<string, unknown>;
  isCurrent: () => boolean; onChanged: () => Promise<void>; onSent: () => void;
  onKeepDraft: (text: string) => void; onBusy: (busy: boolean) => void;
}) {
  const [text, setText] = useState(messageText(item));
  const [preview, setPreview] = useState<Preview | null>(null);
  const [restore, setRestore] = useState(true);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false), rewound = useRef(false);
  const base = `/v1/threads/${encodeURIComponent(threadId)}`;
  async function run(action: () => Promise<void>) {
    if (inFlight.current || !isCurrent()) return;
    inFlight.current = true; setBusy(true); onBusy(true); setError("");
    try { await action(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { inFlight.current = false; setBusy(false); onBusy(false); }
  }
  async function send() {
    if (!isCurrent()) return;
    // A timed-out write is never replayed. Keep the edited text for inspection.
    setUncertain(true);
    await client.request<Turn>(`${base}/turns`, "POST", { ...options, prompt: text.trim() });
    setUncertain(false);
    onSent();
  }
  async function commit(restoreFiles: boolean) {
    if (!isCurrent() || rewound.current) return;
    setUncertain(true);
    const result = await client.request<{ rewind_result?: Outcome }>(`${base}/rewind`, "POST", {
      before_item_id: item.id, restore_files: restoreFiles, force_conflicts: false,
    });
    rewound.current = true;
    setUncertain(false);
    setOutcome(result.rewind_result ?? {});
    await onChanged();
    const actual = result.rewind_result;
    if (restoreFiles && (!actual || actual.conflicted_files?.length || actual.skipped_files?.length || actual.missing_roots?.length)) return;
    await send();
  }
  const partial = rewound.current && !uncertain;
  return <div className="sheet-form edit-message-form">
    <p className="muted">重新生成将替换本条及后续回复。</p>
    <label>编辑消息<textarea aria-label="编辑消息" value={text} rows={5} disabled={busy || rewound.current || uncertain} onChange={e => { setText(e.target.value); setPreview(null); }} /></label>
    {preview && !rewound.current && <section className="record-card" aria-label="重发影响">
      <p>将重新生成 {preview.turns} 轮对话。</p>
      {!!preview.files.length && <><h3>涉及的文件</h3><ul>{preview.files.map(path => <li key={path}>{path}</li>)}</ul></>}
      <label><input type="radio" name="restore-edit" checked={restore} disabled={busy} onChange={() => setRestore(true)} />恢复本会话的文件修改后重发</label>
      <label><input type="radio" name="restore-edit" checked={!restore} disabled={busy} onChange={() => setRestore(false)} />保留当前文件，仅重新生成对话</label>
      <p className="muted">恢复检查点，保留外部修改。</p>
      {!!preview.conflicts.length && <p>可能存在冲突：{preview.conflicts.join("、")}</p>}
      {!!preview.skipped.length && <p>将跳过：{preview.skipped.join("、")}</p>}
      {!!preview.missing_roots?.length && <p>部分工作区已不存在，无法恢复对应文件。</p>}
      {!!preview.no_checkpoint && <p>{preview.no_checkpoint} 轮没有文件检查点，不能保证恢复完整。</p>}
    </section>}
    {outcome && <section className="record-card" aria-label="文件恢复结果">
      <p>原消息及后续对话已回退。</p>
      {([['restored_files', '已恢复'], ['merged_files', '已合并'], ['conflicted_files', '冲突，未覆盖'], ['skipped_files', '已跳过'], ['missing_roots', '工作区缺失']] as const).map(([key, title]) => outcome[key]?.length ? <p key={key}>{title}：{outcome[key]!.join('、')}</p> : null)}
    </section>}
    {error && <p role="alert" className="error">{error}</p>}
    {uncertain && <p role="status">操作结果尚未确认，已暂停重发。请先核对会话状态；编辑文字仍保留在这里。</p>}
    {partial && <p role="status">尚未重新发送。请核对文件恢复结果，再决定是否继续。</p>}
    {!uncertain && <button className="primary" disabled={busy || !text.trim()} onClick={() => void run(async () => {
      if (rewound.current) { await send(); return; }
      if (preview) { await commit(restore); return; }
      const next = await client.request<Preview>(`${base}/rewind-preview?before_item_id=${encodeURIComponent(item.id)}`);
      if (!isCurrent()) return;
      if (next.files.length || next.conflicts.length || next.skipped.length || next.missing_roots?.length || next.no_checkpoint) setPreview(next);
      else await commit(false);
    })}>{busy ? "正在处理…" : partial ? "按当前文件状态继续发送" : preview ? "确认重新发送" : "重新发送"}</button>}
    {uncertain && <button disabled={busy} onClick={() => void run(onChanged)}>核对会话状态</button>}
    {(error || uncertain || partial) && <button disabled={busy} onClick={() => onKeepDraft(text)}>将编辑文字保留到输入框</button>}
  </div>;
}
