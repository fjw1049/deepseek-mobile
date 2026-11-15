import { test, expect } from '@playwright/test';
import type { Item } from '../src/protocol';

test('a noisy turn becomes a single reply with folded process; errors and input remain discoverable', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  async function connect() {
    await page.getByText('高级连接（地址与令牌）', { exact: true }).click();
    await page.getByLabel('访问令牌', { exact: true }).fill('mobile-offline-test');
    await page.getByRole('button', { name: '连接工作台', exact: true }).click();
  }
  await connect();
  await page.getByRole('button', { name: '打开会话' }).click();
  const response = page.waitForResponse(r => r.url().endsWith('/threads') && r.request().method() === 'POST');
  await page.locator('.new-thread').click();
  const thread = await (await response).json();
  const make = (id: string, kind: string, text: string, segment?: string): Item => ({ id, kind, turn_id: 'review-turn', status: 'completed', summary: text, detail: text, metadata: segment ? { agent_segment: segment } : {} });
  const answer = '找到 3 场活动。\n\n- 周五：线上分享会\n- 周六：创作者交流\n- 周日：作品展示';
  const items = [
    make('u', 'user_message', '帮我看看有哪些活动'),
    make('p', 'agent_message', '我会先梳理你的请求并核对相关信息，再根据实际结果推进处理。', 'mid_turn_preface'),
    make('tool1', 'tool_call', 'request_user_input: {"answers":[{"question_id":"scope"}]}'),
    make('blank1', 'agent_message', '', 'mid_turn_preface'),
    make('tool2', 'tool_call', 'search_skills: {"matches":[{"name":"agent-browser"}]}'),
    make('blank2', 'agent_message', '', 'mid_turn_preface'),
    make('tool3', 'tool_call', 'load_skill: # Skill: agent-reach'),
    make('a', 'agent_message', answer, 'final_answer'),
  ];
  let status = 'completed';
  await page.route(`**/v1/threads/${thread.id}`, route => route.fulfill({ json: { thread, turns: [{ id: 'review-turn', status }], items, latest_seq: 0 } }));
  await page.reload();
  await connect();
  await expect(page.locator('.assistant-message')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '复制回复', exact: true })).toHaveCount(1);
  await expect(page.getByText('search_skills:', { exact: false })).toBeHidden();
  await expect(page.getByText('我会先梳理', { exact: false })).toBeHidden();
  await expect(page.getByRole('button', { name: '复制到输入框' })).toBeHidden();
  await page.getByRole('button', { name: '复制回复', exact: true }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(answer);
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('.turn-process > summary')).toBeVisible();
  }
  await page.setViewportSize({ width: 430, height: 932 });
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.screenshot({ path: 'artifacts/apple-app/conversation-clean.png', scale: 'css' });
  await page.locator('.turn-process > summary').click();
  await expect(page.getByText('查找可用技能', { exact: true })).toBeVisible();
  await expect(page.getByText('search_skills:', { exact: false })).toBeHidden();
  await page.locator('.process-item').filter({ hasText: '查找可用技能' }).locator(':scope > summary').click();
  await page.locator('.process-item').filter({ hasText: '查找可用技能' }).getByText('技术详情', { exact: true }).click();
  await expect(page.getByText('search_skills:', { exact: false })).toBeVisible();
  await page.locator('.turn-process > summary').click();
  await page.getByLabel('消息操作', { exact: true }).click();
  await page.getByRole('button', { name: '复制到输入框', exact: true }).click();
  await expect(page.getByLabel('消息', { exact: true })).toHaveValue('帮我看看有哪些活动');
  await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
  await page.screenshot({ path: 'artifacts/apple-app/conversation-clean-dark.png', scale: 'css' });
  status = 'failed';
  items.pop();
  items.push({ ...make('error', 'error', '浏览器连接中断，请检查电脑端'), status: 'failed' });
  await page.reload();
  await connect();
  await expect(page.locator('.turn-process > summary')).toContainText('查看执行详情');
  await expect(page.getByRole('button', { name: '复制回复', exact: true })).toHaveCount(0);
  await page.locator('.turn-process > summary').click();
  await page.locator('.process-item').filter({ hasText: '执行遇到问题' }).locator(':scope > summary').click();
  await expect(page.getByText('浏览器连接中断，请检查电脑端', { exact: false })).toBeVisible();

  const note = '---\n\n**核验状态**（系统生成）\n\n- 运行中断：Live request exceeds the fixed model/output/input boundary';
  items.pop();
  items.push({ ...make('system-note', 'agent_message', note, 'final_answer'), metadata: { agent_segment: 'final_answer', completion_note: note } });
  await page.route(`**/v1/threads/${thread.id}`, route => route.fulfill({ json: { thread, turns: [{ id: 'review-turn', status, error: 'Live request exceeds the fixed model/output/input boundary' }], items, latest_seq: 0 } }));
  await page.reload();
  await connect();
  await expect(page.locator('.assistant-message')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '编辑消息', exact: true })).toBeVisible();
  await expect(page.locator('.turn-failure-guidance')).toContainText('更新并重启电脑服务');
  await expect(page.getByRole('button', { name: '复制回复', exact: true })).toHaveCount(0);
  await expect(page.getByText('核验状态', { exact: false })).toBeHidden();
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.screenshot({ path: 'artifacts/apple-app/failure-recovery.png', scale: 'css' });
  await page.getByRole('button', { name: '编辑消息', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('textbox', { name: '编辑消息', exact: true })).toHaveValue('帮我看看有哪些活动');
});
