'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, errMsg } from '@/lib/api';

export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMsg('');
    try {
      if (newPassword !== confirmPassword) {
        setError('New password and confirmation do not match.');
        return;
      }
      await api.post('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setMsg('Password changed successfully. You can log in with your new password.');
      setTimeout(() => router.push('/login'), 1500);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md card space-y-4">
      <h1 className="text-2xl font-bold">Change Password</h1>
      {error && <p className="alert-error" role="alert">{error}</p>}
      {msg && <p className="alert-ok" role="status">{msg}</p>}
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label" htmlFor="cp-current">Current password</label>
          <input id="cp-current" className="input" type="password" required autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="cp-new">New password (min 10 characters)</label>
          <input id="cp-new" className="input" type="password" required minLength={10} autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="cp-confirm">Confirm new password</label>
          <input id="cp-confirm" className="input" type="password" required minLength={10} autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
        </div>
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Changing…' : 'Change password'}</button>
      </form>
      <p className="text-sm text-slate-600">
        Already changed? <Link href="/login" className="underline">Log in</Link> with your new password.
      </p>
    </div>
  );
}
