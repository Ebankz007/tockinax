"use client";
import Link from "next/link";
import { createElement, useState } from "react";
import { api, errMsg } from "@/lib/api";

function ForgotPasswordInner() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMsg("");
    try {
      await api.post("/auth/forgot-password", { email });
      setMsg("If an account exists with this email, a reset link has been sent.");
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md card space-y-4">
      <h1 className="text-2xl font-bold text-white">Forgot Password</h1>
      {error && <p className="alert-error" role="alert">{error}</p>}
      {msg && <p className="alert-ok" role="status">{msg}</p>}
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label" htmlFor="fp-email">Email</label>
          <input
            id="fp-email"
            className="input"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? "Sending…" : "Send Reset Link"}
        </button>
      </form>
      <p className="text-sm text-slate-600">
        Remember your password? <Link href="/login" className="underline">Log in</Link>
      </p>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return createElement(ForgotPasswordInner);
}
