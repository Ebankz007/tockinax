'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import Stat from '@/components/Stat';
import { SimBadge } from '@/components/Badges';
import { api, errMsg, fetchModule, ApiError, type ModuleState } from '@/lib/api';

type Overview = {
  members: { total: number; active: number; suspended: number };
  orders: { total: number; completed: number; disputed: number; pending: number };
  finance: { service_fee_revenue: string; outstanding_liabilities: string; payouts_pending: number };
  recon: { mismatches_7d: number };
};

type TokenKpis = {
  locked?: number | string;
  matured?: number | string;
  listed?: number | string;
  filled?: number | string;
  holders?: number | string;
  [k: string]: unknown;
};

function AdminInner() {
  const [data, setData] = useState<Overview | null>(null);
  const [kpis, setKpis] = useState<ModuleState<TokenKpis>>({ state: 'loading' });
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const o = await api.get<Overview>('/admin/overview');
        setData(o);
      } catch (e) {
        if (e instanceof ApiError && e.status === 403) setForbidden(true);
        else setError(errMsg(e));
      } finally {
        setLoading(false);
      }
      setKpis(await fetchModule<TokenKpis>('/tokens/admin/kpis'));
    })();
  }, []);

  if (loading) return <p role="status">Loading admin overview…</p>;
  if (forbidden)
    return (
      <div className="card space-y-2">
        <h1 className="font-display text-2xl font-bold text-white">Admin</h1>
        <p className="alert-error" role="alert">Gated: super_admin role required. This area is restricted.</p>
      </div>
    );

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold text-white">
        Admin overview <SimBadge />
      </h1>
      {error && <p className="alert-error" role="alert">{error}</p>}
      {data && (
        <div className="grid gap-4 md:grid-cols-4">
          <Stat label="Members" value={String(data.members.total)} sub={`${data.members.active} active · ${data.members.suspended} suspended`} />
          <Stat label="Orders" value={String(data.orders.total)} sub={`${data.orders.completed} completed · ${data.orders.disputed} disputed · ${data.orders.pending} pending`} />
          <Stat label="Fee revenue" value={String(data.finance.service_fee_revenue)} sub={`${data.finance.payouts_pending} payouts pending`} />
          <Stat label="Recon mismatches (7d)" value={String(data.recon.mismatches_7d)} sub={`Liabilities: ${data.finance.outstanding_liabilities}`} />
        </div>
      )}
      <div className="card space-y-2">
        <h2 className="font-display font-semibold text-white">Token KPIs (pilot)</h2>
        {kpis.state === 'loading' && <p role="status">Loading token KPIs…</p>}
        {kpis.state === 'deploying' && (
          <p className="alert-warn" role="status">
            Token KPI module deploying — <span className="badge-sim">SIM</span> SIMULATED pilot, no live figures yet.
          </p>
        )}
        {kpis.state === 'forbidden' && <p className="alert-error" role="alert">Gated: super_admin role required for token KPIs.</p>}
        {kpis.state === 'error' && <p className="alert-error" role="alert">{kpis.message}</p>}
        {kpis.state === 'live' && (
          <div className="grid gap-4 md:grid-cols-4">
            <Stat label="Locked" value={String(kpis.data.locked ?? '—')} sub="Pilot positions" />
            <Stat label="Matured" value={String(kpis.data.matured ?? '—')} sub="Awaiting/listed" />
            <Stat label="Listed" value={String(kpis.data.listed ?? '—')} sub="On token market" />
            <Stat label="Filled" value={String(kpis.data.filled ?? '—')} sub="Settled (sim)" />
          </div>
        )}
      </div>
      <nav className="flex flex-wrap gap-2 text-sm" aria-label="Admin sections">
        <Link href="/admin/token-ops" className="btn-primary">Token ops</Link>
        <Link href="/admin/deposits" className="btn-secondary">Deposits review</Link>
        <Link href="/admin/withdrawals" className="btn-secondary">Withdrawals review</Link>
        <Link href="/admin/stages" className="btn-secondary">Stages config</Link>
        <Link href="/admin/categories" className="btn-secondary">Categories</Link>
        <Link href="/admin/moderation" className="btn-secondary">Moderation</Link>
        <Link href="/admin/finance" className="btn-secondary">Finance</Link>
        <Link href="/admin/content" className="btn-secondary">Content</Link>
        <Link href="/admin/users" className="btn-secondary">Users</Link>
      </nav>
    </div>
  );
}

export default function AdminPage() {
  return (
    <RequireAuth>
      <AdminInner />
    </RequireAuth>
  );
}
