'use client';

import Link from 'next/link';

export type SocialAccount = {
  platform: string;
  label: string;
  url: string;
  sortOrder?: number;
  enabled?: boolean;
};

const ICON: Record<string, string> = {
  telegram: '📩',
  youtube: '▶',
  x: '𝕏',
  instagram: '📷',
  facebook: 'f',
  tiktok: '🎵',
  linkedin: '💼',
};

/** Render a small circular social icon link, matching the platform glyph set. */
export function SocialIcon({ account, size = 20 }: { account: SocialAccount; size?: number }) {
  const glyph = ICON[account.platform] ?? '🔗';
  return (
    <Link
      href={account.url}
      target="_blank"
      rel="noopener noreferrer"
      title={`TOCKINAX on ${account.label || account.platform}`}
      aria-label={`TOCKINAX ${account.label || account.platform}`}
      className="inline-flex items-center justify-center rounded-full border border-gold/20 bg-ink text-gold hover:bg-gold/10 hover:text-bright transition-colors"
      style={{ width: size, height: size }}
    >
      <span style={{ fontSize: size * 0.55, lineHeight: 1 }}>{glyph}</span>
    </Link>
  );
}

/** Horizontal row of official social channels (footer / header). */
export function SocialIcons({ accounts, size = 20, gap = 2 }: { accounts: SocialAccount[]; size?: number; gap?: number }) {
  const items = accounts.filter((a) => a.enabled !== false && a.url);
  return (
    <div className="flex items-center gap-x-2">
      {items.map((a) => (
        <SocialIcon key={a.platform} account={a} size={size} />
      ))}
    </div>
  );
}

/** Vertical stack for sidebars. */
export function SocialStack({ accounts }: { accounts: SocialAccount[] }) {
  const items = accounts.filter((a) => a.enabled !== false && a.url);
  return (
    <div className="flex flex-col gap-2">
      {items.map((a) => (
        <Link
          key={a.platform}
          href={a.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 rounded-lg border border-edge/60 bg-coal px-3 py-2 text-sm text-mist hover:border-gold/50 hover:text-bright transition-colors"
        >
          <span style={{ fontSize: 18, lineHeight: 1 }}>{ICON[a.platform] ?? '🔗'}</span>
          {a.label || a.platform}
        </Link>
      ))}
    </div>
  );
}
