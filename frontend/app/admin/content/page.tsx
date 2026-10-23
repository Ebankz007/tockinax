'use client';
import { useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import { api, errMsg } from '@/lib/api';

const SLUGS = ['terms', 'privacy', 'fees', 'market-rules', 'refunds', 'faq'];

function ContentInner() {
  const [slug, setSlug] = useState('fees');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load(s: string) {
    setSlug(s);
    setError('');
    setMsg('');
    try {
      const d = await api.get<{ title?: string; body?: string; content?: string }>(`/content/pages/${s}`);
      setTitle(d.title || s);
      setBody(d.body || d.content || '');
    } catch (e) {
      setError(errMsg(e));
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMsg('');
    try {
      await api.put(`/content/pages/${slug}`, { title, body });
      setMsg(`Page “${slug}” saved.`);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Content</h1>
      {error && <p className="alert-error" role="alert">{error}</p>}
      {msg && <p className="alert-ok" role="status">{msg}</p>}
      <div className="flex flex-wrap gap-1" role="group" aria-label="Content pages">
        {SLUGS.map((s) => (
          <button key={s} className={s === slug ? 'btn-primary px-3 py-1 text-sm' : 'btn-secondary px-3 py-1 text-sm'} onClick={() => void load(s)}>
            {s}
          </button>
        ))}
      </div>
      <form className="card space-y-2" onSubmit={save}>
        <div><label className="label" htmlFor="c-title">Title</label><input id="c-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div><label className="label" htmlFor="c-body">Body</label><textarea id="c-body" className="input" rows={10} value={body} onChange={(e) => setBody(e.target.value)} /></div>
        <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save page'}</button>
      </form>
    </div>
  );
}

export default function AdminContentPage() {
  return (
    <RequireAuth>
      <ContentInner />
    </RequireAuth>
  );
}
