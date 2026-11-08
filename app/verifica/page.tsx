"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Gate from "@/components/Gate";
import { OPERATORI } from "@/lib/types";

interface Voce {
  id: string;
  nome_vino: string;
  produttore: string | null;
  annata: string | null;
  verificata_da: string | null;
  verificata_il: string | null;
  controllata: boolean;
  errori: number;
  gravi: number;
}

interface Controllo {
  campo: string;
  esito: string;
  gravita: string;
  valore_corretto: string;
  fonte_url: string;
  tipo_fonte: string;
  citazione: string;
  nota: string;
}

interface Scheda {
  id: string;
  nome_vino: string;
  produttore: string;
  annata: string;
  denominazione: string;
  vitigni: string[];
  gradazione: string;
  temperatura_servizio: string;
  abbinamenti: string[];
  descrizione: string;
  bottle_image: string | null;
  verificati: Record<string, { da?: string; il?: string }>;
  verificata_da: string | null;
  verificata_il: string | null;
  risultato: { campi: Controllo[] } | null;
}

interface Bottiglia {
  id: string;
  formato: string;
  fronte: boolean;
  retro: boolean;
}

type Filtro = "errori" | "da" | "fatte" | "tutte";

const CAMPI: { campo: string; nome: string; elenco?: boolean; lungo?: boolean }[] = [
  { campo: "produttore", nome: "Produttore" },
  { campo: "denominazione", nome: "Denominazione" },
  { campo: "annata", nome: "Annata" },
  { campo: "vitigni", nome: "Vitigni", elenco: true },
  { campo: "gradazione", nome: "Gradazione" },
  { campo: "temperatura_servizio", nome: "Temperatura", lungo: true },
  { campo: "abbinamenti", nome: "Abbinamenti", elenco: true },
  { campo: "descrizione", nome: "Descrizione", lungo: true },
];

const cardStyle = { background: "var(--color-surface)", border: "1px solid rgba(120,94,20,0.2)" };
const inputStyle = { background: "#fff", border: "1px solid var(--color-border, #E0DCD4)", color: "var(--color-text)" };

const filtroDi = (v: Voce): Filtro => (v.verificata_il ? "fatte" : v.errori > 0 ? "errori" : "da");
const dataBreve = (s: string) => new Date(s).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
const sito = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};
const comeTesto = (v: unknown) => (Array.isArray(v) ? v.join(", ") : typeof v === "string" ? v : "");

function Esito({ c }: { c?: Controllo }) {
  if (!c) return <span className="text-xs" style={{ color: "var(--color-muted)" }}>Non controllato</span>;
  const tipi: Record<string, [string, string, string]> = {
    corretto: ["giusto", "#E6EFE3", "#2F5D2A"],
    errato: [c.gravita === "grave" ? "da correggere, grave" : "da correggere", "#F6E3E1", "#8B1A1A"],
    mancante: ["manca nella scheda", "#EEEEEE", "#555555"],
    non_verificabile: ["nessuna fonte trovata", "#EEEEEE", "#555555"],
    editoriale: ["consiglio, non un dato", "#F3ECDD", "#785E14"],
  };
  const [testo, bg, fg] = tipi[c.esito] || [c.esito, "#EEEEEE", "#555555"];
  return (
    <div className="grid gap-1">
      <span className="justify-self-start text-xs rounded-md px-2 py-0.5" style={{ background: bg, color: fg }}>{testo}</span>
      {c.citazione && <span className="text-xs" style={{ color: "var(--color-muted)" }}>«{c.citazione}»</span>}
      {c.esito === "errato" && c.nota && <span className="text-xs" style={{ color: "var(--color-muted)" }}>{c.nota}</span>}
      {c.fonte_url ? (
        <a href={c.fonte_url} target="_blank" rel="noopener noreferrer" className="text-xs underline" style={{ color: "var(--color-gold)" }}>
          {sito(c.fonte_url) || "fonte"}
        </a>
      ) : c.tipo_fonte === "etichetta" ? (
        <span className="text-xs" style={{ color: "var(--color-gold)" }}>dall&apos;etichetta</span>
      ) : null}
    </div>
  );
}

