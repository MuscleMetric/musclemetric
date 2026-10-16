import { authorizeWorker } from '../../supabase/functions/process-notification-push-jobs/auth';

const token = 'a'.repeat(64);
test('rejects missing, placeholder and malformed credentials without calling database', async () => {
  const verify = jest.fn();
  for (const input of [null, '', 'YOUR_TOKEN', 'Bearer '+token, 'x'.repeat(64)]) {
    expect(await authorizeWorker(input, verify)).toBe(false);
  }
  expect(verify).not.toHaveBeenCalled();
});
test('requires a successful server-side secret match', async () => {
  expect(await authorizeWorker(token, async () => false)).toBe(false);
  expect(await authorizeWorker(token, async () => true)).toBe(true);
});
test('fails closed if verification is unavailable', async () => {
  expect(await authorizeWorker(token, async () => { throw Error('offline'); })).toBe(false);
});
