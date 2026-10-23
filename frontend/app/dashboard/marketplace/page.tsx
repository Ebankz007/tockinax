'use client';
import { useEffect, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import Empty from '@/components/Empty';
import { api, errMsg, type Listing, type Order } from '@/lib/api';

function MarketplaceInner() {
  const [mine, setMine] = useState<Listing[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);

  // create listing form
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('general');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('USD');
  // evidence form
  const [orderId, setOrderId] = useState('');
  const [providerRef, setProviderRef] = useState('');
  const [note, setNote] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [l, o] = await Promise.all([
        api.get<Listing[] | { items?: Listing[] }>('/marketplace/listings/mine').catch(() => ({ items: [] as Listing[] })),
        api.get<Order[] | { items?: Order[] }>('/marketplace/orders/mine').catch(() => ({ items: [] as Order[] })),
      ]);
      setMine(Array.isArray(l) ? l : l.items || []);
      setOrders(Array.isArray(o) ? o : o.items || []);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function createListing(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMsg('');
    try {
      await api.post('/marketplace/listings', { title, description, category, price, currency, stock: 1 });
      setMsg('Listing submitted for review.');
      setTitle('');
      setDescription('');
      setPrice('');
      await load();
    } catch (err) {
      setError(errMsg(err));
    }
  }

  async function submitEvidence(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMsg('');
    try {
      const r = await api.post<{ message?: string }>(`/marketplace/orders/${orderId}/evidence`, { providerRef: providerRef || undefined, note: note || undefined });
      setMsg(r.message || 'Evidence recorded as PENDING review.');
      setOrderId('');
      setProviderRef('');
      setNote('');
      await load();
    } catch (err) {
      setError(errMsg(err));
    }
  }

  if (loading) return <p role="status">Loading marketplace…</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">My marketplace</h1>
      {error && <p className="alert-error" role="alert">{error}</p>}
      {msg && <p className="alert-ok" role="status">{msg}</p>}

      <section className="card space-y-2">
        <h2 className="font-semibold">Create listing (seller-enabled accounts only)</h2>
        <form onSubmit={createListing} className="grid gap-2 md:grid-cols-2">
          <div><label className="label" htmlFor="l-title">Title</label><input id="l-title" className="input" required minLength={3} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div><label className="label" htmlFor="l-cat">Category</label><input id="l-cat" className="input" value={category} onChange={(e) => setCategory(e.target.value)} /></div>
          <div className="md:col-span-2"><label className="label" htmlFor="l-desc">Description (min 10 chars)</label><textarea id="l-desc" className="input" required minLength={10} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div><label className="label" htmlFor="l-price">Price</label><input id="l-price" className="input" required pattern="^\d+(\.\d{1,4})?$" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="25.00" /></div>
          <div><label className="label" htmlFor="l-cur">Currency</label><select id="l-cur" className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}><option>USD</option><option>NGN</option></select></div>
          <div className="md:col-span-2"><button className="btn-primary" type="submit">Submit for review</button></div>
        </form>
      </section>

      <section className="card">
        <h2 className="font-semibold">My listings</h2>
        {mine.length === 0 ? <div className="mt-2"><Empty title="No listings yet." hint="Create one above — it enters admin review first." /></div> : (
          <table className="table mt-2"><thead><tr><th scope="col">Title</th><th scope="col">Price</th><th scope="col">Status</th></tr></thead>
          <tbody>{mine.map((l) => (<tr key={l.id}><td>{l.title}</td><td>{l.price} {l.currency}</td><td>{l.status}</td></tr>))}</tbody></table>
        )}
      </section>

      <section className="card">
        <h2 className="font-semibold">My orders</h2>
        {orders.length === 0 ? <div className="mt-2"><Empty title="No orders yet." hint="Order from the public marketplace; orders are recorded, not held." /></div> : (
          <table className="table mt-2"><thead><tr><th scope="col">Order</th><th scope="col">Amount</th><th scope="col">Status</th></tr></thead>
          <tbody>{orders.map((o) => (<tr key={o.id}><td>{o.order_no || o.id}</td><td>{o.amount} {o.currency}</td><td>{o.status}</td></tr>))}</tbody></table>
        )}
      </section>

      <section className="card space-y-2">
        <h2 className="font-semibold">Submit payment evidence</h2>
        <p className="text-xs text-slate-500">Evidence is information for review — not proof. Orders never auto-complete.</p>
        <form onSubmit={submitEvidence} className="grid gap-2 md:grid-cols-3">
          <div><label className="label" htmlFor="e-oid">Order ID</label><input id="e-oid" className="input" required value={orderId} onChange={(e) => setOrderId(e.target.value)} /></div>
          <div><label className="label" htmlFor="e-ref">Provider reference</label><input id="e-ref" className="input" value={providerRef} onChange={(e) => setProviderRef(e.target.value)} maxLength={128} /></div>
          <div><label className="label" htmlFor="e-note">Note</label><input id="e-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} /></div>
          <div><button className="btn-primary" type="submit">Submit evidence</button></div>
        </form>
      </section>
    </div>
  );
}

export default function DashboardMarketplacePage() {
  return (
    <RequireAuth>
      <MarketplaceInner />
    </RequireAuth>
  );
}
