export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5070/api/v1';

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    super(`API ${status}`);
    this.status = status;
    this.body = body;
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export const api = {
  get: <T>(path: string) => req<T>(path),
  post: <T>(path: string, body?: unknown) =>
    req<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    req<T>(path, { method: 'PUT', body: body === undefined ? undefined : JSON.stringify(body) }),
};

/* ---------- Types ---------- */
export type User = {
  id: string;
  email: string;
  status: string;
  referral_code?: string;
  referralCode?: string;
  display_name?: string | null;
  displayName?: string | null;
};

export type Listing = {
  id: string;
  seller_id?: string;
  title: string;
  description: string;
  category: string;
  price: string;
  currency: string;
  stock?: number;
  status: string;
  created_at?: string;
};

export type Order = {
  id: string;
  order_no?: string;
  buyer_id?: string;
  seller_id?: string;
  listing_id?: string;
  amount: string;
  currency: string;
  platform_fee?: string;
  status: string;
  payment_method?: string;
  created_at?: string;
};

export type Campaign = {
  id: string;
  name: string;
  description?: string;
  status: string;
  starts_at?: string | null;
  ends_at?: string | null;
  qualifying_activity?: string;
  reward_rate_bps?: number;
  budget_cap?: string | null;
  funded?: boolean;
  payoutsEnabled?: boolean;
  note?: string;
};

export type ReferralMe = {
  referralCode: string;
  referralUrl: string;
  direct: { id: string; status: string; joined: string }[];
  byLevel: { level: number; n: number }[];
  commissions: { level: number; status: string; total: string; currency: string }[];
  policy: string;
};

export type Payout = {
  id: string;
  amount: string;
  currency: string;
  kind: string;
  status: string;
  created_at?: string;
};

export type Ticket = {
  id: string;
  subject: string;
  status: string;
  created_at?: string;
  messages?: { id?: string; body: string; author?: string; created_at?: string }[];
};

/* ---------- Token marketplace (pilot — tolerate 404s, never crash) ---------- */

export type TokenDef = {
  id: string;
  code: string;
  name?: string;
  cycle_days: 7 | 14;
  purchase_price: string;
  target_price: string;
  status?: string;
};

export type Holding = {
  id: string;
  token_code?: string;
  qty: string | number;
  quantity?: string | number;
  cost?: string | number;
  cost_basis?: string | number;
  lock?: string;
  lock_status?: string;
  status?: string;
  matures_at?: string | null;
  created_at?: string;
  cycle_days?: number;
};

export type TokenListing = {
  id: string;
  token_code?: string;
  seller_id?: string;
  price: string | number;
  qty_total?: string | number;
  qty_remaining?: string | number;
  quantity?: string | number;
  remaining?: string | number;
  status?: string;
  created_at?: string;
};

export type CycleInfo = {
  id?: string;
  cycle_no?: number;
  cycle_days?: number;
  progress?: number;
  completed?: number;
  total?: number;
  eligible?: boolean;
  status?: string;
};

export type StageInfo = {
  stage?: number;
  current?: number;
  name?: string;
  min_buy?: string | number | null;
  max_buy?: string | number | null;
  upgrade_fee?: string | null;
  renew_fee?: string | null;
  fee_unset?: boolean;
  limits?: { min_buy?: string | number | null; max_buy?: string | number | null };
  requirements?: { req_cycles_7d?: number; req_cycles_14d?: number };
  upgrade?: { to_stage?: number; fee?: string | number | null; fee_unset?: boolean } | null;
  renewal?: { fee?: string | number | null; fee_unset?: boolean } | null;
};

export type DepositIntent = {
  id: string;
  amount?: string | number;
  currency?: string;
  network?: string;
  address?: string;
  tx_hash?: string | null;
  txHash?: string | null;
  status?: string;
  created_at?: string;
};

export type WithdrawalReq = {
  id: string;
  amount?: string | number;
  currency?: string;
  network?: string;
  address?: string;
  tx_hash?: string | null;
  txHash?: string | null;
  status?: string;
  created_at?: string;
};

export type CommissionRow = {
  category?: string;
  generation?: number | string;
  level?: number;
  amount?: string | number;
  currency?: string;
  status?: string;
};

export type PricingVersion = {
  id?: string;
  version?: string | number;
  token_code?: string;
  cycle_days?: number;
  purchase_price?: string | number;
  target_price?: string | number;
  effective_from?: string;
  status?: string;
};

export type CategoryRow = {
  id?: string | number;
  name: string;
  description?: string;
  rate_bps?: number | null;
  enabled?: boolean;
  status?: string;
};

/** Module fetch state: 'live' | 'deploying' (404/backend missing) | 'error' | 'forbidden'. Never throws. */
export type ModuleState<T> =
  | { state: 'loading' }
  | { state: 'live'; data: T }
  | { state: 'deploying' }
  | { state: 'forbidden' }
  | { state: 'error'; message: string };

export function isMissing(e: unknown): boolean {
  if (e instanceof ApiError) {
    if (e.status === 404 || e.status === 501 || e.status === 503) return true;
    if (e.status >= 500) return true;
  } else if (e instanceof TypeError) {
    return true; // network failure — backend not reachable
  }
  return false;
}

/** GET that never throws: maps 404/5xx/network issues to 'deploying'. */
export async function fetchModule<T>(path: string): Promise<Exclude<ModuleState<T>, { state: 'loading' }>> {
  try {
    const data = await api.get<T>(path);
    return { state: 'live', data };
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) return { state: 'forbidden' };
    if (isMissing(e)) return { state: 'deploying' };
    return { state: 'error', message: errMsg(e) };
  }
}

export function listOf<T>(d: unknown): T[] {
  if (Array.isArray(d)) return d as T[];
  if (d && typeof d === 'object') {
    const o = d as { items?: unknown; data?: unknown; rows?: unknown };
    if (Array.isArray(o.items)) return o.items as T[];
    if (Array.isArray(o.data)) return o.data as T[];
    if (Array.isArray(o.rows)) return o.rows as T[];
  }
  return [];
}

export function num(v: string | number | undefined | null): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
}

export function errMsg(e: unknown): string {
  if (e instanceof ApiError) {
    const b = e.body as { message?: string; error?: string } | null;
    if (b && typeof b === 'object' && (b.message || b.error))
      return `${b.message || b.error} (HTTP ${e.status})`;
    return `Request failed (HTTP ${e.status})`;
  }
  return e instanceof Error ? e.message : 'Request failed';
}
