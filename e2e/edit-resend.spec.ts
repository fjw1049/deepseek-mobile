import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
const headers = { Authorization: 'Bearer mobile-offline-test' };
async function seed(request: APIRequestContext, title: string) {
  const response = await request.post('/runtime/v1/threads', { headers, data: { title, mode: 'ask', model: 'deepseek-flash' } });
  const thread = await response.json();
  for (const prompt of ['第一条消息', '后续消息']) {
    const sent = await request.post(`/runtime/v1/threads/${thread.id}/turns`, { headers, data: { prompt, mode: 'ask' } });
    expect(sent.ok()).toBeTruthy();
    await expect.poll(async () => {
      const d = await (await request.get(`/runtime/v1/threads/${thread.id}`, { headers })).json();
      return d.turns.at(-1)?.status;
    }).toBe('completed');
  }
  return thread;
}
async function open(page: Page, title: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByText('高级连接（地址与令牌）', { exact: true }).click();
  await page.getByLabel('访问令牌').fill('mobile-offline-test');
  await page.getByRole('button', { name: '连接工作台', exact: true }).click();
  await page.getByRole('button', { name: '打开会话', exact: true }).click();
  await page.getByRole('button', { name: new RegExp(title) }).click();
  await page.getByLabel('消息操作', { exact: true }).first().click();
  await page.getByRole('button', { name: '编辑并重新发送', exact: true }).first().click();
  await expect(page.getByRole('dialog', { name: '编辑并重新发送', exact: true })).toBeVisible();
}
const preview = { turns: 2, files: [], conflicts: [], skipped: [], missing_roots: [], no_checkpoint: 0 };

test('edit resends through real Runtime rewind and preserves another session', async ({ page, request }) => {
  const a = await seed(request, '编辑重发A-' + Date.now());
  const b = await seed(request, '保留会话B-' + Date.now());
  const read = async (id: string) => (await request.get(`/runtime/v1/threads/${id}`, { headers })).json();
  const beforeB = await read(b.id);
  const beforeA = await read(a.id);
  const calls: { url: string; body: any }[] = [];
  page.on('request', r => { if (r.method() === 'POST' && /\/(rewind|turns)$/.test(r.url())) calls.push({ url: r.url(), body: r.postDataJSON() }); });
  await page.route('**/rewind-preview?*', route => route.fulfill({ json: preview }));
  await open(page, a.title);
  await page.getByLabel('编辑消息', { exact: true }).fill('修改后的第一条消息');
  await page.getByRole('button', { name: '重新发送', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.user-message')).toHaveCount(1);
  await expect(page.locator('.user-message')).toContainText('修改后的第一条消息');
  await expect(page.getByRole('button', { name: '发送消息', exact: true })).toBeVisible();
  expect(calls.map(c => c.url.split('/').at(-1))).toEqual(['rewind', 'turns']);
  expect(calls[0].body).toEqual({ before_item_id: beforeA.items.find((i: any) => i.kind === 'user_message').id, restore_files: false, force_conflicts: false });
  expect(calls[1].body).toMatchObject({ mode: 'ask', model: 'deepseek-flash', auto_approve: false, prompt: '修改后的第一条消息' });
  expect((await read(a.id)).turns).toHaveLength(1);
  expect((await read(b.id)).items).toEqual(beforeB.items);
});

test('file conflicts are previewed and actual restore conflicts pause before resend', async ({ page, request }) => {
  const a = await seed(request, '恢复冲突-' + Date.now());
  let sends = 0;
  const rewinds: any[] = [];
  await page.route('**/rewind-preview?*', route => route.fulfill({ json: { ...preview, files: ['owned.ts'], conflicts: ['owned.ts'] } }));
  await page.route('**/rewind', route => { rewinds.push(route.request().postDataJSON()); return route.fulfill({ json: { rewind_result: { restored_files: [], conflicted_files: ['owned.ts'], skipped_files: [], missing_roots: [] } } }); });
  await page.route('**/turns', route => { sends++; return route.fulfill({ json: { id: 'new-turn', status: 'queued' } }); });
  await open(page, a.title);
  await page.getByLabel('编辑消息', { exact: true }).fill('修改任务');
  await page.getByRole('button', { name: '重新发送', exact: true }).click();
  await expect(page.getByLabel('重发影响')).toContainText('owned.ts');
  expect(sends).toBe(0);
  expect(rewinds).toHaveLength(0);
  await page.screenshot({ path: 'artifacts/apple-app/edit-resend-preview.png', scale: 'css' });
  await page.getByRole('button', { name: '确认重新发送', exact: true }).click();
  await expect(page.getByLabel('文件恢复结果')).toContainText('冲突，未覆盖');
  expect(rewinds).toHaveLength(1);
  expect(rewinds[0]).toMatchObject({ restore_files: true, force_conflicts: false });
  expect(sends).toBe(0);
  await page.getByRole('button', { name: '按当前文件状态继续发送', exact: true }).click();
  await expect.poll(() => sends).toBe(1);
  expect(rewinds).toHaveLength(1);
});

for (const failedStage of ['rewind', 'turns']) test(`unknown ${failedStage} result retains text without replay`, async ({ page, request }) => {
  const a = await seed(request, '断网草稿-' + failedStage + Date.now());
  let rewinds = 0, sends = 0;
  await page.route('**/rewind-preview?*', route => route.fulfill({ json: preview }));
  await page.route('**/rewind', route => { rewinds++; return route.fulfill(failedStage === 'rewind' ? { status: 504, json: { detail: '结果未知' } } : { json: { rewind_result: {} } }); });
  await page.route('**/turns', route => { sends++; return route.fulfill({ status: 504, json: { detail: '发送结果未知' } }); });
  await open(page, a.title);
  await page.getByLabel('编辑消息', { exact: true }).fill('必须保留的编辑文字');
  await page.getByRole('button', { name: '重新发送', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('未知');
  await expect(page.getByLabel('编辑消息', { exact: true })).toHaveValue('必须保留的编辑文字');
  await page.getByRole('button', { name: '核对会话状态', exact: true }).click();
  expect(rewinds).toBe(1);
  expect(sends).toBe(failedStage === 'rewind' ? 0 : 1);
  await page.getByRole('button', { name: '将编辑文字保留到输入框', exact: true }).click();
  await expect(page.getByLabel('消息', { exact: true })).toHaveValue('必须保留的编辑文字');
});

test('a reply opens only its own turn changes', async ({ page, request }) => {
  const a = await seed(request, '按轮次变更-' + Date.now());
  const detail = await (await request.get(`/runtime/v1/threads/${a.id}`, { headers })).json();
  detail.turns.forEach((turn: any, index: number) => { turn.diff_snapshot = { complete: true, files: [{ path: `turn-${index}.txt`, additions: 1, deletions: 0, unified_diff: '+only this turn' }] }; });
  await page.route(`**/v1/threads/${a.id}`, route => route.fulfill({ json: detail }));
  await open(page, a.title);
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '查看本轮 1 个文件变更', exact: true }).first().click();
  const panel = page.getByRole('dialog', { name: '执行结果', exact: true });
  await expect(panel).toContainText('turn-0.txt');
  await expect(panel).not.toContainText('turn-1.txt');
});
