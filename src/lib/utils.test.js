import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  calculateDynamicOdds,
  formatExpirationCountdown,
  formatRechargeTimeRemaining,
  generateShareCode,
  getRarityTier,
  getRechargeCyclesRemaining,
  getRechargeIntervalMs,
  getRechargeOpensAvailable,
  getRemainingPercentage,
  getTimeUntilNextRecharge,
  isExpiringSoon,
  validatePercentages,
} from './utils.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = new Date('2026-07-23T12:00:00Z').getTime();

// ---------------------------------------------------------------------------
// getRarityTier — boundary-driven tier thresholds
// ---------------------------------------------------------------------------
describe('getRarityTier', () => {
  it('maps each threshold band, inclusive at the low edge', () => {
    expect(getRarityTier(100)).toBe('common');
    expect(getRarityTier(50)).toBe('common');
    expect(getRarityTier(49.99)).toBe('rare');
    expect(getRarityTier(20)).toBe('rare');
    expect(getRarityTier(19.99)).toBe('epic');
    expect(getRarityTier(5)).toBe('epic');
    expect(getRarityTier(4.99)).toBe('legendary');
    expect(getRarityTier(1)).toBe('legendary');
    expect(getRarityTier(0.99)).toBe('mythic');
    expect(getRarityTier(0)).toBe('mythic');
  });
});

// ---------------------------------------------------------------------------
// getRechargeIntervalMs
// ---------------------------------------------------------------------------
describe('getRechargeIntervalMs', () => {
  it('returns the period length in ms', () => {
    expect(getRechargeIntervalMs('hour')).toBe(HOUR);
    expect(getRechargeIntervalMs('day')).toBe(DAY);
    expect(getRechargeIntervalMs('week')).toBe(7 * DAY);
    expect(getRechargeIntervalMs('month')).toBe(30 * DAY);
  });
  it('defaults unknown/undefined periods to one day', () => {
    expect(getRechargeIntervalMs('fortnight')).toBe(DAY);
    expect(getRechargeIntervalMs(undefined)).toBe(DAY);
  });
});

