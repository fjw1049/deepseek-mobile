import { test, expect } from '@playwright/test';

test('all mobile pages fit narrow screens and preserve navigation', async ({ page }) => {
  await page.goto('/');
  await page.getByText('高级连接（地址与令牌）', { exact: true }).click();
  await page.getByLabel('访问令牌', { exact: true }).fill('mobile-offline-test');
  await page.getByRole('button', { name: '连接工作台', exact: true }).click();
  await page.getByRole('button', { name: '新建会话', exact: true }).click();
  const nav = page.getByRole('navigation', { name: '主导航' });
  async function check(name: string) {
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(nav).toBeVisible();
      await expect(page.getByText(/^(正在加载终端|正在查询终端|正在读取会话的工作区|正在检查服务配置|正在读取电脑任务状态)/)).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name).toBe(true);
    }
    await page.screenshot({ path: `artifacts/page-audit/${name}.png` });
  }
  await check('chat');
  await nav.getByRole('button', { name: '任务', exact: true }).click();
  for (const name of ['任务', '自动化', '用量']) {
    await page.locator('.resource-tabs').getByRole('button', { name, exact: true }).click();
    await expect(page.getByText('正在读取电脑数据…')).toHaveCount(0);
    await check(name);
  }
  await nav.getByRole('button', { name: '任务', exact: true }).click();
  await expect(page.getByRole('region', { name: '模型用量' })).toBeVisible();
  await nav.getByRole('button', { name: '项目', exact: true }).click();
  for (const name of ['文件', '变更', '工具']) {
    await page.locator('.resource-tabs').getByRole('button', { name, exact: true }).click();
    await check(name);
  }
  for (const name of ['Git', '终端', '浏览器控制', '电脑控制', '项目记忆']) {
    await page.getByRole('button', { name, exact: true }).click();
    await check(name);
    await page.getByRole('button', { name: '‹ 返回项目工具' }).click();
  }
  await nav.getByRole('button', { name: '设置', exact: true }).click();
  await check('settings');
  for (const name of ['通知', '已配对设备', '连接信息', '技能', '插件', '工具连接']) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.locator('.header-title strong')).toHaveText(name);
    await check(name);
    if (name === '技能') {
      await page.getByRole('searchbox').fill('no-such-skill-987');
      await expect(page.getByText('无匹配结果', { exact: true })).toBeVisible();
    }
    await page.getByRole('button', { name: '‹ 返回设置' }).click();
  }
  await page.getByLabel('外观', { exact: true }).selectOption('dark');
  await check('settings-dark');
});

test('model bars compare values and reveal exact totals without page overflow', async ({ page }) => {
  const buckets = Array.from({ length: 8 }, (_, i) => ({ model: `model-${i}-long-name`, input_tokens: (i + 1) * 10000, output_tokens: 1000, turns: i + 1 }));
  await page.route('**/v1/usage?**', r => r.fulfill({ json: { buckets, totals: { input_tokens: 360000, output_tokens: 8000 } } }));
  await page.goto('/');
  await page.getByText('高级连接（地址与令牌）', { exact: true }).click();
  await page.getByLabel('访问令牌', { exact: true }).fill('mobile-offline-test');
  await page.getByRole('button', { name: '连接工作台', exact: true }).click();
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '任务', exact: true }).click();
  await page.getByRole('button', { name: '用量', exact: true }).click();
  const bars = page.locator('.model-bar-button');
  await expect(bars).toHaveCount(8);
  await expect(bars.first()).toContainText('model-7');
  await bars.last().click();
  await expect(page.locator('.model-selection')).toContainText('10,000');
  await expect(bars.last()).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/page-audit/model-bars.png' });
});
