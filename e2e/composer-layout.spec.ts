import { test, expect } from '@playwright/test';

test('compact floating composer covers scrolling history while the final reply remains reachable', async ({ page, request }) => {
  const created = await request.post('/runtime/v1/threads', {
    headers: { Authorization: 'Bearer mobile-offline-test' },
    data: { title: '悬浮输入框检查', mode: 'ask' },
  });
  const thread = await created.json();
  await page.route(`**/v1/threads/${thread.id}`, route => route.fulfill({ json: {
    thread, latest_seq: 0,
    turns: [{ id: 'layout-turn', status: 'completed' }],
    items: [{ id: 'answer', turn_id: 'layout-turn', kind: 'agent_message', status: 'completed', summary: '',
      detail: Array.from({ length: 24 }, (_, i) => `第 ${i + 1} 段聊天记录。滑动时文字自然进入输入框后面，最后一条仍能完整阅读。`).join('\n\n') + '\n\n最后一条内容完整可见。', metadata: { agent_segment: 'final_answer' } }],
  } }));
  await page.goto('/');
  await page.getByText('高级连接（地址与令牌）', { exact: true }).click();
  await page.getByLabel('访问令牌', { exact: true }).fill('mobile-offline-test');
  await page.getByRole('button', { name: '连接工作台', exact: true }).click();
  await page.getByRole('button', { name: '打开会话' }).click();
  await page.getByRole('button', { name: /悬浮输入框检查/ }).click();
  const viewport = page.locator('.messages');
  const input = page.getByLabel('消息', { exact: true });
  const last = page.getByText('最后一条内容完整可见。', { exact: true });
  const tailVisible = async () => {
    await expect.poll(async () => {
      const end = (await last.boundingBox())!;
      return end.y + end.height <= (await page.locator('.composer').boundingBox())!.y;
    }).toBe(true);
  };
  const bottom = async () => {
    await viewport.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await tailVisible();
  };
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await bottom();
    expect((await page.locator('.input-box').boundingBox())!.height).toBeLessThanOrEqual(94);
    expect((await page.getByRole('button', { name: '发送消息', exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const view = (await viewport.boundingBox())!;
    const box = (await page.locator('.input-box').boundingBox())!;
    expect(view.y + view.height).toBeGreaterThan(box.y + box.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await input.fill('第一行\n第二行\n第三行\n第四行');
  await tailVisible();
  await page.setViewportSize({ width: 390, height: 500 });
  await tailVisible();
  await viewport.evaluate(el => { el.scrollTop = 150; });
  await expect.poll(() => viewport.evaluate(el => el.scrollTop)).toBe(150);
  await input.fill('缩短草稿');
  await expect.poll(() => viewport.evaluate(el => el.scrollTop)).toBeLessThan(300);
  await input.fill('');
  await page.setViewportSize({ width: 390, height: 844 });
  await bottom();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.screenshot({ path: 'artifacts/apple-app/composer-floating.png', scale: 'css' });
});
