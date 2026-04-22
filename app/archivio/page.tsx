"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import ArchiveGate from "@/components/ArchiveGate";

interface WineRow {
  id: string;
  nome_vino: string;
  produttore: string | null;
  annata: string | null;
  regione: string | null;
  paese: string | null;
  denominazione: string | null;
  bottle_image: string | null;
  scan_count: number;
  last_scanned_at: string;
  first_scanned_at: string;
  lang: string;
}

function ArchiveContent() {
  const router = useRouter();
  const [wines, setWines] = useState<WineRow[]>([]);
  const [totals, setTotals] = useState({ total: 0, totalScans: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/archive")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) {
          setError(data.error);
        } else {
          setWines(data.wines || []);
          setTotals({ total: data.total || 0, totalScans: data.totalScans || 0 });
        }
      })
      .catch(() => {
        if (!cancelled) setError("Errore di connessione");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return wines;
    const q = search.toLowerCase();
    return wines.filter(
      (w) =>
        w.nome_vino.toLowerCase().includes(q) ||
        (w.produttore || "").toLowerCase().includes(q) ||
        (w.regione || "").toLowerCase().includes(q) ||
        (w.paese || "").toLowerCase().includes(q) ||
        (w.denominazione || "").toLowerCase().includes(q)
    );
  }, [wines, search]);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <div
      className="min-h-dvh"
      style={{
        background: "var(--color-bg)",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {/* Header */}
      <div className="sticky top-0 z-10" style={{ background: "var(--color-bg)", borderBottom: "1px solid rgba(120,94,20,0.15)" }}>
        <div className="max-w-4xl mx-auto px-5 md:px-8 py-4 flex items-center gap-4">
          <button
            onClick={() => router.push("/")}
            className="shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg"
            style={{ color: "var(--color-text)" }}
            aria-label="Home"
          >
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <h1
              className="text-xl md:text-2xl font-bold"
              style={{ fontFamily: "var(--font-playfair)", color: "var(--color-gold)" }}
            >
              Archivio vini
            </h1>
            <p className="text-xs md:text-sm" style={{ color: "var(--color-muted)" }}>
              {totals.total} vini distinti · {totals.totalScans} scansioni totali
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="max-w-4xl mx-auto px-5 md:px-8 pb-3">
          <input
            type="search"
            placeholder="Cerca per nome, produttore, regione…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full py-2 px-3 rounded-lg outline-none text-base"
            style={{
              background: "var(--color-surface)",
              border: "1px solid rgba(120,94,20,0.2)",
              color: "var(--color-text)",
            }}
          />
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-5 md:px-8 py-6">
        {loading && (
          <p className="text-center py-12" style={{ color: "var(--color-muted)" }}>
            Caricamento…
          </p>
        )}

        {error && (
          <p className="text-center py-12" style={{ color: "#c0392b" }}>
            {error}
          </p>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="text-center py-16 flex flex-col items-center gap-2">
            <p style={{ color: "var(--color-muted)" }}>
              {wines.length === 0
                ? "Nessuna scansione ancora registrata."
                : "Nessun risultato per la ricerca."}
            </p>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <ul className="grid gap-3 md:gap-4">
            {filtered.map((w) => (
              <li
                key={w.id}
                className="flex items-stretch gap-4 rounded-xl p-3 md:p-4"
                style={{
                  background: "var(--color-surface)",
                  border: "1px solid rgba(120,94,20,0.15)",
                }}
              >
                {/* Thumbnail */}
                <div
                  className="shrink-0 w-16 h-20 md:w-20 md:h-24 rounded-lg overflow-hidden flex items-center justify-center"
                  style={{ background: "rgba(120,94,20,0.06)" }}
                >
                  {w.bottle_image ? (
                    <img
                      src={w.bottle_image}
                      alt={w.nome_vino}
                      className="w-full h-full object-contain"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ color: "var(--color-gold)", opacity: 0.5 }}>
                      <path d="M8 2h8v5a4 4 0 01-4 4 4 4 0 01-4-4V2zM12 11v11M9 22h6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  <div>
                    <h3
                      className="text-base md:text-lg font-bold leading-tight"
                      style={{ color: "var(--color-gold)", fontFamily: "var(--font-playfair)" }}
                    >
                      {w.nome_vino}
                    </h3>
                    <p className="text-xs md:text-sm mt-1 truncate" style={{ color: "var(--color-muted)" }}>
                      {[w.produttore, w.annata].filter(Boolean).join(" · ")}
                    </p>
                    {(w.regione || w.paese || w.denominazione) && (
                      <p className="text-xs mt-0.5 truncate" style={{ color: "var(--color-muted)" }}>
                        {[w.denominazione, w.regione, w.paese].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-2">
                    <span
                      className="text-xs px-2 py-1 rounded-full"
                      style={{
                        background: "rgba(139,26,26,0.08)",
                        color: "var(--color-bordeaux)",
                        border: "1px solid rgba(139,26,26,0.2)",
                      }}
                    >
                      {w.scan_count === 1 ? "1 scansione" : `${w.scan_count} scansioni`}
                    </span>
                    <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                      {formatDate(w.last_scanned_at)}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function ArchivioPage() {
  return (
    <ArchiveGate>
      <ArchiveContent />
    </ArchiveGate>
  );
}
