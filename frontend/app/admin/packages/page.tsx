'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import Empty from '@/components/Empty';
import { api, errMsg, ApiError } from '@/lib/api';

type TokenDef = {
  code: string;
  name: string;
  kind: string;
  total_supply: string | number;
  basis?: string;
  rights?: string;
  active: boolean;
  created_at?: string;
};

type PricingRule = {
  id?: string | number;
  version: string | number;
  lock_days: number;
  rate_bps_per_day: number;
  basis: string;
  active: boolean;
  created_at?: string;
};

function AdminPackagesPage() {
  const [defs, setDefs] = useState<TokenDef[]>([]);
  const [pricing, setPricing] = useState<PricingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [forbidden, setForbidden] = useState(false);

  // ---- package (token definition) form state ----
  const [newDef, setNewDef] = useState({ code: '', name: '', kind: 'STANDARD', total_supply: '0', basis: '', rights: '', active: true });
  const [editDef, setEditDef] = useState<TokenDef | null>(null);

  // ---- pricing form state ----
  const [newPrice, setNewPrice] = useState({ version: '1', lock_days: '7', rate_bps_per_day: '100', basis: 'simple', active: true });

  async function load() {
    setLoading(true); setError(''); setForbidden(false);
    try {
      const [d, p] = await Promise.all([
        api.get<{ items: TokenDef[] }>('/admin/packages').catch(() => ({ items: [] as TokenDef[] })),
        api.get<{ items: PricingRule[] }>('/admin/packages/pricing').catch(() => ({ items: [] as PricingRule[] })),
      ]);
      setDefs(d.items);
      setPricing(p.items);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        setForbidden(true);
        return;
      }
      setError(errMsg(e));
    } finally { setLoading(false); }
  }

  async function createDef(e: React.FormEvent) {
    e.preventDefault(); setError(''); setMsg('');
    try {
      await api.post('/admin/packages', newDef);
      setMsg('Package created.');
      setNewDef({ code: '', name: '', kind: 'STANDARD', total_supply: '0', basis: '', rights: '', active: true });
      await load();
    } catch (e) { setError(errMsg(e)); }
  }

  async function saveDef(e: React.FormEvent) {
    e.preventDefault(); setError(''); setMsg('');
    if (!editDef) return;
    try {
      const body: Record<string, unknown> = {};
      if (newDef.name) body.name = newDef.name;
      if (newDef.kind) body.kind = newDef.kind;
      if (newDef.total_supply) body.total_supply = newDef.total_supply;
      if (newDef.basis !== undefined) body.basis = newDef.basis;
      if (newDef.rights !== undefined) body.rights = newDef.rights;
      if (newDef.active !== undefined) body.active = newDef.active;
      await api.put(`/admin/packages/${editDef.code}`, body);
      setMsg('Package saved.');
      setEditDef(null);
      setNewDef({ code: '', name: '', kind: 'STANDARD', total_supply: '0', basis: '', rights: '', active: true });
      await load();
    } catch (e) { setError(errMsg(e)); }
  }

  async function createPricing(e: React.FormEvent) {
    e.preventDefault(); setError(''); setMsg('');
    try {
      await api.post('/admin/packages/pricing', {
        version: Number(newPrice.version),
        lock_days: Number(newPrice.lock_days),
        rate_bps_per_day: Number(newPrice.rate_bps_per_day),
        basis: newPrice.basis,
        active: newPrice.active,
      });
      setMsg('Pricing rule saved.');
      setNewPrice({ version: '1', lock_days: '7', rate_bps_per_day: '100', basis: 'simple', active: true });
      await load();
    } catch (e) { setError(errMsg(e)); }
  }

  useEffect(() => { void load(); }, []);

  if (loading) return <p role="status">Loading packages…</p>;
  if (forbidden) return (
    <div className="card space-y-2"><h1 className="font-display text-2xl font-bold text-white">Packages</h1><p className="alert-error" role="alert">Gated: super_admin role required.</p></div>
  );

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold text-white">Packages</h1>
      {error && <p className="alert-error" role="alert">{error}</p>}
      {msg && <p className="alert-ok" role="status">{msg}</p>}

      {/* ── Token definitions ───────────────────────────────── */}
      <section className="card space-y-3">
        <h2 className="font-display font-semibold text-white">Token packages</h2>
        {defs.length === 0 ? <div className="mt-2"><Empty title="No token packages defined." /></div> : (
          <table className="table">
            <thead>
              <tr>
                <th scope="col" className="text-xs text-mist uppercase">Code</th>
                <th scope="col" className="text-xs text-mist uppercase">Name</th>
                <th scope="col" className="text-xs text-mist uppercase">Kind</th>
                <th scope="col" className="text-xs text-mist uppercase">Supply</th>
                <th scope="col" className="text-xs text-mist uppercase">Active</th>
                <th scope="col" className="text-xs text-mist uppercase">Action</th>
              </tr>
            </thead>
            <tbody>
              {defs.map((d) => (
                <tr key={d.code} className="border-b border-edge/40 last:border-0">
                  <td className="px-4 py-3 font-mono text-xs text-bright tnum">{d.code}</td>
                  <td className="px-4 py-3 text-sm text-mist">{d.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-mist">{d.kind}</td>
                  <td className="px-4 py-3 font-mono text-xs text-mist tnum">{String(d.total_supply)}</td>
                  <td className="px-4 py-3"><span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${d.active ? 'border-success/40 bg-success/10 text-success' : 'border-text/20 bg-text/5 text-mist'}`}>{d.active ? 'active' : 'inactive'}</span></td>
                  <td className="px-4 py-3">
                    <button className="btn-secondary px-2 py-1 text-xs" onClick={() => setEditDef(d)}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {editDef ? (
          <form onSubmit={saveDef} className="space-y-3 mt-4 pt-4 border-t border-edge/30">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-mist">Edit {editDef.code}</h3>
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-mist mb-1">Code (read-only)</label>
                <input className="input w-full" defaultValue={editDef.code} disabled readOnly />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-mist mb-1">Name</label>
                <input name="name" className="input w-full" defaultValue={editDef.name} />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-mist mb-1">Kind</label>
                <input name="kind" className="input w-full" defaultValue={editDef.kind} />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-mist mb-1">Total supply</label>
                <input name="total_supply" className="input w-full" defaultValue={String(editDef.total_supply)} />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-mist mb-1">Basis</label>
                <input name="basis" className="input w-full" defaultValue={editDef.basis || ''} />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-mist mb-1">Rights</label>
                <input name="rights" className="input w-full" defaultValue={editDef.rights || ''} />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-mist cursor-pointer">
                  <input name="active" type="checkbox" defaultChecked={editDef.active} className="rounded border-edge/70" />
                  Active
                </label>
              </div>
              <div className="sm:col-span-2 flex gap-2">
                <button className="btn-primary flex-1" type="submit">Save</button>
                <button className="btn-secondary flex-1" type="button" onClick={() => setEditDef(null)}>Cancel</button>
              </div>
            </div>
          </form>
        ) : (
          <form onSubmit={createDef} className="mt-4 pt-4 border-t border-edge/30 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-mist">Add a package</h3>
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-mist mb-1">Code</label>
                <input name="code" className="input w-full" defaultValue={newDef.code} onChange={(e) => setNewDef({ ...newDef, code: e.target.value })} required />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-mist mb-1">Name</label>
                <input name="name" className="input w-full" defaultValue={newDef.name} onChange={(e) => setNewDef({ ...newDef, name: e.target.value })} required />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-mist mb-1">Kind</label>
                <input name="kind" className="input w-full" defaultValue={newDef.kind} onChange={(e) => setNewDef({ ...newDef, kind: e.target.value })} />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-mist mb-1">Total supply</label>
                <input name="total_supply" type="number" step="0.0001" min="0" className="input w-full" defaultValue={newDef.total_supply} onChange={(e) => setNewDef({ ...newDef, total_supply: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-mist mb-1">Basis</label>
                <input name="basis" className="input w-full" defaultValue={newDef.basis} onChange={(e) => setNewDef({ ...newDef, basis: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-mist mb-1">Rights</label>
                <input name="rights" className="input w-full" defaultValue={newDef.rights} onChange={(e) => setNewDef({ ...newDef, rights: e.target.value })} />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-mist cursor-pointer">
                  <input name="active" type="checkbox" defaultChecked className="rounded border-edge/70" onChange={(e) => setNewDef({ ...newDef, active: e.target.checked })} />
                  Active
                </label>
              </div>
              <div className="sm:col-span-2">
                <button className="btn-primary w-full" type="submit">Create package</button>
              </div>
            </div>
          </form>
        )}
      </section>

      {/* ── Pricing rules ───────────────────────────────────── */}
      <section className="card space-y-3">
        <h2 className="font-display font-semibold text-white">Pricing rules</h2>
        {pricing.length === 0 ? <div className="mt-2"><Empty title="No pricing rules defined." /></div> : (
          <table className="table">
            <thead>
              <tr>
                <th scope="col" className="text-xs text-mist uppercase">Version</th>
                <th scope="col" className="text-xs text-mist uppercase">Lock days</th>
                <th scope="col" className="text-xs text-mist uppercase">Rate bps/day</th>
                <th scope="col" className="text-xs text-mist uppercase">Basis</th>
                <th scope="col" className="text-xs text-mist uppercase">Active</th>
              </tr>
            </thead>
            <tbody>
              {pricing.map((p) => (
                <tr key={`${p.version}-${p.lock_days}`} className="border-b border-edge/40 last:border-0">
                  <td className="px-4 py-3 font-mono text-xs text-mist tnum">{String(p.version)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-bright tnum">{String(p.lock_days)} days</td>
                  <td className="px-4 py-3 font-mono text-xs text-gold tnum">{String(p.rate_bps_per_day)} bps</td>
                  <td className="px-4 py-3 font-mono text-xs text-mist">{p.basis}</td>
                  <td className="px-4 py-3"><span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${p.active ? 'border-success/40 bg-success/10 text-success' : 'border-text/20 bg-text/5 text-mist'}`}>{p.active ? 'active' : 'inactive'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <form onSubmit={createPricing} className="mt-4 pt-4 border-t border-edge/30 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-mist">Add / update pricing rule</h3>
          <div className="grid gap-3 sm:grid-cols-5">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-mist mb-1">Version</label>
              <input name="version" type="number" min="1" className="input w-full" defaultValue={newPrice.version} onChange={(e) => setNewPrice({ ...newPrice, version: e.target.value })} />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-mist mb-1">Lock days</label>
              <input name="lock_days" type="number" min="1" className="input w-full" defaultValue={newPrice.lock_days} onChange={(e) => setNewPrice({ ...newPrice, lock_days: e.target.value })} required />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-mist mb-1">Rate bps/day</label>
              <input name="rate_bps_per_day" type="number" min="0" className="input w-full" defaultValue={newPrice.rate_bps_per_day} onChange={(e) => setNewPrice({ ...newPrice, rate_bps_per_day: e.target.value })} required />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-mist mb-1">Basis</label>
              <input name="basis" className="input w-full" defaultValue={newPrice.basis} onChange={(e) => setNewPrice({ ...newPrice, basis: e.target.value })} />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-mist cursor-pointer">
                <input name="active" type="checkbox" defaultChecked className="rounded border-edge/70" onChange={(e) => setNewPrice({ ...newPrice, active: e.target.checked })} />
                Active
              </label>
            </div>
            <div className="sm:col-span-5">
              <button className="btn-primary w-full" type="submit">Save pricing rule</button>
            </div>
          </div>
        </form>
      </section>

      <p className="text-sm">
        <Link href="/admin" className="text-gold underline">← Admin overview</Link>
      </p>
    </div>
  );
}

export default function AdminPackagesPageWrapper() {
  return (
    <RequireAuth>
      <AdminPackagesPage />
    </RequireAuth>
  );
}
