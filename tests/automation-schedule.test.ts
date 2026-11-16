import { expect, test } from 'vitest';
import { parseSchedule, makeSchedule, localDateInput } from '../src/automation-schedule';
test('daily and weekday controls round-trip without changing the schedule', () => {
  for (const cron of ['0 9 * * *', '30 18 * * 1-5', '59 23 * * *']) {
    const parsed = parseSchedule(cron);
    expect(makeSchedule(parsed.frequency, parsed.time, cron)).toBe(cron);
  }
});
test('unrecognized advanced schedules remain untouched', () => {
  const cron = '*/10 * * * *';
  expect(parseSchedule(cron).frequency).toBe('custom');
  expect(makeSchedule('custom', '09:00', cron)).toBe(cron);
  expect(() => makeSchedule('daily', '25:00', '')).toThrow();
});
test('date input uses local wall time and invalid dates stay empty', () => {
  expect(localDateInput('invalid')).toBe('');
  expect(localDateInput(new Date(2027, 0, 2, 9, 30).toISOString())).toBe('2027-01-02T09:30');
});
