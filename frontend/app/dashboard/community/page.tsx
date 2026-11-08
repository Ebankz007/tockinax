'use client';

import Link from 'next/link';
import { useEffect, useState, useCallback } from 'react';
import { api, errMsg, type CommunityMeSummary, type BonusAward, type LeaderboardEntry } from '@/lib/api';
import Empty from '@/components/Empty';
import { SocialIcons } from '@/components/SocialIcons';

type Tab =
  | 'testimonials'
  | 'submit'
  | 'social'
  | 'promote'
  | 'leaderboards'
  | 'bonuses'
  | 'rules';

export default function CommunityPage() {
  const [tab, setTab] = useState<Tab>('testimonials');
  const [summary, setSummary] = useState<CommunityMeSummary | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadSummary = useCallback(async () => {
    try {
      const s = await api.get<CommunityMeSummary>('/community/me/summary');
      setSummary(s);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  return (
    <div className="space-y-5">
      <div className="card">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Community &amp; Rewards</h1>
            <p className="text-mist text-sm">
              Share your experience, promote TOCKINAX, and compete in weekly leaderboards
              for testimonial and referral bonuses.
            </p>
          </div>
        </div>

        {summary && (
          <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <StatCard label="My testimonials" value={summary.testimonials.total} sub="shared" />
            <StatCard label="Social posts" value={summary.socialSubmissions.total} sub="submitted" />
            <StatCard label="Verified views" value={summary.verifiedViews} sub="eligible" />
            <StatCard label="Bonus paid" value={summary.bonusPaid} sub="USDT" />
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-edge/60 bg-surface p-4 flex overflow-x-auto gap-1 no-scrollbar">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`whitespace-nowrap shrink-0 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                tab === t.value
                  ? 'border-gold text-gold'
                  : 'text-mist border-transparent hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="p-4">
          {tab === 'testimonials' && <MyTestimonials />}
          {tab === 'submit' && <SubmitTestimonial onDone={() => loadSummary()} />}
          {tab === 'social' && <MySocialPosts />}
          {tab === 'promote' && <PromoteUs />}
          {tab === 'leaderboards' && <WeeklyLeaderboards />}
          {tab === 'bonuses' && <MyBonuses />}
          {tab === 'rules' && <CompetitionRules />}
        </div>
      </div>

      {error && <div className="alert-error" role="alert">{error}</div>}
    </div>
  );
}

const TABS: { value: Tab; label: string }[] = [
  { value: 'testimonials', label: 'My Testimonials' },
  { value: 'submit', label: 'Submit Testimonial' },
  { value: 'social', label: 'My Social Posts' },
  { value: 'promote', label: 'Promote Us' },
  { value: 'leaderboards', label: 'Weekly Leaderboards' },
  { value: 'bonuses', label: 'My Bonus History' },
  { value: 'rules', label: 'Competition Rules' },
];

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wide text-mist">{label}</div>
      <div className="mt-1 text-2xl font-bold tnum">{value}</div>
      {sub && <div className="mt-1 text-xs text-mist">{sub}</div>}
    </div>
  );
}

/* ---------- My Testimonials ---------- */

function MyTestimonials() {
  const [items, setItems] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<any[]>('/community/testimonials/mine')
      .then(setItems)
      .catch((e) => setError(errMsg(e)))
      .finally(() => setLoading(false));
  }, []);

  const STATUS_COLOR: Record<string, string> = {
    pending: 'bg-brand-500/10 text-brand-300',
    approved: 'bg-success/10 text-success',
    rejected: 'bg-red-500/10 text-red-300',
    needs_correction: 'bg-brand-500/10 text-brand-300',
    unpublished: 'bg-mist/10 text-mist',
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">My testimonials</h2>
        <span className={`badge ${loading ? 'badge-disabled' : 'badge-ok'}`}>
          {loading ? 'loading…' : `${items.length} shared`}
        </span>
      </div>
      {loading && <p className="text-mist">Loading…</p>}
      {!loading && items.length === 0 && <Empty title="No testimonials yet." hint="Submit your first testimonial in the Submit tab." />}
      {!loading && items.length > 0 && (
        <div className="space-y-2">
          {items.map((t) => (
            <div key={t.id} className="card p-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                <h3 className="font-semibold text-sm">{t.title}</h3>
                <span
                  className={`inline-block text-[10px] font-bold rounded px-2 py-0.5 uppercase ${
                    STATUS_COLOR[t.status] || 'badge-disabled'
                  }`}
                >
                  {t.status.replace(/_/g, ' ')}
                </span>
              </div>
              <p className="text-xs text-mist line-clamp-2">{t.body}</p>
              <div className="mt-2 flex items-center gap-3 text-xs text-mist">
                <span>{t.displayName} · {t.country}</span>
                <span>{t.views} views</span>
                <span>{new Date(t.createdAt).toLocaleDateString()}</span>
                {t.adminRemarks && <span className="text-red-400">{t.adminRemarks}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
      {error && <div className="alert-error" role="alert">{error}</div>}
    </div>
  );
}

/* ---------- Submit Testimonial ---------- */

function SubmitTestimonial({ onDone }: { onDone: () => void }) {
  const [mediaType, setMediaType] = useState<'written' | 'image' | 'video'>('written');
  const [form, setForm] = useState({
    title: '',
    body: '',
    displayName: '',
    country: 'NG',
    socialUrl: '',
    consent: false,
    policyAccepted: false,
  });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, type, value, checked } = e.target as any;
    setForm((p) => ({ ...p, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (f && !mediaType) setMediaType(f.type.startsWith('video') ? 'video' : 'image');
  };

  const isVideo = mediaType === 'video';
  const maxMB = isVideo ? 50 : 8;
  const accept = isVideo ? 'video/mp4,video/quicktime' : 'image/png,image/jpeg,image/webp';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setOk('');
    try {
      const body: any = {
        title: form.title,
        body: form.body,
        displayName: form.displayName,
        country: form.country,
        socialUrl: form.socialUrl || undefined,
        mediaType,
        consent: form.consent,
        policyAccepted: form.policyAccepted,
      };
      const created = await api.post<any>('/community/testimonials', body);
      let tid = created.id;

      if (file) {
        const ab = await file.arrayBuffer();
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5070/api/v1'}/community/testimonials/${tid}/media`,
          {
            credentials: 'include',
            method: 'POST',
            headers: {
              'Content-Type': file.type,
              'X-File-Name': encodeURIComponent(file.name),
            },
            body: ab,
          }
        );
        if (!res.ok) throw new Error('Media upload failed');
      }
      setOk('Testimonial submitted for review.');
      setForm({ title: '', body: '', displayName: '', country: 'NG', socialUrl: '', consent: false, policyAccepted: false });
      setFile(null);
      onDone();
    } catch (e: any) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const MAX = maxMB * 1024 * 1024;

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Title</label>
            <input
              name="title" className="input" value={form.title} onChange={handleChange}
              placeholder="e.g. Great platform, honest experience" required
            />
          </div>
          <div>
            <label className="label">Media type</label>
            <select name="mediaType" className="input" value={mediaType} onChange={(e) => setMediaType(e.target.value as any)}>
              <option value="written">Written</option>
              <option value="image">Image (photo)</option>
              <option value="video">Video</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Your story</label>
            <textarea
              name="body" className="input h-24" value={form.body} onChange={handleChange}
              placeholder="What was your experience? Be honest — critical feedback is welcome."
              required
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label">Display name</label>
            <input name="displayName" className="input" value={form.displayName} onChange={handleChange} required />
          </div>
          <div>
            <label className="label">Country</label>
            <select name="country" className="input" value={form.country} onChange={handleChange} required>
              <option value="NG">Nigeria</option>
              <option value="KE">Kenya</option>
              <option value="GH">Ghana</option>
              <option value="ZA">South Africa</option>
              <option value="US">United States</option>
              <option value="GB">United Kingdom</option>
              <option value="CA">Canada</option>
              <option value="IN">India</option>
            </select>
          </div>
          <div>
            <label className="label">Social profile URL (optional)</label>
            <input name="socialUrl" className="input" value={form.socialUrl} onChange={handleChange} placeholder="https://x.com/you" />
          </div>
        </div>

        {file && (
          <div className="card border-line/20 p-3">
            <div className="flex items-center gap-2 text-sm">
              <span style={{ fontSize: 16 }}>{mediaType === 'video' ? '🎥' : '🖼️'}</span>
              <span className="font-medium truncate">{file.name}</span>
              <span className="ml-auto text-xs text-mist">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
              <button
                type="button"
                onClick={() => setFile(null)}
                className="text-xs text-red-400 hover:underline"
              >
                Remove
              </button>
            </div>
            <p className="text-[10px] text-mist mt-1">
              Max {maxMB}MB · {accept} · {mediaType === 'video' ? 'up to 120s' : ''}
            </p>
          </div>
        )}

        {!file && mediaType !== 'written' && (
          <div className="alert-warn" role="status">
            {mediaType === 'video' ? 'Upload an MP4/MOV video (max 50MB, up to 120s).' : 'Upload a JPG/PNG/WebP image (max 8MB).'}
          </div>
        )}

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" name="consent" checked={form.consent} onChange={handleChange} required />
          I consent to my display name, country and testimonial being shown publicly.
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" name="policyAccepted" checked={form.policyAccepted} onChange={handleChange} required />
          I agree this is my honest feedback; I am not being paid or required to write a positive review.
        </label>

        <div className="pt-2">
          <button
            type="submit"
            disabled={busy || !form.consent || !form.policyAccepted}
            className="btn-primary w-full"
          >
            {busy ? 'Submitting…' : 'Submit for review'}
          </button>
        </div>
      </form>

      {ok && <div className="alert-ok" role="status">{ok}</div>}
      {error && <div className="alert-error" role="alert">{error}</div>}
    </div>
  );
}

/* ---------- My Social Posts ---------- */

function MySocialPosts() {
  const [items, setItems] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<any[]>('/community/social-submissions/mine')
      .then(setItems)
      .catch((e) => setError(errMsg(e)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">My social posts</h2>
        <span className={`badge ${loading ? 'badge-disabled' : 'badge-ok'}`}>
          {loading ? 'loading…' : `${items.length} submitted`}
        </span>
      </div>
      {loading && <p className="text-mist">Loading…</p>}
      {!loading && items.length === 0 && <Empty title="No social posts yet." hint="Promote TOCKINAX on your channels and submit the post link for verification." />}
      {!loading && items.length > 0 && (
        <div className="space-y-2">
          {items.map((s) => (
            <div key={s.id} className="card p-3">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="badge badge-ok">{s.platform}</span>
                <span
                  className={`inline-block text-[10px] font-bold rounded px-2 py-0.5 uppercase ${
                    s.status === 'verified' ? 'bg-success/10 text-success' : s.status === 'rejected' ? 'bg-red-500/10 text-red-300' : 'badge-disabled'
                  }`}
                >
                  {s.status.replace(/_/g, ' ')}
                </span>
              </div>
              <p className="text-xs text-mist break-all truncate md:max-w-[400px]">{s.postUrl}</p>
              {s.caption && <p className="text-xs text-mist line-clamp-1 mt-1">{s.caption}</p>}
              <div className="mt-2 text-xs text-mist">
                {s.has_screenshot ? '📷 screenshot attached' : 'No screenshot'} ·{' '}
                {new Date(s.submitted_at).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}
      {error && <div className="alert-error" role="alert">{error}</div>}
    </div>
  );
}

/* ---------- Promote Us ---------- */

function PromoteUs() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<any[]>('/community/social-accounts')
      .then(setAccounts)
      .catch(() => setAccounts([]))
      .finally(() => setLoading(false));
  }, []);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 1500);
  };

  const CAPTIONS = [
    'Just joined TOCKINAX — trade, lock, grow. My honest take below 👇',
    'TOCKINAX weekly leaderboard is live. Share your story and earn bonuses.',
    'My experience with TOCKINAX: transparent, member-first, no fake promises.',
  ];
  const HASHTAGS = ['#TOCKINAX', '#CommunityRewards', '#HonestReview', '#Testimonial'];

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <h2 className="text-sm font-semibold mb-3">Official channels</h2>
        <p className="text-xs text-mist mb-3">
          Link your post to any official TOCKINAX channel, then submit it below for
          verification and weekly promotion credit.
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          {loading ? (
            <div className="col-span-3 h-8 animate-pulse rounded bg-surface2" />
          ) : (
            accounts.map((a) => (
              <Link
                key={a.platform}
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg border border-edge/60 bg-coal px-3 py-2 text-sm text-mist hover:border-gold/50 hover:text-bright transition-colors"
              >
                <span style={{ fontSize: 18, lineHeight: 1 }}>{a.platform === 'telegram' ? '📩' : a.platform === 'x' ? '𝕏' : '🔗'}</span>
                {a.label || a.platform}
              </Link>
            ))
          )}
        </div>
      </div>

      <div className="card p-4">
        <h2 className="text-sm font-semibold mb-3">Suggested caption</h2>
        <div className="space-y-2">
          {CAPTIONS.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <p className="text-sm text-mist flex-1">{c}</p>
              <button
                onClick={() => copy(c)}
                className="rounded-lg border border-line/20 px-2 py-1 text-[11px] font-medium text-mist hover:border-gold/50 hover:text-gold transition-colors"
                title="Copy caption"
              >
                {copied === c ? 'Copied ✓' : 'Copy'}
              </button>
            </div>
          ))}
          <div className="pt-1 text-[10px] text-mist">
            Suggested hashtags: {HASHTAGS.join(' ')} · Tag @TOCKINAX on X/Instagram or
            TOCKINAX on Telegram.
          </div>
        </div>
      </div>

      <div className="card p-4">
        <h2 className="text-sm font-semibold mb-3">Submit your post for verification</h2>
        <p className="text-xs text-mist mb-3">
          Paste your public post URL and upload a screenshot. An admin will verify
          the tagging before it counts toward weekly promotion rewards.
        </p>
        <Empty title="Submission form coming soon." hint="Post URL + screenshot submission will be wired to /community/social-submissions." />
      </div>
    </div>
  );
}

/* ---------- Weekly Leaderboards ---------- */

function WeeklyLeaderboards() {
  const [data, setData] = useState<{ testimonial: any; referral: any } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ testimonial?: any; referral?: any }>('/community/leaderboards?kind=testimonial')
      .then((t) => {
        return api
          .get<{ referral?: any }>('/community/leaderboards?kind=referral')
          .then((r) => ({ testimonial: t.testimonial, referral: r.referral }));
      })
      .then(setData)
      .catch((e) => setError(errMsg(e)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold">Weekly leaderboards</h2>
      {loading && <p className="text-mist">Loading…</p>}
      {!loading && !data && <Empty title="Leaderboards unavailable." />}
      {!loading && data && (
        <div className="grid gap-4 sm:grid-cols-2">
          <LeaderboardPanel title="Top testimonials" kind="testimonial" board={data.testimonial} />
          <LeaderboardPanel title="Top referrers" kind="referral" board={data.referral} />
        </div>
      )}
      {error && <div className="alert-error" role="alert">{error}</div>}
    </div>
  );
}

function LeaderboardPanel({ title, kind, board }: { title: string; kind: string; board: any }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className={`badge ${board?.status === 'open' ? 'badge-ok' : 'badge-disabled'}`}>
          {board?.status || '—'}
        </span>
      </div>
      {!board ? (
        <p className="text-mist">No competition this week.</p>
      ) : (
        <div className="space-y-2">
          {board.leaderboard.map((e: LeaderboardEntry, i: number) => (
            <div key={e.rank || i} className="flex items-center gap-2 text-sm">
              <span className="w-4 text-mist font-mono tnum">#{e.rank}</span>
              <span className="font-semibold truncate w-24">{e.member}</span>
              <span className="ml-auto tnum">{e.metric}</span>
              {e.amount !== undefined && <span className="ml-2 text-xs text-gold tnum">{e.amount} {e.currency}</span>}
            </div>
          ))}
          {board.leaderboard.length === 0 && <p className="text-xs text-mist">No qualified entries yet.</p>}
        </div>
      )}
      {board?.minMetric !== undefined && (
        <p className="mt-2 text-[10px] text-mist">Minimum {board.minMetric} qualified {kind === 'testimonial' ? 'views' : 'referrals'}.</p>
      )}
    </div>
  );
}

/* ---------- My Bonuses ---------- */

function MyBonuses() {
  const [awards, setAwards] = useState<BonusAward[]>([]);
  const [txs, setTxs] = useState<any[]>([]);
  const [totals, setTotals] = useState<{ paid: string; approvedPending: string; provisional: string }>({
    paid: '0', approvedPending: '0', provisional: '0',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ awards: BonusAward[]; transactions: any[]; totals: any }>('/community/bonuses/mine')
      .then((d) => {
        setAwards(d.awards);
        setTxs(d.transactions);
        setTotals(d.totals);
      })
      .catch((e) => setError(errMsg(e)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <h2 className="text-sm font-semibold mb-3">My weekly bonuses</h2>
        <div className="grid gap-3 sm:grid-cols-3 text-xs">
          <div className="card p-3 border-line/20">
            <div className="text-mist uppercase tracking-wide text-[10px]">Paid</div>
            <div className="text-success font-mono tnum">{totals.paid} USDT</div>
          </div>
          <div className="card p-3 border-line/20">
            <div className="text-mist uppercase tracking-wide text-[10px]">Approved, pending pay</div>
            <div className="text-brand-300 font-mono tnum">{totals.approvedPending} USDT</div>
          </div>
          <div className="card p-3 border-line/20">
            <div className="text-mist uppercase tracking-wide text-[10px]">Provisional</div>
            <div className="text-mist font-mono tnum">{totals.provisional} USDT</div>
          </div>
        </div>
      </div>

      <div className="card p-4">
        <h3 className="text-sm font-semibold mb-3">Award history</h3>
        {loading && <p className="text-mist">Loading…</p>}
        {!loading && awards.length === 0 && <p className="text-mist">No bonus awards yet.</p>}
        {!loading && awards.length > 0 && (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Week</th><th>Position</th><th>Metric</th><th>Amount</th><th>Status</th><th>Payment</th>
                </tr>
              </thead>
              <tbody>
                {awards.map((a) => (
                  <tr key={a.id}>
                    <td>{a.weekKey}</td>
                    <td className="font-mono tnum">#{a.position}</td>
                    <td className="tnum">{a.metricValue}</td>
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
                    <td className="text-xs text-mist">{a.paymentStatus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {error && <div className="alert-error" role="alert">{error}</div>}
    </div>
  );
}

/* ---------- Competition Rules ---------- */

function CompetitionRules() {
  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold">Competition rules</h2>
      <div className="card p-4 space-y-3">
        <p className="text-sm text-mist">
          Weekly bonuses are <strong>promotional incentives</strong> funded by TOCKINAX.
          They are not investment returns, never conditional on a positive review, and never
          require you to purchase anything.
        </p>
        <ul className="list-disc list-inside text-sm text-mist space-y-1">
          <li>Testimonial competition: ranked by eligible verified views within the weekly window.</li>
          <li>Referral competition: ranked by qualified verified registrations within the weekly window.</li>
          <li>Only approved, policy-compliant testimonials count. Self-referrals, duplicates and fraud are excluded.</li>
          <li>Top 5 in each competition qualify for position rewards 1&ndash;5, as configured by admin.</li>
          <li>Winners are provisional until admin verification; approved bonuses are credited to your USDT balance.</li>
          <li>Honest and critical feedback is welcome — you are never required to write a positive review.</li>
          <li>No personal information is published without your consent.</li>
        </ul>
        <p className="text-xs text-mist mt-2">
          Full eligibility, window and reward amounts are set in the admin dashboard under
          Community &amp; Rewards Management → Bonus configuration.
        </p>
      </div>
    </div>
  );
}
