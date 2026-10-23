'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import RiskStrip from '@/components/RiskStrip';
import { SimBadge } from '@/components/Badges';
import ModuleEmpty from '@/components/ModuleEmpty';
import { api, errMsg, fetchModule, ApiError, type ModuleState, type StageInfo } from '@/lib/api';

const money = (v: string | number | null | undefined) => (v == null ? '—' : `${v} USDT`);
const limitText = (l?: { min_buy?: string | number | null; max_buy?: string | number | null }) => {
  if (!l || (l.min_buy == null && l.max_buy == null)) return '—';
  return `${l.min_buy ?? '—'} – ${l.max_buy ?? '—'} USDT`;
};

function StageInner() {
  const [mod, setMod] = useState<ModuleState<StageInfo>>({ state: 'loading' });
  const [busy, setBusy] = useState<'up' | 're' | null>(null);
  const [ok, setOk] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchModule<StageInfo>('/tokens/stages/current').then(setMod);
  }, []);

  const stage = mod.state === 'live' ? mod.data : null;
  const current = stage?.current ?? stage?.stage ?? null;
  // Approved plan: the upgrade fee is the fee to LEAVE the current stage (absent at the top stage).
  const upgradeFee = stage?.upgrade?.fee ?? stage?.upgrade_fee ?? null;
  const renewalFee = stage?.renewal?.fee ?? stage?.renew_fee ?? null;
  const atTop = current != null && current >= 5;
  const upgradeUnset = !stage || atTop || stage.upgrade?.fee_unset === true || upgradeFee == null;
  const renewalUnset = !stage || stage.renewal?.fee_unset === true || renewalFee == null;

  async function act(kind: 'up' | 're') {
    setBusy(kind);
    setOk('');
    setError('');
    try {
      const path = kind === 'up' ? '/tokens/stages/upgrade' : '/tokens/stages/renew';
      await api.post(path, {});
      setOk(kind === 'up' ? 'Upgrade requested (pending review).' : 'Renewal requested (pending review).');
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status >= 500)) {
        setError('Stage module deploying — action unavailable. Nothing was charged.');
      } else setError(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold text-white">
        My stage <SimBadge />
      </h1>
      <div className="card space-y-3">
        {ok && <p className="alert-ok" role="status">{ok}</p>}
        {error && <p className="alert-error" role="alert">{error}</p>}
        {mod.state === 'loading' && <p role="status">Loading stage…</p>}
        {mod.state === 'deploying' && <ModuleEmpty title="Stage module deploying." />}
        {mod.state === 'forbidden' && <p className="alert-error" role="alert">Gated: please log in again.</p>}
        {mod.state === 'error' && <p className="alert-error" role="alert">{mod.message}</p>}
        {mod.state === 'live' && stage && (
          <>
            <p className="font-display text-lg text-white">
              Current: <strong className="text-gold">{stage.name || `Stage ${current ?? '—'}`}</strong>
            </p>
            <table className="table">
              <thead><tr><th scope="col">Action</th><th scope="col">Fee</th></tr></thead>
              <tbody>
                <tr>
                  <td className="text-white">Upgrade {atTop ? '' : '(to leave your current stage)'}</td>
                  <td className="text-gold">{atTop ? 'Top stage — none' : money(upgradeFee)}</td>
                </tr>
                <tr><td className="text-white">Renewal (current stage)</td><td className="text-gold">{money(renewalFee)}</td></tr>
              </tbody>
            </table>
            <p className="text-sm text-mist">
              Buy limits: <strong className="text-white">{limitText(stage.limits)}</strong>
            </p>
            {(upgradeUnset || renewalUnset) && (
              <p className="alert-info" role="status">
                A fee is not published for {atTop ? 'an upgrade' : 'this action'}. Requests stay disabled until it is disclosed.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" disabled={busy !== null || upgradeUnset} onClick={() => act('up')}>
                {busy === 'up' ? 'Submitting…' : 'Upgrade stage'}
              </button>
              <button className="btn-secondary" disabled={busy !== null || renewalUnset} onClick={() => act('re')}>
                {busy === 're' ? 'Submitting…' : 'Renew stage'}
              </button>
            </div>
            <p className="text-sm text-mist">
              Requests are pending review. Nothing charges until the fee is disclosed and you confirm.
            </p>
          </>
        )}
        <p className="text-sm text-mist">
          <Link href="/stages" className="text-gold underline">All 5 stages →</Link>{' '}
          <Link href="/risk" className="ml-2 text-gold underline">Risk disclosure</Link>
        </p>
      </div>
      <RiskStrip compact />
    </div>
  );
}

export default function StagePage() {
  return (
    <RequireAuth>
      <StageInner />
    </RequireAuth>
  );
}
