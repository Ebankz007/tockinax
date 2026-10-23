'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, errMsg, type Listing } from '@/lib/api';
import Empty from '@/components/Empty';

export default function MarketplacePage() {
  const [items, setItems] = useState<Listing[]>([]);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), per: '12' });
      if (q) params.set('q', q);
      if (category) params.set('category', category);
      const data = await api.get<{ items: Listing[] }>(`/marketplace/listings?${params}`);
      setItems(data.items || []);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [q, category, page]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Marketplace</h1>
      <form
        className="card flex flex-wrap gap-2"
        onSubmit={(e) => { e.preventDefault(); setPage(1); void load(); }}
        role="search"
      >
        <label className="sr-only" htmlFor="mq">Search listings</label>
        <input id="mq" className="input max-w-xs" placeholder="Search title…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="sr-only" htmlFor="mcat">Category</label>
        <input id="mcat" className="input max-w-[200px]" placeholder="Category (optional)" value={category} onChange={(e) => setCategory(e.target.value)} />
        <button className="btn-primary" type="submit">Search</button>
      </form>
      {loading && <p role="status">Loading listings…</p>}
      {error && <p className="alert-error" role="alert">{error}</p>}
      {!loading && !error && items.length === 0 && (
        <Empty title="No active listings right now." hint="Try a different search, or check back later." />
      )}
      <div className="grid gap-4 md:grid-cols-3">
        {items.map((l) => (
          <article key={l.id} className="card">
            <h2 className="font-bold">{l.title}</h2>
            <p className="mt-1 line-clamp-3 text-sm text-slate-600">{l.description}</p>
            <p className="mt-2 text-sm"><span className="font-semibold">{l.price} {l.currency}</span> · {l.category}</p>
            <p className="mt-1 text-xs text-slate-500">Status: {l.status}</p>
          </article>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
        <span className="text-sm" aria-live="polite">Page {page}</span>
        <button className="btn-secondary" onClick={() => setPage((p) => p + 1)}>Next</button>
      </div>
      <p className="text-xs text-slate-500">Orders are recorded, not held — no escrow implied.</p>
    </div>
  );
}
