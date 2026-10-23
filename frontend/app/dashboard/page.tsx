'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import Stat from '@/components/Stat';
import Empty from '@/components/Empty';
import RiskStrip from '@/components/RiskStrip';
import { SimBadge } from '@/components/Badges';
import Countdown from '@/components/Countdown';
import { api, errMsg, fetchModule, listOf, type ReferralMe, type Payout, type User, type Holding } from '@/lib/api';

type Notification = { id: string; title?: string; body?: string; message?: string; created_at?: string };

function DashboardInner() {
  const [me, setMe] = useState<User | null>(null);
  const [ref, setRef] = useState<ReferralMe | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [notes, setNotes] = useState<Notification[] | null>(null);
  const [holdings, setHoldings] = useState<Holding[] | null>(null);
  const [tokensDeploying, setTokensDeploying] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const m = await api.get<User>('/auth/me');
        setMe(m);
        const [r, p, n, h] = await Promise.all([
          api.get<ReferralMe>('/referrals/me').catch(() => null),
          api.get<Payout[] | { items?: Payout[] }>('/payouts/mine').catch(() => [] as Payout[]),
          api.get<Notification[] | { items?: Notification[] }>('/notifications').catch(() => null),
          fetchModule<unknown>('/tokens/holdings'),
        ]);
        if (r) setRef(r);
        setPayouts(Array.isArray(p) ? p : p.items || []);
        if (n) setNotes(Array.isArray(n) ? n : n.items || []);
        if (h.state === 'live') setHoldings(listOf<Holding>(h.data));
        else if (h.state === 'deploying') setTokensDeploying(true);
      } catch (e) {
        setError(errMsg(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <p role="status">Loading dashboard…</p>;

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold text-white">
        Dashboard <SimBadge />
      </h1>
      {error && <p className="alert-error" role="alert">{error}</p>}
      {me && (
        <div className="grid gap-4 md:grid-cols-4">
          <Stat label="Account" value={me.status || 'member'} sub={me.email} />
          <Stat label="Direct referrals" value={String(ref?.direct.length ?? '—')} sub="Level 1 members" />
          <Stat label="Payout requests" value={String(payouts.length)} sub="All time" />
          <Stat label="Token positions" value={holdings ? String(holdings.length) : tokensDeploying ? 'SIM' : '—'} sub={holdings ? 'Across cycles' : 'Token module deploying'} />
        </div>
      )}
      <div className="card space-y-2">
        <h2 className="font-display font-semibold text-white">Token portfolio snapshot</h2>
        {holdings === null ? (
          <Empty title={tokensDeploying ? 'Token module deploying — portfolio preview unavailable.' : 'No holdings yet.'} hint={tokensDeploying ? 'SIMULATED pilot — no real funds' : 'Buy and lock tokens to start a position.'} />
        ) : holdings.length === 0 ? (
          <Empty title="No holdings yet." hint="Buy and lock tokens to start a position." />
        ) : (
          <table className="table">
            <thead>
              <tr><th scope="col">Token</th><th scope="col">Qty</th><th scope="col">Matures in</th><th scope="col">Status</th></tr>
            </thead>
            <tbody>
              {holdings.slice(0, 5).map((h, i) => (
                <tr key={h.id || i}>
                  <td className="text-white">{h.token_code || 'Pilot token'}</td>
                  <td>{String(h.qty ?? h.quantity ?? '—')}</td>
                  <td><Countdown at={h.matures_at} /></td>
                  <td>{h.lock_status || h.lock || h.status || 'locked'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Link href="/dashboard/tokens" className="inline-block text-sm text-gold underline">Manage portfolio →</Link>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <h2 className="font-semibold text-white">Referral snapshot</h2>
          {!ref ? <Empty title="Referral data unavailable." hint="Login may have expired or the endpoint is down." /> : (
            <>
              <p className="mt-1 break-all text-sm">Code: <strong>{ref.referralCode}</strong></p>
              <p className="text-xs text-mist">{ref.policy}</p>
              <Link href="/dashboard/referrals" className="mt-2 inline-block text-sm text-gold underline">View referrals →</Link>
            </>
          )}
        </div>
        <div className="card">
          <h2 className="font-semibold text-white">Notifications</h2>
          {notes === null ? <Empty title="No notification feed." hint="The notifications endpoint is not available yet." /> :
            notes.length === 0 ? <Empty title="No notifications." /> : (
            <ul className="mt-2 space-y-1 text-sm">
              {notes.slice(0, 8).map((n) => (
                <li key={n.id} className="border-b border-line/10 py-1">{n.title || n.message || n.body}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <nav className="flex flex-wrap gap-2 text-sm" aria-label="Dashboard sections">
        <Link href="/dashboard/tokens" className="btn-primary">Tokens</Link>
        <Link href="/dashboard/token-market" className="btn-secondary">Token market</Link>
        <Link href="/dashboard/cycles" className="btn-secondary">Cycles</Link>
        <Link href="/dashboard/stage" className="btn-secondary">My stage</Link>
        <Link href="/dashboard/deposits" className="btn-secondary">Deposits</Link>
        <Link href="/dashboard/withdrawals" className="btn-secondary">Withdrawals</Link>
        <Link href="/dashboard/commissions" className="btn-secondary">Commissions</Link>
        <Link href="/dashboard/statement" className="btn-secondary">Statement</Link>
        <Link href="/dashboard/marketplace" className="btn-secondary">My marketplace</Link>
        <Link href="/dashboard/referrals" className="btn-secondary">Referrals</Link>
        <Link href="/dashboard/payouts" className="btn-secondary">Payouts</Link>
        <Link href="/dashboard/support" className="btn-secondary">Support</Link>
      </nav>
      <RiskStrip compact />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardInner />
    </RequireAuth>
  );
}
