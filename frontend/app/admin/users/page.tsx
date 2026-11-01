'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import Empty from '@/components/Empty';
import { api, errMsg, ApiError, type AdminUser, type AdminRole } from '@/lib/api';

type RoleAction = { userId: string; role: string; action: 'assign' | 'remove' };

function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busyUser, setBusyUser] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError('');
    try {
      const [u, r] = await Promise.all([
        api.get<{ items: AdminUser[] }>('/admin/users').catch(() => ({ items: [] as AdminUser[] })),
        api.get<{ items: AdminRole[] }>('/admin/roles').catch(() => ({ items: [] as AdminRole[] })),
      ]);
      setUsers(u.items);
      setRoles(r.items);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        setError('Gated: super_admin role required.');
      } else setError(errMsg(e));
    } finally { setLoading(false); }
  }

  async function toggleRole(userId: string, role: string, action: 'assign' | 'remove') {
    setBusyUser(userId); setError(''); setMsg('');
    try {
      await api.put(`/admin/users/${userId}/role`, { action, role });
      setMsg(`Role ${action === 'assign' ? 'assigned' : 'removed'}.`);
      await load();
    } catch (e) { setError(errMsg(e)); } finally { setBusyUser(null); }
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault(); setError(''); setMsg('');
    const form = e.currentTarget as HTMLFormElement;
    const fd = new FormData(form);
    const email = fd.get('email') as string;
    const displayName = fd.get('displayName') as string || undefined;
    const role = fd.get('role') as string;
    try {
      await api.post('/admin/users', { email, displayName, role });
      setMsg('Staff account created. Temporary password was returned server-side — deliver it out-of-band.');
      form.reset();
      await load();
    } catch (e) { setError(errMsg(e)); }
  }

  async function suspendUser(userId: string) {
    if (!window.confirm('Suspend this user?')) return;
    setBusyUser(userId); setError(''); setMsg('');
    try {
      await api.delete(`/admin/users/${userId}`);
      setMsg('User suspended.');
      await load();
    } catch (e) { setError(errMsg(e)); } finally { setBusyUser(null); }
  }

  useEffect(() => { void load(); }, []);

  if (loading) return <p role="status">Loading users…</p>;

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold text-white">User management</h1>
      {error && <p className="alert-error" role="alert">{error}</p>}
      {msg && <p className="alert-ok" role="status">{msg}</p>}

      <section className="card space-y-3">
        <h2 className="font-display font-semibold text-white">Create staff account</h2>
        <p className="text-xs text-mist">
          Creates an active account with a server-generated temporary password. The password is shown
          once in the API response — deliver it out-of-band (secure channel, not email).
        </p>
        <form onSubmit={createUser} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-mist mb-1">Email</label>
              <input name="email" type="email" className="input w-full" required />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-mist mb-1">Display name</label>
              <input name="displayName" className="input w-full" />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-mist mb-1">Role</label>
              <select name="role" className="input w-full" required>
                {roles.map((r) => (
                  <option key={r.id} value={r.name}>{r.name} ({r.permission_count} permissions)</option>
                ))}
              </select>
            </div>
          </div>
          <button className="btn-primary w-full" type="submit">Create account</button>
        </form>
      </section>

      <section className="card space-y-3">
        <h2 className="font-display font-semibold text-white">Users &amp; roles</h2>
        {users.length === 0 ? <div className="mt-2"><Empty title="No users." /></div> : (
          <table className="table">
            <thead>
              <tr>
                <th scope="col" className="text-xs text-mist uppercase">Email</th>
                <th scope="col" className="text-xs text-mist uppercase">Member no</th>
                <th scope="col" className="text-xs text-mist uppercase">Status</th>
                <th scope="col" className="text-xs text-mist uppercase">Roles</th>
                <th scope="col" className="text-xs text-mist uppercase">2FA</th>
                <th scope="col" className="text-xs text-mist uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-edge/40 last:border-0">
                  <td className="px-4 py-3 font-mono text-xs text-bright tnum">{u.email}</td>
                  <td className="px-4 py-3 font-mono text-xs text-mist tnum">{u.member_no || '—'}</td>
                  <td className="px-4 py-3"><span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${u.status === 'active' ? 'border-success/40 bg-success/10 text-success' : u.status === 'suspended' ? 'border-text/20 bg-text/5 text-mist' : 'border-text/40 bg-text/10 text-text'}`}>{u.status}</span></td>
                  <td className="px-4 py-3 font-mono text-xs text-mist">{u.roles.join(', ') || '—'}</td>
                  <td className="px-4 py-3"><span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${u.mfa_enabled ? 'border-success/40 bg-success/10 text-success' : 'border-text/20 bg-text/5 text-mist'}`}>{u.mfa_enabled ? 'enabled' : 'off'}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {roles.map((r) => {
                        const has = u.roles.includes(r.name);
                        return (
                          <button
                            key={r.name}
                            className={`px-2 py-1 text-xs rounded border transition-colors ${has ? 'bg-gold text-black border-gold' : 'border-edge/70 text-mist hover:border-gold/40 hover:text-bright'}`}
                            disabled={busyUser === u.id}
                            onClick={() => void toggleRole(u.id, r.name, has ? 'remove' : 'assign')}
                          >
                            {busyUser === u.id ? '…' : (has ? 'Remove' : 'Add')}
                          </button>
                        );
                      })}
                      <button className="btn-danger px-2 py-1 text-xs" disabled={busyUser === u.id} onClick={() => void suspendUser(u.id)}>Suspend</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <p className="text-sm">
        <Link href="/admin" className="text-gold underline">← Admin overview</Link>
      </p>
    </div>
  );
}

export default function AdminUsersPageWrapper() {
  return (
    <RequireAuth>
      <AdminUsersPage />
    </RequireAuth>
  );
}
