import { test, expect, type Page } from '@playwright/test';

async function connect(page: Page) {
  await page.getByText('高级连接（地址与令牌）', { exact: true }).click();
  await page.getByLabel('访问令牌', { exact: true }).fill('mobile-offline-test');
  await page.getByRole('button', { name: '连接工作台', exact: true }).click();
}
async function newChat(page: Page) {
  await page.getByRole('button', { name: '打开会话' }).click();
  await page.locator('.new-thread').click();
  await expect(page.getByLabel('消息', { exact: true })).toBeEnabled();
}
test('browser belongs to its query, can be hidden, and never polls or controls from the feed', async ({ page }) => {
  const frame = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==';
  let reads = 0;
  const writes: string[] = [];
  page.on('request', r => { if (r.method() === 'POST' && r.url().includes('/browser/')) writes.push(r.url()); });
  await page.route('**/browser/view', r => { reads++; return r.fulfill({ json: { active: true, owner: 'agent', generation: 1, url: 'https://example.com/current', image: frame } }); });
  await page.goto('/');
  await connect(page);
  const created = page.waitForResponse(r => r.url().endsWith('/threads') && r.request().method() === 'POST');
  await newChat(page);
  const thread = await (await created).json();
  expect(reads).toBe(0);
  const item = (id: string, turn_id: string, kind: string, detail: string, metadata = {}) => ({ id, turn_id, kind, detail, summary: detail, metadata, status: 'completed' });
  await page.route(`**/v1/threads/${thread.id}`, r => r.fulfill({ json: { thread, latest_seq: 0,
    turns: [{ id: 'web-query', status: 'completed' }, { id: 'plain-query', status: 'completed' }],
    items: [item('u1', 'web-query', 'user_message', '查看网页上的活动'), item('b', 'web-query', 'tool_call', '已读取活动页面', { tool_name: 'browser_use' }), item('a1', 'web-query', 'agent_message', '活动信息已整理', { agent_segment: 'final_answer' }), item('u2', 'plain-query', 'user_message', '谢谢，写一句问候'), item('a2', 'plain-query', 'agent_message', '你好！', { agent_segment: 'final_answer' })],
  } }));
  await page.reload(); await connect(page);
  await expect(page.locator('.browser-turn-entry')).toHaveCount(1);
  await expect(page.locator('.conversation-turn').filter({ hasText: '查看网页上的活动' }).locator('.browser-turn-entry')).toBeVisible();
  await expect(page.locator('.conversation-turn').filter({ hasText: '谢谢，写一句问候' }).locator('.browser-turn-entry')).toHaveCount(0);
  await expect(page.getByAltText('电脑浏览器实时画面')).toHaveCount(0);
  expect(reads).toBe(0);
  await page.locator('.browser-turn-entry > details > summary').click();
  await page.getByRole('button', { name: '查看当前浏览器', exact: true }).click();
  const browser = page.getByRole('dialog', { name: '浏览器', exact: true });
  await expect(browser.getByAltText('可操作的电脑浏览器画面')).toBeVisible();
  await expect(browser.getByRole('button', { name: '接管浏览器', exact: true })).toBeVisible();
  await expect(browser.getByLabel('向网页输入文字')).toBeHidden();
  expect(writes).toEqual([]);
  await browser.getByRole('button', { name: '停止浏览器任务', exact: true }).click();
  await expect(browser.getByRole('button', { name: '确认停止', exact: true })).toBeVisible();
  expect(writes).toEqual([]);
  await browser.getByRole('button', { name: '继续任务', exact: true }).click();
  expect(writes).toEqual([]);
  await browser.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '隐藏本轮网页入口', exact: true }).click();
  await expect(page.locator('.browser-turn-entry')).toHaveCount(0);
  await page.reload(); await connect(page);
  await expect(page.locator('.browser-turn-entry')).toHaveCount(0);
  await page.locator('.turn-process > summary').click();
  await page.getByRole('button', { name: '显示本轮网页入口', exact: true }).click();
  await expect(page.locator('.browser-turn-entry')).toHaveCount(1);
  expect(writes).toEqual([]);
  await page.locator('.turn-process > summary').click();
  await page.screenshot({ path: 'artifacts/apple-app/browser-query-entry.png', scale: 'css' });
});

test('approval choice is explicit, survives reload, is scoped to a conversation and is sent to Runtime', async ({ page }) => {
  await page.goto('/');
  await connect(page);
  await newChat(page);
  const chip = page.getByRole('button', { name: '审批模式', exact: true });
  await expect(chip).toHaveText('逐次确认');
  await chip.click();
  await page.getByRole('button', { name: /^自动批准/ }).click();
  await expect(chip).toHaveText('自动批准');
  await page.reload();
  await connect(page);
  await expect(chip).toHaveText('自动批准');
  const requests: any[] = [];
  page.on('request', r => { if (r.method() === 'POST' && r.url().endsWith('/turns')) requests.push(r.postDataJSON()); });
  await page.getByLabel('消息', { exact: true }).fill('离线审批模式验证');
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await expect(page.locator('.assistant-message')).toContainText('Mobile connected');
  expect(requests[0].auto_approve).toBe(true);
  expect(requests[0].trust_mode).toBeUndefined();
  await chip.click();
  await page.getByRole('button', { name: /^逐次确认/ }).click();
  await page.getByLabel('消息', { exact: true }).fill('恢复逐次确认');
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1].auto_approve).toBe(false);
  await expect(page.getByRole('button', { name: '发送消息', exact: true })).toBeVisible();
  await chip.click();
  await page.getByRole('button', { name: /^自动批准/ }).click();
  await newChat(page);
  await expect(chip).toHaveText('逐次确认');
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(chip).toBeVisible();
    await expect(page.getByRole('button', { name: '查看浏览器' })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await page.locator('.chat-surface').boundingBox())?.x).toBe(0);
  await page.screenshot({ path: 'artifacts/apple-app/composer-permissions.png' });
  await chip.click();
  await page.evaluate(async () => { await Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().endTime !== Infinity).map(a => a.finished.catch(() => {}))); });
  await page.screenshot({ path: 'artifacts/apple-app/permission-options.png' });
});
