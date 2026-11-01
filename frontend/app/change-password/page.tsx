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
  const [showCpCurrent, setShowCpCurrent] = useState(false);
  const [showCpNew, setShowCpNew] = useState(false);
  const [showCpConfirm, setShowCpConfirm] = useState(false);

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
          <div className="relative">
            <input id="cp-current" className="input" type={showCpCurrent ? 'text' : 'password'} required autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-bright focus:outline-none focus:ring-2 focus:ring-bright focus:ring-offset-2"
              onClick={() => setShowCpCurrent(!showCpCurrent)}
              aria-label={showCpCurrent ? 'Hide password' : 'Show password'}
            >
              <svg
                className="width-5 height-5"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path
                  d="M1 12s4-8 12-8 12 8 12 8-4 8-12 8-12-8-12-8Z"
                />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="cp-new">New password (min 10 characters)</label>
          <div className="relative">
            <input id="cp-new" className="input" type={showCpNew ? 'text' : 'password'} required minLength={10} autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-bright focus:outline-none focus:ring-2 focus:ring-bright focus:ring-offset-2"
              onClick={() => setShowCpNew(!showCpNew)}
              aria-label={showCpNew ? 'Hide password' : 'Show password'}
            >
              <svg
                className="width-5 height-5"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path
                  d="M1 12s4-8 12-8 12 8 12 8-4 8-12 8-12-8-12-8Z"
                />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="cp-confirm">Confirm new password</label>
          <div className="relative">
            <input id="cp-confirm" className="input" type={showCpConfirm ? 'text' : 'password'} required minLength={10} autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-bright focus:outline-none focus:ring-2 focus:ring-bright focus:ring-offset-2"
              onClick={() => setShowCpConfirm(!showCpConfirm)}
              aria-label={showCpConfirm ? 'Hide password' : 'Show password'}
            >
              <svg
                className="width-5 height-5"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path
                  d="M1 12s4-8 12-8 12 8 12 8-4 8-12 8-12-8-12-8Z"
                />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
          </div>
        </div>
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Changing…' : 'Change password'}</button>
      </form>
      <p className="text-sm text-slate-600">
        Already changed? <Link href="/login" className="underline">Log in</Link> with your new password.
      </p>
    </div>
  );
}
