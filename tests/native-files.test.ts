import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  native: vi.fn(() => true),
  writeFile: vi.fn(
    async (_input: {
      path: string;
      directory: string;
      data: string;
      recursive: boolean;
    }) => ({ uri: "file:///cache/export/file.txt" }),
  ),
  readdir: vi.fn(async () => ({ files: [] as Array<{ name: string }> })),
  rmdir: vi.fn(async () => {}),
  share: vi.fn(async () => ({})),
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: mocks.native },
}));
vi.mock("@capacitor/filesystem", () => ({
  Directory: { Cache: "CACHE" },
  Filesystem: {
    writeFile: mocks.writeFile,
    readdir: mocks.readdir,
    rmdir: mocks.rmdir,
  },
}));
vi.mock("@capacitor/share", () => ({ Share: { share: mocks.share } }));
import {
  exportFile,
  exportTextFile,
  safeExportName,
  MAX_EXPORT_BYTES,
} from "../src/native-files";

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.native.mockReturnValue(true);
  mocks.readdir.mockResolvedValue({ files: [] });
  mocks.share.mockResolvedValue({});
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("native file export", () => {
  it("strips paths and invalid names while bounding UTF-8 filename bytes", () => {
    expect(safeExportName("../../private/file.txt")).toBe("file.txt");
    expect(safeExportName("..\\..\\file.txt")).toBe("file.txt");
    expect(safeExportName("../..")).toBe("export.bin");
    expect(
      new TextEncoder().encode(safeExportName("测".repeat(300))).length,
    ).toBeLessThanOrEqual(200);
  });
  it("writes only Cache, shares a local URI, and defers cleanup until receiving apps have read", async () => {
    expect(
      await exportFile({
        name: "../test.txt",
        data: new TextEncoder().encode("hello"),
      }),
    ).toBe("shared");
    const write = mocks.writeFile.mock.calls[0][0] as unknown as {
      path: string;
      directory: string;
      data: string;
    };
    expect(write.path).toMatch(/^mobile-exports\/\d+-[a-z0-9-]+\/test.txt$/);
    expect(write.directory).toBe("CACHE");
    expect(atob(write.data)).toBe("hello");
    expect(mocks.share).toHaveBeenCalledWith({
      title: "test.txt",
      files: ["file:///cache/export/file.txt"],
      dialogTitle: "保存或分享文件",
    });
    expect(mocks.rmdir).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(mocks.rmdir).toHaveBeenCalledWith({
      path: write.path.split("/").slice(0, -1).join("/"),
      directory: "CACHE",
      recursive: true,
    });
  });
  it("rejects oversize binary and UTF-8 text before filesystem access", async () => {
    await expect(
      exportFile({ name: "big", data: new Uint8Array(MAX_EXPORT_BYTES + 1) }),
    ).rejects.toThrow("8 MiB");
    await expect(
      exportTextFile({ name: "big.md", text: "测".repeat(800000) }),
    ).rejects.toThrow("2 MiB");
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });
  it("cancellation is not reported as a successful save and still cleans cache", async () => {
    mocks.share.mockRejectedValueOnce(new Error("Share canceled"));
    expect(await exportFile({ name: "file", data: new Uint8Array([1]) })).toBe(
      "cancelled",
    );
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(mocks.rmdir).toHaveBeenCalledOnce();
  });
  it("reaps only expired directories in the dedicated export cache", async () => {
    const old = `${Date.now() - 7200000}-12345`;
    mocks.readdir.mockResolvedValueOnce({
      files: [
        { name: old },
        { name: "../../private" },
        { name: `${Date.now()}-current` },
      ],
    });
    await exportFile({ name: "file", data: new Uint8Array() });
    expect(mocks.rmdir).toHaveBeenCalledTimes(1);
    expect(mocks.rmdir).toHaveBeenCalledWith({
      path: `mobile-exports/${old}`,
      directory: "CACHE",
      recursive: true,
    });
  });
  it("uses Web Share without creating a native file on browser", async () => {
    mocks.native.mockReturnValue(false);
    const share = vi.fn(async () => {});
    vi.stubGlobal("navigator", { canShare: () => true, share });
    expect(
      await exportFile({ name: "file.txt", data: new Uint8Array([65]) }),
    ).toBe("shared");
    expect(share).toHaveBeenCalledOnce();
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });
});
