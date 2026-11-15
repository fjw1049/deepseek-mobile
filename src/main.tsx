import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  lazy,
  Suspense,
} from "react";
import { createRoot } from "react-dom/client";
import { useModalFocus } from "./modal-focus";
import { Capacitor } from "@capacitor/core";
import { App as NativeApp } from "@capacitor/app";
import {
  Menu,
  Plus,
  ArrowUp,
  Square,
  Code2,
  MessageSquare,
  Activity,
  Folder,
  Settings,
  ChevronRight,
  X,
  RefreshCw,
  Wifi,
  Check,
  ShieldCheck,
  Search,
  MoreHorizontal,
  Terminal,
  Plug,
  Zap,
  Monitor,
  LogOut,
  GitBranch,
  Share2,
  Sun,
  Moon,
} from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  RuntimeClient,
  ApiError,
  applyEvent,
  type Thread,
  type Detail,
  type Approval,
  type Elevation,
  type InputRequest,
  type Item,
} from "./protocol";
import {
  AttachmentPicker,
  AttachmentList,
  CopyButton,
  CodeBlock,
  composeMessage,
  type TextAttachment,
} from "./composer-tools";
import { SessionTools } from "./session-tools";
import { ResourceTools } from "./resource-tools";
import { WorkspaceTools } from "./workspace-tools";
import {
  MediaPicker,
  MediaAttachmentList,
  composeMediaMessage,
  type UploadedAttachment,
} from "./media-composer";
import { FileTools } from "./file-tools";
import {
  NativeNotificationSettings,
  notifyRuntimeEvent,
} from "./notifications";
import { PreviewStatus } from "./preview-status";
import { VoiceInput } from "./voice-input";
import { AdvancedSessionTools } from "./advanced-session-tools";
import { ExtensionTools } from "./extension-tools";
import { GitTools } from "./git-tools";
const TerminalTools = lazy(() =>
  import("./terminal-tools").then((m) => ({ default: m.TerminalTools })),
);
import { CuaTools } from "./cua-tools";
import { BrowserControls } from "./browser-controls";
import {
  SkillManagement,
  ProjectMemory,
  McpManagement,
} from "./settings-management";
import { PairingPanel, DeviceTools } from "./device-tools";
import { ModelCatalog } from "./model-catalog";
import "./style.css";

type ResumeReview = {
  code?: string;
  confirmation_key: string;
  permission_changes: Array<{
    field: string;
    current: unknown;
    target: unknown;
  }>;
};
const permissionNames: Record<string, string> = {
  workspace: "工作目录",
  mode: "运行模式",
  allow_shell: "Shell 执行",
  trust_mode: "信任模式",
  auto_approve: "自动审批",
};
type Page = "chat" | "activity" | "workspace" | "settings";
const label: Record<string, string> = {
  agent: "执行",
  plan: "规划",
  ask: "问答",
  goal: "目标",
  completed: "已完成",
  complete: "已完成",
  active: "运行中",
  running: "运行中",
  paused: "已暂停",
  blocked: "等待处理",
  budget_limited: "预算已用尽",
  timed_out: "已超时",
  in_progress: "运行中",
  queued: "等待中",
  failed: "失败",
  interrupted: "已停止",
  canceled: "已取消",
};
const active = (s?: string) =>
  s === "in_progress" || s === "queued" || s === "running";
const pretty = (v: unknown) =>
  typeof v === "string" ? v : JSON.stringify(v, null, 2);
