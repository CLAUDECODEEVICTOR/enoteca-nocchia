"use client";

import { useEffect, useState } from "react";
import FeedbackGate from "@/components/FeedbackGate";

interface FeedbackItem {
  id: string;
  created_at: string;
  is_correct: boolean;
  wine_name: string | null;
  producer: string | null;
  vintage: string | null;
  testo_etichetta: string | null;
  user_correction: string | null;
  notes: string | null;
  lang: string | null;
  original_photo: string | null;
}

type Filter = "all" | "wrong" | "correct";

// Il contenuto vive dentro il gate: monta solo a PIN inserito, così la chiamata
// a /api/feedback/list parte quando il cookie di sessione esiste già.
function FeedbackContent() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const qs = filter === "all" ? "" : `?filter=${filter}`;
    fetch(`/api/feedback/list${qs}`)
      .then(async (r) => {
        // Senza questo controllo un errore del server sembrerebbe un archivio vuoto.
        if (!r.ok) throw new Error(r.status === 401 ? "Sessione scaduta. Ricarica la pagina e reinserisci il PIN." : "Errore di caricamento");
        return r.json();
      })
      .then((data) => setItems(data.items || []))
      .catch((e) => {
        setItems([]);
        setError(e instanceof Error ? e.message : "Errore di caricamento");
      })
      .finally(() => setLoading(false));
  }, [filter]);

  const wrongCount = items.filter((i) => !i.is_correct).length;

  return (
    <div className="min-h-dvh" style={{ background: "var(--color-bg)", color: "var(--color-text)" }}>
        <div className="max-w-3xl mx-auto px-5 md:px-8 py-8">
          <header className="mb-6">
            <h1 className="text-3xl md:text-4xl font-bold mb-1" style={{ fontFamily: "var(--font-playfair)", color: "var(--color-gold)" }}>
              Feedback scansioni
            </h1>
            <p className="text-sm" style={{ color: "var(--color-muted)" }}>
              {loading ? "Caricamento..." : `${items.length} feedback totali · ${wrongCount} segnalati come sbagliati`}
            </p>
          </header>

          <div className="flex gap-2 mb-6 flex-wrap">
            {(["all", "wrong", "correct"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: filter === f ? "var(--color-bordeaux)" : "var(--color-surface)",
                  color: filter === f ? "#FFFFFF" : "var(--color-text)",
                  border: "1px solid rgba(120,94,20,0.3)",
                }}
              >
                {f === "all" ? "Tutti" : f === "wrong" ? "Sbagliati" : "Corretti"}
              </button>
            ))}
          </div>

          {error && (
            <p className="text-center py-12" style={{ color: "#c0392b" }}>
              {error}
            </p>
          )}

          {!loading && !error && items.length === 0 && (
            <p className="text-center py-12" style={{ color: "var(--color-muted)" }}>
              Nessun feedback ancora.
            </p>
          )}

          <div className="flex flex-col gap-3">
            {items.map((item) => {
              const isOpen = expanded === item.id;
              const date = new Date(item.created_at).toLocaleString("it-IT", {
                day: "2-digit",
                month: "2-digit",
                year: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              });
              return (
                <div
                  key={item.id}
                  className="rounded-xl overflow-hidden transition-all"
                  style={{
                    background: "var(--color-surface)",
                    border: "1px solid rgba(120,94,20,0.2)",
                  }}
                >
                  <button
                    onClick={() => setExpanded(isOpen ? null : item.id)}
                    className="w-full text-left px-4 py-3 flex items-center gap-3"
                  >
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: item.is_correct ? "#1f8a3a" : "#c0392b" }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate" style={{ color: "var(--color-text)" }}>
                        {item.wine_name || "—"}
                        {item.vintage ? ` · ${item.vintage}` : ""}
                      </div>
                      <div className="text-xs" style={{ color: "var(--color-muted)" }}>
                        {item.producer || ""}
                        {item.producer ? " · " : ""}
                        {date}
                      </div>
                    </div>
                    <span className="text-xs flex-shrink-0" style={{ color: "var(--color-muted)" }}>
                      {isOpen ? "▲" : "▼"}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 pt-1 flex flex-col gap-3 text-sm" style={{ color: "var(--color-text)" }}>
                      {item.original_photo && (
                        <div>
                          <div className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>Foto scattata</div>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`data:image/jpeg;base64,${item.original_photo}`}
                            alt="Foto scansione"
                            className="rounded-lg max-w-full"
                            style={{ maxHeight: "400px", objectFit: "contain" }}
                          />
                        </div>
                      )}

                      {item.testo_etichetta && (
                        <Field label="Testo letto da Claude" value={item.testo_etichetta} mono />
                      )}

                      {!item.is_correct && item.user_correction && (
                        <Field label="Vino giusto secondo il proprietario" value={item.user_correction} />
                      )}

                      {item.notes && <Field label="Note libere" value={item.notes} />}

                      <div className="text-xs pt-2" style={{ color: "var(--color-muted)" }}>
                        ID: {item.id} · lang: {item.lang || "—"}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
    </div>
  );
}

export default function FeedbackAdminPage() {
  return (
    <FeedbackGate>
      <FeedbackContent />
    </FeedbackGate>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>{label}</div>
      <div
        className="rounded-lg p-2 whitespace-pre-wrap break-words"
        style={{
          background: "var(--color-bg)",
          border: "1px solid rgba(120,94,20,0.15)",
          fontFamily: mono ? "ui-monospace, SFMono-Regular, monospace" : undefined,
          fontSize: mono ? "12px" : undefined,
        }}
      >
        {value}
      </div>
    </div>
  );
}
