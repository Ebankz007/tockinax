'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, errMsg, type SocialAccount } from '@/lib/api';
import Empty from '@/components/Empty';
import { SocialIcons } from '@/components/SocialIcons';

type AdminTab =
  | 'testimonials'
  | 'social'
  | 'competition'
  | 'bonus'
  | 'announcements';

export default function AdminCommunityPage() {
  const [tab, setTab] = useState<AdminTab>('testimonials');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  return (
    <div className="space-y-5">
      <div className="card">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Community &amp; Rewards Management</h1>
            <p className="text-mist text-sm">
              Moderate testimonials, manage official social channels, run weekly
              competitions, configure and pay bonuses, and publish announcements.
            </p>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-edge/60 bg-surface p-4 flex overflow-x-auto gap-1 no-scrollbar">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`whitespace-nowrap shrink-0 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                tab === t.value ? 'border-gold text-gold' : 'text-mist border-transparent hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="p-4">
          {tab === 'testimonials' && <AdminTestimonials />}
          {tab === 'social' && <AdminSocial />}
          {tab === 'competition' && <AdminCompetition />}
          {tab === 'bonus' && <AdminBonus />}
          {tab === 'announcements' && <AdminAnnouncements />}
        </div>
      </div>

      {error && <div className="alert-error" role="alert">{error}</div>}
    </div>
  );
}

const TABS: { value: AdminTab; label: string }[] = [
  { value: 'testimonials', label: 'Testimonials' },
  { value: 'social', label: 'Social Media' },
  { value: 'competition', label: 'Competitions' },
  { value: 'bonus', label: 'Bonuses' },
  { value: 'announcements', label: 'Announcements' },
];

/* ---------- Admin: Testimonials ---------- */