function IconButton({
  title,
  onClick,
  children,
  disabled = false,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      className="icon-button"
      aria-label={title}
      title={title}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
function Sheet({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  const dialogRef = useModalFocus(true, close);
  return (
    <div
      className={`overlay ${title === "执行结果" ? "panel-overlay" : title === "快速选择模型" ? "model-popover-overlay" : ""}`}
      onClick={close}
    >
      <section
        className={`sheet ${title === "执行结果" ? "side-sheet" : title === "快速选择模型" ? "model-popover-sheet" : ""}`}
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="handle" />
        <header>
          <h2>{title}</h2>
          <IconButton title="关闭" onClick={close}>
            <X size={20} />
          </IconButton>
        </header>
        {children}
      </section>
    </div>
  );
}
function Connection({
  connect,
}: {
  connect: (client: RuntimeClient) => Promise<void>;
}) {
  const [url, setUrl] = useState(
      localStorage.getItem("runtime-url") ??
        (Capacitor.isNativePlatform() ? "" : "/runtime"),
    ),
    [token, setToken] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <main className="connection">
      <div className="brandmark">
        <Code2 size={32} />
      </div>
      <div className="eyebrow">DEEPSEEK MOBILE</div>
      <h1>
        你的工作台，
        <br />
        随身同行。
      </h1>
      <p>连接电脑上的 DeepSeek Runtime，继续对话、查看任务，随时做出决定。</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const client = new RuntimeClient(url, token);
            await connect(client);
            localStorage.setItem("runtime-url", url);
          } catch (e) {
            setError(e instanceof Error ? e.message : "连接失败");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          电脑服务地址
          <input
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://你的电脑地址"
            autoCapitalize="none"
            autoCorrect="off"
          />
        </label>
        <label>
          访问令牌
          <input
            required
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Runtime access token"
            autoComplete="off"
          />
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? <RefreshCw className="spin" size={17} /> : <Wifi size={17} />}{" "}
          {busy ? "正在连接" : "连接工作台"}
          <ChevronRight size={18} />
        </button>
      </form>
      <PairingPanel connect={connect} />
      <small>
        模型在电脑执行。手动输入的令牌仅存本次内存；原生 App
        的配对凭据保存在系统安全存储中。
      </small>
    </main>
  );
}
function ItemView({
  item,
  reuse,
}: {
  item: Item;
  reuse?: (text: string) => void;
}) {
  const body = item.detail || item.summary;
  if (item.kind === "user_message")
    return (
      <div className="user-message">
        {body.length > 600 ? (
          <>
            <span>{body.slice(0, 240)}…</span>
            <details>
              <summary>展开完整消息与附件正文</summary>
              <div>{body}</div>
            </details>
          </>
        ) : (
          body
        )}
        {reuse && (
          <button className="reuse-message" onClick={() => reuse(body)}>
            编辑为新消息
          </button>
        )}
      </div>
    );
  if (item.kind === "agent_message")
    return (
      <article className="assistant-message">
        <Markdown remarkPlugins={[remarkGfm]} components={{ pre: CodeBlock }}>
          {body}
        </Markdown>
        {!active(item.status) && <CopyButton text={body} />}
      </article>
    );
  return (
    <details className={`tool-card ${item.kind === "error" ? "failed" : ""}`}>
      <summary>
        {active(item.status) ? (
          <span className="loader" />
        ) : (
          <Check size={15} />
        )}
        <span>
          {item.kind === "agent_reasoning"
            ? "思考过程"
            : item.summary || item.kind}
        </span>
        <small>{label[item.status] ?? item.status}</small>
      </summary>
      <pre>
        {body}
        {item.metadata ? "\n" + pretty(item.metadata) : ""}
      </pre>
    </details>
  );
}
function AskCard({
  request,
  submit,
}: {
  request: InputRequest;
  submit: (answers: unknown[], cancelled?: boolean) => Promise<void>;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="action-card"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await submit(
            request.questions.map((q, i) => ({
              question_id: q.id ?? String(i),
              value: answers[q.id ?? String(i)] ?? "",
            })),
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="card-label">
        <MessageSquare size={16} />
        需要你的回答
      </div>
      {request.questions.map((q, i) => {
        const id = q.id ?? String(i);
        return (
          <fieldset key={id}>
            <legend>{q.question ?? q.header}</legend>
            {q.options && (
              <div className="options">
                {q.options.map((o) => (
                  <button
                    type="button"
                    className={answers[id] === o.label ? "selected" : ""}
                    key={o.label}
                    onClick={() => setAnswers({ ...answers, [id]: o.label })}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}
            <input
              aria-label={q.question ?? q.header ?? "回答"}
              value={answers[id] ?? ""}
              required
              onChange={(e) => setAnswers({ ...answers, [id]: e.target.value })}
              placeholder="输入你的回答"
            />
          </fieldset>
        );
      })}
      <div className="actions">
        <button
          type="button"
          onClick={() => void submit([], true)}
          disabled={busy}
        >
          取消
        </button>
        <button className="primary" disabled={busy}>
          提交回答
        </button>
      </div>
    </form>
  );
}
function App() {
  const [client, setClient] = useState<RuntimeClient | null>(null),
    [threads, setThreads] = useState<Thread[]>([]),
    [selected, setSelected] = useState<string | null>(null),
    [detail, setDetail] = useState<Detail | null>(null),
    [page, setPage] = useState<Page>("chat");
  const [drawer, setDrawer] = useState(false),
    [search, setSearch] = useState(""),
    [showArchived, setShowArchived] = useState(false),
    [sheet, setSheet] = useState<
      "new" | "model" | "model-quick" | "more" | "result" | null
    >(null),
    [toast, setToast] = useState(""),
    [busy, setBusy] = useState(false),
    [streamState, setStreamState] = useState("连接中"),
    [resume, setResume] = useState(0);
  const [prompt, setPrompt] = useState(""),
    [mode, setMode] = useState("agent"),
    [provider, setProvider] = useState(""),
    [model, setModel] = useState(""),
    [effort, setEffort] = useState(""),
    [workspace, setWorkspace] = useState(""),
    [title, setTitle] = useState("");
  const [approvals, setApprovals] = useState<Approval[]>([]),
    [questions, setQuestions] = useState<InputRequest[]>([]),
    [elevations, setElevations] = useState<Elevation[]>([]),
    [records, setRecords] = useState<unknown>(null),
    [resource, setResource] = useState("tasks"),
    [resourceError, setResourceError] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const drawerRef = useModalFocus(drawer, () => setDrawer(false));
  const composerMenu = useRef<HTMLDetailsElement>(null);
  const modelBeforeEdit = useRef({ thread: selected, provider, model, effort });
  const openModel = () => {
    modelBeforeEdit.current = { thread: selected, provider, model, effort };
    setSheet("model-quick");
  };
  const cancelModel = () => {
    const previous = modelBeforeEdit.current;
    if (previous.thread === selectedRef.current) {
      setProvider(previous.provider);
      setModel(previous.model);
      setEffort(previous.effort);
    }
    setSheet(null);
  };
  const resourceRequest = useRef(0);
  const [attachments, setAttachments] = useState<TextAttachment[]>([]);
  const [uploaded, setUploaded] = useState<UploadedAttachment[]>([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [workspaceView, setWorkspaceView] = useState("files");
  const uploadedDrafts = useRef<Record<string, UploadedAttachment[]>>({});
  const drafts = useRef<
    Record<string, { prompt: string; files: TextAttachment[] }>
  >({});
  const [theme, setTheme] = useState(
    localStorage.getItem("mobile-theme") ?? "system",
  );
  const [capabilities, setCapabilities] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      document.documentElement.dataset.theme =
        theme === "system" ? (media.matches ? "dark" : "light") : theme;
    };
    update();
    localStorage.setItem("mobile-theme", theme);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [theme]);
  useEffect(() => {
    setCapabilities({});
    if (!client) return;
    let stale = false;
    void client
      .request<{ capabilities?: Record<string, boolean> }>(
        "/legacy/app",
        "POST",
        { op: "capabilities" },
      )
      .then((r) => {
        if (!stale) setCapabilities(r.capabilities ?? {});
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [client]);
  const [resumeReview, setResumeReview] = useState<
    (ResumeReview & { taskId: string; threadId: string | null }) | null
  >(null);
  const connectionRef = useRef(client);
  connectionRef.current = client;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const composerState = useRef({ prompt, attachments, uploaded });
  composerState.current = { prompt, attachments, uploaded };
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }
  }, [prompt, selected, page]);
  const switchThread = (id: string | null, preserve = true) => {
    const previous = selectedRef.current;
    if (previous === id) return;
    if (previous && preserve) {
      const draft = composerState.current;
      drafts.current[previous] = {
        prompt: draft.prompt,
        files: draft.attachments,
      };
      uploadedDrafts.current[previous] = draft.uploaded;
    }
    const draft = id ? drafts.current[id] : undefined;
    selectedRef.current = id;
    detailRef.current = null;
    setSelected(id);
    setDetail(null);
    setPrompt(draft?.prompt ?? "");
    setAttachments(draft?.files ?? []);
    setUploaded(id ? (uploadedDrafts.current[id] ?? []) : []);
    setUploadBusy(false);
    setEffort("");
    setSheet(null);
    if (composerMenu.current) composerMenu.current.open = false;
  };
  const content = useRef<HTMLDivElement>(null),
    follow = useRef(true),
    detailRef = useRef<Detail | null>(null);
  useEffect(() => {
    detailRef.current = detail;
  }, [detail]);
  const error = (e: unknown) =>
    setToast(e instanceof Error ? e.message : String(e));
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const visible = () => {
      if (document.visibilityState === "visible") setResume((n) => n + 1);
    };
    document.addEventListener("visibilitychange", visible);
    const listener = NativeApp.addListener("appStateChange", (s) => {
      if (s.isActive) setResume((n) => n + 1);
    });
    return () => {
      document.removeEventListener("visibilitychange", visible);
      void listener.then((h) => h.remove());
    };
  }, []);
  useEffect(() => {
    const sub = NativeApp.addListener("backButton", () => {
      const dismiss = new Event("mobile-dismiss-overlay", { cancelable: true });
      if (!window.dispatchEvent(dismiss)) return;
      if (composerMenu.current?.open) {
        composerMenu.current.open = false;
        return;
      }
      if (sheet) setSheet(null);
      else if (drawer) setDrawer(false);
      else if (page !== "chat") setPage("chat");
      else if (selected) switchThread(null);
      else void NativeApp.minimizeApp();
    });
    return () => {
      void sub.then((h) => h.remove());
    };
  }, [sheet, drawer, page, selected]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) {
        if (composerMenu.current?.open) {
          composerMenu.current.open = false;
          return;
        }
        setSheet(null);
        setDrawer(false);
      }
    };
    const outsideComposer = (event: PointerEvent) => {
      if (
        composerMenu.current?.open &&
        event.target instanceof Node &&
        !composerMenu.current.contains(event.target)
      )
        composerMenu.current.open = false;
    };
    window.addEventListener("keydown", key);
    window.addEventListener("pointerdown", outsideComposer);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("pointerdown", outsideComposer);
    };
  }, []);
  const refreshThreads = useCallback(async () => {
    if (client)
      setThreads(
        await client.request<Thread[]>("/v1/threads?include_archived=true"),
      );
  }, [client]);
  useEffect(() => {
    if (!client) return;
    void refreshThreads().catch(error);
  }, [client, resume, refreshThreads]);
  useEffect(() => {
    if (!client || !selected) {
      setDetail(null);
      return;
    }
    const controller = new AbortController();
    let dead = false,
      timer: ReturnType<typeof setTimeout> | undefined;
    setDetail(null);
    setStreamState("连接中");
    setApprovals([]);
    setQuestions([]);
    setElevations([]);
    detailRef.current = null;
    follow.current = true;
    let loadingPending = false;
    const pending = async () => {
      if (loadingPending) return;
      loadingPending = true;
      try {
        const [a, elevations, q] = await Promise.all([
          client.request<Approval[]>(
            `/v1/approvals/pending?thread_id=${selected}`,
            "GET",
            undefined,
            controller.signal,
          ),
          client.request<Elevation[]>(
            `/v1/elevations/pending?thread_id=${selected}`,
            "GET",
            undefined,
            controller.signal,
          ),
          client.request<InputRequest[]>(
            `/v1/user-inputs/pending?thread_id=${selected}`,
            "GET",
            undefined,
            controller.signal,
          ),
        ]);
        if (!dead) {
          setApprovals(a);
          setQuestions(q);
          setElevations(elevations);
        }
      } catch (e) {
        if (!dead) error(e);
      } finally {
        loadingPending = false;
      }
    };
    const snapshot = async () => {
      const d = await client.request<Detail>(
        `/v1/threads/${selected}`,
        "GET",
        undefined,
        controller.signal,
      );
      if (!dead) {
        // A snapshot can finish after newer SSE deltas. Do not roll them back.
        const previous = detailRef.current;
        if (!previous || d.latest_seq >= previous.latest_seq) {
          detailRef.current = d;
          setDetail(d);
        }
        if (!previous) {
          setMode(d.thread.mode);
          setProvider(d.thread.provider);
          setModel(d.thread.model);
        }
      }
      return d;
    };
    const loop = async () => {
      let delay = 750;
      while (!dead) {
        try {
          const d = await snapshot();
          await pending();
          if (dead) return;
          setStreamState("已连接");
          delay = 750;
          let notificationSeq = d.latest_seq;
          await client.stream(
            selected,
            d.latest_seq,
            controller.signal,
            (event) => {
              if (dead) return;
              if (event.event === "stream.resync_required") {
                throw new Error("会话正在重新同步");
              }
              if (
                typeof event.seq === "number" &&
                event.seq > notificationSeq &&
                (!event.thread_id || event.thread_id === selected)
              ) {
                notificationSeq = event.seq;
                void notifyRuntimeEvent(event, { source: client.base });
              }
              setDetail((old) => {
                if (!old) return old;
                const next = applyEvent(old, event);
                detailRef.current = next;
                return next;
              });
              if (event.event !== "item.delta") {
                void pending();
                if (
                  event.event.startsWith("turn.") ||
                  event.event.startsWith("thread.")
                ) {
                  clearTimeout(timer);
                  timer = setTimeout(() => {
                    void snapshot().catch((e) => {
                      if (!dead) error(e);
                    });
                    void refreshThreads().catch(() => {});
                  }, 250);
                }
              }
            },
          );
        } catch (e) {
          if (dead) return;
          if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
            setStreamState("需要重新连接");
            error(e);
            return;
          }
          setStreamState("重新连接中");
        }
        if (!dead)
          await new Promise<void>((resolve) => {
            const id = setTimeout(resolve, delay);
            controller.signal.addEventListener(
              "abort",
              () => {
                clearTimeout(id);
                resolve();
              },
              { once: true },
            );
          });
        delay = Math.min(delay * 2, 10000);
      }
    };
    void loop();
    const poll = setInterval(() => {
      void pending();
    }, 5000);
    return () => {
      dead = true;
      controller.abort();
      clearTimeout(timer);
      clearInterval(poll);
    };
  }, [client, selected, resume, refreshThreads]);
  useEffect(() => {
    if (follow.current)
      content.current?.scrollTo({
        top: content.current.scrollHeight,
        behavior: "auto",
      });
  }, [detail?.items, approvals, questions]);
  const resourcePaths: Record<string, string> = {
    tasks: "/v1/tasks",
    automations: "/v1/automations",
    skills: "/v1/skills",
    plugins: "/v1/plugins",
    mcp: "/v1/mcp/servers",
    usage: "/v1/usage?group_by=model&scope=session",
    workspace: "/v1/workspace/status",
  };
  const loadResource = useCallback(async () => {
    const generation = ++resourceRequest.current;
    if (!client) return;
    setResourceError("");
    setRecords(null);
    try {
      const data = await client.request(
        resourcePaths[resource] ?? resourcePaths.tasks,
      );
      if (generation === resourceRequest.current) setRecords(data);
    } catch (e) {
      if (generation === resourceRequest.current)
        setResourceError(e instanceof Error ? e.message : String(e));
    }
  }, [client, resource]);
  useEffect(() => {
    if (page !== "chat" && page !== "workspace") void loadResource();
    return () => {
      resourceRequest.current++;
    };
  }, [page, loadResource, resume]);
  if (!client)
    return (
      <Connection
        connect={async (c) => {
          const abort = new AbortController(),
            timer = setTimeout(() => abort.abort(), 12000);
          try {
            const rows = await c.request<Thread[]>(
              "/v1/threads",
              "GET",
              undefined,
              abort.signal,
            );
            setThreads(rows);
            setClient(c);
          } finally {
            clearTimeout(timer);
          }
        }}
      />
    );
  const latest = detail?.turns.at(-1),
    running = active(latest?.status),
    current = detail?.thread;
  const choose = (t: Thread) => {
    switchThread(t.id);
    setPage("chat");
    setDrawer(false);
  };
  const create = async () => {
    const t = await client.request<Thread>("/v1/threads", "POST", {
      ...(workspace.trim() ? { workspace: workspace.trim() } : {}),
      ...(title.trim() ? { title: title.trim() } : {}),
      mode: mode === "goal" ? "agent" : mode,
      ...(provider.trim() ? { provider: provider.trim() } : {}),
      ...(model.trim() ? { model: model.trim() } : {}),
    });
    await refreshThreads();
    choose(t);
    setSheet(null);
    setTitle("");
  };
  const send = async () => {
    if (
      !selected ||
      detailRef.current?.thread.id !== selected ||
      detailRef.current?.thread.archived ||
      (!prompt.trim() && !attachments.length && !uploaded.length)
    )
      return;
    const text = composeMediaMessage(
      composeMessage(prompt, attachments),
      uploaded,
    );
    await client.request(
      `/v1/threads/${selected}/${mode === "goal" ? "goal" : "turns"}`,
      "POST",
      {
        ...(mode === "goal" ? { args: `-- ${text}` } : { prompt: text, mode }),
        ...(provider ? { provider } : {}),
        ...(model ? { model } : {}),
        ...(effort ? { reasoning_effort: effort } : {}),
      },
    );
    if (selectedRef.current === selected) {
      setPrompt("");
      setAttachments([]);
      setUploaded([]);
    }
    delete uploadedDrafts.current[selected];
    delete drafts.current[selected];
    setResume((n) => n + 1);
  };
  const selectPage = (p: Page) => {
    setDrawer(false);
    setSheet(null);
    setPage(p);
    if (p === "workspace") setResource("workspace");
    if (p === "activity") setResource("tasks");
    if (p === "settings") setResource("skills");
  };
  const visibleThreads = threads
    .filter((t) => t.archived === showArchived)
    .filter((t) =>
      `${t.title ?? ""} ${t.workspace}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    );
  const projectGroups = [...new Set(visibleThreads.map((t) => t.workspace))];
  const saveModel = async () => {
    if (selected && provider.trim() && model.trim()) {
      await client.request(`/v1/threads/${selected}`, "PATCH", {
        provider: provider.trim(),
        model: model.trim(),
      });
      await refreshThreads();
    }
    if (selectedRef.current === selected) {
      setSheet(null);
      setResume((n) => n + 1);
    }
  };
  return (
    <div className={`app-shell ${drawer ? "navigation-open" : ""}`}>
      <div
        className="chat-surface"
        inert={drawer || !!sheet || !!resumeReview || undefined}
      >
        <header className="topbar">
          <IconButton
            title="打开会话"
            onClick={() => {
              setSheet(null);
              setDrawer(true);
            }}
          >
            <Menu size={21} />
          </IconButton>
          <div className="header-title">
            <strong>
              {page === "chat"
                ? "智能体聊天"
                : page === "activity"
                  ? "活动"
                  : page === "workspace"
                    ? "工作区"
                    : "设置与扩展"}
            </strong>
            <span
              className="connection-indicator"
              aria-label={selected ? streamState : "已连接电脑"}
              title={selected ? streamState : "已连接电脑"}
            >
              <i
                className={
                  streamState === "已连接" || !selected ? "online" : "offline"
                }
              />
            </span>
          </div>
          <IconButton
            title="结果"
            onClick={() => {
              setDrawer(false);
              setSheet("result");
            }}
          >
            <Code2 size={21} />
          </IconButton>
        </header>
        <PreviewStatus client={client} />
        {page === "chat" ? (
          <>
            <div className="breadcrumb">
              <button
                className="project-breadcrumb"
                aria-label="工作区"
                onClick={() => selectPage("workspace")}
              >
                <Folder size={14} />
                <span>
                  {current?.workspace.split("/").filter(Boolean).at(-1) ??
                    "你的项目"}
                </span>
              </button>
              <ChevronRight size={13} />
              <span>{current?.title ?? "新的一天，开始创造"}</span>
              {selected && (
                <IconButton title="分享聊天" onClick={() => setSheet("more")}>
                  <Share2 size={15} />
                </IconButton>
              )}
              {selected && (
                <IconButton title="会话操作" onClick={() => setSheet("more")}>
                  <MoreHorizontal size={19} />
                </IconButton>
              )}
            </div>
            <div
              className="messages"
              ref={content}
              onScroll={() => {
                const el = content.current;
                if (el)
                  follow.current =
                    el.scrollHeight - el.scrollTop - el.clientHeight < 80;
              }}
            >
              {!selected ? (
                <div className="welcome">
                  <div className="brandmark small">
                    <Code2 size={27} />
                  </div>
                  <span className="eyebrow">YOUR PERSONAL WORKBENCH</span>
                  <h1>想做点什么？</h1>
                  <p>
                    从一个问题到一个完成的项目。
                    <br />
                    让电脑上的智能体继续为你工作。
                  </p>
                  <button
                    className="suggestion"
                    aria-label="新建会话"
                    onClick={() => setSheet("new")}
                  >
                    <Code2 size={20} />
                    <span>
                      <b>开始一个任务</b>
                      <small>选择项目，与智能体一起工作</small>
                    </span>
                    <ChevronRight size={17} />
                  </button>
                  <button
                    className="suggestion"
                    onClick={() => setDrawer(true)}
                  >
                    <MessageSquare size={20} />
                    <span>
                      <b>继续之前的对话</b>
                      <small>{threads.length} 个会话等待你回来</small>
                    </span>
                    <ChevronRight size={17} />
                  </button>
                </div>
              ) : !detail ? (
                <div className="empty">
                  <RefreshCw className="spin" />
                  正在恢复会话…
                </div>
              ) : (
                <>
                  {detail.items.length === 0 && (
                    <div className="empty">
                      <MessageSquare size={28} />
                      <h2>{current?.title ?? "新会话"}</h2>
                      <p>输入任务，开始这次对话。</p>
                    </div>
                  )}
                  {detail.items.map((item) => (
                    <ItemView
                      key={item.id}
                      item={item}
                      reuse={(text) => {
                        setPrompt(text);
                        setAttachments([]);
                        content.current?.scrollTo({
                          top: content.current.scrollHeight,
                        });
                      }}
                    />
                  ))}
                  {current?.goal && (
                    <div className="action-card">
                      <div className="card-label">
                        <Zap size={17} />
                        目标 ·{" "}
                        {label[String(current.goal.status)] ??
                          String(current.goal.status)}
                      </div>
                      <p>{String(current.goal.objective ?? "")}</p>
                      <small>
                        已执行 {String(current.goal.turns_used ?? 0)} 轮 ·{" "}
                        {String(current.goal.tokens_used ?? 0)} tokens
                      </small>
                      <div className="actions">
                        {(current.goal.status === "active"
                          ? [["pause", "暂停目标"]]
                          : ["paused", "blocked"].includes(
                                String(current.goal.status),
                              )
                            ? [["resume", "继续目标"]]
                            : []
                        ).map(([args, name]) => (
                          <button
                            disabled={busy}
                            key={args}
                            onClick={() =>
                              void run(async () => {
                                await client.request(
                                  `/v1/threads/${selected}/goal`,
                                  "POST",
                                  {
                                    args,
                                    expected_goal_id: current.goal!.goal_id,
                                  },
                                );
                                setResume((n) => n + 1);
                              })
                            }
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {approvals.map((a) => (
                    <div className="action-card" key={a.approval_id}>
                      <div className="card-label">
                        <ShieldCheck size={17} />
                        需要你的授权
                      </div>
                      <h3>{a.tool_name}</h3>
                      <p>{a.description}</p>
                      {a.input_summary && <pre>{a.input_summary}</pre>}
                      <div className="actions">
                        <button
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              await client.request(
                                `/v1/approvals/${a.approval_id}`,
                                "POST",
                                { decision: "deny" },
                              );
                              setResume((n) => n + 1);
                            })
                          }
                        >
                          拒绝
                        </button>
                        <button
                          className="primary"
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              await client.request(
                                `/v1/approvals/${a.approval_id}`,
                                "POST",
                                { decision: "allow" },
                              );
                              setResume((n) => n + 1);
                            })
                          }
                        >
                          允许本次
                        </button>
                      </div>
                    </div>
                  ))}
                  {elevations.map((e) => (
                    <div className="action-card" key={e.elevation_id}>
                      <div className="card-label">
                        <ShieldCheck size={17} />
                        请求扩大执行权限
                      </div>
                      <h3>{e.tool_name}</h3>
                      <p>{e.reason}</p>
                      <pre>{e.command_preview}</pre>
                      <div className="actions">
                        {(
                          [
                            ["deny", "拒绝提权"],
                            ["allow", "允许本次提权"],
                          ] as const
                        ).map(([decision, name]) => (
                          <button
                            key={decision}
                            className={decision === "allow" ? "primary" : ""}
                            disabled={busy}
                            onClick={() =>
                              void run(async () => {
                                await client.request(
                                  `/v1/elevations/${e.elevation_id}`,
                                  "POST",
                                  { decision },
                                );
                                setResume((n) => n + 1);
                              })
                            }
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  {questions.map((q) => (
                    <AskCard
                      key={q.request_id}
                      request={q}
                      submit={async (answers, cancelled) => {
                        try {
                          await client.request(
                            `/v1/user-inputs/${q.request_id}`,
                            "POST",
                            { answers, cancelled: !!cancelled },
                          );
                          setResume((n) => n + 1);
                        } catch (e) {
                          error(e);
                        }
                      }}
                    />
                  ))}
                  {running && (
                    <div className="working">
                      <span className="loader" />
                      智能体正在工作{" "}
                      <button onClick={() => setSheet("result")}>
                        查看进展
                        <ChevronRight size={13} />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
            {selected && (
              <section className="composer">
                {current?.archived && (
                  <p className="feature-note">
                    此会话已归档。在“会话操作”中恢复后即可继续发送。
                  </p>
                )}
                <MediaAttachmentList
                  files={uploaded}
                  onChange={setUploaded}
                  disabled={busy || uploadBusy}
                />
                <AttachmentList files={attachments} onChange={setAttachments} />
                <div className="input-box">
                  <textarea
                    ref={inputRef}
                    aria-label="消息"
                    disabled={busy || uploadBusy || !!sheet || !current}
                    placeholder={running ? "追加指令…" : "问我"}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
                        !e.shiftKey &&
                        !e.nativeEvent.isComposing &&
                        matchMedia("(pointer: fine)").matches &&
                        !running &&
                        !busy
                      ) {
                        e.preventDefault();
                        void run(send);
                      }
                    }}
                    rows={1}
                    onInput={(e) => {
                      const el = e.currentTarget;
                      el.style.height = "auto";
                      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
                    }}
                  />
                  <div className="composer-actions">
                    <details className="composer-add" ref={composerMenu}>
                      <summary aria-label="添加附件">
                        <Plus size={20} />
                      </summary>
                      <div className="attachment-popover">
                        <div className="upload-option">
                          <MediaPicker
                            key={selected}
                            client={client}
                            threadId={selected}
                            files={uploaded}
                            onChange={(files) => {
                              setUploaded(files);
                              if (composerMenu.current)
                                composerMenu.current.open = false;
                            }}
                            onDetachedUpload={(file, remaining) => {
                              if (connectionRef.current !== client) return;
                              const currentThread =
                                selectedRef.current === selected;
                              if (!currentThread && !drafts.current[selected])
                                return;
                              const files = currentThread
                                ? composerState.current.uploaded
                                : (uploadedDrafts.current[selected] ?? []);
                              if (files.some((item) => item.path === file.path))
                                return;
                              if (files.length >= 5) {
                                setToast(
                                  "附件已上传到电脑，但原会话草稿已有 5 个附件，请从工作区重新引用。",
                                );
                                return;
                              }
                              const next = [...files, file];
                              if (currentThread) setUploaded(next);
                              else uploadedDrafts.current[selected] = next;
                              setToast(
                                remaining
                                  ? `附件已保存到原会话草稿；其余 ${remaining} 个文件尚未上传，请重新选择。`
                                  : "附件已保存到原会话草稿",
                              );
                            }}
                            onBusy={setUploadBusy}
                            onError={error}
                            disabled={busy || running}
                          />
                        </div>
                        <div className="text-option">
                          <AttachmentPicker
                            key={selected}
                            files={attachments}
                            onChange={(files) => {
                              setAttachments(files);
                              if (composerMenu.current)
                                composerMenu.current.open = false;
                            }}
                            onError={setToast}
                            disabled={busy || running}
                          />
                        </div>
                        <button
                          onClick={() => {
                            selectPage("workspace");
                            setWorkspaceView("files");
                          }}
                        >
                          <Folder size={17} /> 引用电脑文件
                        </button>
                        <hr />
                        <button
                          onClick={() => {
                            setMode("goal");
                            if (composerMenu.current)
                              composerMenu.current.open = false;
                          }}
                        >
                          <Zap size={17} /> 目标模式
                        </button>
                        <button
                          onClick={() => {
                            setMode("plan");
                            if (composerMenu.current)
                              composerMenu.current.open = false;
                          }}
                        >
                          <Code2 size={17} /> 规划模式
                        </button>
                      </div>
                    </details>
                    <button
                      className="model-chip"
                      disabled={!current}
                      onClick={openModel}
                    >
                      {model || "默认模型"}
                      <ChevronRight size={13} />
                    </button>
                    <VoiceInput
                      key={selected}
                      client={client}
                      onTranscript={(text) =>
                        setPrompt((old) => (old ? old + "\n" + text : text))
                      }
                      disabled={busy || uploadBusy || running}
                    />
                    {running ? (
                      <>
                        <button
                          disabled={busy || !prompt.trim()}
                          onClick={() =>
                            void run(async () => {
                              await client.request(
                                `/v1/threads/${selected}/turns/${latest!.id}/steer`,
                                "POST",
                                { prompt },
                              );
                              if (selectedRef.current === selected)
                                setPrompt("");
                              else if (selected && drafts.current[selected])
                                drafts.current[selected].prompt = "";
                            })
                          }
                        >
                          追加
                        </button>
                        <button
                          className="send stop"
                          aria-label="停止生成"
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              await client.request(
                                `/v1/threads/${selected}/turns/${latest!.id}/interrupt`,
                                "POST",
                              );
                              setResume((n) => n + 1);
                            })
                          }
                        >
                          <Square size={16} fill="currentColor" />
                        </button>
                      </>
                    ) : (
                      <button
                        className="send"
                        aria-label="发送消息"
                        disabled={
                          busy ||
                          !current ||
                          uploadBusy ||
                          (!prompt.trim() &&
                            !attachments.length &&
                            !uploaded.length) ||
                          !!current?.archived
                        }
                        onClick={() => void run(send)}
                      >
                        {busy ? (
                          <RefreshCw className="spin" size={18} />
                        ) : (
                          <ArrowUp size={20} />
                        )}
                      </button>
                    )}
                  </div>
                </div>
                <div className="composer-footer">
                  <button
                    aria-label="查看分支"
                    onClick={() => {
                      selectPage("workspace");
                      setWorkspaceView("git");
                    }}
                  >
                    <GitBranch size={14} /> Git
                  </button>
                  <button
                    className="workspace-chip"
                    aria-label="选择项目文件"
                    onClick={() => {
                      selectPage("workspace");
                      setWorkspaceView("files");
                    }}
                  >
                    <Folder size={14} />
                    <span>
                      {current?.workspace.split("/").filter(Boolean).at(-1) ??
                        "项目"}
                    </span>
                    <ChevronRight size={10} />
                  </button>
                  <select
                    aria-label="运行模式"
                    value={mode}
                    onChange={(e) => setMode(e.target.value)}
                  >
                    {["agent", "plan", "ask", "goal"].map((m) => (
                      <option key={m} value={m}>
                        {m === "agent" ? "智能体" : label[m]}
                      </option>
                    ))}
                  </select>
                  <button
                    aria-label="查看上下文"
                    onClick={() => setSheet("more")}
                  >
                    <Activity size={13} />
                  </button>
                </div>
              </section>
            )}
          </>
        ) : (
          <main className="resource-page">
            {page === "settings" && (
              <div className="device-card">
                <div className="avatar">
                  <Monitor size={22} />
                </div>
                <div>
                  <strong>已连接工作台</strong>
                  <small>{client.base}</small>
                </div>
                <IconButton
                  title="断开连接"
                  onClick={() => {
                    switchThread(null, false);
                    drafts.current = {};
                    uploadedDrafts.current = {};
                    setClient(null);
                    setThreads([]);
                    setPage("chat");
                  }}
                >
                  <LogOut size={18} />
                </IconButton>
              </div>
            )}
            {page === "settings" && <DeviceTools client={client} />}
            {page === "settings" && <NativeNotificationSettings />}
            {page === "settings" && (
              <label className="appearance-setting">
                外观
                <select
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  aria-label="外观"
                >
                  <option value="system">跟随系统</option>
                  <option value="light">浅色</option>
                  <option value="dark">深色</option>
                </select>
              </label>
            )}
            {page === "activity" && capabilities.tasks === false && (
              <p className="feature-note">
                当前电脑服务未启用后台任务。请在电脑的 Runtime
                配置中启用后重新连接；普通会话仍可使用。
              </p>
            )}
            {page !== "workspace" && (
              <div className="resource-tabs">
                {(page === "activity"
                  ? [
                      ["tasks", "任务"],
                      ["automations", "自动化"],
                      ["usage", "用量"],
                    ]
                  : page === "settings"
                    ? [
                        ["skills", "技能"],
                        ["plugins", "插件"],
                        ["mcp", "MCP"],
                      ]
                    : [["workspace", "工作区状态"]]
                ).map(([key, name]) => (
                  <button
                    key={key}
                    className={resource === key ? "selected" : ""}
                    onClick={() => setResource(key)}
                  >
                    {name}
                  </button>
                ))}
                <IconButton title="刷新" onClick={() => void loadResource()}>
                  <RefreshCw size={16} />
                </IconButton>
              </div>
            )}
            {page === "workspace" ? (
              selected ? (
                <>
                  <div className="resource-tabs" aria-label="工作区功能">
                    {[
                      ["files", "文件"],
                      ["changes", "执行变更"],
                      ["git", "Git"],
                      ["terminal", "终端"],
                      ["browser", "浏览器控制"],
                      ["cua", "电脑控制"],
                      ["memory", "项目记忆"],
                    ].map(([id, name]) => (
                      <button
                        key={id}
                        onClick={() => setWorkspaceView(id)}
                        className={workspaceView === id ? "selected" : ""}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                  {workspaceView === "files" ? (
                    <FileTools
                      key={selected}
                      client={client}
                      threadId={selected}
                      onMention={(mention) => {
                        setPrompt((old) =>
                          old ? old + "\n" + mention : mention,
                        );
                        setPage("chat");
                      }}
                    />
                  ) : workspaceView === "git" ? (
                    <GitTools
                      key={selected}
                      client={client}
                      threadId={selected}
                    />
                  ) : workspaceView === "terminal" ? (
                    <Suspense fallback={<p role="status">正在加载终端…</p>}>
                      <TerminalTools
                        key={selected}
                        client={client}
                        threadId={selected}
                      />
                    </Suspense>
                  ) : workspaceView === "browser" ? (
                    <BrowserControls
                      key={selected}
                      client={client}
                      threadId={selected}
                    />
                  ) : workspaceView === "cua" ? (
                    <CuaTools
                      key={selected}
                      client={client}
                      threadId={selected}
                    />
                  ) : workspaceView === "memory" ? (
                    <ProjectMemory
                      key={selected}
                      client={client}
                      threadId={selected}
                    />
                  ) : (
                    <WorkspaceTools
                      key={selected}
                      client={client}
                      threadId={selected}
                    />
                  )}
                </>
              ) : (
                <div className="empty">
                  <Folder size={28} />
                  <h2>先选择一个会话</h2>
                  <p>在会话列表选择项目后，可查看真实文件变更和电脑浏览器。</p>
                  <button onClick={() => setDrawer(true)}>选择会话</button>
                </div>
              )
            ) : resourceError ? (
              <div role="alert" className="error">
                {resourceError}
                <button onClick={() => void loadResource()}>重试</button>
              </div>
            ) : records === null ? (
              <div className="empty">
                <RefreshCw className="spin" />
                正在读取电脑数据…
              </div>
            ) : resource === "tasks" || resource === "automations" ? (
              <ResourceTools
                key={resource}
                data={records}
                resource={resource}
                client={client}
                refresh={loadResource}
                openThread={(id) => {
                  const t = threads.find((t) => t.id === id);
                  if (t) choose(t);
                  else {
                    switchThread(id);
                    setPage("chat");
                  }
                }}
                action={(id, action) =>
                  run(async () => {
                    const result = await client.request<ResumeReview>(
                      `/v1/${resource}/${encodeURIComponent(id)}/${action}`,
                      "POST",
                      resource === "tasks" && action === "resume" && selected
                        ? { thread_id: selected }
                        : undefined,
                    );
                    if (result?.code === "resume_confirmation_required") {
                      setResumeReview({
                        ...result,
                        taskId: id,
                        threadId: selected,
                      });
                      return;
                    }
                    await loadResource();
                  })
                }
              />
            ) : resource === "skills" ||
              resource === "plugins" ||
              resource === "mcp" ? (
              <>
                <ExtensionTools
                  key={resource}
                  client={client}
                  resource={resource}
                  data={records}
                  onChanged={loadResource}
                />
                {resource === "skills" && (
                  <SkillManagement client={client} onChanged={loadResource} />
                )}
                {resource === "mcp" && (
                  <McpManagement client={client} onChanged={() => {}} />
                )}
              </>
            ) : (
              <Records data={records} resource={resource} action={() => {}} />
            )}
          </main>
        )}
      </div>
      {drawer && (
        <button
          className="navigation-dismiss"
          aria-label="关闭导航"
          onClick={() => setDrawer(false)}
        />
      )}
      {drawer && (
        <div className="drawer-backdrop" onClick={() => setDrawer(false)}>
          <aside
            ref={drawerRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="会话导航"
            className="drawer"
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <div className="brandmark tiny">
                <Code2 size={20} />
              </div>
              <button
                className="sidebar-brand"
                aria-label="对话"
                onClick={() => selectPage("chat")}
              >
                DeepSeek
              </button>
              <IconButton
                title="搜索会话"
                onClick={() => setSearchOpen((value) => !value)}
              >
                <Search size={17} />
              </IconButton>
              <IconButton title="关闭会话列表" onClick={() => setDrawer(false)}>
                <X size={20} />
              </IconButton>
            </header>
            <button
              className="new-thread"
              onClick={() => {
                setDrawer(false);
                setSheet("new");
              }}
            >
              <Plus size={19} />
              新建会话
            </button>
            {(searchOpen || search) && (
              <label className="search">
                <Search size={16} />
                <input
                  placeholder="搜索会话或项目"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
            )}
            <nav className="sidebar-navigation" aria-label="应用导航">
              {(
                [
                  ["activity", "活动", Activity],
                  ["workspace", "工作区", Folder],
                ] as const
              ).map(([id, name, Icon]) => (
                <button
                  key={id}
                  className={page === id ? "active" : ""}
                  onClick={() => selectPage(id)}
                >
                  <Icon size={21} strokeWidth={page === id ? 2.2 : 1.7} />
                  <span>{name}</span>
                </button>
              ))}
            </nav>

            <div className="resource-tabs" aria-label="会话筛选">
              <button
                className={!showArchived ? "selected" : ""}
                onClick={() => setShowArchived(false)}
              >
                最近会话
              </button>
              <button
                className={showArchived ? "selected" : ""}
                onClick={() => setShowArchived(true)}
              >
                已归档
              </button>
            </div>
            <div className="thread-list">
              {projectGroups.map((project) => (
                <details
                  className="thread-group"
                  key={`${project}-${!!search}`}
                  open
                >
                  <summary
                    title={project}
                    onClick={(e) => {
                      if (search) e.preventDefault();
                    }}
                  >
                    <Folder size={17} />
                    <span>
                      {project.split("/").filter(Boolean).at(-1) || project}
                    </span>
                  </summary>
                  <div className="project-threads">
                    {visibleThreads
                      .filter((t) => t.workspace === project)
                      .map((t) => (
                        <button
                          key={t.id}
                          className={selected === t.id ? "selected" : ""}
                          onClick={() => choose(t)}
                        >
                          <span>
                            <b title={t.title || "新会话"}>
                              {t.title || "新会话"}
                            </b>
                          </span>
                          <small>
                            {label[t.latest_turn_status ?? ""] ?? "就绪"}
                          </small>
                          {t.activity_waiting && <i className="attention" />}
                        </button>
                      ))}
                  </div>
                </details>
              ))}
              {!!search && !visibleThreads.length && (
                <p className="muted">没有匹配的项目或会话。</p>
              )}
              {!threads.some((t) => t.archived === showArchived) && (
                <p className="muted">
                  {showArchived
                    ? "暂无归档会话。"
                    : "还没有会话，开始你的第一个任务。"}
                </p>
              )}
            </div>
            <div className="sidebar-appearance" aria-label="外观快捷设置">
              <button
                aria-label="使用浅色模式"
                aria-pressed={theme === "light"}
                onClick={() => setTheme("light")}
              >
                <Sun size={16} />
              </button>
              <button
                aria-label="使用深色模式"
                aria-pressed={theme === "dark"}
                onClick={() => setTheme("dark")}
              >
                <Moon size={16} />
              </button>
            </div>
            <button
              className="sidebar-settings"
              onClick={() => selectPage("settings")}
            >
              <Settings size={18} /> 设置
            </button>
            <footer>
              <Monitor size={17} />
              <span>个人工作台</span>
              <i className="online" />
            </footer>
          </aside>
        </div>
      )}
      {sheet === "new" && (
        <Sheet title="新建会话" close={() => setSheet(null)}>
          <form
            className="sheet-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(create);
            }}
          >
            <label>
              会话名称
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="这次想做什么？（可选）"
              />
            </label>
            <label>
              电脑上的项目目录
              <input
                value={workspace}
                onChange={(e) => setWorkspace(e.target.value)}
                placeholder="留空使用 Runtime 默认目录"
                autoCapitalize="none"
              />
            </label>
            <label>
              运行模式
              <select value={mode} onChange={(e) => setMode(e.target.value)}>
                {["agent", "plan", "ask", "goal"].map((m) => (
                  <option key={m} value={m}>
                    {label[m]}
                  </option>
                ))}
              </select>
            </label>
            <button className="primary" disabled={busy}>
              创建会话
              <ArrowUp size={17} />
            </button>
          </form>
        </Sheet>
      )}
      {sheet === "model-quick" && (
        <Sheet title="快速选择模型" close={cancelModel}>
          <div className="quick-model-list">
            {Array.from(
              new Map(
                threads.map((t) => [JSON.stringify([t.provider, t.model]), t]),
              ).values(),
            ).map((t) => (
              <button
                key={`${t.provider}/${t.model}`}
                aria-pressed={provider === t.provider && model === t.model}
                onClick={() => {
                  setProvider(t.provider);
                  setModel(t.model);
                }}
              >
                <span>
                  {t.model}
                  <small>{t.provider}</small>
                </span>
                {provider === t.provider && model === t.model && (
                  <Check size={15} />
                )}
              </button>
            ))}
          </div>
          <label className="quick-effort">
            推理强度
            <select value={effort} onChange={(e) => setEffort(e.target.value)}>
              <option value="">使用默认值</option>
              {["off", "low", "medium", "high", "xhigh", "max"].map((value) => (
                <option key={value} value={value}>
                  {
                    {
                      off: "关闭思考",
                      low: "低",
                      medium: "中",
                      high: "高",
                      xhigh: "更高",
                      max: "最高",
                    }[value]
                  }{" "}
                  ({value})
                </option>
              ))}
            </select>
          </label>
          <button
            className="advanced-model-link"
            onClick={() => setSheet("model")}
          >
            高级模型配置
            <ChevronRight size={14} />
          </button>
          <button
            className="primary"
            disabled={busy}
            onClick={() => void run(saveModel)}
          >
            完成
          </button>
        </Sheet>
      )}
      {sheet === "model" && (
        <Sheet title="模型与推理" close={cancelModel}>
          <div className="sheet-form">
            <p className="muted">
              使用电脑中已配置的提供商与模型，密钥留在电脑。
            </p>
            <ModelCatalog
              client={client}
              provider={provider}
              onSelect={(p, m) => {
                setProvider(p);
                setModel(m);
              }}
            />
            <label>
              最近使用的模型
              <select
                aria-label="最近使用的模型"
                value=""
                onChange={(e) => {
                  const pair = JSON.parse(e.target.value) as [string, string];
                  setProvider(pair[0]);
                  setModel(pair[1]);
                }}
              >
                <option value="" disabled>
                  选择已有会话的模型
                </option>
                {Array.from(
                  new Map(
                    threads.map((t) => [
                      JSON.stringify([t.provider, t.model]),
                      t,
                    ]),
                  ).entries(),
                ).map(([value, t]) => (
                  <option key={value} value={value}>
                    {t.provider} / {t.model}
                  </option>
                ))}
              </select>
            </label>
            <label>
              提供商
              <input
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                autoCapitalize="none"
              />
            </label>
            <label>
              模型 ID
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                autoCapitalize="none"
              />
            </label>
            <label>
              推理强度
              <select
                value={effort}
                onChange={(e) => setEffort(e.target.value)}
              >
                <option value="">使用默认值</option>
                {["off", "low", "medium", "high", "xhigh", "max"].map((x) => (
                  <option key={x} value={x}>
                    {
                      {
                        off: "关闭思考",
                        low: "低",
                        medium: "中",
                        high: "高",
                        xhigh: "更高",
                        max: "最高",
                      }[x]
                    }{" "}
                    ({x})
                  </option>
                ))}
              </select>
            </label>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void run(saveModel)}
            >
              完成
            </button>
          </div>
        </Sheet>
      )}
      {sheet === "more" && selected && detail && (
        <Sheet title="会话操作" close={() => setSheet(null)}>
          <SessionTools
            key={selected}
            client={client}
            detail={detail}
            active={running}
            onChanged={async () => {
              await refreshThreads();
              const d = await client.request<Detail>(`/v1/threads/${selected}`);
              if (selectedRef.current !== selected) return;
              const previous = detailRef.current;
              const next =
                previous && previous.latest_seq > d.latest_seq
                  ? { ...previous, thread: d.thread }
                  : d;
              setDetail(next);
              detailRef.current = next;
            }}
            onDeleted={async () => {
              delete drafts.current[selected];
              delete uploadedDrafts.current[selected];
              if (selectedRef.current === selected) switchThread(null, false);
              await refreshThreads();
            }}
            onFork={async (t) => {
              await refreshThreads();
              if (selectedRef.current !== selected) return;
              choose(t);
              setSheet(null);
            }}
            onSync={() => {
              setResume((n) => n + 1);
              setSheet(null);
            }}
          />
          <AdvancedSessionTools
            key={`advanced-${selected}`}
            client={client}
            detail={detail}
            onChanged={async () => {
              await refreshThreads();
              setResume((n) => n + 1);
            }}
            onOpenThread={async (id) => {
              await refreshThreads();
              if (selectedRef.current !== selected) return;
              switchThread(id);
              setPage("chat");
            }}
          />
        </Sheet>
      )}
      {sheet === "result" && (
        <Sheet title="执行结果" close={() => setSheet(null)}>
          {selected && (
            <WorkspaceTools
              key={selected}
              client={client}
              threadId={selected}
              compact
            />
          )}
          <h3>工具记录</h3>
          <div className="result-list">
            {detail?.items
              .filter(
                (i) =>
                  ![
                    "user_message",
                    "agent_message",
                    "agent_reasoning",
                  ].includes(i.kind),
              )
              .map((i) => (
                <ItemView item={i} key={i.id} />
              ))}
            {!detail?.items.some(
              (i) =>
                !["user_message", "agent_message", "agent_reasoning"].includes(
                  i.kind,
                ),
            ) && (
              <div className="empty">
                <Terminal size={28} />
                <p>工具调用和文件变更会显示在这里。</p>
              </div>
            )}
          </div>
        </Sheet>
      )}
      {resumeReview && (
        <Sheet title="恢复任务前确认" close={() => setResumeReview(null)}>
          <div className="sheet-form">
            <p>该任务将恢复以下原有执行权限：</p>
            {resumeReview.permission_changes.map((change) => (
              <div key={change.field}>
                <b>{permissionNames[change.field] ?? change.field}</b>
                <p>
                  {pretty(change.current)} → {pretty(change.target)}
                </p>
              </div>
            ))}
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const result = await client.request<ResumeReview>(
                    `/v1/tasks/${encodeURIComponent(resumeReview.taskId)}/resume`,
                    "POST",
                    {
                      confirmation_key: resumeReview.confirmation_key,
                      ...(resumeReview.threadId
                        ? { thread_id: resumeReview.threadId }
                        : {}),
                    },
                  );
                  if (result?.code === "resume_confirmation_required") {
                    setResumeReview({
                      ...result,
                      taskId: resumeReview.taskId,
                      threadId: resumeReview.threadId,
                    });
                    setToast("权限已变化，请重新检查");
                    return;
                  }
                  setResumeReview(null);
                  await loadResource();
                })
              }
            >
              确认恢复任务
            </button>
          </div>
        </Sheet>
      )}
      {toast && (
        <div role="alert" className="toast" onClick={() => setToast("")}>
          {toast}
          <X size={14} />
        </div>
      )}
    </div>
  );
}
function Records({
  data,
  resource,
  action,
}: {
  data: unknown;
  resource: string;
  action: (id: string, a: string) => void;
}) {
  const value = data as Record<string, unknown> | null;
  const candidates = Array.isArray(data)
    ? data
    : (value?.[resource] ?? value?.items ?? value?.servers);
  if (Array.isArray(candidates))
    return (
      <div className="record-list">
        {candidates.length === 0 ? (
          <div className="empty">
            <Check size={27} />
            <h2>暂时没有内容</h2>
            <p>
              电脑上的{resource === "tasks" ? "任务" : "配置"}会同步显示在这里。
            </p>
          </div>
        ) : (
          candidates.map((r: Record<string, unknown>, i) => (
            <article className="record-card" key={String(r.id ?? r.name ?? i)}>
              <div className="card-label">
                {resource === "automations" ? (
                  <Zap size={16} />
                ) : resource === "tasks" ? (
                  <Activity size={16} />
                ) : (
                  <Plug size={16} />
                )}
                <span>
                  {String(r.title ?? r.name ?? r.prompt ?? r.id ?? "项目")}
                </span>
              </div>
              <span className="status-pill">
                {label[String(r.status)] ??
                  String(r.status ?? (r.enabled === false ? "已停用" : "可用"))}
              </span>
              <details>
                <summary>详细信息</summary>
                <pre>{pretty(r)}</pre>
              </details>
              {resource === "tasks" && !!r.id && (
                <div className="actions">
                  {active(String(r.status)) ? (
                    <button onClick={() => action(String(r.id), "cancel")}>
                      停止任务
                    </button>
                  ) : [
                      "failed",
                      "interrupted",
                      "canceled",
                      "timed_out",
                    ].includes(String(r.status)) ? (
                    <button onClick={() => action(String(r.id), "resume")}>
                      恢复任务
                    </button>
                  ) : null}
                </div>
              )}
              {resource === "automations" && !!r.id && (
                <div className="actions">
                  <button
                    onClick={() =>
                      action(
                        String(r.id),
                        r.status === "paused" ? "resume" : "pause",
                      )
                    }
                  >
                    {r.status === "paused" ? "启用" : "暂停"}
                  </button>
                  <button onClick={() => action(String(r.id), "run")}>
                    立即运行
                  </button>
                </div>
              )}
            </article>
          ))
        )}
      </div>
    );
  return (
    <div className="record-card">
      <pre>{pretty(data)}</pre>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
