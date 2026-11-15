import { useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";
import { useModalFocus } from "./modal-focus";
import { RuntimeClient } from "./protocol";
import {
  useAudioRecorder,
  formatVoiceDuration,
  type RecordedAudio,
} from "@runtime-audio-recorder";

export function VoiceInput({
  client,
  onTranscript,
  disabled = false,
}: {
  client: RuntimeClient;
  onTranscript: (text: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [audio, setAudio] = useState<RecordedAudio | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(false);
  const generation = useRef(0);
  const operation = useRef<AbortController | null>(null);
  const recorder = useAudioRecorder({
    maxDurationMs: 30000,
    onAutoStop: setAudio,
  });
  useEffect(
    () => () => {
      generation.current++;
      operation.current?.abort();
    },
    [],
  );
  useEffect(() => {
    const cancelOnBackground = () => {
      if (document.hidden) {
        generation.current++;
        recorder.cancel();
        setStarting(false);
      }
    };
    document.addEventListener("visibilitychange", cancelOnBackground);
    return () =>
      document.removeEventListener("visibilitychange", cancelOnBackground);
  }, [recorder.cancel]);
  async function show() {
    generation.current++;
    setOpen(true);
    setError("");
    setConfigured(null);
    const controller = new AbortController();
    operation.current?.abort();
    operation.current = controller;
    try {
      const status = await client.request<{ configured: boolean }>(
        "/v1/voice/status",
        "GET",
        undefined,
        controller.signal,
      );
      if (!controller.signal.aborted) setConfigured(status.configured);
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : "电脑语音服务不可用");
    }
  }
  function close() {
    generation.current++;
    operation.current?.abort();
    recorder.cancel();
    setAudio(null);
    setStarting(false);
    setBusy(false);
    setOpen(false);
  }
  const dialogRef = useModalFocus(open, close);
  async function start() {
    const current = ++generation.current;
    setError("");
    setAudio(null);
    setStarting(true);
    try {
      const result = await recorder.start();
      if (current !== generation.current) return;
      if (!result.ok)
        setError(
          result.reason === "denied"
            ? "麦克风权限被拒绝，请在系统或浏览器设置中允许麦克风。"
            : "当前设备无法录音，请使用键盘听写或文字输入。",
        );
    } catch {
      if (current === generation.current) {
        recorder.cancel();
        setError("无法启动麦克风，请检查设备权限。");
      }
    } finally {
      if (current === generation.current) setStarting(false);
    }
  }
  async function stop() {
    const current = generation.current;
    const result = await recorder.stop();
    if (current === generation.current) setAudio(result);
  }
  async function transcribe() {
    if (!audio || busy) return;
    if (audio.blob.size > 1000044) {
      setError("录音超过大小限制，请重新录制。");
      return;
    }
    setBusy(true);
    setError("");
    const controller = new AbortController();
    operation.current = controller;
    try {
      const bytes = new Uint8Array(await audio.blob.arrayBuffer());
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      const result = await client.request<{ text: string }>(
        "/v1/voice/transcribe",
        "POST",
        { audio: btoa(binary) },
        controller.signal,
      );
      if (!controller.signal.aborted) {
        onTranscript(result.text);
        close();
      }
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : "转写失败");
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className="icon-button"
        title="语音输入"
        aria-label="语音输入"
        disabled={disabled}
        onClick={() => void show()}
      >
        <Mic size={20} />
      </button>
      {open && (
        <div className="overlay" onClick={close}>
          <section
            ref={dialogRef}
            tabIndex={-1}
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label="语音输入"
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <h2>语音输入</h2>
              <button aria-label="关闭语音输入" onClick={close}>
                关闭
              </button>
            </header>
            <div className="sheet-form">
              <p className="muted">
                录音最多 30
                秒。录完后点击转写才会上传到电脑配置的语音服务；文字会填入输入框，由你确认发送。
              </p>
              {configured === null && !error && (
                <p role="status">正在检查电脑语音服务…</p>
              )}
              {configured === false && (
                <p role="status">
                  电脑尚未配置 ASR。请先在电脑语音设置中配置语音服务和独立的 ASR
                  密钥；聊天模型密钥不能代替。也可以使用手机键盘自带的听写。
                </p>
              )}
              {!recorder.supported && (
                <p role="status">
                  当前环境不支持麦克风录音。浏览器需要 HTTPS 或本机 localhost。
                </p>
              )}
              {recorder.recording ? (
                <>
                  <p role="status">
                    正在录音 {formatVoiceDuration(recorder.elapsedMs)} / 0:30
                  </p>
                  <progress
                    max={30000}
                    value={recorder.elapsedMs}
                    aria-label="录音时长"
                  />
                  <button onClick={() => void stop()}>结束录音</button>
                  <button
                    onClick={() => {
                      recorder.cancel();
                      setAudio(null);
                    }}
                  >
                    取消录音
                  </button>
                </>
              ) : (
                <button
                  disabled={
                    !configured || !recorder.supported || busy || starting
                  }
                  onClick={() => void start()}
                >
                  {starting
                    ? "等待麦克风权限…"
                    : audio
                      ? "重新录音"
                      : "开始录音"}
                </button>
              )}
              {audio && !recorder.recording && (
                <>
                  <p>已录制 {formatVoiceDuration(audio.durationMs)}</p>
                  <button
                    disabled={busy || !configured}
                    onClick={() => void transcribe()}
                  >
                    {busy ? "正在转写…" : "转写录音"}
                  </button>
                  <button
                    onClick={() => {
                      operation.current?.abort();
                      setAudio(null);
                      setBusy(false);
                    }}
                  >
                    丢弃录音
                  </button>
                  {busy && (
                    <p className="muted">
                      取消等待不会撤回语音服务已经处理的请求。
                    </p>
                  )}
                </>
              )}
              {error && (
                <p role="alert" className="error">
                  {error}
                </p>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