function Dettaglio({ id, chi, setChi, onFatto, onIndietro }: {
  id: string;
  chi: string | null;
  setChi: (n: string) => void;
  onFatto: () => void;
  onIndietro: () => void;
}) {
  const [scheda, setScheda] = useState<Scheda | null>(null);
  const [bottiglie, setBottiglie] = useState<Bottiglia[]>([]);
  const [valori, setValori] = useState<Record<string, string>>({});
  const [stato, setStato] = useState<"carica" | "pronta" | "salva" | "errore">("carica");

  // Remounted for each card (key), so it starts empty and loading.
  useEffect(() => {
    fetch(`/api/verifica?id=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        setScheda(d.scheda);
        setBottiglie(d.bottiglie || []);
        setValori(Object.fromEntries(CAMPI.map(({ campo }) => [campo, comeTesto(d.scheda[campo])])));
        setStato("pronta");
      })
      .catch(() => setStato("errore"));
  }, [id]);

  const controllo = (campo: string) => scheda?.risultato?.campi.find((c) => c.campo === campo);
  const conFronte = bottiglie.find((b) => b.fronte);
  const conRetro = bottiglie.find((b) => b.retro);
  const formati = [...new Set(bottiglie.map((b) => b.formato))].join(", ");

  const salva = async (riapri = false) => {
    if (!chi || !scheda) return;
    setStato("salva");
    const corpo = riapri
      ? { id, chi, riapri: true }
      : {
          id,
          chi,
          valori: Object.fromEntries(
            CAMPI.map(({ campo, elenco }) => [campo, elenco ? valori[campo].split(",").map((s) => s.trim()).filter(Boolean) : valori[campo]])
          ),
        };
    const res = await fetch("/api/verifica", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }).catch(() => null);
    if (res?.ok) onFatto();
    else setStato("errore");
  };

  if (stato === "carica" && !scheda) return <p className="text-sm" style={{ color: "var(--color-muted)" }}>Apro la scheda…</p>;
  if (!scheda) return <p className="text-sm" style={{ color: "#c0392b" }}>Scheda non caricata: controlla la connessione.</p>;

  const foto = (src: string | null, testo: string) => (
    <figure className="m-0 text-center">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={`${scheda.nome_vino}, ${testo}`} className="h-36 w-auto rounded-lg object-contain bg-white" />
      ) : (
        <div className="h-36 w-24 rounded-lg flex items-center justify-center text-xs" style={{ border: "1px dashed var(--color-border, #E0DCD4)", color: "var(--color-muted)" }}>
          nessuna foto
        </div>
      )}
      <figcaption className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>{testo}</figcaption>
    </figure>
  );

  return (
    <section className="rounded-2xl p-4 md:p-5 grid gap-4" style={cardStyle}>
      <button onClick={onIndietro} className="justify-self-start min-h-[44px] text-sm" style={{ color: "var(--color-muted)" }}>
        ← Elenco
      </button>
      <div>
        <h2 className="text-2xl font-medium" style={{ fontFamily: "var(--font-playfair)", color: "var(--color-bordeaux)" }}>{scheda.nome_vino}</h2>
        <p className="text-sm mt-1" style={{ color: "var(--color-muted)" }}>
          {[scheda.produttore, scheda.annata, formati].filter(Boolean).join(" · ")}
        </p>
        {scheda.verificata_il && (
          <p className="text-sm mt-2" style={{ color: "#2F5D2A" }}>
            Verificata da {scheda.verificata_da} il {dataBreve(scheda.verificata_il)}
          </p>
        )}
      </div>
      <div className="flex gap-3 flex-wrap">
        {foto(conFronte ? `/api/stock/photo?id=${conFronte.id}` : null, "fronte")}
        {foto(conRetro ? `/api/stock/photo?id=${conRetro.id}&lato=retro` : null, "retro")}
        {foto(scheda.bottle_image, "foto per i clienti")}
      </div>

      <div className="grid gap-3">
        {CAMPI.map(({ campo, nome, elenco, lungo }) => {
          const c = controllo(campo);
          const proposta = c?.esito === "errato" && c.valore_corretto ? c.valore_corretto : "";
          const fatto = scheda.verificati[campo]?.da;
          return (
            <div key={campo} className="rounded-xl p-3 grid gap-2 bg-white" style={{ border: "1px solid var(--color-border, #E0DCD4)" }}>
              <div className="flex justify-between gap-3 items-baseline">
                <span className="font-medium">{nome}</span>
                {fatto && <span className="text-xs" style={{ color: "#2F5D2A" }}>controllato da {fatto}</span>}
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <p className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>Nella scheda</p>
                  <p className="text-sm">{comeTesto(scheda[campo as keyof Scheda]) || "vuoto"}</p>
                </div>
                <div>
                  <p className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>Controllo automatico</p>
                  <Esito c={c} />
                </div>
              </div>
              {proposta && (
                <div className="flex gap-2 items-center flex-wrap text-sm rounded-lg p-2" style={{ background: "#F6E3E1" }}>
                  <span>Proposta: {proposta}</span>
                  <button onClick={() => setValori((v) => ({ ...v, [campo]: proposta }))} className="min-h-[44px] px-3 rounded-lg text-sm underline" style={{ color: "var(--color-bordeaux)" }}>
                    Usa la proposta
                  </button>
                </div>
              )}
              <label className="grid gap-1">
                <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                  Valore giusto{elenco ? ", separati da virgola" : ""}
                </span>
                {lungo ? (
                  <textarea value={valori[campo] ?? ""} onChange={(e) => setValori((v) => ({ ...v, [campo]: e.target.value }))} rows={campo === "descrizione" ? 4 : 2} className="rounded-lg p-2 text-base" style={inputStyle} />
                ) : (
                  <input value={valori[campo] ?? ""} onChange={(e) => setValori((v) => ({ ...v, [campo]: e.target.value }))} className="rounded-lg px-2 min-h-[44px] text-base" style={inputStyle} />
                )}
              </label>
            </div>
          );
        })}
        <div className="rounded-xl p-3 grid gap-2 bg-white" style={{ border: "1px solid var(--color-border, #E0DCD4)" }}>
          <span className="font-medium">Formato</span>
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <p className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>In magazzino</p>
              <p className="text-sm">{formati || "nessuna bottiglia"}</p>
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>Controllo automatico</p>
              <Esito c={controllo("formato")} />
            </div>
          </div>
          <p className="text-xs" style={{ color: "var(--color-muted)" }}>Il formato si corregge dal Magazzino, dopo averlo guardato sullo scaffale.</p>
        </div>
      </div>

      <div className="flex gap-2 items-center flex-wrap">
        <span className="text-sm" style={{ color: "var(--color-muted)" }}>Chi verifica:</span>
        {OPERATORI.map((n) => (
          <button
            key={n}
            onClick={() => setChi(n)}
            aria-pressed={chi === n}
            className="min-h-[44px] px-4 rounded-full text-sm"
            style={chi === n ? { background: "var(--color-gold)", color: "#fff" } : { border: "1px solid var(--color-border, #E0DCD4)" }}
          >
            {n}
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          {scheda.verificata_il && (
            <button onClick={() => salva(true)} disabled={!chi || stato === "salva"} className="min-h-[52px] px-4 rounded-xl text-sm disabled:opacity-50" style={{ border: "1px solid var(--color-border, #E0DCD4)" }}>
              Riapri
            </button>
          )}
          <button onClick={() => salva()} disabled={!chi || stato === "salva"} className="min-h-[52px] px-5 rounded-xl font-medium text-white disabled:opacity-50" style={{ background: "var(--color-bordeaux)" }}>
            {stato === "salva" ? "Salvo…" : "Segna come verificata"}
          </button>
        </div>
      </div>
      {!chi && <p className="text-sm" style={{ color: "var(--color-muted)" }}>Scegli chi verifica per salvare.</p>}
      {stato === "errore" && <p className="text-sm" style={{ color: "#c0392b" }}>Non salvata: controlla la connessione e riprova.</p>}
    </section>
  );
}

function Verifica() {
  const router = useRouter();
  const [voci, setVoci] = useState<Voce[]>([]);
  const [filtro, setFiltro] = useState<Filtro>("errori");
  const [cerca, setCerca] = useState("");
  const [aperta, setAperta] = useState<string | null>(null);
  const [chi, setChi] = useState<string | null>(null);
  const [errore, setErrore] = useState(false);
  const [caricato, setCaricato] = useState(false);

  const carica = useCallback(
    () =>
      fetch("/api/verifica", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d) => {
          setVoci(d.schede || []);
          setErrore(false);
          setCaricato(true);
          return (d.schede || []) as Voce[];
        })
        .catch(() => {
          setErrore(true);
          return [] as Voce[];
        }),
    []
  );

  useEffect(() => {
    carica();
  }, [carica]);

  const conta = useMemo(() => {
    const n = { errori: 0, da: 0, fatte: 0, tutte: voci.length };
    for (const v of voci) n[filtroDi(v)]++;
    return n;
  }, [voci]);

  const elenco = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    return voci
      .filter((v) => filtro === "tutte" || filtroDi(v) === filtro)
      .filter((v) => !q || `${v.nome_vino} ${v.produttore || ""}`.toLowerCase().includes(q))
      .sort((a, b) => (filtro === "errori" ? b.gravi - a.gravi || b.errori - a.errori : 0));
  }, [voci, filtro, cerca]);

  // After saving, the next card of the same list opens: checking goes on without going back.
  const fatto = async () => {
    const i = elenco.findIndex((v) => v.id === aperta);
    const prossima = elenco.filter((v) => v.id !== aperta)[Math.max(i, 0)];
    await carica();
    setAperta(prossima?.id ?? null);
    window.scrollTo({ top: 0 });
  };

  const chip = (f: Filtro, nome: string) => (
    <button
      key={f}
      onClick={() => setFiltro(f)}
      aria-pressed={filtro === f}
      className="min-h-[44px] px-4 rounded-full text-sm"
      style={filtro === f ? { background: "var(--color-bordeaux)", color: "#fff" } : { border: "1px solid var(--color-border, #E0DCD4)" }}
    >
      {nome} ({conta[f]})
    </button>
  );

  return (
    <main className="min-h-screen p-4" style={{ background: "var(--color-bg)", color: "var(--color-text)" }}>
      <div className="max-w-3xl mx-auto grid gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/admin")} className="min-h-[44px] pr-3 text-sm" style={{ color: "var(--color-muted)" }}>
            ← Admin
          </button>
          <h1 className="text-2xl font-medium">Verifica schede</h1>
        </div>
        {errore && <p className="text-sm" style={{ color: "#c0392b" }}>Dati non caricati: controlla la connessione.</p>}
        {aperta ? (
          <Dettaglio key={aperta} id={aperta} chi={chi} setChi={setChi} onFatto={fatto} onIndietro={() => setAperta(null)} />
        ) : (
          <>
            <p className="text-sm" style={{ color: "var(--color-muted)" }}>
              Ogni scheda è stata confrontata in automatico con le fonti dei produttori. Una scheda verificata da voi mostra ai clienti anche i vitigni.
            </p>
            <div className="flex gap-2 flex-wrap">
              {chip("errori", "Con errori")}
              {chip("da", "Da verificare")}
              {chip("fatte", "Verificate")}
              {chip("tutte", "Tutte")}
            </div>
            <input
              value={cerca}
              onChange={(e) => setCerca(e.target.value)}
              placeholder="Cerca un vino o un produttore"
              aria-label="Cerca un vino o un produttore"
              className="rounded-lg px-3 min-h-[44px] text-base"
              style={inputStyle}
            />
            <ul className="grid gap-2">
              {elenco.map((v) => (
                <li key={v.id}>
                  <button onClick={() => setAperta(v.id)} className="w-full min-h-[64px] rounded-xl p-3 text-left flex justify-between gap-3 items-center" style={cardStyle}>
                    <span>
                      <span className="block font-medium">{v.nome_vino}</span>
                      <span className="block text-sm" style={{ color: "var(--color-muted)" }}>{[v.produttore, v.annata].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="text-xs text-right shrink-0" style={{ color: v.verificata_il ? "#2F5D2A" : v.errori ? "#8B1A1A" : "var(--color-muted)" }}>
                      {v.verificata_il
                        ? `verificata da ${v.verificata_da}`
                        : v.errori
                          ? v.gravi === v.errori
                            ? `${v.errori} ${v.errori === 1 ? "grave" : "gravi"} da correggere`
                            : `${v.errori} da correggere, ${v.gravi || "nessuno"} ${v.gravi === 1 ? "grave" : "gravi"}`
                          : v.controllata
                            ? "nessun errore trovato"
                            : "non controllata"}
                    </span>
                  </button>
                </li>
              ))}
              {!caricato && !errore && <p className="text-sm" style={{ color: "var(--color-muted)" }}>Carico le schede…</p>}
              {caricato && !elenco.length && <p className="text-sm" style={{ color: "var(--color-muted)" }}>Nessuna scheda in questo elenco.</p>}
            </ul>
          </>
        )}
      </div>
    </main>
  );
}

export default function VerificaPage() {
  return (
    <Gate scope="admin" title="Verifica schede" subtitle="Area riservata. Inserisci il PIN amministratore." showBackLink>
      <Verifica />
    </Gate>
  );
}
