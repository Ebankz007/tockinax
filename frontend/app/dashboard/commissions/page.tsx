'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import Empty from '@/components/Empty';
import RiskStrip from '@/components/RiskStrip';
import { SimBadge } from '@/components/Badges';
import ModuleEmpty from '@/components/ModuleEmpty';
import { fetchModule, listOf, type CommissionRow, type ModuleState } from '@/lib/api';

function CommissionsInner() {
  const [mod, setMod] = useState<ModuleState<unknown>>({ state: 'loading' });
  useEffect(() => {
    fetchModule<unknown>('/tokens/commissions').then(setMod);
  }, []);

  const rows = mod.state === 'live' ? listOf<CommissionRow>(mod.data) : [];

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold text-white">
        Commissions <SimBadge />
      </h1>
      <div className="card space-y-3">
        <p className="alert-info" role="note">
          Commission categories and rates follow the approved plan. Payouts stay gated until
          verification, approval and funding — all rows below remain pending/disabled until then.
        </p>
        {mod.state === 'loading' && <p role="status">Loading commissions…</p>}
        {mod.state === 'deploying' && <ModuleEmpty title="Commissions module deploying." />}
        {mod.state === 'forbidden' && <p className="alert-error" role="alert">Gated: please log in again.</p>}
        {mod.state === 'error' && <p className="alert-error" role="alert">{mod.message}</p>}
        {mod.state === 'live' && rows.length === 0 && (
          <Empty title="No commissions yet." hint="Commissions accrue only on verified sales after approval." />
        )}
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  <th scope="col">Generation</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c, i) => (
                  <tr key={i}>
                    <td className="text-white">{c.category || '—'}</td>
                    <td>{String(c.generation ?? c.level ?? '—')}</td>
                    <td>{String(c.amount ?? '—')} {c.currency || ''}</td>
                    <td>
                      <span className="badge-disabled">{c.status || 'pending'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-sm text-mist">
          <Link href="/referrals" className="text-gold underline">Approved categories →</Link>{' '}
          <Link href="/risk" className="ml-2 text-gold underline">Risk disclosure</Link>
        </p>
      </div>
      <RiskStrip compact />
    </div>
  );
}

export default function CommissionsPage() {
  return (
    <RequireAuth>
      <CommissionsInner />
    </RequireAuth>
  );
}
