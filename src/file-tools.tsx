import { useEffect, useRef, useState } from "react";
import { Folder, File, Download, ArrowLeft, RefreshCw } from "lucide-react";
import { RuntimeClient } from "./protocol";
import { exportFile } from "./native-files";

type Entry = { name: string; path: string; directory: boolean; size: number };
type Listing = { path: string; entries: Entry[]; truncated: boolean };
type Content = {
  name: string;
  path: string;
  size: number;
  data_base64: string;
};
function bytes(content: Content) {
  return Uint8Array.from(atob(content.data_base64), (char) =>
    char.charCodeAt(0),
  );
}
function preview(content: Content): string | null {
  const data = bytes(content);
  if (data.slice(0, 200000).includes(0)) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(
      data.slice(0, 200000),
      { stream: data.length > 200000 },
    );
  } catch {
    return null;
  }
}
export function FileTools({
  client,
  threadId,
  onMention,
}: {
  client: RuntimeClient;
  threadId: string;
  onMention?: (mention: string) => void;
}) {
  const epoch = useRef(0);
  useEffect(() => {
    epoch.current += 1;
    return () => {
      epoch.current += 1;
    };
  }, [threadId]);
  const [path, setPath] = useState("");
  const [listing, setListing] = useState<Listing | null>(null);
  const [content, setContent] = useState<Content | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    setPath("");
    setContent(null);
  }, [threadId]);
  useEffect(() => {
    const controller = new AbortController();
    let live = true;
    setBusy(true);
    setError("");
    setListing(null);
    setContent(null);
    void client
      .request<Listing>(
        `/v1/threads/${encodeURIComponent(threadId)}/files?path=${encodeURIComponent(path)}`,
        "GET",
        undefined,
        controller.signal,
      )
      .then((value) => {
        if (live) setListing(value);
      })
      .catch((e: unknown) => {
        if (live) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
      controller.abort();
    };
  }, [client, threadId, path, refresh]);
  const open = async (entry: Entry) => {
    if (entry.directory) {
      setPath(entry.path);
      return;
    }
    const generation = epoch.current;
    setBusy(true);
    setError("");
    setContent(null);
    try {
      const result = await client.request<Content>(
        `/v1/threads/${encodeURIComponent(threadId)}/files/content?path=${encodeURIComponent(entry.path)}`,
      );
      if (generation === epoch.current) setContent(result);
    } catch (e) {
      if (generation === epoch.current)
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (generation === epoch.current) setBusy(false);
    }
  };
  const text = content ? preview(content) : null;
  return (
    <section aria-label="工作区文件">
      <div className="resource-tabs">
        <button
          disabled={busy || (!path && !content)}
          onClick={() =>
            content
              ? setContent(null)
              : setPath(path.split("/").slice(0, -1).join("/"))
          }
        >
          <ArrowLeft size={15} /> 返回
        </button>
        <strong style={{ overflowWrap: "anywhere", minWidth: 0, flex: 1 }}>
          {content?.name ?? (path.split("/").at(-1) || "项目文件")}
        </strong>
        <button
          className="icon-button"
          aria-label="刷新文件列表"
          disabled={busy}
          onClick={() => setRefresh((value) => value + 1)}
        >
          <RefreshCw size={16} />
        </button>
      </div>
      <p className="muted">
        仅当前会话的执行目录。敏感文件、符号链接不显示；单文件上限 8 MiB。
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {busy && (
        <p role="status" className="empty">
          正在读取电脑文件…
        </p>
      )}
      {!busy && content ? (
        <article className="record-card">
          <div className="actions">
            {onMention && !/["\r\n]/.test(content.path) && (
              <button onClick={() => onMention(`@"${content.path}"`)}>
                引用到消息
              </button>
            )}
            <button
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await exportFile({
                    name: content.name,
                    data: bytes(content),
                  });
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Download size={14} /> 保存或分享文件
            </button>
          </div>
          {text !== null ? (
            <>
              <pre style={{ maxHeight: "50vh", overflow: "auto" }}>{text}</pre>
              {content.size > 200000 && (
                <p className="muted">
                  预览仅显示前 200 KB，保存可获取完整文件。
                </p>
              )}
            </>
          ) : /\.(png|jpe?g|webp|gif|bmp)$/i.test(content.name) ? (
            <img
              alt={content.name}
              src={`data:image/${content.name.split(".").at(-1)?.replace("jpg", "jpeg")};base64,${content.data_base64}`}
              style={{ maxWidth: "100%", marginTop: 16 }}
            />
          ) : (
            <p className="empty">
              此格式不支持文本预览，可保存后使用对应应用打开。
            </p>
          )}
        </article>
      ) : (
        !busy &&
        listing && (
          <>
            {!listing.entries.length && (
              <p className="empty">这个目录没有可访问的文件。</p>
            )}
            {listing.entries.map((entry) => (
              <button
                className="menu-row"
                style={{
                  width: "100%",
                  marginTop: 8,
                  overflowWrap: "anywhere",
                }}
                key={entry.path}
                onClick={() => void open(entry)}
              >
                {entry.directory ? <Folder size={17} /> : <File size={17} />}
                <span style={{ minWidth: 0, flex: 1 }}>{entry.name}</span>
                {!entry.directory && (
                  <small>{Math.ceil(entry.size / 1024)} KB</small>
                )}
              </button>
            ))}
            {listing.truncated && (
              <p className="muted">目录超过 300 项，仅显示部分结果。</p>
            )}
          </>
        )
      )}
    </section>
  );
}
