'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import Empty from '@/components/Empty';
import { api, errMsg, ApiError, type AdminRole, type AdminPermission } from '@/lib/api';

function AdminRolesPage() {
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [permissions, setPermissions] = useState<AdminPermission[]>([]);
  const [rolePerms, setRolePerms] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [busy, setBusy] = useState<{ roleId: string; permKey: string } | null>(null);

  async function load() {
    setLoading(true); setError('');
    try {
      const [r, p] = await Promise.all([
        api.get<{ items: AdminRole[] }>('/admin/roles').catch(() => ({ items: [] as AdminRole[] })),
        api.get<{ items: AdminPermission[] }>('/admin/permissions').catch(() => ({ items: [] as AdminPermission[] })),
      ]);
      setRoles(r.items);
      setPermissions(p.items);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) setError('Gated: super_admin role required.');
      else setError(errMsg(e));
    } finally { setLoading(false); }
  }

  async function loadRolePerms(roleId: string) {
    try {
      const r = await api.get<{ items: AdminPermission[] }>(`/admin/roles/${roleId}/permissions`);
      setRolePerms((prev) => ({ ...prev, [roleId]: r.items.map((x) => x.key) }));
    } catch (e) { setError(errMsg(e)); }
  }

  async function togglePerm(roleId: string, permKey: string, assign: boolean) {
    setBusy({ roleId, permKey }); setError(''); setMsg('');
    try {
      if (assign) {
        await api.post(`/admin/roles/${roleId}/permissions`, { permissionKey: permKey });
      } else {
        await api.delete(`/admin/roles/${roleId}/permissions/${permKey}`);
      }
      setMsg(`Permission ${assign ? 'assigned' : 'removed'}.`);
      await loadRolePerms(roleId);
    } catch (e) { setError(errMsg(e)); } finally { setBusy(null); }
  }

  useEffect(() => { void load(); }, []);

  if (loading) return <p role="status">Loading roles…</p>;

  const role = selectedRoleId ? roles.find((r) => r.id === selectedRoleId) : null;
  const rolePermissionKeys = selectedRoleId ? rolePerms[selectedRoleId] || [] : [];

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold text-white">Roles &amp; permissions</h1>
      {error && <p className="alert-error" role="alert">{error}</p>}
      {msg && <p className="alert-ok" role="status">{msg}</p>}

      <section className="card space-y-3">
        <h2 className="font-display font-semibold text-white">Roles</h2>
        {roles.length === 0 ? <div className="mt-2"><Empty title="No roles." /></div> : (
          <table className="table">
            <thead>
              <tr>
                <th scope="col" className="text-xs text-mist uppercase">Role</th>
                <th scope="col" className="text-xs text-mist uppercase">Description</th>
                <th scope="col" className="text-xs text-mist uppercase">Permissions</th>
                <th scope="col" className="text-xs text-mist uppercase">Action</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r.id} className={`border-b border-edge/40 last:border-0 cursor-pointer ${selectedRoleId === r.id ? 'bg-white/5' : ''}`} onClick={() => {
                  setSelectedRoleId(r.id);
                  if (!rolePerms[r.id]) void loadRolePerms(r.id);
                }}>
                  <td className="px-4 py-3 text-bright">{r.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-mist">{r.description || '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gold tnum">{String(r.permission_count)}</td>
                  <td className="px-4 py-3">
                    {selectedRoleId === r.id ? (
                      <button className="btn-secondary text-xs" onClick={() => setSelectedRoleId(null)}>Close</button>
                    ) : (
                      'Select'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {role && selectedRoleId && (
        <section className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-semibold text-white">Permissions — {role.name}</h2>
            <button className="btn-secondary" onClick={() => setSelectedRoleId(null)}>Back to roles</button>
          </div>
          <p className="text-xs text-mist">
            Toggle permissions for <strong>{role.name}</strong>. Changes take effect on the next authenticated request.
          </p>
          {permissions.length === 0 ? <div className="mt-2"><Empty title="No permissions defined." /></div> : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {permissions.map((p) => {
                const has = rolePermissionKeys.includes(p.key);
                return (
                  <div key={p.id} className="rounded-lg border border-edge/70 bg-ink p-3 flex items-center justify-between">
                    <div>
                      <div className="text-sm text-bright">{p.key}</div>
                      <div className="text-[10px] text-mist">{p.description || '—'}</div>
                    </div>
                    <button
                      className={`rounded border px-2 py-1 text-xs transition-colors ${has ? 'bg-gold text-black border-gold' : 'border-edge/70 text-mist hover:border-gold/40'}`}
                      disabled={busy?.roleId === selectedRoleId && busy?.permKey === p.key}
                      onClick={() => void togglePerm(selectedRoleId!, p.key, !has)}
                    >
                      {busy?.roleId === selectedRoleId && busy?.permKey === p.key ? '…' : (has ? 'Revoke' : 'Grant')}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-xs text-mist">
            <Link href="/admin/users" className="text-gold underline">Manage user role assignments</Link>
          </p>
        </section>
      )}

      <p className="text-sm">
        <Link href="/admin" className="text-gold underline">← Admin overview</Link>
      </p>
    </div>
  );
}

export default function AdminRolesPageWrapper() {
  return (
    <RequireAuth>
      <AdminRolesPage />
    </RequireAuth>
  );
}
