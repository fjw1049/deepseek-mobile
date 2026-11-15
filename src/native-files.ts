import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

export const MAX_EXPORT_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const CACHE_ROOT = "mobile-exports";
const CACHE_LIFETIME_MS = 60 * 60 * 1000;
export type ExportResult = "shared" | "downloaded" | "cancelled";

export function safeExportName(name: string): string {
  const base =
    (name.split(/[\\/]/).at(-1) || "export.bin")
      .replace(/[\x00-\x1f\x7f<>:"|?*]/g, "_")
      .replace(/^\.+/, "")
      .trim() || "export.bin";
  let safe = "";
  for (const char of base) {
    if (new TextEncoder().encode(safe + char).byteLength > 200) break;
    safe += char;
  }
  return safe || "export.bin";
}

async function cleanupExpiredExports(): Promise<void> {
  try {
    const listing = await Filesystem.readdir({
      path: CACHE_ROOT,
      directory: Directory.Cache,
    });
    for (const entry of listing.files) {
      if (!/^\d{13}-[a-z0-9-]+$/i.test(entry.name)) continue;
      if (Date.now() - Number(entry.name.split("-")[0]) < CACHE_LIFETIME_MS)
        continue;
      await Filesystem.rmdir({
        path: `${CACHE_ROOT}/${entry.name}`,
        directory: Directory.Cache,
        recursive: true,
      }).catch(() => {});
    }
  } catch {
    /* The export cache may not exist yet or may have been cleared by the OS. */
  }
}

function cancelled(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || /cancelled|canceled/i.test(error.message))
  );
}

export async function exportFile({
  name,
  data,
  mimeType = "application/octet-stream",
}: {
  name: string;
  data: Uint8Array;
  mimeType?: string;
}): Promise<ExportResult> {
  if (data.byteLength > MAX_EXPORT_BYTES)
    throw new Error("单文件最多导出 8 MiB。");
  const filename = safeExportName(name);
  if (Capacitor.isNativePlatform()) {
    await cleanupExpiredExports();
    const folder = `${CACHE_ROOT}/${Date.now()}-${crypto.randomUUID()}`;
    const path = `${folder}/${filename}`;
    const chunks: string[] = [];
    for (let i = 0; i < data.length; i += 32768)
      chunks.push(String.fromCharCode(...data.subarray(i, i + 32768)));
    try {
      const file = await Filesystem.writeFile({
        path,
        directory: Directory.Cache,
        data: btoa(chunks.join("")),
        recursive: true,
      });
      await Share.share({
        title: filename,
        files: [file.uri],
        dialogTitle: "保存或分享文件",
      });
      return "shared";
    } catch (e) {
      if (cancelled(e)) return "cancelled";
      throw e;
    } finally {
      // A chosen receiving app can read after the share sheet has returned.
      // Delay deletion; subsequent exports also reap this dedicated cache after suspension.
      setTimeout(() => {
        void Filesystem.rmdir({
          path: folder,
          directory: Directory.Cache,
          recursive: true,
        }).catch(() => {});
      }, CACHE_LIFETIME_MS);
    }
  }
  const file = new File([data.slice().buffer], filename, { type: mimeType });
  if (navigator.canShare?.({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({ files: [file] });
      return "shared";
    } catch (e) {
      if (cancelled(e)) return "cancelled";
      throw e;
    }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return "downloaded";
}

export async function exportTextFile({
  name,
  text,
  mimeType = "text/plain;charset=utf-8",
}: {
  name: string;
  text: string;
  mimeType?: string;
}): Promise<ExportResult> {
  if (text.length > MAX_TEXT_BYTES)
    throw new Error("文本导出最多 2 MiB，请缩小会话范围。");
  const data = new TextEncoder().encode(text);
  if (data.byteLength > MAX_TEXT_BYTES)
    throw new Error("文本导出最多 2 MiB，请缩小会话范围。");
  return exportFile({ name, data, mimeType });
}
