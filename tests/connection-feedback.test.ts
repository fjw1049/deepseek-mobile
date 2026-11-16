import { expect, test } from 'vitest';
import { connectionFeedback } from '../src/connection-feedback';
import { ApiError } from '../src/protocol';
test('credential errors do not claim the computer is offline', () => {
  expect(connectionFeedback(new Error('plugin unavailable'), 'credentials').title).toBe('无法读取保存的连接');
});
test('revoked authorization explains re-pairing, network errors retain credentials', () => {
  expect(connectionFeedback(new ApiError(401, 'Unauthorized'), 'network').title).toBe('电脑授权已失效');
  expect(connectionFeedback(new TypeError('Failed to fetch'), 'network').detail).toContain('不会被清除');
});
