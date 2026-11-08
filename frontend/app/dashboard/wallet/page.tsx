'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import Empty from '@/components/Empty';
import RiskStrip from '@/components/RiskStrip';
import ModuleEmpty from '@/components/ModuleEmpty';
import { api, errMsg, type WalletAddresses } from '@/lib/api';

function DashboardWalletInner() {
  const [wallets, setWallets] = useState<WalletAddresses | null>(null);
  const [mod, setMod] = useState<'loading' | 'live' | 'error'>('loading');
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({ network: 'TRC20' as 'TRC20' | 'BEP20', address: '', password: '' });
  const [ok, setOk] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get<WalletAddresses>('/auth/wallet')
      .then(setWallets)
      .catch(() => setWallets({ trc20: null, bep20: null }))
      .finally(() => setMod('live'));
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(form.network);
    setOk('');
    setError('');
    try {
      await api.post('/auth/wallet', {
        network: form.network,
        address: form.address.trim(),
        password: form.password,
      });
      setOk('Wallet address saved.');
      setForm({ network: form.network, address: '', password: '' });
      const w = await api.get<WalletAddresses>('/auth/wallet');
      setWallets(w);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold text-white">Wallet addresses</h1>
      <p className="text-sm text-mist">
        Save your USDT receiving addresses so buyers can pay you directly. Addresses are
        used for withdrawals and member-to-member payments (when you are the receiver).
      </p>

      {mod === 'loading' && <p role="status">Loading…</p>}
      {mod === 'error' && <p className="alert-error" role="alert">Unable to load wallets.</p>}

      {mod === 'live' && (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            {['TRC20', 'BEP20'].map((net) => (
              <div key={net} className="card p-4">
                <h2 className="font-display font-semibold text-white">{net}</h2>
                <div className="flex items-center justify-between pt-2">
                  <span className={wallets?.[net.toLowerCase() as keyof WalletAddresses] ? 'text-green-400' : 'text-mist'}>
                    {wallets?.[net.toLowerCase() as keyof WalletAddresses] || 'Not set'}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="card space-y-4">
            <h2 className="font-display font-semibold text-white">Add or update address</h2>
            {ok && <p className="alert-ok" role="status">{ok}</p>}
            {error && <p className="alert-error" role="alert">{error}</p>}
            <form onSubmit={save} className="space-y-3">
              <div>
                <label className="label">Network</label>
                <select
                  name="network"
                  className="input"
                  value={form.network}
                  onChange={(e) => setForm({ ...form, network: e.target.value as 'TRC20' | 'BEP20' })}
                >
                  <option value="TRC20">TRON / TRC20</option>
                  <option value="BEP20">BSC / BEP20</option>
                </select>
              </div>
              <div>
                <label className="label">Address (public only)</label>
                <input
                  name="address"
                  className="input font-mono"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder={form.network === 'BEP20' ? '0x...' : 'T...'}
                  autoComplete="off"
                />
                <p className="hint">
                  Public address only. Never paste private keys, seed phrases, or mnemonics.
                </p>
              </div>
              <div>
                <label className="label">Current password (confirm change)</label>
                <input
                  name="password"
                  type="password"
                  className="input"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                />
              </div>
              <button
                type="submit"
                className="btn-primary w-full"
                disabled={busy === form.network || !form.password || !form.address}
              >
                {busy === form.network ? 'Saving…' : 'Save address'}
              </button>
            </form>
          </div>

          <p className="text-sm text-mist">
            Addresses are used for withdrawals and member-to-member payments. No real funds
            move until live payments are enabled.
            <Link href="/risk" className="text-gold underline ml-2">
              Risk disclosure →
            </Link>
          </p>
          <RiskStrip compact />
        </>
      )}
    </div>
  );
}

export default function DashboardWalletPage() {
  return (
    <RequireAuth>
      <DashboardWalletInner />
    </RequireAuth>
  );
}
