'use client';
import { useEffect, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import Empty from '@/components/Empty';
import { api, errMsg, type ReferralMe } from '@/lib/api';

function ReferralsInner() {
  const [data, setData] = useState<ReferralMe | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<ReferralMe>('/referrals/me')
      .then(setData)
      .catch((e) => setError(errMsg(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p role="status">Loading referrals…</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">My referrals</h1>
      {error && <p className="alert-error" role="alert">{error}</p>}
      {!data ? <Empty title="Referral data unavailable." /> : (
        <>
          <div className="card flex flex-wrap items-center gap-2">
            <span className="text-sm">Your link:</span>
            <code className="break-all rounded bg-slate-100 px-2 py-1 text-xs">{data.referralUrl}</code>
            <button
              className="btn-secondary px-3 py-1"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(data.referralUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                } catch { /* clipboard unavailable */ }
              }}
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <div className="card">
            <h2 className="font-semibold">Network by level</h2>
            {data.byLevel.length === 0 ? <div className="mt-2"><Empty title="No referrals yet." /></div> : (
              <table className="table mt-2"><thead><tr><th scope="col">Level</th><th scope="col">Members</th></tr></thead>
              <tbody>{data.byLevel.map((b) => (<tr key={b.level}><td>Level {b.level}</td><td>{b.n}</td></tr>))}</tbody></table>
            )}
          </div>
          <div className="card">
            <h2 className="font-semibold">Commissions</h2>
            <p className="text-xs text-slate-500">{data.policy}</p>
            {data.commissions.length === 0 ? <div className="mt-2"><Empty title="No commissions yet." hint="Commissions pay only on verified sales, never for recruitment." /></div> : (
              <table className="table mt-2"><thead><tr><th scope="col">Level</th><th scope="col">Status</th><th scope="col">Total</th></tr></thead>
              <tbody>{data.commissions.map((c, i) => (<tr key={i}><td>{c.level}</td><td>{c.status}</td><td>{c.total} {c.currency}</td></tr>))}</tbody></table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function DashboardReferralsPage() {
  return (
    <RequireAuth>
      <ReferralsInner />
    </RequireAuth>
  );
}
