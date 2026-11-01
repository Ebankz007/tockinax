'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, errMsg } from '@/lib/api';

export default function TwoFaSetupPage() {
  const router = useRouter();
  const [secret, setSecret] = useState<string | null>(null);
  const [qrUri, setQrUri] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    setBusy(true);
    try {
      const s = await api.get<{ secret: string; qrUri: string }>('/auth/2fa/setup');
      setSecret(s.secret);
      setQrUri(s.qrUri);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
      setLoaded(true);
    }
  }

  useEffect(() => { void load(); }, []);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMsg('');
    try {
      await api.post('/auth/2fa/verify', { token });
      setMsg('2FA enabled. You will be asked for a code on every login.');
      setTimeout(() => router.push('/dashboard'), 1200);
    } catch (e) {
      setError(errMsg(e));
    } finally { setBusy(false); }
  }

  if (!loaded) return <p role="status">Loading 2FA setup…</p>;
  if (!secret || !qrUri) return <p className="alert-error">Unable to generate 2FA secret.</p>;

  return (
    <div className="mx-auto max-w-md card space-y-4">
      <h1 className="text-2xl font-bold">Set up two-factor authentication</h1>
      {error && <p className="alert-error" role="alert">{error}</p>}
      {msg && <p className="alert-ok" role="status">{msg}</p>}

      <section className="space-y-3">
        <p className="text-sm text-mist">
          Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.), then
          enter the 6-digit code it shows to confirm and enable 2FA on your account.
        </p>
        <div className="flex justify-center">
          <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUri)}`} alt="2FA QR code" className="rounded-lg border border-edge/70 bg-ink p-2" />
        </div>
        <div className="bg-ink rounded-xl border border-edge/70 p-3 text-mist font-mono text-sm break-all">
          {secret}
        </div>
      </section>

      <form onSubmit={verify} className="space-y-3">
        <div>
          <label className="label" htmlFor="2fa-token">Verification code</label>
          <input id="2fa-token" className="input" type="text" required maxLength={6} pattern="[0-9]*" inputMode="numeric" value={token} onChange={(e) => setToken(e.target.value.replace(/\D/g, ''))} placeholder="000000" />
        </div>
        <button className="btn-primary w-full" disabled={busy || token.length !== 6}>{busy ? 'Verifying…' : 'Enable 2FA'}</button>
      </form>

      <p className="text-sm text-slate-600">
        Already have 2FA? <Link href="/login" className="underline">Log in</Link>.
      </p>
    </div>
  );
}
