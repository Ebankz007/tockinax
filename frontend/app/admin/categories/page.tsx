'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import { SimBadge } from '@/components/Badges';
import ModuleEmpty from '@/components/ModuleEmpty';
import { fetchModule, listOf, type CategoryRow, type ModuleState } from '@/lib/api';

// Approved compensation plan — fallback only, while the categories API is unavailable.
const APPROVED: [string, string][] = [
  ['Direct Customer Acquisition Reward', '1000'],
  ['Direct Marketplace Activity Commission', '500'],
  ['Customer Retention Reward', '300'],
  ['Stage Advancement Recognition', '400'],
  ['Second-Generation Marketplace Commission', '300'],
  ['Third-Generation Marketplace Commission', '200'],
  ['Fourth-Generation Marketplace Commission', '150'],
  ['Fifth-Generation Marketplace Commission', '100'],
];

const pct = (bps: number | string | null | undefined) =>
  bps == null ? '—' : `${Number(bps) / 100}%`;

function CategoriesInner() {
  const [mod, setMod] = useState<ModuleState<unknown>>({ state: 'loading' });
  useEffect(() => {
    fetchModule<unknown>('/tokens/categories').then(setMod);
  }, []);

  const live = mod.state === 'live' ? listOf<CategoryRow>(mod.data) : [];
  const rows: { name: string; note: string; rate: string }[] =
    live.length > 0
      ? live.map((c) => ({ name: c.name, note: c.description || c.status || '', rate: pct(c.rate_bps) }))
      : APPROVED.map(([name, bps]) => ({ name, note: 'Approved plan category.', rate: pct(bps) }));

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold text-white">
        Commission categories <SimBadge />
      </h1>
      <div className="card space-y-3">
        <p className="alert-info" role="note">
          Rates below are the approved compensation plan. Commissions pay only on verified sales after
          approval and funding — every row ships <span className="badge-disabled">DISABLED</span> until then.
        </p>
        {mod.state === 'loading' && <p role="status">Loading categories…</p>}
        {mod.state === 'deploying' && <ModuleEmpty title="Categories module deploying." showRiskLink={false} />}
        {mod.state === 'forbidden' && <p className="alert-error" role="alert">Gated: super_admin role required.</p>}
        {mod.state === 'error' && <p className="alert-error" role="alert">{mod.message}</p>}
        {mod.state !== 'loading' && (
          <table className="table">
            <thead><tr><th scope="col">#</th><th scope="col">Category</th><th scope="col">Rate</th><th scope="col">Note</th><th scope="col">Status</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.name}>
                  <td>{i + 1}</td>
                  <td className="text-white">{r.name}</td>
                  <td className="text-gold">{r.rate}</td>
                  <td className="text-mist">{r.note}</td>
                  <td><span className="badge-disabled">DISABLED</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-sm">
        <Link href="/admin" className="text-gold underline">← Admin overview</Link>
      </p>
    </div>
  );
}

export default function AdminCategoriesPage() {
  return (
    <RequireAuth>
      <CategoriesInner />
    </RequireAuth>
  );
}
