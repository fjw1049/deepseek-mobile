import { test, expect } from '@playwright/test';
import { navigate } from './navigation';

test('usage shows readable units, scope and inconsistent accounting without JSON or free-cost claims', async ({ page }) => {
  let data: object = { group_by: 'model', scope: 'session', buckets: [{ model: 'deepseek-flash', input_tokens: 2265443, output_tokens: 5178, total_tokens: 1144532, cost_usd: 0, cost_cny: 0, turns: 4 }], totals: { input_tokens: 2265443, output_tokens: 5178, total_tokens: 1144532, cost_usd: 0, cost_cny: 0, turns: 4 } };
  await page.route('**/v1/usage?**', r => r.fulfill({ json: data }));
  await page.goto('/');
  await page.getByText('高级连接（地址与令牌）', { exact: true }).click();
  await page.getByLabel('访问令牌', { exact: true }).fill('mobile-offline-test');
  await page.getByRole('button', { name: '连接工作台', exact: true }).click();
  await navigate(page, '活动');
  await page.getByRole('button', { name: '用量', exact: true }).click();
  const usage = page.getByRole('region', { name: '模型用量' });
  await expect(usage).toContainText('本次电脑运行期间');
  await expect(usage).toContainText('2,265,443');
  await expect(usage).toContainText('不一致');
  await expect(usage).toContainText('未估算');
  await expect(usage.locator('pre')).toHaveCount(0);
  await expect(usage).not.toContainText('input_tokens');
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.screenshot({ path: 'artifacts/apple-app/usage-readable.png', scale: 'css' });
  data = { buckets: [], totals: {} };
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await expect(usage).toContainText('暂无用量记录');
});

test('inactive browser does not show stale URL or controls and panel header never scrolls under status bar', async ({ page }) => {
  let view: object = { active: false, url: 'https://www.so.com/s?q=%E6%B5%8B%E8%AF%95', owner: 'user' };
  await page.route('**/browser/view', r => r.fulfill({ json: view }));
  await page.goto('/');
  await page.getByText('高级连接（地址与令牌）', { exact: true }).click();
  await page.getByLabel('访问令牌', { exact: true }).fill('mobile-offline-test');
  await page.getByRole('button', { name: '连接工作台', exact: true }).click();
  await navigate(page, '新建会话');
  await page.getByRole('button', { name: '创建会话', exact: true }).click();
  await page.evaluate(() => { document.documentElement.style.setProperty('--app-safe-top', '59px'); document.documentElement.dataset.theme = 'dark'; });
  await page.getByRole('button', { name: '结果', exact: true }).click();
  const panel = page.getByRole('dialog', { name: '执行结果' });
  await panel.evaluate(el => { const body = el.querySelector('.sheet-body')!; const filler = document.createElement('div'); filler.style.height = '1800px'; body.append(filler); body.scrollTop = 1200; });
  expect((await panel.getByRole('button', { name: '关闭', exact: true }).boundingBox())!.y).toBeGreaterThanOrEqual(59);
  await panel.getByRole('button', { name: '关闭', exact: true }).click();
  await navigate(page, '工作区');
  await page.getByRole('button', { name: '工具', exact: true }).click();
  await page.getByRole('button', { name: '浏览器控制', exact: true }).click();
  const browser = page.getByRole('region', { name: '浏览器控制' });
  await expect(browser).toContainText('当前没有打开的网页');
  await expect(browser).not.toContainText('%E6');
  await expect(browser.getByLabel('网页地址', { exact: true })).toBeHidden();
  await expect(browser.getByRole('button', { name: '接管浏览器', exact: true })).toHaveCount(0);
  await browser.getByText('手动打开网址', { exact: true }).click();
  await expect(browser.getByLabel('网页地址', { exact: true })).toBeVisible();
  view = { active: true, owner: 'user', generation: 1, scene: { scene_id: 'x' }, url: 'https://www.so.com/s?q=%E6%B5%8B%E8%AF%95', image: null };
  await expect(browser).toContainText('由你控制');
  await browser.getByText('手动操作网页', { exact: true }).click();
  await expect(browser).toContainText('画面尚未就绪');
  await expect(browser.getByRole('button', { name: '向下滚动', exact: true })).toBeDisabled();
  await expect(browser).not.toContainText('%E6');
});
