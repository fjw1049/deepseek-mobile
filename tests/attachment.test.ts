import { describe, it, expect } from "vitest";
import {
  readTextAttachments,
  composeMessage,
  ATTACHMENT_LIMIT,
} from "../src/composer-tools";
describe("bounded text attachments", () => {
  it("does not truncate or silently send binary data", async () => {
    const files = await readTextAttachments(
      [new File(["你好\n真实内容"], "a.md")],
      [],
    );
    expect(composeMessage("阅读", files)).toContain("真实内容");
    await expect(
      readTextAttachments([new File([new Uint8Array([255])], "bad.txt")], []),
    ).rejects.toThrow("UTF-8");
    await expect(
      readTextAttachments([new File(["a\0b"], "binary.txt")], []),
    ).rejects.toThrow("二进制");
    await expect(
      readTextAttachments([new File(["x"], "a.pdf")], []),
    ).rejects.toThrow("请使用「添加文件或图片」");
  });
  it("bounds combined files and byte size before reading", async () => {
    await expect(
      readTextAttachments(
        Array.from({ length: 6 }, () => new File(["x"], "a.txt")),
        [],
      ),
    ).rejects.toThrow("最多");
    await expect(
      readTextAttachments(
        [new File([new Uint8Array(ATTACHMENT_LIMIT + 1)], "big.txt")],
        [],
      ),
    ).rejects.toThrow("100 KB");
  });
});