// ---------------------------------------------------------------------------
// calculateDynamicOdds — the odds redistribution as items deplete
// ---------------------------------------------------------------------------
describe('calculateDynamicOdds', () => {
  it('leaves odds unchanged when nothing has a max quantity', () => {
    const items = [{ id: 1, percentage: 30 }, { id: 2, percentage: 70 }];
    const out = calculateDynamicOdds(items, []);
    expect(out.map(i => i.adjustedPercentage)).toEqual([30, 70]);
  });

  it('redistributes to 100% among survivors when a capped item is exhausted', () => {
    const items = [
      { id: 1, percentage: 50, maxQuantity: 1 },
      { id: 2, percentage: 50 },
    ];
    const out = calculateDynamicOdds(items, [{ itemId: 1 }]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(2);
    expect(out[0].adjustedPercentage).toBe(100);
  });

  it('keeps a capped item while it still has quantity, renormalizing the rest', () => {
    const items = [
      { id: 1, percentage: 25, maxQuantity: 2 },
      { id: 2, percentage: 75 },
    ];
    const out = calculateDynamicOdds(items, [{ itemId: 1 }]); // 1 of 2 pulled
    expect(out).toHaveLength(2);
    // total is still 100, so adjusted equals the raw percentages
    expect(out.find(i => i.id === 1).adjustedPercentage).toBeCloseTo(25);
    expect(out.find(i => i.id === 2).adjustedPercentage).toBeCloseTo(75);
  });

  it('renormalizes when the surviving percentages no longer sum to 100', () => {
    const items = [
      { id: 1, percentage: 20, maxQuantity: 1 },
      { id: 2, percentage: 20 },
      { id: 3, percentage: 60 },
    ];
    const out = calculateDynamicOdds(items, [{ itemId: 1 }]); // id 1 gone; 20 + 60 remain
    expect(out).toHaveLength(2);
    expect(out.find(i => i.id === 2).adjustedPercentage).toBeCloseTo(25); // 20/80
    expect(out.find(i => i.id === 3).adjustedPercentage).toBeCloseTo(75); // 60/80
  });

  it('returns [] once every item is exhausted', () => {
    const items = [{ id: 1, percentage: 100, maxQuantity: 2 }];
    const out = calculateDynamicOdds(items, [{ itemId: 1 }, { itemId: 1 }]);
    expect(out).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// validatePercentages
// ---------------------------------------------------------------------------
describe('validatePercentages', () => {
  it('rejects an empty item list', () => {
    expect(validatePercentages([])).toEqual({
      valid: false, total: 0, message: 'Add at least one item',
    });
  });
  it('accepts a total of exactly 100', () => {
    const r = validatePercentages([{ percentage: 40 }, { percentage: 60 }]);
    expect(r.valid).toBe(true);
    expect(r.message).toBe('Perfect!');
  });
  it('reports the shortfall when under 100', () => {
    const r = validatePercentages([{ percentage: 40 }, { percentage: 50 }]);
    expect(r.valid).toBe(false);
    expect(r.message).toBe('Missing 10.00%');
  });
  it('reports the excess when over 100', () => {
    const r = validatePercentages([{ percentage: 70 }, { percentage: 40 }]);
    expect(r.valid).toBe(false);
    expect(r.message).toBe('Over by 10.00%');
  });
  it('tolerates floating-point sums via rounding', () => {
    const r = validatePercentages([{ percentage: 33.33 }, { percentage: 33.33 }, { percentage: 33.34 }]);
    expect(r.valid).toBe(true);
  });
});

describe('getRemainingPercentage', () => {
  it('returns what is left up to 100', () => {
    expect(getRemainingPercentage([{ percentage: 30 }, { percentage: 20 }])).toBe(50);
  });
  it('never goes negative when over-allocated', () => {
    expect(getRemainingPercentage([{ percentage: 80 }, { percentage: 40 }])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Recharge availability — the subtlest logic in the app.
// ---------------------------------------------------------------------------
describe('getRechargeOpensAvailable', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
  afterEach(() => { vi.useRealTimers(); });

  const unlimitedBox = (over = {}) => ({
    pullRechargeEnabled: true,
    pullRechargePeriod: 'day',
    pullRechargeAmount: 3,
    pullRechargeMax: 5,
    createdAt: NOW,
    ...over,
  });

  it('returns Infinity when recharge is disabled', () => {
    expect(getRechargeOpensAvailable({ pullRechargeEnabled: false }, [])).toBe(Infinity);
  });

  it('offers a full period allowance on a fresh box', () => {
    expect(getRechargeOpensAvailable(unlimitedBox(), [])).toBe(3);
  });

  it('drops to zero once the period allowance is spent', () => {
    const pulls = [NOW, NOW, NOW]; // 3 pulls this period, amount = 3
    expect(getRechargeOpensAvailable(unlimitedBox(), pulls)).toBe(0);
  });

  it('banks idle periods but never exceeds pullRechargeMax', () => {
    // Last pull 2 days ago: 2 banked periods * 3 = 6, capped at max 5.
    const pulls = [NOW - 2 * DAY];
    expect(getRechargeOpensAvailable(unlimitedBox(), pulls)).toBe(5);
  });

  it('limited cycles: total ever = (cyclesElapsed + 1) * amount, minus pulls', () => {
    const box = {
      pullRechargeEnabled: true,
      pullRechargePeriod: 'day',
      pullRechargeAmount: 2,
      pullRechargeMax: 10,
      pullRechargeUnlimited: false,
      pullRechargeCycles: 3,
      createdAt: NOW - 5 * DAY, // 5 periods elapsed, clamped to 3 cycles
    };
    // grandTotal = (3 + 1) * 2 = 8; minus 3 pulls = 5 remaining
    expect(getRechargeOpensAvailable(box, [NOW, NOW, NOW])).toBe(5);
  });

  it('limited cycles: exhausted once all grantable opens are spent', () => {
    const box = {
      pullRechargeEnabled: true,
      pullRechargePeriod: 'day',
      pullRechargeAmount: 2,
      pullRechargeMax: 10,
      pullRechargeUnlimited: false,
      pullRechargeCycles: 3,
      createdAt: NOW - 5 * DAY,
    };
    const eight = Array(8).fill(NOW);
    expect(getRechargeOpensAvailable(box, eight)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getTimeUntilNextRecharge
// ---------------------------------------------------------------------------
describe('getTimeUntilNextRecharge', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
  afterEach(() => { vi.useRealTimers(); });

  it('returns 0 when recharge is disabled', () => {
    expect(getTimeUntilNextRecharge({ pullRechargeEnabled: false }, [])).toBe(0);
  });

  it('counts down within the current period from the last pull', () => {
    const box = { pullRechargeEnabled: true, pullRechargePeriod: 'day', createdAt: NOW };
    // Pulled 6h ago → 18h until the period rolls over.
    expect(getTimeUntilNextRecharge(box, [NOW - 6 * HOUR])).toBe(18 * HOUR);
  });

  it('is a full interval immediately after a pull', () => {
    const box = { pullRechargeEnabled: true, pullRechargePeriod: 'day', createdAt: NOW };
    expect(getTimeUntilNextRecharge(box, [NOW])).toBe(DAY);
  });

  it('returns -1 when limited cycles are exhausted', () => {
    const box = {
      pullRechargeEnabled: true,
      pullRechargePeriod: 'day',
      pullRechargeUnlimited: false,
      pullRechargeCycles: 2,
      createdAt: NOW - 3 * DAY, // 3 periods >= 2 cycles
    };
    expect(getTimeUntilNextRecharge(box, [NOW - HOUR])).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// getRechargeCyclesRemaining
// ---------------------------------------------------------------------------
describe('getRechargeCyclesRemaining', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
  afterEach(() => { vi.useRealTimers(); });

  it('returns null for unlimited (or disabled) recharge', () => {
    expect(getRechargeCyclesRemaining({ pullRechargeEnabled: true })).toBeNull();
    expect(getRechargeCyclesRemaining({ pullRechargeEnabled: false })).toBeNull();
  });

  it('counts down cycles as periods elapse, floored at 0', () => {
    const box = {
      pullRechargeEnabled: true,
      pullRechargePeriod: 'day',
      pullRechargeUnlimited: false,
      pullRechargeCycles: 5,
      createdAt: NOW - 2 * DAY,
    };
    expect(getRechargeCyclesRemaining(box)).toBe(3);
    expect(getRechargeCyclesRemaining({ ...box, createdAt: NOW - 9 * DAY })).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Time formatters
// ---------------------------------------------------------------------------
describe('formatRechargeTimeRemaining', () => {
  it('formats across the day / hour / minute / second bands', () => {
    expect(formatRechargeTimeRemaining(0)).toBe('Now');
    expect(formatRechargeTimeRemaining(-1)).toBe('Now');
    expect(formatRechargeTimeRemaining(25 * HOUR)).toBe('1d 1h');
    expect(formatRechargeTimeRemaining(90 * 60 * 1000)).toBe('1h 30m');
    expect(formatRechargeTimeRemaining(90 * 1000)).toBe('1m 30s');
    expect(formatRechargeTimeRemaining(45 * 1000)).toBe('45s');
  });
});

describe('formatExpirationCountdown', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
  afterEach(() => { vi.useRealTimers(); });

  it('reports Expired at or past the deadline', () => {
    expect(formatExpirationCountdown(NOW - 1)).toBe('Expired');
  });
  it('formats future deadlines by largest unit', () => {
    expect(formatExpirationCountdown(NOW + 25 * HOUR)).toBe('1d 1h');
    expect(formatExpirationCountdown(NOW + 90 * 60 * 1000)).toBe('1h 30m');
    expect(formatExpirationCountdown(NOW + 30 * 1000)).toBe('30s');
  });
});

describe('isExpiringSoon', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
  afterEach(() => { vi.useRealTimers(); });

  it('is true only within the next 24 hours', () => {
    expect(isExpiringSoon(NOW + HOUR)).toBe(true);
    expect(isExpiringSoon(NOW + 24 * HOUR)).toBe(true);
    expect(isExpiringSoon(NOW + 25 * HOUR)).toBe(false);
    expect(isExpiringSoon(NOW - HOUR)).toBe(false); // already expired
  });
});

// ---------------------------------------------------------------------------
// generateShareCode
// ---------------------------------------------------------------------------
describe('generateShareCode', () => {
  it('produces a 6-char A-Z0-9 code, matching the Firestore rule', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateShareCode()).toMatch(/^[A-Z0-9]{6}$/);
    }
  });
});
