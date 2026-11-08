/**
 * TOCKINAX participation plan — single source of truth for UI copy.
 *
 * These are the numbers from the approved business & compensation plan in
 * `ooo/Tockinax_Business_and_Compensation_Plan (1).pdf`. They must stay in
 * lockstep with `backend/db/seed.cjs`.
 *
 * Insurance note: insurance is an ACCOUNT-LEVEL membership. It is activated
 * once on the member account and is never tied to a token, holding, or lock term.
 */

export type LockTermDays = 7 | 14 | 30;

export type LockTerm = {
  days: LockTermDays;
  /** Daily target rate, e.g. 0.006 = 0.60% per day. */
  ratePerDay: number;
  /** Total target over the term, e.g. 0.042 = 4.20%. */
  termRate: number;
  /** Target multiple applied to the locked amount. */
  target: number;
};

/** Approved plan: 7 days 0.60%/day, 14 days 0.75%/day, 30 days 1.00%/day. */
export const LOCK_TERMS: LockTerm[] = [
  { days: 7, ratePerDay: 0.006, termRate: 0.042, target: 1.042 },
  { days: 14, ratePerDay: 0.0075, termRate: 0.105, target: 1.105 },
  { days: 30, ratePerDay: 0.01, termRate: 0.3, target: 1.3 },
];

export type StageDef = {
  stage: 1 | 2 | 3 | 4 | 5;
  name: string;
  minBuy: number;
  maxBuy: number;
  generations: number;
  /** Fee paid once when entering the stage (Stage 1 = the $20 registration). */
  entryFee: number;
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
    entryFee: 20,
    accent: '#EAECEF',
    blurb: 'Registration stage. $20 registration fee; locking range $50–$500.',
  },
  {
    stage: 2,
    name: 'Growth',
    minBuy: 500.01,
    maxBuy: 2000,
    generations: 2,
    entryFee: 25,
    accent: '#0ECB81',
    blurb: 'Enter with a $25 fee; locking range $500.01–$2,000.',
  },
  {
    stage: 3,
    name: 'Advanced',
    minBuy: 2000.01,
    maxBuy: 5000,
    generations: 3,
    entryFee: 50,
    accent: '#3B82F6',
    blurb: 'Enter with a $50 fee; locking range $2,000.01–$5,000.',
  },
  {
    stage: 4,
    name: 'Premium',
    minBuy: 5000.01,
    maxBuy: 50000,
    generations: 3,
    entryFee: 100,
    accent: '#8B5CF6',
    blurb: 'Enter with a $100 fee; locking range $5,000.01–$50,000.',
  },
  {
    stage: 5,
    name: 'Elite',
    minBuy: 50000.01,
    maxBuy: 100000,
    generations: 3,
    entryFee: 250,
    accent: '#F0B90B',
    blurb: 'Enter with a $250 fee; locking range $50,000.01–$100,000.',
  },
];

export type ReferralReward = {
  generation: 1 | 2 | 3;
  name: string;
  amountUsdt: number;
  basis: string;
};

/** Approved plan: three referral generations paid per eligible registration. */
export const REFERRAL_REWARDS: ReferralReward[] = [
  { generation: 1, name: 'Direct referral', amountUsdt: 5, basis: 'A member you personally refer.' },
  { generation: 2, name: 'Second generation', amountUsdt: 2, basis: 'A member referred by your direct referral.' },
  { generation: 3, name: 'Third generation', amountUsdt: 1, basis: 'A member in your third referral level.' },
];

export type RegistrationSplit = {
  key: string;
  label: string;
  amountUsdt: number;
  purpose: string;
};

/** Approved plan: allocation of each $20 USDT registration. */
export const REGISTRATION_SPLIT: RegistrationSplit[] = [
  { key: 'direct', label: 'Direct referral', amountUsdt: 5, purpose: 'Qualifying direct referrer' },
  { key: 'gen2', label: 'Second generation', amountUsdt: 2, purpose: 'Level-two referral reward' },
  { key: 'gen3', label: 'Third generation', amountUsdt: 1, purpose: 'Level-three referral reward' },
  { key: 'leadership', label: 'Leadership pool', amountUsdt: 2, purpose: 'Leadership reward allocation' },
  { key: 'transaction', label: 'Transaction charges', amountUsdt: 2, purpose: 'Proposed processing costs' },
  { key: 'administration', label: 'Administration', amountUsdt: 8, purpose: 'Company administration' },
];

export const PLATFORM_RULES = {
  registrationFeeUsdt: 20,
  withdrawalFeeUsdt: 1,
  transferFeeUsdt: 0,
  /** Maximum approved daily target rate (30-day term). */
  dailyTargetRate: 0.01,
  /** Company-funded settlement charges 10% of the projected profit. */
  settlementChargeOnProfit: 0.1,
  /** Platform fees are RECORDED in system_settings but NOT enforced. */
  feesEnforced: false,
} as const;

/** Target resale for a lock. Explicitly a target, never a promise. */
export function targetResale(amount: number, days: LockTermDays): number {
  const term = LOCK_TERMS.find((t) => t.days === days);
  const mult = term ? term.target : 1;
  return Math.round(amount * mult * 100) / 100;
}

/** Company-funded settlement: member receives cost + 90% of projected profit. */
export function companySettlement(amount: number, days: LockTermDays): { profit: number; fee: number; net: number } {
  const total = targetResale(amount, days);
  const profit = Math.round((total - amount) * 100) / 100;
  const fee = Math.round(profit * PLATFORM_RULES.settlementChargeOnProfit * 100) / 100;
  return { profit, fee, net: Math.round((total - fee) * 100) / 100 };
}

export function usdt(n: number, dp = 2): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function bpsToPct(bps: number): string {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;
}
