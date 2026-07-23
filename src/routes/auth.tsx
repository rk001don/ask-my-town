import { createFileRoute, useNavigate, useSearch, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { AppHeader } from "@/components/AppHeader";
import { toast } from "sonner";
import { Loader2, LogIn } from "lucide-react";

const searchSchema = z.object({
  redirect: z.string().optional(),
  mode: z.enum(["signin", "signup"]).optional(),
});

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — MyTown" },
      { name: "description", content: "Sign in to MyTown to track your orders and reorder faster." },
      { property: "og:title", content: "Sign in — MyTown" },
      { property: "og:description", content: "Sign in to MyTown to track your orders and reorder faster." },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (s) => searchSchema.parse(s),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const search = useSearch({ from: "/auth" });
  const [mode, setMode] = useState<"signin" | "signup">(search.mode ?? "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  // Bounce away if already signed in.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) nav({ to: search.redirect ?? "/my-orders" });
    });
  }, [nav, search.redirect]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Check your email to confirm your account.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back!");
        nav({ to: search.redirect ?? "/my-orders" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setGoogleBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) throw new Error(String(result.error));
      if (result.redirected) return;
      nav({ to: search.redirect ?? "/my-orders" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google sign-in failed");
      setGoogleBusy(false);
    }
  }

  return (
    <div>
      <AppHeader title="Sign in" showCart={false} showSearch={false} />
      <div className="px-5 pt-4 pb-24">
        <div className="glass rounded-3xl p-5">
          <h2 className="text-display text-2xl font-semibold">
            {mode === "signup" ? "Create your account" : "Welcome back"}
          </h2>
          <p className="mt-1 text-sm text-[color:var(--text-secondary)]">
            Track your orders, reorder faster, save your address.
          </p>

          <button
            type="button"
            onClick={google}
            disabled={googleBusy}
            className="tap-scale mt-5 flex w-full items-center justify-center gap-2 rounded-full border border-[color:var(--border-strong)] bg-white/5 px-4 py-3 font-semibold"
          >
            {googleBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : (
              <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35.5 24 35.5c-6.4 0-11.5-5.1-11.5-11.5S17.6 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.7 6.4 29 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.2 19 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.7 6.4 29 4.5 24 4.5 16.4 4.5 9.8 8.7 6.3 14.7z"/><path fill="#4CAF50" d="M24 43.5c5 0 9.5-1.9 12.9-5l-6-4.9C29 35 26.6 35.5 24 35.5c-5.3 0-9.7-3.1-11.3-7.4l-6.5 5c3.4 6 10 10.4 17.8 10.4z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6 4.9c-.4.4 6.6-4.8 6.6-14.5 0-1.2-.1-2.4-.4-3.5z"/></svg>
            )}
            Continue with Google
          </button>

          <div className="my-4 flex items-center gap-3 text-xs text-[color:var(--text-tertiary)]">
            <div className="h-px flex-1 bg-[color:var(--border-subtle)]" />
            or
            <div className="h-px flex-1 bg-[color:var(--border-subtle)]" />
          </div>

          <form onSubmit={submit} className="space-y-3">
            <label className="block">
              <span className="text-xs text-[color:var(--text-secondary)]">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="mt-1 w-full rounded-2xl border border-[color:var(--border-subtle)] bg-black/20 px-4 py-3 outline-none focus:border-[color:var(--accent-primary)]"
                placeholder="you@example.com"
              />
            </label>
            <label className="block">
              <span className="text-xs text-[color:var(--text-secondary)]">Password</span>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                className="mt-1 w-full rounded-2xl border border-[color:var(--border-subtle)] bg-black/20 px-4 py-3 outline-none focus:border-[color:var(--accent-primary)]"
                placeholder="At least 6 characters"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="tap-scale mt-2 flex w-full items-center justify-center gap-2 rounded-full accent-gradient px-4 py-3 font-semibold text-[color:var(--on-accent)]"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              {mode === "signup" ? "Create account" : "Sign in"}
            </button>
          </form>

          <button
            type="button"
            onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
            className="mt-4 w-full text-center text-sm text-[color:var(--text-secondary)] underline"
          >
            {mode === "signup" ? "Have an account? Sign in" : "New here? Create an account"}
          </button>

          <p className="mt-4 text-center text-xs text-[color:var(--text-tertiary)]">
            You can also{" "}
            <Link to="/activity" className="underline">
              track without an account
            </Link>{" "}
            using your phone number.
          </p>
        </div>
      </div>
    </div>
  );
}