function AdminTestimonials() {
  const [items, setItems] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = `/admin/community/testimonials${statusFilter ? `?status=${statusFilter}` : ''}`;
      const r = await api.get<{ items: any[] }>(url);
      setItems(Array.isArray(r) ? r : r.items || []);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const STATUS_COLOR: Record<string, string> = {
    pending: 'bg-brand-500/10 text-brand-300',
    approved: 'bg-success/10 text-success',
    rejected: 'bg-red-500/10 text-red-300',
    needs_correction: 'bg-brand-500/10 text-brand-300',
    unpublished: 'bg-mist/10 text-mist',
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-sm font-semibold">Testimonial moderation</h2>
        <div className="flex items-center gap-2">
          {['', 'pending', 'approved', 'rejected', 'needs_correction', 'unpublished'].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                statusFilter === s ? 'bg-gold text-black border-gold' : 'border-line/20 text-mist hover:bg-white/5'
              }`}
            >
              {s || 'All'}
            </button>
          ))}
        </div>
      </div>
      {loading && <p className="text-mist">Loading…</p>}
      {!loading && items.length === 0 && <Empty title="No testimonials." />}
      {!loading && items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Title</th><th>Member</th><th>Country</th><th>Type</th><th>Status</th><th>Views</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id}>
                  <td className="font-medium truncate md:max-w-[220px]" title={t.title}>{t.title}</td>
                  <td>{t.display_name || t.displayName}</td>
                  <td>{t.country}</td>
                  <td className="text-xs text-mist">{t.media_type || t.mediaType}</td>
                  <td>
                    <span
                      className={`inline-block text-[10px] font-bold rounded px-2 py-0.5 uppercase ${
                        STATUS_COLOR[t.status] || 'badge-disabled'
                      }`}
                    >
                      {t.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="tnum">{t.views ?? 0}</td>
                  <td>
                    <ActionButtons kind="testimonial" item={t} onDone={load} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {error && <div className="alert-error" role="alert">{error}</div>}
    </div>
  );
}

type ActionProps = { kind: 'testimonial'; item: any; onDone: () => void };

function ActionButtons({ kind, item, onDone }: ActionProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const canAct = ['pending', 'needs_correction', 'rejected'].includes(item.status);

  const act = async (action: string) => {
    setBusy(item.id);
    try {
      await api.post(`/admin/community/testimonials/${item.id}/review`, {
        action,
        remarks: action === 'reject' || action === 'needs_correction' ? window.prompt('Reason (required):') || '' : '',
        reason: action === 'suspect' ? window.prompt('Reason:') || '' : '',
      });
      onDone();
    } catch (e) {
      alert(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex gap-1">
      {canAct && (
        <button onClick={() => act('approve')} disabled={busy === item.id} className="text-[10px] px-2 py-1 rounded bg-success/10 text-success hover:bg-success/20">Approve</button>
      )}
      {canAct && (
        <button onClick={() => act('reject')} disabled={busy === item.id} className="text-[10px] px-2 py-1 rounded bg-red-500/10 text-red-300 hover:bg-red-500/20">Reject</button>
      )}
      {canAct && (
        <button onClick={() => act('needs_correction')} disabled={busy === item.id} className="text-[10px] px-2 py-1 rounded bg-brand-500/10 text-brand-300 hover:bg-brand-500/20">Correction</button>
      )}
      {!item.featured && canAct && (
        <button onClick={() => act('feature')} disabled={busy === item.id} className="text-[10px] px-2 py-1 rounded bg-gold/10 text-gold hover:bg-gold/20">Feature</button>
      )}
      {item.featured && (
        <button onClick={() => act('unfeature')} disabled={busy === item.id} className="text-[10px] px-2 py-1 rounded bg-mist/10 text-mist hover:bg-mist/20">Unfeature</button>
      )}
      {item.status === 'approved' && (
        <button onClick={() => act('unpublish')} disabled={busy === item.id} className="text-[10px] px-2 py-1 rounded border border-line/20 text-mist hover:bg-white/5">Unpublish</button>
      )}
      <button onClick={() => act('suspect')} disabled={busy === item.id} className="text-[10px] px-2 py-1 rounded bg-red-500/10 text-red-300 hover:bg-red-500/20">Flag</button>
      <button
        onClick={() => {
          if (window.confirm('Delete this testimonial?')) act('delete' as any);
        }}
        disabled={busy === item.id}
        className="text-[10px] px-2 py-1 rounded border border-line/20 text-red-400 hover:bg-red-500/10"
      >
        Delete
      </button>
    </div>
  );
}

/* ---------- Admin: Social Media ---------- */

function AdminSocial() {
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, s] = await Promise.all([
        api.get<SocialAccount[]>('/admin/community/social-accounts'),
        api.get<any[]>('/admin/community/social-submissions'),
      ]);
      setAccounts(a);
      setSubmissions(Array.isArray(s) ? s : []);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div className="card p-4">
        <h2 className="text-sm font-semibold mb-3">Official channels</h2>
        <p className="text-xs text-mist mb-3">Configure the official URLs rendered in header, footer and testimonials page.</p>
        <div className="space-y-2">
          {loading ? (
            <div className="col-span-2 h-8 animate-pulse rounded bg-surface2" />
          ) : accounts.length === 0 ? (
            <Empty title="No channels configured." />
          ) : (
            accounts.map((a) => (
              <div key={a.platform} className="flex items-center justify-between px-3 py-2 rounded-lg border border-edge/60 bg-coal text-sm">
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 16 }}>{a.platform === 'telegram' ? '📩' : a.platform === 'x' ? '𝕏' : '🔗'}</span>
                  <span className="font-medium truncate w-20">{a.label || a.platform}</span>
                </div>
                <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-gold hover:underline text-[11px]">{a.url}</a>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="card p-4 col-span-2 lg:col-span-3">
        <h2 className="text-sm font-semibold mb-3">Social post submissions</h2>
        <p className="text-xs text-mist mb-3">Members submit post URLs + screenshots for admin verification.</p>
        {loading && <p className="text-mist">Loading…</p>}
        {!loading && submissions.length === 0 && <p className="text-mist">No submissions.</p>}
        {!loading && submissions.length > 0 && (
          <div className="space-y-2">
            {submissions.map((s) => (
              <div key={s.id} className="card p-3">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="badge badge-ok">{s.platform}</span>
                  <span
                    className={`inline-block text-[10px] font-bold rounded px-2 py-0.5 uppercase ${
                      s.status === 'verified' ? 'bg-success/10 text-success' :
                      s.status === 'rejected' ? 'bg-red-500/10 text-red-300' : 'badge-disabled'
                    }`}
                  >
                    {s.status.replace(/_/g, ' ')}
                  </span>
                </div>
                <p className="text-xs text-mist break-all truncate md:max-w-[400px]">{s.post_url || s.postUrl}</p>
                {s.caption && <p className="text-xs text-mist line-clamp-1 mt-1">{s.caption}</p>}
                <div className="mt-2 flex items-center gap-3">
                  {s.screenshot_key || s.screenshotKey ? (
                    <Link href={`/admin/community/social-submissions/${s.id}/screenshot`} className="text-xs text-gold underline">View screenshot</Link>
                  ) : <span className="text-xs text-mist">No screenshot</span>}
                  <span className="text-xs text-mist">{s.member_no || s.email || s.user_id}</span>
                </div>
                <div className="mt-2 flex gap-2">
                  <VerifyButtons submission={s} onDone={load} />
                </div>
              </div>
            ))}
          </div>
        )}
        {error && <div className="alert-error" role="alert">{error}</div>}
      </div>
    </div>
  );
}

function VerifyButtons({ submission, onDone }: { submission: any; onDone: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (status: string) => {
    const remarks = window.prompt('Admin remarks (optional):') || '';
    setBusy(submission.id);
    try {
      await api.post(`/admin/community/social-submissions/${submission.id}/verify`, {
        status,
        remarks,
        method: 'admin',
      });
      onDone();
    } catch (e) {
      alert(errMsg(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="flex gap-1">
      <button onClick={() => act('verified')} disabled={busy === submission.id} className="text-[10px] px-2 py-1 rounded bg-success/10 text-success hover:bg-success/20">Verify</button>
      <button onClick={() => act('rejected')} disabled={busy === submission.id} className="text-[10px] px-2 py-1 rounded bg-red-500/10 text-red-300 hover:bg-red-500/20">Reject</button>
      <button onClick={() => act('needs_info')} disabled={busy === submission.id} className="text-[10px] px-2 py-1 rounded bg-brand-500/10 text-brand-300 hover:bg-brand-500/20">Needs info</button>
    </div>
  );
}

/* ---------- Admin: Competition ---------- */

function AdminCompetition() {
  const [comps, setComps] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<any[]>('/admin/community/competitions');
      setComps(Array.isArray(r) ? r : []);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold">Weekly competitions</h2>
      {loading && <p className="text-mist">Loading…</p>}
      {!loading && comps.length === 0 && <Empty title="No competitions." />}
      {!loading && comps.length > 0 && (
        <div className="space-y-2">
          {comps.map((c) => (
            <div key={c.id} className="card p-3">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="badge badge-ok">{c.kind}</span>
                <span className="font-mono tnum text-xs">{c.week_key}</span>
                <span
                  className={`inline-block text-[10px] font-bold rounded px-2 py-0.5 uppercase ${
                    c.status === 'open' ? 'bg-success/10 text-success' :
                    c.status === 'verifying' ? 'bg-brand-500/10 text-brand-300' :
                    c.status === 'finalized' ? 'bg-mist/15 text-mist' : 'badge-disabled'
                  }`}
                >
                  {c.status.replace(/_/g, ' ')}
                </span>
              </div>
              <div className="text-xs text-mist mb-2">
                {new Date(c.starts_at).toLocaleString()} → {new Date(c.ends_at).toLocaleString()} ({c.timezone})
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (window.confirm(`Snapshot ${c.kind} week ${c.week_key} now?`)) {
                      fetch(`/admin/community/competitions/${c.id}/snapshot`, { method: 'POST' })
                        .then((r) => r.ok ? load() : r.json().then((e) => alert(e?.error || 'snapshot failed')))
                        .catch((e) => alert(errMsg(e)));
                    }
                  }}
                  className="text-[10px] px-2.5 py-1 rounded border border-line/20 text-mist hover:bg-white/5"
                >
                  Snapshot
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`Finalize ${c.kind} week ${c.week_key} and pick provisional winners?`)) {
                      fetch(`/admin/community/competitions/${c.id}/finalize`, { method: 'POST' })
                        .then((r) => r.ok ? load() : r.json().then((e) => alert(e?.error || 'finalize failed')))
                        .catch((e) => alert(errMsg(e)));
                    }
                  }}
                  className="text-[10px] px-2.5 py-1 rounded bg-gold/10 text-gold hover:bg-gold/20"
                >
                  Finalize
                </button>
                {c.status === 'open' && (
                  <button
                    onClick={() => {
                      const reason = window.prompt('Reason for cancellation:');
                      if (reason) {
                        fetch(`/admin/community/competitions/${c.id}/cancel`, {
                          method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ reason }),
                        }).then((r) => r.ok ? load() : r.json().then((e) => alert(e?.error || 'cancel failed')))
                          .catch((e) => alert(errMsg(e)));
                      }
                    }
                  }
                  className="text-[10px] px-2.5 py-1 rounded bg-red-500/10 text-red-300 hover:bg-red-500/20"
                >
                  Cancel
                </button>)}
              </div>
            </div>
          ))}
        </div>
      )}
      {error && <div className="alert-error" role="alert">{error}</div>}
    </div>
  );
}

/* ---------- Admin: Bonus ---------- */

function AdminBonus() {
  const [configs, setConfigs] = useState<any[]>([]);
  const [awards, setAwards] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cfgs, awards] = await Promise.all([
        api.get<any[]>('/admin/community/bonus-config'),
        api.get<any[]>('/admin/community/awards'),
      ]);
      setConfigs(cfgs);
      setAwards(awards);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="card p-4 col-span-2">
        <h2 className="text-sm font-semibold mb-3">Bonus configuration</h2>
        <p className="text-xs text-mist mb-3">
          Reward amounts are never hardcoded — edit here. Position rewards 1&ndash;5,
          pool, min metric and eligibility are all admin-configurable per competition kind.
        </p>
        <div className="space-y-3">
          {loading ? (
            <div className="h-8 animate-pulse rounded bg-surface2" />
          ) : configs.map((c) => (
            <div key={c.kind} className="card p-3 border-line/20">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold">{c.kind === 'testimonial' ? 'Testimonial' : 'Referral'} competition</span>
                <span className="badge badge-ok">Active</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-3 text-xs text-mist">
                <div>Pool: <span className="text-white tnum">{c.pool_amount} {c.currency}</span></div>
                <div>Min metric: <span className="text-white tnum">{c.min_metric}</span></div>
                <div>Approval required: {c.approval_required ? 'Yes' : 'No'}</div>
              </div>
              <div className="mt-2 text-[11px] text-mist">
                Position rewards: {Object.entries(c.position_rewards || {}).map(([p, v]) => `P${p}: ${v}`).join(' · ')}
              </div>
              <button
                onClick={() => {
                  const rewards: Record<string, string> = {};
                  for (let i = 1; i <= 5; i += 1) rewards[String(i)] = (window.prompt(`Reward for position ${i} (USDT)`, String(c.position_rewards?.[String(i)] ?? '0')) || '0');
                  if (rewards) {
                    fetch(`/admin/community/bonus-config/${c.kind}`, {
                      method: 'PUT', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ positionRewards: rewards }),
                    }).then((r) => r.ok ? load() : r.json().then((e) => alert(e?.error || 'update failed')))
                      .catch((e) => alert(errMsg(e)));
                  }
                }}
                className="text-[10px] px-2.5 py-1 rounded bg-gold/10 text-gold hover:bg-gold/20"
              >
                Edit position rewards
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-4 col-span-2">
        <h2 className="text-sm font-semibold mb-3">Bonus awards &amp; payments</h2>
        <p className="text-xs text-mist mb-3">Approve provisional winners, disqualify with reason, or pay approved awards through the ledger.</p>
        {loading && <p className="text-mist">Loading…</p>}
        {!loading && awards.length === 0 && <p className="text-mist">No awards yet.</p>}
        {!loading && awards.length > 0 && (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Competition</th><th>Position</th><th>Member</th><th>Amount</th><th>Status</th><th>Payment</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {awards.map((a) => (
                  <tr key={a.id}>
                    <td className="font-mono tnum text-xs">{a.week_key}</td>
                    <td className="font-mono tnum">#{a.position}</td>
                    <td className="truncate w-32">{a.member_no || a.user_id}</td>
                    <td className="tnum">{a.amount} {a.currency}</td>
                    <td>
                      <span
                        className={`inline-block text-[10px] font-bold rounded px-2 py-0.5 uppercase ${
                          a.status === 'approved' ? 'bg-success/10 text-success' :
                          a.status === 'paid' ? 'bg-success/15 text-success' :
                          a.status === 'disqualified' ? 'bg-red-500/10 text-red-300' : 'badge-disabled'
                        }`}
                      >
                        {a.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="text-xs text-mist">{a.payment_status}</td>
                    <td>
                      {a.status === 'provisional' && (
                        <>
                          <button
                            onClick={() => {
                              if (window.confirm(`Approve ${a.amount} for position #${a.position}?`)) {
                                fetch(`/admin/community/awards/${a.id}/approve`, { method: 'POST' })
                                  .then((r) => r.ok ? load() : r.json().then((e) => alert(e?.error || 'approve failed')))
                                  .catch((e) => alert(errMsg(e)));
                              }
                            }}
                            className="text-[10px] px-2 py-1 rounded bg-success/10 text-success hover:bg-success/20"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => {
                              const reason = window.prompt('Disqualify reason:');
                              if (reason) {
                                fetch(`/admin/community/awards/${a.id}/disqualify`, {
                                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ reason }),
                                }).then((r) => r.ok ? load() : r.json().then((e) => alert(e?.error || 'disqualify failed')))
                                  .catch((e) => alert(errMsg(e)));
                              }
                            }}
                            className="text-[10px] px-2 py-1 rounded bg-red-500/10 text-red-300 hover:bg-red-500/20"
                          >
                            Disqualify
                          </button>
                        </>
                      )}
                      {a.status === 'approved' && a.payment_status !== 'paid' && (
                        <button
                          onClick={() => {
                            if (window.confirm(`Pay ${a.amount} to member? (requires funded pool)`)) {
                              fetch(`/admin/community/awards/${a.id}/pay`, { method: 'POST' })
                                .then((r) => r.ok ? load() : r.json().then((e) => alert(e?.error || 'pay failed')))
                                .catch((e) => alert(errMsg(e)));
                            }
                          }}
                          className="text-[10px] px-2 py-1 rounded bg-gold/10 text-gold hover:bg-gold/20"
                        >
                          Pay
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {error && <div className="alert-error" role="alert">{error}</div>}
      </div>
    </div>
  );
}

