/* global beforeEach, afterEach, it, expect */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const report = require('../../scripts/e2e/production-report.cjs');
let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-report-'));
  process.env.MM_ALLURE_RESULTS = dir;
  delete process.env.GITHUB_STEP_SUMMARY;
});
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); delete process.env.MM_ALLURE_RESULTS; });
it('records expected/actual values, preserves failure and marks unreached checks skipped', async () => {
  await expect(report.run('analytics-initial', async () => report.check('Distance',
    () => assert.equal(5, 8.2), { expected: 8.2, actual: 5 }))).rejects.toThrow();
  await report.run('cleanup-final baseline verification', async () => {});
  const rows = report.finalize();
  expect(rows.find(r => r.testCaseId === 'analytics-initial').status).toBe('failed');
  expect(rows.find(r => r.testCaseId === 'analytics-initial').steps[0].parameters).toEqual([
    { name: 'expected', value: '8.2' }, { name: 'actual', value: '5' }]);
  expect(rows.find(r => r.testCaseId === 'plans').status).toBe('skipped');
  expect(rows.find(r => r.testCaseId === 'cleanup-final baseline verification').status).toBe('passed');
});
it('labels an interrupted result broken instead of passed', () => {
  fs.writeFileSync(path.join(dir, 'interrupted-result.json'), JSON.stringify({
    uuid: 'interrupted', testCaseId: 'setup', name: 'Setup', labels: [{ name: 'suite', value: 'Setup' }], stage: 'running' }));
  expect(report.finalize().find(r => r.testCaseId === 'setup').status).toBe('broken');
});
it('keeps cleanup failures visible independently and rethrows them', async () => {
  await expect(report.run('cleanup-final baseline verification', async () => { throw Error('Rows remain'); })).rejects.toThrow('Rows remain');
  const rows = report.finalize();
  expect(rows.find(r => r.testCaseId === 'cleanup-final baseline verification').status).toBe('broken');
  expect(fs.readFileSync(path.join(dir, 'summary.md'), 'utf8')).toContain('Cleanup: NOT VERIFIED');
});
it('redacts secrets, emails, JWTs and account IDs from report messages', () => {
  process.env.E2E_TESTER_PASSWORD = 'secret-example';
  expect(report.sanitize('secret-example user@example.com eyJabc.def.ghi 12345678-1234-1234-1234-123456789012'))
    .toBe('[REDACTED] [EMAIL] [TOKEN] [ID]');
  delete process.env.E2E_TESTER_PASSWORD;
});
