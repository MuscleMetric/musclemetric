/* global describe, it, expect */
const { parseTap } = require('../../scripts/e2e/database-checks.cjs');
describe('database assertions retain their actual outcome in Allure',()=>{
  it('parses individual assertions with failure diagnostics',()=>{
    const parsed=parseTap('BEGIN\n1..2\nok 1 - owner can read\nnot ok 2 - other user denied\n# got 1 row\n# expected 0\nROLLBACK');
    expect(parsed.valid).toBe(true);
    expect(parsed.tests.map(t=>t.status)).toEqual(['passed','failed']);
    expect(parsed.tests[1].message).toContain('expected 0');
  });
  it.each(['1..2\nok 1 - only one ran','1..2\nok 1 - first\nok 1 - duplicate',
    '1..1\nok 2 - wrong ordinal','1..1\nok 1 - pass\nBail out! interrupted','ERROR: schema missing'])
    ('rejects incomplete or invalid SQL execution: %s',text=>expect(parseTap(text).valid).toBe(false));
  it('never calls TODO or skipped assertions passed',()=>{
    expect(parseTap('1..2\nok 1 - pending # SKIP unavailable\nnot ok 2 - future # TODO').tests.map(t=>t.status)).toEqual(['skipped','skipped']);
  });
});

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
it('combined report preserves failed, cancelled and skipped upstream jobs', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'combined-report-'));
  try {
    for (const outcome of ['failure', 'cancelled', 'skipped', 'success']) {
      const result = spawnSync(process.execPath, ['scripts/e2e/combined-report.cjs'], {
        env: { ...process.env, MM_ALLURE_RESULTS: dir, DATABASE_RESULT: outcome, PRODUCTION_RESULT: 'success', GITHUB_STEP_SUMMARY: '' },
        encoding: 'utf8',
      });
      expect(result.status).toBe(0);
      const rows = fs.readdirSync(dir).filter(f => f.endsWith('-result.json')).map(f => JSON.parse(fs.readFileSync(path.join(dir, f))));
      expect(rows).toHaveLength(2);
      const database = rows.find(r => r.testCaseId === 'job/DATABASE_RESULT');
      expect(database.status).toBe(outcome === 'success' ? 'passed' : outcome === 'skipped' ? 'skipped' : 'broken');
      expect(database.statusDetails.message).toContain(outcome);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