/* ---------- Admin: Announcements ---------- */

function AdminAnnouncements() {
  const [items, setItems] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<{
    category: string;
    title: string;
    body: string;
    audience: string;
    publish: boolean;
  }>({
    category: 'competition_opening',
    title: '',
    body: '',
    audience: 'members',
    publish: true,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<any[]>('/admin/community/announcements');
      setItems(Array.isArray(r) ? r : []);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/admin/community/announcements', {
        category: form.category,
        title: form.title,
        body: form.body,
        audience: form.audience,
        publish: form.publish,
      });
      setForm({ category: 'competition_opening', title: '', body: '', audience: 'members', publish: true });
      load();
    } catch (e) {
      alert(errMsg(e));
    }
  };

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold">Announcements</h2>
      <form onSubmit={create} className="card p-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <label className="label">Category</label>
            <select name="category" className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option value="competition_opening">Competition opening</option>
              <option value="leaderboard_update">Leaderboard update</option>
              <option value="competition_closing">Competition closing</option>
              <option value="winners_announcement">Winners announcement</option>
              <option value="bonus_payment">Bonus payment notice</option>
              <option value="general">General</option>
            </select>
          </div>
          <div className="sm:col-span-3">
            <label className="label">Title</label>
            <input name="title" className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="sm:col-span-3">
            <label className="label">Audience</label>
            <select name="audience" className="input" value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value as 'all' | 'members' | 'winners' | 'admins' })}>
              <option value="all">All</option>
              <option value="members">Members</option>
              <option value="winners">Winners</option>
              <option value="admins">Admins</option>
            </select>
          </div>
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.publish} onChange={(e) => setForm({ ...form, publish: e.target.checked })} />
              Publish now
            </label>
          </div>
        </div>
        <div>
          <label className="label">Body</label>
          <textarea name="body" className="input h-24" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
        </div>
        <button type="submit" className="btn-primary w-auto">Publish announcement</button>
      </form>

      <div className="card p-4">
        <h3 className="text-sm font-semibold mb-3">Announcement feed</h3>
        {loading && <p className="text-mist">Loading…</p>}
        {!loading && items.length === 0 && <p className="text-mist">No announcements.</p>}
        {!loading && items.length > 0 && (
          <div className="space-y-2">
            {items.map((n) => (
              <div key={n.id} className="card p-3 border-line/20">
                <div className="flex items-center justify-between mb-1">
                  <span className="badge badge-ok text-[10px]">{n.category}</span>
                  <span className="text-xs text-mist">{n.published ? 'Published' : 'Draft'} · {new Date(n.created_at).toLocaleDateString()}</span>
                </div>
                <div className="text-sm text-mist">{n.title}</div>
                <div className="text-[11px] text-mist mt-1 line-clamp-2">{n.body}</div>
                {n.published && (
                  <button
                    onClick={() => {
                      if (window.confirm('Unpublish this announcement?')) {
                        fetch(`/admin/community/announcements/${n.id}`, { method: 'DELETE' })
                          .then((r) => r.ok ? load() : r.json().then((e) => alert(e?.error || 'unpublish failed')))
                          .catch((e) => alert(errMsg(e)));
                      }
                    }}
                    className="mt-2 text-[10px] text-red-400 hover:underline"
                  >
                    Unpublish
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {error && <div className="alert-error" role="alert">{error}</div>}
      </div>
    </div>
  );
}
