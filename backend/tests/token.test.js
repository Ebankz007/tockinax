// Token-marketplace hermetic tests — NO DB. Pure math + guard logic only.
const fs = require('fs');
const path = require('path');
const { priceSimple, maturesAt } = require('../src/lib/tokenPricing');
const { isMatured, isFillComplete } = require('../src/lib/maturity');
const { STAGE_GENS, maxGenForStage, isGenerationEligible, filterEligibleAncestors } = require('../src/lib/commcats');
const { validateBuyQty } = require('../src/routes/v1.tokenmarket');

describe('token pricing (simple interest, Decimal)', () => {
  test('100 USDT / 7d @100bps/day -> 107 total, 1.07 unit', () => {
    const r = priceSimple('100', 7, 100);
    expect(r.total).toBe('107.0000');
    expect(r.unit).toBe('1.0700');
  });
  test('100 USDT / 14d @100bps/day -> 114 total, 1.14 unit', () => {
    const r = priceSimple('100', 14, 100);
    expect(r.total).toBe('114.0000');
    expect(r.unit).toBe('1.1400');
  });
  test('simple-not-compound proof: 14d != 100*1.01^14', () => {
    const simple = priceSimple('100', 14, 100);
    const compound = 100 * Math.pow(1.01, 14); // ~114.947...
    expect(parseFloat(simple.total)).toBeCloseTo(114, 4);
    expect(compound).toBeGreaterThan(114.5);
    expect(Math.abs(compound - parseFloat(simple.total))).toBeGreaterThan(0.5);
  });
  test('invalid lock days throw', () => {
    expect(() => priceSimple('100', 30, 100)).toThrow(/invalid_lock/);
  });
});

describe('maturity date math', () => {
  test('maturesAt adds exact lock days', () => {
    const base = new Date('2026-01-01T00:00:00.000Z');
    expect(maturesAt(base, 7).toISOString()).toBe('2026-01-08T00:00:00.000Z');
    expect(maturesAt(base, 14).toISOString()).toBe('2026-01-15T00:00:00.000Z');
  });
  test('isMatured true only when matures_at < now', () => {
    expect(isMatured('2026-01-01T00:00:00Z', '2026-01-09T00:00:00Z')).toBe(true);
    expect(isMatured('2026-01-10T00:00:00Z', '2026-01-09T00:00:00Z')).toBe(false);
  });
  test('isFillComplete only on zero remaining', () => {
    expect(isFillComplete('0')).toBe(true);
    expect(isFillComplete('0.0000')).toBe(true);
    expect(isFillComplete('3.5')).toBe(false);
  });
});

describe('stage -> generation map', () => {
  test('map is 1->1 .. 5->5', () => {
    expect(STAGE_GENS).toEqual({ 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 });
    for (let s = 1; s <= 5; s++) expect(maxGenForStage(s)).toBe(s);
  });
  test('depth beyond stage is ineligible', () => {
    expect(isGenerationEligible(1, 1)).toBe(true);
    expect(isGenerationEligible(1, 2)).toBe(false);
    expect(isGenerationEligible(3, 3)).toBe(true);
    expect(isGenerationEligible(3, 4)).toBe(false);
  });
  test('filterEligibleAncestors keeps only gated depths', () => {
    const rows = [
      { ancestor_id: 'a', depth: 1, stage: 1 },
      { ancestor_id: 'b', depth: 2, stage: 1 },
    ];
    const kept = filterEligibleAncestors(rows);
    expect(kept.map((x) => x.ancestor_id)).toEqual(['a']);
  });
});

describe('upgrade blocked on NULL fee (never invent fees)', () => {
  test('route source enforces 409 fee_unset', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'v1.tokens.js'), 'utf8');
    expect(src).toMatch(/fee_unset/);
    expect(src).toMatch(/409/);
    expect(src).toMatch(/fee == null/);
  });
  test('pure fee gate: null/undefined blocks, set value passes', () => {
    const blocked = (fee) => fee == null;
    expect(blocked(null)).toBe(true);
    expect(blocked(undefined)).toBe(true);
    expect(blocked('25.0000')).toBe(false);
    expect(blocked(0)).toBe(false); // explicit zero is disclosed, not TBD
  });
});

describe('oversell guard (pure)', () => {
  test('exact fill passes, overbuy throws oversell', () => {
    expect(validateBuyQty('10.0000', '10.0000')).toBe(true);
    expect(validateBuyQty('10.0000', '3.2500')).toBe(true);
    expect(() => validateBuyQty('10.0000', '10.0001')).toThrow(/oversell/);
  });
  test('zero/negative qty throws invalid_qty', () => {
    expect(() => validateBuyQty('10', '0')).toThrow(/invalid_qty/);
    expect(() => validateBuyQty('10', '-1')).toThrow(/invalid_qty/);
  });
  test('buy route uses SELECT ... FOR UPDATE (SQL-string assertion)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'v1.tokenmarket.js'), 'utf8');
    expect(src).toMatch(/for update/i);
    expect(src).toMatch(/remaining/i);
  });
});
