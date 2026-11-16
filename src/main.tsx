import { UsageView } from "./usage-view";
import { connectionFeedback } from "./connection-feedback";
import { loadDeviceCredential } from "./native-credentials";
import { accountMode } from "./account-auth";
import { AccountLogin } from "./account-login";
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
  FileText,
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
  Zap,
  Monitor,
  LogOut,
  Sun,
  Moon,
} from "lucide-react";
import { EditMessage } from "./edit-message";
import { ConversationView, ProcessItem } from "./conversation-view";
import {
  RuntimeClient,
  ApiError,
  applyEvent,
  type Thread,
  type Detail,
  type Item,
  type Approval,
  type Elevation,
  type InputRequest,
} from "./protocol";
import {
  AttachmentPicker,
  AttachmentList,
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
import "./app-design.css";
import { ServiceStatus } from "./service-status";
import { useKeyboardVisible } from "./keyboard-visible";

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
      className={`overlay ${["执行结果", "浏览器"].includes(title) ? "panel-overlay" : title === "快速选择模型" ? "model-popover-overlay" : ""}`}
      onClick={close}
    >
      <section
        className={`sheet ${["执行结果", "浏览器"].includes(title) ? "side-sheet" : title === "快速选择模型" ? "model-popover-sheet" : ""}`}
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
        <div className="sheet-body">{children}</div>
      </section>
    </div>
  );
}
function Connection({
  connect, autoRestore = true,
}: {
  connect: (client: RuntimeClient) => Promise<void>;
  autoRestore?: boolean;
}) {
  const [url, setUrl] = useState(
      localStorage.getItem("runtime-url") ??
        (Capacitor.isNativePlatform() ? "" : "/runtime"),
    ),
    [token, setToken] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [startup, setStartup] = useState(Capacitor.isNativePlatform() && autoRestore);
  const [restoreFailed, setRestoreFailed] = useState<ReturnType<typeof connectionFeedback> | null>(null);
  const [setup, setSetup] = useState(false);
  const connectRef = useRef(connect);
  connectRef.current = connect;
  const restore = async () => {
    setStartup(true);
    setRestoreFailed(null);
    let stage: "credentials" | "network" = "credentials";
    try {
      const saved = await loadDeviceCredential();
      if (!saved) { setSetup(true); return; }
      stage = "network";
      await connectRef.current(new RuntimeClient(saved.url, saved.token));
    } catch (e) {
      setRestoreFailed(connectionFeedback(e, stage));
    } finally { setStartup(false); }
  };
  useEffect(() => { if (Capacitor.isNativePlatform() && autoRestore) void restore(); }, []);
  if (startup || (restoreFailed && !setup)) return (
    <main className="startup-screen">
      <img className="startup-brand" src="/brand.svg" alt="DeepSeek" />
      <h1>DeepSeek</h1>
      <p role="status">{startup ? "正在连接你的电脑…" : restoreFailed?.title}</p>
      {!startup && <>
        <p>{restoreFailed?.detail}</p>
        <button className="primary" onClick={() => void restore()}>重新连接</button>
        <button onClick={() => setSetup(true)}>更换电脑</button>
      </>}
    </main>
  );
  return (
    <main className="connection">
      <div className="brandmark">
        <img src="/brand.svg" alt="DeepSeek" width={64} height={64} />
      </div>
      <div className="eyebrow">DEEPSEEK MOBILE</div>
      <h1>连接你的电脑</h1>
      <PairingPanel connect={connect} />
      <details className="advanced-connection"><summary>高级连接（地址与令牌）</summary>
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
      </details>
      <small>
        请保持电脑在线。
      </small>
    </main>
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
  const keyboardVisible = useKeyboardVisible();
  const [autoRestore, setAutoRestore] = useState(true);
  const [client, setClient] = useState<RuntimeClient | null>(null),
    [threads, setThreads] = useState<Thread[]>([]),
    [selected, setSelected] = useState<string | null>(null),
    [detail, setDetail] = useState<Detail | null>(null),
    [page, setPage] = useState<Page>("chat");
  const [drawer, setDrawer] = useState(false),
    [search, setSearch] = useState(""),
    [showArchived, setShowArchived] = useState(false),
    [sheet, setSheet] = useState<
      "new" | "model" | "model-quick" | "more" | "result" | "browser" | "permissions" | "task-settings" | "edit" | null
    >(null),
    [toast, setToast] = useState(""),
    [busy, setBusy] = useState(false),
    [streamState, setStreamState] = useState("连接中"),
    [resume, setResume] = useState(0);
  const [editTarget, setEditTarget] = useState<Item | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [resultTurnId, setResultTurnId] = useState<string | undefined>();
  const [approvalOverrides, setApprovalOverrides] = useState<Record<string, boolean>>({});
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
    [recordsResource, setRecordsResource] = useState(""),
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
  const composerRef = useRef<HTMLElement>(null);
  const messageViewportSize = useRef({ width: 0, height: 0 });
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
    if (client) {
      const key = `last-thread:${client.scope}`;
      if (id) localStorage.setItem(key, id);
      else localStorage.removeItem(key);
    }
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
    setToast("");
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
      else if (page === "settings" && resource !== "settings") setResource("settings");
      else if (page === "workspace" && !["files", "changes", "tools"].includes(workspaceView)) setWorkspaceView("tools");
      else if (page !== "chat") setPage("chat");
      else if (selected) switchThread(null);
      else void NativeApp.minimizeApp();
    });
    return () => {
      void sub.then((h) => h.remove());
    };
  }, [sheet, drawer, page, selected, resource, workspaceView]);
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
    if (!client) return;
    const rows = await client.request<Thread[]>("/v1/threads?include_archived=true");
    if (connectionRef.current === client) setThreads(rows);
  }, [client]);
  useEffect(() => {
    if (!client) return;
    void refreshThreads().catch(error);
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refreshThreads().catch(() => {});
    }, 10000);
    return () => clearInterval(timer);
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
          // Follow server changes unless this device has an unsubmitted edit.
          setMode(value => !previous || value === previous.thread.mode ? d.thread.mode : value);
          setProvider(value => !previous || value === previous.thread.provider ? d.thread.provider : value);
          setModel(value => !previous || value === previous.thread.model ? d.thread.model : value);
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
          if (!dead) setStreamState("重新连接中");
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
  // Keep the last reply visible when the keyboard or a growing draft reduces
  // the message viewport. Reading older messages must never snap to the end.
  useEffect(() => {
    const viewport = content.current;
    if (!viewport) return;
    const composer = composerRef.current;
    const observer = new ResizeObserver(() => {
      messageViewportSize.current = { width: viewport.clientWidth, height: viewport.clientHeight };
      viewport.style.setProperty("--composer-height", `${composer?.getBoundingClientRect().height ?? 0}px`);
      if (follow.current) viewport.scrollTop = viewport.scrollHeight;
    });
    observer.observe(viewport);
    if (composer) observer.observe(composer);
    return () => observer.disconnect();
  }, [page, selected]);
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
    if (!client || client.account || !resourcePaths[resource]) return;
    setResourceError("");
    setRecordsResource(resource);
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
  const ConnectionView = accountMode ? AccountLogin : Connection;
  if (!client)
    return (
      <ConnectionView
        autoRestore={autoRestore}
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
            switchThread(null, false);
            drafts.current = {};
            uploadedDrafts.current = {};
            setApprovalOverrides({});
            setApprovals([]);
            setQuestions([]);
            setElevations([]);
            setRecords(null);
            setThreads(rows);
            setClient(c);
            const previous = localStorage.getItem(`last-thread:${c.scope}`);
            const restored = rows.find((t) => t.id === previous && !t.archived);
            if (restored) { setSelected(restored.id); selectedRef.current = restored.id; }
          } finally {
            clearTimeout(timer);
          }
        }}
      />
    );
  const latest = detail?.turns.at(-1),
    running = active(latest?.status),
    current = detail?.thread;
  const approvalKey = `approval-mode:${client.scope}:${selected}`;
  const savedApproval = localStorage.getItem(approvalKey);
  const autoApprove = client.account ? current?.auto_approve === true : approvalOverrides[approvalKey] ?? (savedApproval === null ? current?.auto_approve === true : savedApproval === "auto");
  const chooseApproval = (enabled: boolean) => {
    if (client.account) {
      if (!selected) return;
      void run(async () => {
        await client.request(`/v1/threads/${selected}`, "PATCH", { auto_approve: enabled });
        setResume(n => n + 1);
        setSheet(null);
      });
      return;
    }
    localStorage.setItem(approvalKey, enabled ? "auto" : "ask");
    setApprovalOverrides((old) => ({ ...old, [approvalKey]: enabled }));
    setSheet(null);
  };
  const choose = (t: Thread) => {
    switchThread(t.id);
    setPage("chat");
    setDrawer(false);
  };
  const create = async (configured = false) => {
    const t = await client.request<Thread>("/v1/threads", "POST", {
      ...(!client.account && (configured ? workspace.trim() : current?.workspace) ? { workspace: configured ? workspace.trim() : current!.workspace } : {}),
      ...(configured && title.trim() ? { title: title.trim() } : {}),
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
        ...(mode === "goal" ? { args: `-- ${text}` } : { prompt: text, mode, ...(!client.account ? { auto_approve: autoApprove } : {}) }),
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
    if (p === page) return;
    setPage(p);
    if (p === "workspace") setResource("workspace");
    if (p === "activity") setResource("tasks");
    if (p === "settings") setResource("settings");
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
    <div className={`app-shell ${drawer ? "navigation-open" : ""} ${keyboardVisible ? "keyboard-visible" : ""}`}>
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
                ? "对话"
                : page === "activity"
                  ? "任务"
                  : page === "workspace"
                    ? "项目"
                    : ({ notifications: "通知", devices: "已配对设备", connection: "连接信息", skills: "技能", plugins: "插件", mcp: "工具连接" } as Record<string, string>)[resource] || "设置"}
            </strong>
            <span
              className="connection-indicator"
              aria-label={selected ? `电脑连接：${streamState}` : "已连接电脑"}
              title={selected ? streamState : "已连接电脑"}
            >
              <i
                className={
                  streamState === "已连接" || !selected ? "online" : "offline"
                }
              />
            </span>
          </div>
          {!client.account && page === "chat" && selected && <IconButton
            title="结果"
            onClick={() => {
              setDrawer(false);
              setResultTurnId(undefined);
              setSheet("result");
            }}
          >
            <FileText size={21} />
          </IconButton>}
        </header>

        {selected && streamState !== "已连接" && streamState !== "连接中" && <section className="connection-banner" aria-label="连接提示" role="status">
          <span>{streamState === "需要重新连接" ? (client.account ? "账号会话已失效，请重新登录。" : "电脑授权已失效，请重新配对。") : "正在恢复连接。消息和已有结果会保留，不会自动重发操作。"}</span>
          <button onClick={() => { if (streamState === "需要重新连接") { switchThread(null, false); drafts.current = {}; uploadedDrafts.current = {}; setAutoRestore(false); setClient(null); setThreads([]); setApprovals([]); setQuestions([]); setElevations([]); setRecords(null); } else setResume(n => n + 1); }}>{streamState === "需要重新连接" ? (client.account ? "重新登录" : "重新配对") : "重新连接"}</button>
        </section>}
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
                <IconButton title="会话操作" onClick={() => setSheet("more")}>
                  <MoreHorizontal size={19} />
                </IconButton>
              )}
            </div>
            <div className="chat-body">
            <div
              className="messages"
              ref={content}
              onScroll={() => {
                const el = content.current;
                // A viewport resize can emit scroll before ResizeObserver runs.
                // It must not be mistaken for the reader scrolling into history.
                if (el && el.clientWidth === messageViewportSize.current.width && el.clientHeight === messageViewportSize.current.height)
                  follow.current =
                    el.scrollHeight - el.scrollTop - el.clientHeight < 80;
              }}
            >
              {!selected ? (
                <div className="welcome">
                  <div className="brandmark small">
                    <Code2 size={27} />
                  </div>
                  <h1>想做点什么？</h1>

                  <button
                    className="suggestion"
                    aria-label="新建会话"
                    disabled={busy}
                    onClick={() => void run(() => create())}
                  >
                    <Code2 size={20} />
                    <span>
                      <b>开始一个任务</b>

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
                      <small>{threads.length} 个会话</small>
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

                    </div>
                  )}
                  <ConversationView
                    threadId={selected || undefined}
                    openBrowser={() => setSheet("browser")}
                    items={detail.items}
                    turns={detail.turns}
                    editDisabled={client.account || running || busy || !!current?.archived || mode === "goal"}
                    edit={(item) => { setEditTarget(item); setSheet("edit"); }}
                    openChanges={(turnId) => { setResultTurnId(turnId); setSheet("result"); }}
                    waiting={questions.length ? "等待你的回答" : approvals.length || elevations.length ? "等待你的确认" : undefined}
                    reuse={(text) => {
                      setPrompt(text);
                      setAttachments([]);
                      content.current?.scrollTo({ top: content.current.scrollHeight });
                    }}
                  />
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

                </>
              )}
            </div>
            {selected && (
              <section className="composer" ref={composerRef}>
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
                    disabled={uploadBusy || !!sheet || !current || !!current?.archived}
                    placeholder={running ? "补充要求…" : "发消息，或描述你想完成的事…"}
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
                    {!client.account && <details className="composer-add" ref={composerMenu}>
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
                    </details>}
                    <button
                      className="model-chip"
                      disabled={!current}
                      onClick={openModel}
                    >
                      {model || "默认模型"}
                      <ChevronRight size={13} />
                    </button>
                    {!client.account && <VoiceInput
                      key={selected}
                      client={client}
                      onTranscript={(text) =>
                        setPrompt((old) => (old ? old + "\n" + text : text))
                      }
                      disabled={busy || uploadBusy || running}
                    />}
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
                  <button className="task-settings-chip" aria-label="任务设置" onClick={() => setSheet("task-settings")}>{mode === "agent" ? "智能体" : label[mode]}<ChevronRight size={14} /></button>
                  <button className="permission-chip" onClick={() => setSheet("permissions")} aria-label="审批模式">
                    <ShieldCheck size={14} />{mode === "goal" ? "目标权限" : autoApprove ? "自动批准" : "逐次确认"}
                  </button>
                </div>
              </section>
            )}
            </div>
          </>
        ) : (
          <main className="resource-page">
            {page === "settings" && resource !== "settings" && (
              <button className="back-row" onClick={() => setResource("settings")}>‹ 返回设置</button>
            )}
            {page === "settings" && resource === "connection" && <section className="record-card"><h2>{client.account ? "当前工作空间" : "当前电脑"}</h2><p className="connection-address">{client.base}</p>{client.account && <p>本地账号开发环境 · 离线模型</p>}</section>}
            {page === "settings" && resource === "settings" && (
              <div className="device-card">
                <div className="avatar">
                  <Monitor size={22} />
                </div>
                <div>
                  <strong>{selected && streamState !== "已连接" ? "电脑连接待恢复" : "已连接工作台"}</strong>

                </div>
                <IconButton
                  title="断开连接"
                  onClick={() => { void run(async () => {
                    await client.logout();
                    switchThread(null, false);
                    drafts.current = {};
                    uploadedDrafts.current = {};
                    setAutoRestore(false);
                    setClient(null);
                    setThreads([]);
                    setRecords(null);
                    setApprovals([]);
                    setQuestions([]);
                    setElevations([]);
                    setApprovalOverrides({});
                    setPage("chat");
                  }); }}
                >
                  <LogOut size={18} />
                </IconButton>
              </div>
            )}
            {!client.account && page === "settings" && resource === "connection" && <><PreviewStatus client={client} /><ServiceStatus client={client} /></>}
            {page === "settings" && resource === "devices" && <DeviceTools client={client} />}
            {page === "settings" && resource === "notifications" && <NativeNotificationSettings />}
            {page === "settings" && resource === "settings" && (
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
            {page === "settings" && resource === "settings" && (
              <div className="settings-groups">
                <h2>偏好与连接</h2>
                {[["notifications", "通知", "任务完成与待确认提醒"], ["devices", "已配对设备", "管理电脑与手机授权"], ["connection", "连接信息", "当前电脑与服务状态"]].filter(([id]) => !client.account || id !== "devices").map(([id, title]) => (
                  <button className="settings-row" aria-label={title} key={id} onClick={() => setResource(id)}><span><strong>{title}</strong></span><ChevronRight size={18} /></button>
                ))}
                {!client.account && <h2>扩展能力</h2>}
                {(!client.account ? [["skills", "技能", "让助手掌握更多工作方法"], ["plugins", "插件", "管理电脑上的扩展"], ["mcp", "工具连接", "连接外部服务（MCP）"]] : []).map(([id, title]) => (
                  <button className="settings-row" aria-label={title} key={id} onClick={() => setResource(id)}><span><strong>{title}</strong></span><ChevronRight size={18} /></button>
                ))}
              </div>
            )}
            {!client.account && page === "activity" && capabilities.tasks === false && (
              <p className="feature-note">
                电脑未启用后台任务。
              </p>
            )}
            {!client.account && page === "activity" && (
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
                    aria-pressed={resource === key}
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
            {client.account && (page === "workspace" || page === "activity") ? (
              <section className="record-card"><h2>{page === "workspace" ? "项目能力尚未接入" : "后台任务尚未接入"}</h2><p>当前账号环境支持会话、模型切换和消息同步。这部分能力需要完成服务端隔离后开放。</p></section>
            ) : page === "workspace" ? (
              selected ? (
                <>
                  <div className="resource-tabs" aria-label="工作区功能">
                    {[
                      ["files", "文件"],
                      ["changes", "变更"],
                      ["tools", "工具"],
                    ].map(([id, name]) => (
                      <button
                        key={id}
                        onClick={() => setWorkspaceView(id)}
                        aria-pressed={workspaceView === id || (id === "tools" && !["files", "changes"].includes(workspaceView))}
                        className={(workspaceView === id || (id === "tools" && !["files", "changes"].includes(workspaceView))) ? "selected" : ""}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                  {!["files", "changes", "tools"].includes(workspaceView) && <button className="back-row" onClick={() => setWorkspaceView("tools")}>‹ 返回项目工具</button>}
                  {workspaceView === "tools" ? (
                    <div className="tool-directory">
                      <h2>项目工具</h2>
                      {[["git", "Git", "查看变更与管理分支"], ["terminal", "终端", "运行电脑命令"], ["browser", "浏览器控制", "查看与操作网页"], ["cua", "电脑控制", "查看画面、暂停或交还电脑任务"], ["memory", "项目记忆", "保存项目的工作约定"]].map(([id, title]) => <button className="settings-row" aria-label={title} key={id} onClick={() => setWorkspaceView(id)}><span><strong>{title}</strong></span><ChevronRight size={18} /></button>)}
                    </div>
                  ) : workspaceView === "files" ? (
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

                  <button onClick={() => setDrawer(true)}>选择会话</button>
                </div>
              )
            ) : page === "settings" && ["settings", "devices", "notifications", "connection"].includes(resource) ? null : recordsResource !== resource ? (<div className="empty" role="status">正在加载…</div>) : resourceError ? (
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
              resource === "usage" ? <UsageView data={records} /> : <div className="empty"><h2>暂时无法展示此内容</h2><p>请返回上一级选择功能。</p></div>
            )}
          </main>
        )}
        <nav className="app-tabbar" aria-label="主导航" hidden={keyboardVisible}>
          {([["chat", "对话", MessageSquare], ["activity", "任务", Activity], ["workspace", "项目", Folder], ["settings", "设置", Settings]] as const).map(([id, name, Icon]) => (
            <button key={id} aria-current={page === id ? "page" : undefined} onClick={() => selectPage(id)}><Icon size={22} strokeWidth={page === id ? 2 : 1.7} /><span>{name}</span></button>
          ))}
        </nav>
      </div>
      {drawer && (
        <button
          className="navigation-dismiss"
          aria-label="关闭导航"
          onClick={() => setDrawer(false)}
        />
      )}
      <div className="drawer-backdrop" aria-hidden={!drawer} inert={!drawer || undefined} onClick={() => setDrawer(false)}>
          <aside
            ref={drawerRef}
            tabIndex={-1}
            role="dialog"
            aria-modal={drawer || undefined}
            aria-label="会话导航"
            className="drawer"
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <div className="brandmark tiny">
                <img src="/brand.svg" alt="" width={32} height={32} />
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
              disabled={busy}
              onClick={() => {
                setDrawer(false);
                void run(() => create());
              }}
            >
              <Plus size={19} />
              新建会话
            </button>
            <button className="new-project-chat" onClick={() => { setDrawer(false); setSheet("new"); }}>
              {client.account ? "设置会话名称…" : "指定项目新建…"}
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
      {sheet === "new" && (
        <Sheet title="新建会话" close={() => setSheet(null)}>
          <form
            className="sheet-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => create(true));
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
            {!client.account && <label>
              电脑上的项目目录
              <input
                value={workspace}
                onChange={(e) => setWorkspace(e.target.value)}
                placeholder="留空使用 Runtime 默认目录"
                autoCapitalize="none"
              />
            </label>}
            <label>
              运行模式
              <select value={mode} onChange={(e) => setMode(e.target.value)}>
                {["agent", "plan", "ask", "goal"].filter(m => !client.account || m !== "goal").map((m) => (
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
      {sheet === "edit" && selected && editTarget && <Sheet title="编辑并重新发送" close={() => { if (!editBusy) setSheet(null); }}>
        <EditMessage key={`${selected}:${editTarget.id}`} client={client} threadId={selected} item={editTarget}
          options={{ mode, provider, model, ...(effort ? { reasoning_effort: effort } : {}), auto_approve: autoApprove }}
          isCurrent={() => selectedRef.current === selected && connectionRef.current === client}
          onBusy={setEditBusy}
          onChanged={async () => {
            const next = await client.request<Detail>(`/v1/threads/${selected}`);
            if (selectedRef.current !== selected || connectionRef.current !== client) return;
            setDetail(next); detailRef.current = next; setResume(n => n + 1);
            await refreshThreads();
          }}
          onSent={() => { if (selectedRef.current === selected) { setSheet(null); setResume(n => n + 1); } }}
          onKeepDraft={(text) => { if (selectedRef.current === selected) { setPrompt(text); setAttachments([]); setUploaded([]); setSheet(null); } }}
        />
      </Sheet>}
      {sheet === "browser" && selected && <Sheet title="浏览器" close={() => setSheet(null)}>
        <BrowserControls key={selected} client={client} threadId={selected} />
      </Sheet>}
      {sheet === "task-settings" && selected && <Sheet title="任务设置" close={() => setSheet(null)}>
        <div className="sheet-form"><label>运行模式
                  <select
                    aria-label="运行模式"
                    value={mode}
                    onChange={(e) => setMode(e.target.value)}
                  >
                    {["agent", "plan", "ask", "goal"].filter(m => !client.account || m !== "goal").map((m) => (
                      <option key={m} value={m}>
                        {m === "agent" ? "智能体" : label[m]}
                      </option>
                    ))}
                  </select>
        </label>
          <p className="muted">下条消息生效。</p>
          <p className="muted">{({ agent: "调用工具并完成工作", plan: "先规划，再执行", ask: "提问与讨论", goal: "按电脑端设置持续推进目标" } as Record<string, string>)[mode]}</p>
          <button onClick={() => setSheet("permissions")}>查看审批方式：{mode === "goal" ? "目标权限" : autoApprove ? "自动批准" : "逐次确认"}</button>
          <button className="primary" onClick={() => setSheet(null)}>完成</button>
        </div>
      </Sheet>}
      {sheet === "permissions" && selected && <Sheet title="审批模式" close={() => setSheet(null)}>
        <div className="sheet-form permission-options">
          <p className="muted">下条消息生效；待确认操作不变。</p>
          {mode === "goal" ? <p>目标权限由电脑管理。</p> : <>
            <button className="settings-row" aria-pressed={!autoApprove} onClick={() => chooseApproval(false)}><span><strong>逐次确认</strong><small>需要授权的工具操作，由你确认后执行。</small></span>{!autoApprove && <Check size={18} />}</button>
            <button className="settings-row" aria-pressed={autoApprove} onClick={() => chooseApproval(true)}><span><strong>自动批准</strong><small>允许助手自动批准常规工具请求，包括文件修改和命令执行。强制确认及系统权限仍会询问。</small></span>{autoApprove && <Check size={18} />}</button>
          </>}
        </div>
      </Sheet>}
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
          {!client.account && <AdvancedSessionTools
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
          />}
        </Sheet>
      )}
      {sheet === "result" && (
        <Sheet title="执行结果" close={() => setSheet(null)}>
          {selected && (
            <WorkspaceTools
              key={selected}
              client={client}
              threadId={selected}
              turnId={resultTurnId}
              compact
            />
          )}
          <details className="tool-log"><summary>工具记录</summary>
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
                <ProcessItem item={i} key={i.id} />
              ))}
            {!detail?.items.some(
              (i) =>
                !["user_message", "agent_message", "agent_reasoning"].includes(
                  i.kind,
                ),
            ) && (
              <div className="empty">
                <Terminal size={28} />
                <p>暂无执行记录</p>
              </div>
            )}
          </div>
          </details>
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
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
