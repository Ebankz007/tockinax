/**
 * TOCKINAX participation plan — single source of truth for UI copy.
 *
 * These are the numbers from the approved compensation plan. They are shown to
 * members and must stay in lockstep with `backend/db/seed.cjs`. If the seed and
 * this file disagree, this file is wrong until proven otherwise.
 *
 * Note on Stage 1 cycles: the approved plan requires 6 x 7-day AND 3 x 14-day
 * cycles (42 cumulative days) to leave Stage 1. Any environment showing 0/0 is
 * mis-seeded — a member would advance with zero locking cycles.
 */

export type StageDef = {
  stage: 1 | 2 | 3 | 4 | 5;
  name: string;
  minBuy: number;
  maxBuy: number;
  generations: number;
  cycles7d: number;
  cycles14d: number;
  cumulativeDays: number;
  upgradeFee: number;
  renewalFee: number;
  accent: string;
  blurb: string;
};

export const STAGES: StageDef[] = [
  {
    stage: 1,
    name: 'Entry',
    minBuy: 50,
    maxBuy: 500,
    generations: 1,
    cycles7d: 6,
    cycles14d: 3,
    cumulativeDays: 42,
    upgradeFee: 100,
    renewalFee: 25,
    accent: '#EAECEF',
    blurb: 'Direct-referral eligibility with a 500 USDT lock ceiling.',
  },
  {
    stage: 2,
    name: 'Growth',
    minBuy: 500,
    maxBuy: 2500,
    generations: 2,
    cycles7d: 6,
    cycles14d: 3,
    cumulativeDays: 42,
    upgradeFee: 250,
    renewalFee: 50,
    accent: '#0ECB81',
    blurb: 'Two generations of eligibility, up to 2,500 USDT.',
  },
  {
    stage: 3,
    name: 'Advancement',
    minBuy: 2500,
    maxBuy: 10000,
    generations: 3,
    cycles7d: 6,
    cycles14d: 3,
    cumulativeDays: 42,
    upgradeFee: 600,
    renewalFee: 120,
    accent: '#3B82F6',
    blurb: 'Professional tier, up to 10,000 USDT, three generations.',
  },
  {
    stage: 4,
    name: 'Premium',
    minBuy: 10000,
    maxBuy: 25000,
    generations: 4,
    cycles7d: 6,
    cycles14d: 3,
    cumulativeDays: 42,
    upgradeFee: 1500,
    renewalFee: 300,
    accent: '#8B5CF6',
    blurb: 'High-volume capacity to 25,000 USDT, four generations.',
  },
  {
    stage: 5,
    name: 'Elite',
    minBuy: 25000,
    maxBuy: 100000,
    generations: 5,
    cycles7d: 6,
    cycles14d: 3,
    cumulativeDays: 42,
    upgradeFee: 0,
    renewalFee: 600,
    accent: '#F0B90B',
    blurb: 'Top tier — 100,000 USDT ceiling, five generations.',
  },
];

export type ReferralCategory = {
  id: number;
  key: string;
  name: string;
  basis: string;
  rateBps: number;
  scope: string;
};

/**
 * Eight approved categories. `active` is false in every environment: nothing
 * pays until a category is approved AND funded. Displayed as "inactive" on
 * purpose — a member should never see a number that looks payable.
 */
export const REFERRAL_CATEGORIES: ReferralCategory[] = [
  { id: 1, key: 'acquisition', name: 'Direct acquisition', basis: 'verified activation of a direct referral', rateBps: 1000, scope: 'Gen 1' },
  { id: 2, key: 'marketplace_direct', name: 'Marketplace activity', basis: 'eligible direct-referral marketplace volume', rateBps: 500, scope: 'Gen 1' },
  { id: 3, key: 'retention', name: 'Retention', basis: 'approved retention and sustained activity', rateBps: 300, scope: 'Gen 1–2' },
  { id: 4, key: 'advancement_recognition', name: 'Stage advancement', basis: 'verified downline stage milestone', rateBps: 400, scope: 'Gen 1–3' },
  { id: 5, key: 'gen2', name: 'Second generation', basis: 'eligible gen-2 marketplace volume', rateBps: 300, scope: 'Gen 2' },
  { id: 6, key: 'gen3', name: 'Third generation', basis: 'eligible gen-3 marketplace volume', rateBps: 200, scope: 'Gen 3' },
  { id: 7, key: 'gen4', name: 'Fourth generation', basis: 'eligible gen-4 marketplace volume', rateBps: 150, scope: 'Gen 4' },
  { id: 8, key: 'gen5', name: 'Fifth generation', basis: 'eligible gen-5 marketplace volume', rateBps: 100, scope: 'Gen 5' },
];

export const PLATFORM_RULES = {
  activationFeeUsdt: 20,
  withdrawalFeeUsdt: 1,
  transferFeeUsdt: 0,
  dailyTargetRate: 0.01,
  sevenDayTarget: 1.07,
  fourteenDayTarget: 1.14,
  minCycleDays: 42,
  /** Platform fees are RECORDED in system_settings but NOT enforced. */
  feesEnforced: false,
} as const;

/** Target resale for a lock. Explicitly a target, never a promise. */
export function targetResale(amount: number, days: 7 | 14): number {
  const mult = days === 7 ? PLATFORM_RULES.sevenDayTarget : PLATFORM_RULES.fourteenDayTarget;
  return Math.round(amount * mult * 100) / 100;
}

export function usdt(n: number, dp = 2): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function bpsToPct(bps: number): string {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;
}
