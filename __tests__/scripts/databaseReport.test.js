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
