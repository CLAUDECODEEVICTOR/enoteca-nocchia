"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

type Scope = "app" | "admin";

interface GateProps {
  scope: Scope;
  title: string;
  subtitle: string;
  /** Staff areas offer a way back to the customer-facing home. */
  showBackLink?: boolean;
  children: React.ReactNode;
}

/**
 * PIN gate. The code itself lives in an env var on the server: this component
 * only ever sends what the user typed and reads back yes or no, so nothing
 * secret ends up in the JavaScript bundle. The signed cookie the server returns
 * is what the protected API routes actually check.
 */
export default function Gate({ scope, title, subtitle, showBackLink, children }: GateProps) {
  const router = useRouter();
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Already unlocked in a previous visit? The cookie answers, not the browser storage.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/auth?scope=${scope}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data?.ok) setUnlocked(true);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scope]);

  useEffect(() => {
    if (!unlocked && !checking) inputRef.current?.focus();
  }, [unlocked, checking]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (submitting || pin.length < 4) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, pin }),
      });
      if (res.ok) {
        setUnlocked(true);
        return;
      }
      const data = await res.json().catch(() => null);
      setErrorMessage(data?.error || "PIN errato");
      setPin("");
    } catch {
      setErrorMessage("Errore di connessione");
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) return null;
  if (unlocked) return <>{children}</>;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center px-6"
      style={{ background: "var(--color-bg)" }}
    >
      <h1
        className="text-3xl md:text-4xl font-bold mb-2"
        style={{ fontFamily: "var(--font-playfair)", color: "var(--color-gold)" }}
      >
        {title}
      </h1>
      <p className="text-sm mb-8 text-center" style={{ color: "var(--color-muted)" }}>
        {subtitle}
      </p>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col items-center gap-4 w-full max-w-[200px]"
      >
        <input
          ref={inputRef}
          type="password"
          inputMode="numeric"
          maxLength={12}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          className="w-full text-center text-2xl tracking-[0.5em] py-3 rounded-xl outline-none transition-colors"
          style={{
            background: "var(--color-surface)",
            border: errorMessage ? "2px solid #c0392b" : "1px solid rgba(120,94,20,0.3)",
            color: "var(--color-text)",
            fontFamily: "var(--font-dm-sans)",
          }}
          placeholder="····"
          autoComplete="off"
          aria-label="PIN"
        />

        {errorMessage && (
          <p className="text-sm text-center" style={{ color: "#c0392b" }}>
            {errorMessage}
          </p>
        )}

        <button
          type="submit"
          disabled={pin.length < 4 || submitting}
          className="w-full py-3 rounded-xl text-base font-medium transition-all duration-200 disabled:opacity-40"
          style={{ background: "var(--color-bordeaux)", color: "#FFFFFF" }}
        >
          {submitting ? "..." : "Entra"}
        </button>

        {showBackLink && (
          <button
            type="button"
            onClick={() => router.push("/")}
            className="text-sm mt-4"
            style={{ color: "var(--color-muted)" }}
          >
            ← Torna alla home
          </button>
        )}
      </form>
    </div>
  );
}
