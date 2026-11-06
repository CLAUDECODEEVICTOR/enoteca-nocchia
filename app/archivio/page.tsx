"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ArchiveGate from "@/components/ArchiveGate";
import WineCard from "@/components/WineCard";
import type { WineAnalysis } from "@/lib/types";
import "@/lib/i18n";

interface Riga {
  id: string;
  nome_vino: string;
  produttore: string | null;
  annata: string | null;
  regione: string | null;
  paese: string | null;
  denominazione: string | null;
  bottle_image: string | null;
  scan_count: number;
  categoria: string | null;
  origine: string | null;
  foto_id: string | null;
  formati: string[] | null;
  pezzi: number | null;
  con_dubbi: boolean;
}

interface SenzaScheda {
  id: string;
  nome_vino: string;
  produttore: string;
  formato: string;
}

type Scheda = WineAnalysis & {
  categoria: string | null;
  metodo: string | null;
  occasione: string | null;
  dubbi: string | null;
  bottle_image: string | null;
  scan_count: number;
};

interface Bottiglia {
  id: string;
  formato: string;
  quantita: number;
  prezzo: number | null;
}

const GRUPPI: { nome: string; categorie: string[] }[] = [
  { nome: "Vini", categorie: ["vino-rosso", "vino-bianco", "vino-rosato", "vino-frizzante"] },
  { nome: "Champagne e bollicine", categorie: ["champagne", "spumante", "franciacorta"] },
  { nome: "Superalcolici", categorie: ["rum", "grappa", "gin", "whisky", "cognac", "armagnac", "vodka", "tequila", "mezcal"] },
  { nome: "Liquori e amari", categorie: ["liquori", "amaro", "limoncello", "sambuca"] },
  { nome: "Dolci e fortificati", categorie: ["passito", "moscato", "porto", "marsala", "muffato", "vin-santo", "recioto"] },
];
const CLIENTI = "Solo scan dei clienti";
const DUBBI = "Da verificare";
const SENZA = "Senza scheda";
const A_PAGINA = 60;

const etichetta = (categoria: string) => {
  const testo = categoria.replace(/-/g, " ");
  return testo.charAt(0).toUpperCase() + testo.slice(1);
};
const bordo = "1px solid rgba(120,94,20,0.2)";

function Dato({ nome, valore }: { nome: string; valore: string }) {
  return (
    <div>
      <dt className="text-xs" style={{ color: "var(--color-muted)" }}>{nome}</dt>
      <dd style={{ color: "var(--color-text)" }}>{valore}</dd>
    </div>
  );
}

