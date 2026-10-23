'use client';
import { useEffect, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import Empty from '@/components/Empty';
import { api, errMsg, ApiError, type Listing, type Order } from '@/lib/api';

function ModerationInner() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [l, o] = await Promise.all([
        api.get<Listing[] | { items?: Listing[] }>('/admin/listings?status=pending_review'),
        api.get<Order[] | { items?: Order[] }>('/admin/orders?status=evidence_submitted'),
      ]);
      setListings(Array.isArray(l) ? l : l.items || []);
      setOrders(Array.isArray(o) ? o : o.items || []);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) setForbidden(true);
      else setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function decide(id: string, decision: 'active' | 'suspended' | 'removed') {
    setError('');
    setMsg('');
    try {
      await api.post(`/admin/listings/${id}/decision`, { decision });
      setMsg(`Listing ${decision}.`);
      await load();
    } catch (e) {
      setError(errMsg(e));
    }
  }

  async function confirm(id: string, confirm: boolean) {
    setError('');
    setMsg('');
    try {
      const r = await api.post<{ status: string }>(`/admin/orders/${id}/confirm`, { confirm });
      setMsg(`Order → ${r.status}.`);
      await load();
    } catch (e) {
      setError(errMsg(e));
    }
  }

  if (loading) return <p role="status">Loading moderation queue…</p>;
  if (forbidden) return <p className="alert-error" role="alert">Gated: super_admin role required.</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Moderation</h1>
      {error && <p className="alert-error" role="alert">{error}</p>}
      {msg && <p className="alert-ok" role="status">{msg}</p>}
      <section className="card">
        <h2 className="font-semibold">Listings in review</h2>
        {listings.length === 0 ? <div className="mt-2"><Empty title="Review queue empty." /></div> : (
          <ul className="mt-2 space-y-2 text-sm">
            {listings.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-2 rounded border border-slate-200 p-2">
                <span className="font-medium">{l.title}</span>
                <span className="text-xs text-slate-500">{l.price} {l.currency} · {l.status}</span>
                <span className="ml-auto flex gap-1">
                  <button className="btn-primary px-2 py-1 text-xs" onClick={() => void decide(l.id, 'active')}>Approve</button>
                  <button className="btn-secondary px-2 py-1 text-xs" onClick={() => void decide(l.id, 'suspended')}>Suspend</button>
                  <button className="btn-secondary px-2 py-1 text-xs" onClick={() => void decide(l.id, 'removed')}>Remove</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card">
        <h2 className="font-semibold">Orders awaiting confirmation / disputes</h2>
        {orders.length === 0 ? <div className="mt-2"><Empty title="No orders awaiting review." /></div> : (
          <ul className="mt-2 space-y-2 text-sm">
            {orders.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-2 rounded border border-slate-200 p-2">
                <span className="font-medium">{o.order_no || o.id}</span>
                <span className="text-xs text-slate-500">{o.amount} {o.currency} · {o.status}</span>
                <span className="ml-auto flex gap-1">
                  <button className="btn-primary px-2 py-1 text-xs" onClick={() => void confirm(o.id, true)}>Confirm completed</button>
                  <button className="btn-secondary px-2 py-1 text-xs" onClick={() => void confirm(o.id, false)}>Mark disputed</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function AdminModerationPage() {
  return (
    <RequireAuth>
      <ModerationInner />
    </RequireAuth>
  );
}
