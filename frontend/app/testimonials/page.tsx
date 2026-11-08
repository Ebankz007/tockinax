'use client';

import Link from 'next/link';
import { useEffect, useState, useCallback } from 'react';
import { api, type Testimonial } from '@/lib/api';
import Empty from '@/components/Empty';
import { SocialIcons } from '@/components/SocialIcons';
import RequireAuth from '@/components/RequireAuth';

type MediaTab = 'all' | 'video' | 'image' | 'written';

export default function TestimonialsPage() {
  const [items, setItems] = useState<Testimonial[]>([]);
  const [featured, setFeatured] = useState<Testimonial[]>([]);
  const [media, setMedia] = useState<MediaTab>('all');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await api.get<Testimonial[]>('/community/testimonials?limit=60');
      const all = Array.isArray(r) ? r : [];
      setItems(all);
      setFeatured(all.filter((t) => t.featured));
    } catch (e) {
      setError('Unable to load testimonials right now. Try again shortly.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const byMedia = items.filter((t) =>
    media === 'all' ? true : t.mediaType === media
  );
  const featuredByMedia = featured.filter((t) =>
    media === 'all' ? true : t.mediaType === media
  );

  const socials = [
    { platform: 'telegram', label: 'Telegram', url: 'https://t.me/tockinax' },
    { platform: 'x', label: 'X (Twitter)', url: 'https://x.com/tockinax' },
    { platform: 'instagram', label: 'Instagram', url: 'https://www.instagram.com/tockinax' },
    { platform: 'facebook', label: 'Facebook', url: 'https://www.facebook.com/tockinax' },
    { platform: 'youtube', label: 'YouTube', url: 'https://www.youtube.com/@tockinax' },
  ];

  return (
    <div className="space-y-6">
      <div className="card space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Member testimonials</h1>
            <p className="text-mist text-sm">
              Honest experiences from TOCKINAX members. Every testimonial is reviewed
              before it appears; only approved submissions are public.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {['all', 'video', 'image', 'written'].map((m) => (
              <button
                key={m}
                onClick={() => setMedia(m as MediaTab)}
                className={`rounded-lg border px-3 py-1 text-xs font-medium transition-colors ${
                  media === m
                    ? 'bg-gold text-black border-gold'
                    : 'border-line/20 text-mist hover:bg-white/5'
                }`}
              >
                {m === 'all' ? 'All' : m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {featured.length > 0 && (
          <section className="mt-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-mist mb-3">Featured</h2>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {featuredByMedia.map((t) => (
                <TestimonialCard key={t.id} t={t} featured />
              ))}
            </div>
          </section>
        )}

        <section className="mt-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-mist mb-3">
            {byMedia.length === 0 ? 'No testimonials yet' : `Community voices (${byMedia.length})`}
          </h2>
          {loading ? (
            <p role="status" className="text-mist">Loading testimonials…</p>
          ) : byMedia.length === 0 ? (
            <Empty title="No testimonials found." hint="Be the first to share your experience." />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {byMedia.map((t) => (
                <TestimonialCard key={t.id} t={t} />
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="card">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-mist mb-3">Follow TOCKINAX</h2>
        <p className="text-xs text-mist mb-3">
          Promote us on your channels and get rewarded. See{' '}
          <Link href="/dashboard/community?tab=promote" className="text-gold hover:underline">
            Promote Us &amp; Get Rewarded
          </Link>
          .
        </p>
        <SocialIcons accounts={socials} size={24} gap={4} />
      </section>

      {error && <div className="alert-error" role="alert">{error}</div>}
    </div>
  );
}

function TestimonialCard({ t, featured }: { t: Testimonial; featured?: boolean }) {
  const media = t.media[0];
  const isVideo = media?.kind === 'video';
  const shareText = encodeURIComponent(`"${t.title}" — ${t.displayName}, ${t.country} via @TOCKINAX`);
  const shareUrl = encodeURIComponent(typeof location !== 'undefined' ? location.origin : '');
  return (
    <article className="card rounded-2xl border-gold/30 overflow-hidden relative group">
      {t.featured && (
        <span className="absolute top-3 left-3 z-10 rounded-full bg-gold text-black text-xs font-bold px-2 py-0.5">
          Featured
        </span>
      )}
      <div className="relative aspect-video bg-coal overflow-hidden">
        {isVideo && media ? (
          <video
            src={media.url}
            playsInline
            muted
            preload="metadata"
            poster=""
            className="w-full h-full object-cover"
          />
        ) : media?.kind === 'image' ? (
          <img src={media.url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center border border-dashed border-edge/40">
            <span className="text-mist text-xs">{t.mediaType === 'written' ? 'Written' : 'Media'}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-black/20"></div>
        <div className="absolute bottom-2 left-2 z-10 flex items-center gap-1 bg-black/60 backdrop-blur px-2 py-1 rounded">
          <span className="text-[10px] font-semibold text-white">{t.views} views</span>
        </div>
      </div>
      <div className="p-3">
        <h3 className="font-semibold text-sm leading-snug">{t.title}</h3>
        <p className="mt-1 text-xs text-mist line-clamp-2">{t.body}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="flex items-center gap-1 text-mist">
            <span style={{ fontSize: 14, lineHeight: 1 }}>{t.country === 'NG' ? '🇳🇬' : '🌍'}</span>
            {t.displayName}
          </span>
          <time className="text-mist">{new Date(t.publishedAt || t.createdAt).toLocaleDateString()}</time>
          {t.socialUrl && (
            <a
              href={t.socialUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gold hover:underline"
              title="Member's social profile"
            >
              Social profile
            </a>
          )}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => {
              const url = `https://x.com/intent/tweet?text=${shareText}&url=${shareUrl}`;
              window.open(url, '_blank', 'width=550,height=420');
            }}
            className="rounded-lg border border-line/20 px-2.5 py-1 text-[10px] font-medium text-mist hover:border-gold/50 hover:text-gold transition-colors"
          >
            Share
          </button>
        </div>
      </div>
    </article>
  );
}
