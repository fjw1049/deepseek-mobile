import { useEffect, useRef, useState, type ReactNode } from "react";
import { FileText, Copy, X } from "lucide-react";

export type TextAttachment = { name: string; text: string; size: number };
export const ATTACHMENT_LIMIT = 100 * 1024;
const extensions =
  /\.(txt|md|csv|tsv|json|jsonl|yaml|yml|xml|html|css|js|jsx|ts|tsx|py|sh|sql|log|toml|ini|rs|go|java|c|cpp|h)$/i;
export async function readTextAttachments(
  files: File[],
  previous: TextAttachment[],
): Promise<TextAttachment[]> {
  if (files.length + previous.length > 5)
    throw new Error("每条消息最多添加 5 个文本文件");
  if (
    files.reduce((n, f) => n + f.size, 0) +
      previous.reduce((n, f) => n + f.size, 0) >
    ATTACHMENT_LIMIT
  )
    throw new Error("文本附件总大小不能超过 100 KB");
  const next: TextAttachment[] = [];
  for (const file of files) {
    if (!extensions.test(file.name))
      throw new Error(
        `${file.name}：目前支持文本、代码和 CSV；图片、PDF 和 Office 文件请使用「添加文件或图片」`,
      );
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(
        await file.arrayBuffer(),
      );
    } catch {
      throw new Error(`${file.name} 不是 UTF-8 文本，请转换编码后重试`);
    }
    if (text.includes("\0"))
      throw new Error(`${file.name} 包含二进制内容，不能作为文本发送`);
    next.push({ name: file.name, text, size: file.size });
  }
  return [...previous, ...next];
}
export function composeMessage(prompt: string, files: TextAttachment[]) {
  if (!files.length) return prompt.trim();
  return `${prompt.trim()}\n\n以下是用户附加的文本文件内容：\n${files.map((f) => JSON.stringify({ filename: f.name, content: f.text })).join("\n")}`.trim();
}
export function AttachmentPicker({
  files,
  onChange,
  onError,
  disabled,
}: {
  files: TextAttachment[];
  onChange: (files: TextAttachment[]) => void;
  onError: (message: string) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [reading, setReading] = useState(false);
  return (
    <>
      <button
        className="icon-button"
        aria-label="添加文本附件"
        disabled={disabled || reading}
        onClick={() => input.current?.click()}
      >
        <FileText size={18} />
      </button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        aria-label="选择文本附件"
        accept=".txt,.md,.csv,.tsv,.json,.jsonl,.yaml,.yml,.xml,.html,.css,.js,.jsx,.ts,.tsx,.py,.sh,.sql,.log,.toml,.ini,.rs,.go,.java,.c,.cpp,.h"
        onChange={async (e) => {
          const selected = Array.from(e.currentTarget.files ?? []);
          e.currentTarget.value = "";
          setReading(true);
          try {
            const next = await readTextAttachments(selected, files);
            if (mounted.current) onChange(next);
          } catch (e) {
            if (mounted.current)
              onError(e instanceof Error ? e.message : String(e));
          } finally {
            if (mounted.current) setReading(false);
          }
        }}
      />
    </>
  );
}
export function AttachmentList({
  files,
  onChange,
}: {
  files: TextAttachment[];
  onChange: (files: TextAttachment[]) => void;
}) {
  return files.length ? (
    <div className="attachments">
      <small>文本内容将随消息发送 · 最多 5 个 / 100 KB</small>
      {files.map((f, i) => (
        <div className="attachment" key={`${f.name}-${i}`}>
          <details>
            <summary>
              {f.name} · {Math.ceil(f.size / 1024)} KB
            </summary>
            <pre>
              {f.text.slice(0, 3000)}
              {f.text.length > 3000 ? "\n…预览已截断，发送时保留全文" : ""}
            </pre>
          </details>
          <button
            aria-label={`移除附件 ${f.name}`}
            onClick={() => onChange(files.filter((_, j) => j !== i))}
          >
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  ) : null;
}
export function CopyButton({
  text,
  label = "复制回复",
}: {
  text: string;
  label?: string;
}) {
  const [status, setStatus] = useState("");
  return (
    <span className="copy-control">
      <button
        className="copy-button"
        aria-label={label}
        onClick={async () => {
          try {
            if (!navigator.clipboard) throw new Error();
            await navigator.clipboard.writeText(text);
            setStatus("已复制");
          } catch {
            setStatus("复制失败，请长按选择文字");
          }
        }}
      >
        <Copy size={14} />
        {label === "复制代码" ? "复制代码" : null}
      </button>
      {status && <small role="status">{status}</small>}
    </span>
  );
}
export function CodeBlock({ children }: { children?: ReactNode }) {
  const code = useRef<HTMLPreElement>(null);
  const [status, setStatus] = useState("");
  return (
    <div className="code-block">
      <button
        aria-label="复制代码"
        onClick={async () => {
          try {
            if (!navigator.clipboard) throw new Error();
            await navigator.clipboard.writeText(code.current?.innerText ?? "");
            setStatus("已复制");
          } catch {
            setStatus("复制失败，请选择代码复制");
          }
        }}
      >
        {status || "复制代码"}
      </button>
      <pre ref={code}>{children}</pre>
    </div>
  );
}
