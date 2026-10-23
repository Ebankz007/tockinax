'use client';
import { useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import Empty from '@/components/Empty';
import { api, errMsg, ApiError } from '@/lib/api';

type AdminUser = { id: string; email: string; status: string; seller_enabled?: boolean };

function UsersInner() {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<AdminUser[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [searched, setSearched] = useState(false);

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    setError('');
    setMsg('');
    try {
      const d = await api.get<AdminUser[] | { items?: AdminUser[] }>(`/admin/users?q=${encodeURIComponent(q)}`);
      setItems(Array.isArray(d) ? d : d.items || []);
      setSearched(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setError('Gated: super_admin role required.');
      else setError(errMsg(err));
    }
  }

  async function act(id: string, action: 'suspend' | 'reactivate' | 'seller_enable' | 'seller_disable') {
    setError('');
    setMsg('');
    try {
      await api.post(`/admin/users/${id}/${action}`, {});
      setMsg(`User ${action}d.`);
      await search();
    } catch (err) {
      setError(errMsg(err));
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Users</h1>
      {error && <p className="alert-error" role="alert">{error}</p>}
      {msg && <p className="alert-ok" role="status">{msg}</p>}
      <form className="card flex gap-2" onSubmit={(e) => void search(e)} role="search">
        <label className="sr-only" htmlFor="u-q">Search users</label>
        <input id="u-q" className="input max-w-sm" placeholder="Email or ID…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn-primary" type="submit">Search</button>
      </form>
      {!searched ? <Empty title="Search to list members." /> :
        items.length === 0 ? <Empty title="No members match." /> : (
        <ul className="space-y-2 text-sm">
          {items.map((u) => (
            <li key={u.id} className="card flex flex-wrap items-center gap-2">
              <span className="font-medium">{u.email}</span>
              <span className="text-xs text-slate-500">{u.status}{u.seller_enabled ? ' · seller' : ''}</span>
              <span className="ml-auto flex flex-wrap gap-1">
                <button className="btn-secondary px-2 py-1 text-xs" onClick={() => void act(u.id, 'suspend')}>Suspend</button>
                <button className="btn-secondary px-2 py-1 text-xs" onClick={() => void act(u.id, 'reactivate')}>Reactivate</button>
                <button className="btn-secondary px-2 py-1 text-xs" onClick={() => void act(u.id, 'seller_enable')}>Enable seller</button>
                <button className="btn-secondary px-2 py-1 text-xs" onClick={() => void act(u.id, 'seller_disable')}>Disable seller</button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AdminUsersPage() {
  return (
    <RequireAuth>
      <UsersInner />
    </RequireAuth>
  );
}
