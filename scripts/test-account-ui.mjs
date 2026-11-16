import { chromium, expect } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const credentials = JSON.parse(readFileSync(resolve(root, '.runtime/account/dev-account.json'), 'utf8'));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
try {
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 850 } });
  const a = await mobile.newPage(), b = await desktop.newPage();
  for (const page of [a, b]) {
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:5178');
    await page.getByLabel('邮箱', { exact: true }).fill(credentials.email);
    await page.getByLabel('密码', { exact: true }).fill(credentials.password);
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page.getByRole('button', { name: '打开会话', exact: true })).toBeVisible({ timeout: 20000 });
  }
  const title = `账号同步验证 ${Date.now()}`;
  await a.getByRole('button', { name: '打开会话', exact: true }).click();
  await a.getByRole('button', { name: '设置会话名称…', exact: true }).click();
  await a.getByLabel('会话名称', { exact: true }).fill(title);
  await a.getByRole('button', { name: '创建会话', exact: true }).click();
  await expect(a.getByRole('textbox', { name: '消息', exact: true })).toBeEnabled();
  await a.getByRole('textbox', { name: '消息', exact: true }).fill('这是同一账号的跨端离线验证。');
  await a.getByRole('button', { name: '发送消息', exact: true }).click();
  await expect(a.locator('.assistant-message')).toContainText('Offline Runtime', { timeout: 20000 });
  await b.getByRole('button', { name: '打开会话', exact: true }).click();
  await expect(b.locator('.project-threads button').filter({ hasText: title })).toBeVisible({ timeout: 15000 });
  await b.locator('.project-threads button').filter({ hasText: title }).click();
  await expect(b.locator('.assistant-message')).toContainText('跨端离线验证', { timeout: 15000 });
  await b.locator('.model-chip').click();
  await b.getByRole('button', { name: '高级模型配置', exact: true }).click();
  await b.getByLabel('模型 ID', { exact: true }).fill('offline-alternate');
  await b.getByRole('button', { name: '完成', exact: true }).click();
  await expect(a.locator('.model-chip')).toContainText('offline-alternate', { timeout: 15000 });
  await b.getByRole('button', { name: '审批模式', exact: true }).click();
  await b.getByRole('button', { name: '自动批准', exact: false }).click();
  await expect(a.locator('.permission-chip')).toContainText('自动批准', { timeout: 15000 });
  mkdirSync(resolve(root, 'artifacts/account'), { recursive: true });
  await a.screenshot({ path: resolve(root, 'artifacts/account/mobile-synced.png') });
  await b.screenshot({ path: resolve(root, 'artifacts/account/desktop-web-synced.png') });
  await a.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '设置', exact: true }).click();
  await a.getByRole('button', { name: '断开连接', exact: true }).click();
  await expect(a.getByRole('heading', { name: '登录工作空间' })).toBeVisible();
  await expect(a.locator('.assistant-message')).toHaveCount(0);
  expect(errors).toEqual([]);
  console.log('PASS: two independent browser sessions, chat sync, model/approval sync, logout. This is not an Electron/native test.');
} finally {
  await browser.close();
}
