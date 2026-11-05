'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import Empty from '@/components/Empty';
import { api, errMsg, num, ApiError } from '@/lib/api';

function WalletInner() {
  const [profile, setProfile] = useState({
    usdtAddressTrc20: '',
    usdtAddressBep20: '',
    displayName: '',
  });
  const [editing, setEditing] = useState<'trc20' | 'bep20' | null>(null);
  const [newAddress, setNewAddress] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const p = await api.get('/user/profile');
        setProfile(p.profile || { usdtAddressTrc20: '', usdtAddressBep20: '', displayName: '' });
      } catch (e) { setError(errMsg(e)); }
    }
    void load();
  }, []);

  async function saveWallet(network: 'TRC20' | 'BEP20', address: string) {
    setBusy(true); setError(''); setMsg('');
    try {
      const p = await api.put('/user/profile', {
        usdtAddressTrc20: network === 'TRC20' ? address : profile.usdtAddressTrc20,
        usdtAddressBep20: network === 'BEP20' ? address : profile.usdtAddressBep20,
      });
      setProfile(p.profile || profile);
      setMsg(`${network} address saved.`);
      setEditing(null);
    } catch (e) { setError(errMsg(e)); } finally { setBusy(false); };
  };

  async function clearWallet(network: 'TRC20' | 'BEP20') {
    if (!window.confirm(`Clear your ${network} address?`)) return undefined;
    setBusy(true); setError(''); setMsg('');
    try {
      const p = await api.put('/user/profile', {
        usdtAddressTrc20: network === 'TRC20' ? '' : profile.usdtAddressTrc20,
        usdtAddressBep20: network === 'BEP20' ? '' : profile.usdtAddressBep20,
      });
      setProfile(p.profile || profile);
      setMsg(`${network} address cleared.`);
      setEditing(null);
    } catch (e) { setError(errMsg(e)); } finally { setBusy(false); };
  };

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold text-white">Receiving Wallets</h1>
      {error && <p className="alert-error" role="alert">{error}</p>}
      {msg && <p className="alert-ok" role="status">{msg}</p>}

      <div className="card space-y-3">
        <h2 className="font-display font-semibold text-white">TRC20 Address</h2>
        {profile.usdtAddressTrc20
          ? (
            <div>
              <p className="text-sm text-mist">Your TRC20 receiving address</p>
              <div className="mt-2 rounded-lg border border-edge/70 bg-ink p-3">
                <code className="font-mono text-sm break-all">{profile.usdtAddressTrc20 || '—'}</code>
                <button
                  onClick={() => void clearWallet('TRC20')}
                  className="mt-2 text-xs text-red-400"
                >
                  Clear
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-sm text-mist">No TRC20 address set yet</p>
              <p className="text-xs text-mist hint">
                Add a TRC20 address below to receive USDT TRC20 transfers.
              </p>
              <button
                onClick={() => setEditing('trc20')}
                className="mt-2 btn-primary text-xs"
              >
                Set TRC20 address
              </button>
            </div>
          )}

          {editing === 'trc20' && (
            <div className="mt-3 rounded-lg border border-gold/50 bg-gold/5 p-3">
              <input
                id="trc20-addr"
                className="input font-mono w-full"
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
                placeholder="T..."
                autoComplete="off"
              />
              <div className="mt-2 flex justify-end gap-2">
                <button
                  onClick={() => saveWallet('TRC20', newAddress)}
                  className="btn-primary text-xs"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditing(null)}
                  className="text-xs text-mist ml-2"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="card space-y-3 mt-4">
          <h2 className="font-display font-semibold text-white">BEP20 Address</h2>
          {profile.usdtAddressBep20
            ? (
              <div>
                <p className="text-sm text-mist">Your BEP20 receiving address</p>
                <div className="mt-2 rounded-lg border border-edge/70 bg-ink p-3">
                  <code className="font-mono text-sm break-all">{profile.usdtAddressBep20 || '—'}</code>
                  <button
                    onClick={() => void clearWallet('BEP20')}
                    className="mt-2 text-xs text-red-400"
                  >
                    Clear
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-sm text-mist">No BEP20 address set yet</p>
                <p className="text-xs text-mist hint">
                  Add a BEP20 address below to receive USDT BEP20 transfers.
                </p>
                <button
                  onClick={() => setEditing('bep20')}
                  className="mt-2 btn-primary text-xs"
                >
                  Set BEP20 address
                </button>
              </div>
            )}

            {editing === 'bep20' && (
              <div className="mt-3 rounded-lg border border-gold/50 bg-gold/5 p-3">
                <input
                  id="bep20-addr"
                  className="input font-mono w-full"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  placeholder="0x..."
                  autoComplete="off"
                />
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    onClick={() => saveWallet('BEP20', newAddress)}
                    className="btn-primary text-xs"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditing(null)}
                    className="text-xs text-mist ml-2"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WalletPage() {
  return (
    <RequireAuth>
      <WalletInner />
    </RequireAuth>
  );
}