function SchedaAperta({ id, onClose }: { id: string; onClose: () => void }) {
  const [dati, setDati] = useState<{ scheda: Scheda; bottiglie: Bottiglia[] } | null>(null);
  const [errore, setErrore] = useState(false);

  useEffect(() => {
    let annullato = false;
    fetch(`/api/archive?id=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (!annullato) setDati(d);
      })
      .catch(() => {
        if (!annullato) setErrore(true);
      });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      annullato = true;
      window.removeEventListener("keydown", onKey);
    };
  }, [id, onClose]);

  const scheda = dati?.scheda;
  const bottiglie = dati?.bottiglie ?? [];
  const pezzi = bottiglie.reduce((n, b) => n + b.quantita, 0);
  const formati = [...new Set(bottiglie.map((b) => b.formato))];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={scheda?.nome_vino ?? "Scheda"}
      className="fixed inset-0 z-50 overflow-y-auto overscroll-contain"
      style={{ background: "var(--color-bg)", paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)" }}
    >
      <button
        onClick={onClose}
        aria-label="Chiudi la scheda"
        className="fixed right-3 z-10 w-14 h-14 rounded-full flex items-center justify-center text-white"
        style={{ top: "calc(env(safe-area-inset-top) + 8px)", background: "var(--color-bordeaux)" }}
      >
        <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>

      <div className="max-w-2xl mx-auto px-5 md:px-8 grid grid-cols-1 gap-4" style={{ paddingTop: "calc(env(safe-area-inset-top) + 24px)" }}>
        {errore && <p className="py-16 pr-16" style={{ color: "#c0392b" }}>Scheda non caricata: controlla la connessione.</p>}
        {!errore && !scheda && <p className="py-16 pr-16" style={{ color: "var(--color-muted)" }}>Caricamento…</p>}
        {scheda && (
          <>
            <div className="flex gap-2 pr-16">
              {bottiglie[0]
                ? ["fronte", "retro"].map((lato) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={lato}
                      src={`/api/stock/photo?id=${bottiglie[0].id}&lato=${lato}`}
                      alt={`${lato === "retro" ? "Retro" : "Fronte"} della bottiglia`}
                      className="w-32 md:w-44 h-48 md:h-64 rounded-lg object-cover"
                      style={{ background: "rgba(120,94,20,0.08)" }}
                    />
                  ))
                : scheda.bottle_image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={scheda.bottle_image} alt={scheda.nome_vino} className="h-48 md:h-64 rounded-lg object-contain" />
                  )}
            </div>

            <WineCard wine={scheda} />

            <dl className="rounded-xl p-4 md:p-6 grid grid-cols-2 gap-4 text-sm" style={{ background: "var(--color-surface)", border: bordo }}>
              {scheda.categoria && <Dato nome="Categoria" valore={etichetta(scheda.categoria)} />}
              {scheda.metodo && <Dato nome="Metodo" valore={scheda.metodo} />}
              {scheda.occasione && <Dato nome="Occasione" valore={scheda.occasione} />}
              {scheda.annata && <Dato nome="Annata" valore={scheda.annata} />}
              <Dato nome="In magazzino" valore={bottiglie.length ? `${pezzi} ${pezzi === 1 ? "bottiglia" : "bottiglie"}` : "Non registrata"} />
              {formati.length > 0 && <Dato nome="Formati" valore={formati.join(", ")} />}
              <Dato nome="Scan dei clienti" valore={String(scheda.scan_count)} />
            </dl>

            {scheda.testo_etichetta && (
              <div className="rounded-xl p-4 md:p-6 text-sm" style={{ background: "var(--color-surface)", border: bordo }}>
                <p className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>Testo letto sull&apos;etichetta</p>
                <p className="whitespace-pre-wrap break-words" style={{ color: "var(--color-text)" }}>{scheda.testo_etichetta}</p>
              </div>
            )}
            {scheda.dubbi && (
              <p className="rounded-xl p-4 text-sm" style={{ border: "1px solid #c0392b", color: "#c0392b" }}>Da controllare: {scheda.dubbi}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ArchiveContent() {
  const router = useRouter();
  const [righe, setRighe] = useState<Riga[]>([]);
  const [senzaScheda, setSenzaScheda] = useState<SenzaScheda[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [gruppo, setGruppo] = useState<string | null>(null);
  const [mostrate, setMostrate] = useState(A_PAGINA);
  const [aperta, setAperta] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/archive")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) {
          setError(data.error);
        } else {
          setRighe(data.wines || []);
          setSenzaScheda(data.senzaScheda || []);
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

  const inGruppo = (r: Riga, nome: string) =>
    nome === DUBBI ? r.con_dubbi : nome === CLIENTI ? r.origine !== "magazzino" : GRUPPI.find((g) => g.nome === nome)?.categorie.includes(r.categoria ?? "") ?? false;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return righe.filter(
      (r) =>
        (!gruppo || inGruppo(r, gruppo)) &&
        (!q ||
          [r.nome_vino, r.produttore, r.regione, r.paese, r.denominazione, r.categoria?.replace(/-/g, " ")].some((v) =>
            (v || "").toLowerCase().includes(q)
          ))
    );
  }, [righe, search, gruppo]);

  const daMagazzino = righe.filter((r) => r.origine === "magazzino").length;
  const filtri = [
    { nome: null as string | null, n: righe.length },
    ...GRUPPI.map((g) => ({ nome: g.nome as string | null, n: righe.filter((r) => inGruppo(r, g.nome)).length })),
    { nome: CLIENTI as string | null, n: righe.length - daMagazzino },
    { nome: DUBBI as string | null, n: righe.filter((r) => r.con_dubbi).length },
    { nome: SENZA as string | null, n: senzaScheda.length },
  ];

  const scegli = (nome: string | null) => {
    setGruppo(nome);
    setMostrate(A_PAGINA);
  };
  const chiudi = useMemo(() => () => setAperta(null), []);

  return (
    <div
      className="min-h-dvh"
      style={{
        background: "var(--color-bg)",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {aperta && <SchedaAperta id={aperta} onClose={chiudi} />}

      {/* Header */}
      <div className="sticky top-0 z-10" style={{ background: "var(--color-bg)", borderBottom: "1px solid rgba(120,94,20,0.15)" }}>
        <div className="max-w-4xl mx-auto px-5 md:px-8 py-4 flex items-center gap-4">
          <button
            onClick={() => router.push("/admin")}
            className="shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg"
            style={{ color: "var(--color-text)" }}
            aria-label="Torna ad Admin"
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
              Archivio schede
            </h1>
            <p className="text-xs md:text-sm" style={{ color: "var(--color-muted)" }}>
              {daMagazzino} schede del magazzino, {righe.length - daMagazzino} solo dagli scan dei clienti
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="max-w-4xl mx-auto px-5 md:px-8 pb-3 grid gap-2">
          <input
            type="search"
            placeholder="Cerca per nome, produttore, regione, tipo…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setMostrate(A_PAGINA);
            }}
            className="w-full py-2 px-3 rounded-lg outline-none text-base"
            style={{ background: "var(--color-surface)", border: bordo, color: "var(--color-text)" }}
          />
          <div className="flex flex-wrap gap-2">
            {filtri.map((f) => (
              <button
                key={f.nome ?? "tutte"}
                onClick={() => scegli(f.nome)}
                aria-pressed={gruppo === f.nome}
                className="min-h-[44px] px-3 rounded-lg text-sm"
                style={
                  gruppo === f.nome
                    ? { background: "var(--color-bordeaux)", color: "#fff" }
                    : { border: "1px solid rgba(120,94,20,0.3)", color: "var(--color-text)" }
                }
              >
                {f.nome ?? "Tutte"} ({f.n})
              </button>
            ))}
          </div>
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

        {!loading && !error && gruppo === SENZA && (
          <ul className="grid grid-cols-1 gap-3">
            {senzaScheda.map((s) => (
              <li key={s.id} className="flex items-center gap-4 rounded-xl p-3" style={{ background: "var(--color-surface)", border: bordo }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/stock/photo?id=${s.id}`}
                  alt="Fronte della bottiglia"
                  loading="lazy"
                  decoding="async"
                  className="shrink-0 w-16 h-20 rounded-lg object-cover"
                  style={{ background: "rgba(120,94,20,0.06)" }}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium" style={{ color: "var(--color-text)" }}>
                    {s.nome_vino || s.produttore || "Etichetta non letta"}
                  </p>
                  <p className="text-sm" style={{ color: "#c0392b" }}>Scheda da creare: controlla il nome in Magazzino.</p>
                </div>
                <button onClick={() => router.push("/magazzino")} className="shrink-0 min-h-[44px] px-3 rounded-lg text-sm" style={{ border: "1px solid rgba(120,94,20,0.3)", color: "var(--color-text)" }}>
                  Magazzino
                </button>
              </li>
            ))}
          </ul>
        )}

        {!loading && !error && gruppo !== SENZA && filtered.length === 0 && (
          <p className="text-center py-16" style={{ color: "var(--color-muted)" }}>
            Nessun risultato.
          </p>
        )}

        {!loading && !error && gruppo !== SENZA && filtered.length > 0 && (
          <>
            <ul className="grid grid-cols-1 gap-3 md:gap-4">
              {filtered.slice(0, mostrate).map((w) => (
                <li key={w.id}>
                  <button
                    onClick={() => setAperta(w.id)}
                    className="w-full text-left flex items-stretch gap-4 rounded-xl p-3 md:p-4"
                    style={{ background: "var(--color-surface)", border: "1px solid rgba(120,94,20,0.15)" }}
                  >
                    <span className="shrink-0 w-16 h-20 md:w-20 md:h-24 rounded-lg overflow-hidden block" style={{ background: "rgba(120,94,20,0.06)" }}>
                      {(w.foto_id || w.bottle_image) && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={w.foto_id ? `/api/stock/photo?id=${w.foto_id}` : w.bottle_image!}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      )}
                    </span>
                    <span className="flex-1 min-w-0 flex flex-col justify-between">
                      <span>
                        <span className="block text-base md:text-lg font-bold leading-tight" style={{ color: "var(--color-gold)", fontFamily: "var(--font-playfair)" }}>
                          {w.nome_vino}
                        </span>
                        <span className="block text-xs md:text-sm mt-1 truncate" style={{ color: "var(--color-muted)" }}>
                          {[w.produttore, w.annata].filter(Boolean).join(", ")}
                        </span>
                        {(w.regione || w.paese || w.denominazione) && (
                          <span className="block text-xs mt-0.5 truncate" style={{ color: "var(--color-muted)" }}>
                            {[w.denominazione, w.regione, w.paese].filter(Boolean).join(", ")}
                          </span>
                        )}
                      </span>
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs" style={{ color: "var(--color-muted)" }}>
                        {w.categoria && <span style={{ color: "var(--color-bordeaux)" }}>{etichetta(w.categoria)}</span>}
                        {w.formati && <span>{w.formati.join(", ")}</span>}
                        {w.scan_count > 0 && <span>{w.scan_count === 1 ? "1 scan cliente" : `${w.scan_count} scan clienti`}</span>}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {filtered.length > mostrate && (
              <button
                onClick={() => setMostrate((n) => n + A_PAGINA)}
                className="w-full min-h-[52px] mt-4 rounded-xl font-medium"
                style={{ border: "1px solid rgba(120,94,20,0.3)", color: "var(--color-text)" }}
              >
                Mostra altre ({filtered.length - mostrate})
              </button>
            )}
          </>
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
