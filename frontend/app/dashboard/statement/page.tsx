'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import RiskStrip from '@/components/RiskStrip';
import { SimBadge } from '@/components/Badges';
import ModuleEmpty from '@/components/ModuleEmpty';
import { fetchModule, type ModuleState } from '@/lib/api';

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return 'type,date,description,amount,currency,status\n';
  const cols = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}

function StatementInner() {
  const [mod, setMod] = useState<ModuleState<unknown>>({ state: 'loading' });
  const [ok, setOk] = useState('');

  useEffect(() => {
    fetchModule<unknown>('/tokens/statement').then(setMod);
  }, []);

  const rows: Record<string, unknown>[] =
    mod.state === 'live' && Array.isArray(mod.data)
      ? (mod.data as Record<string, unknown>[])
      : mod.state === 'live' && mod.data && typeof mod.data === 'object' && Array.isArray((mod.data as { items?: unknown }).items)
        ? ((mod.data as { items: Record<string, unknown>[] }).items)
        : [];

  function download() {
    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tockinax-statement-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setOk(`Downloaded ${rows.length} row(s) as CSV (client-side, from statement JSON).`);
  }

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold text-white">
        Statement <SimBadge />
      </h1>
      <div className="card space-y-3">
        <p className="text-sm text-mist">
          Your pilot activity as JSON, exported client-side to CSV. SIMULATED pilot — no real funds.
        </p>
        {ok && <p className="alert-ok" role="status">{ok}</p>}
        {mod.state === 'loading' && <p role="status">Loading statement…</p>}
        {mod.state === 'deploying' && <ModuleEmpty title="Statement module deploying." />}
        {mod.state === 'forbidden' && <p className="alert-error" role="alert">Gated: please log in again.</p>}
        {mod.state === 'error' && <p className="alert-error" role="alert">{mod.message}</p>}
        {mod.state === 'live' && (
          <>
            <p className="text-sm text-mist" role="status">{rows.length} row(s) loaded.</p>
            <div className="overflow-x-auto max-h-96 overflow-y-auto rounded border border-line/10">
              <table className="table">
                <thead>
                  <tr>
                    {rows.length > 0 ? (
                      Object.keys(rows[0]).map((c) => <th key={c} scope="col">{c}</th>)
                    ) : (
                      <th scope="col">No columns</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 100).map((r, i) => (
                    <tr key={i}>
                      {Object.keys(rows[0]).map((c) => (
                        <td key={c}>{String(r[c] ?? '—')}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="btn-primary" onClick={download} disabled={rows.length === 0}>
              Download CSV
            </button>
          </>
        )}
        <p className="text-sm">
          <Link href="/risk" className="text-gold underline">Risk disclosure</Link>
        </p>
      </div>
      <RiskStrip compact />
    </div>
  );
}

export default function StatementPage() {
  return (
    <RequireAuth>
      <StatementInner />
    </RequireAuth>
  );
}
