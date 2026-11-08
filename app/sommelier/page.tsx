"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import LanguageToggle from "@/components/LanguageToggle";
import "@/lib/i18n";

interface Consiglio {
  id: string;
  nome_vino: string;
  produttore: string;
  annata: string;
  bottle_image: string | null;
  perche: string;
}

const TAVOLA = ["pesce", "carne", "pizza", "formaggi", "dolci"] as const;
const OCCASIONE = ["aperitivo", "dopocena", "regalo"] as const;
const STILI = ["leggero", "morbido", "intenso", "voi"] as const;
// A gift or an after-dinner bottle is not chosen by body: the style question shows only with food or words.
const SENZA_STILE = new Set(["regalo", "dopocena"]);

// This page's palette: warm paper instead of cold white, ink instead of pure black.
const C = { carta: "#FCFBF8", inchiostro: "#302D28", muto: "#746E65", linea: "#E8E1D6", crema: "#F5F2EB", oro: "var(--color-gold)", vino: "var(--color-bordeaux)" };

function Spunta() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <path d="M5 12.5 10 17 19 7" />
    </svg>
  );
}

function Altoparlante() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />
    </svg>
  );
}

type Riconoscimento = { lang: string; interimResults: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void; start: () => void; stop: () => void };

export default function SommelierPage() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [scelte, setScelte] = useState<string[]>([]);
  const [stile, setStile] = useState<string>("voi");
  const [testo, setTesto] = useState("");
  const [stato, setStato] = useState<"scegli" | "carica" | "pronto" | "errore" | "nessuno">("scegli");
  const [intro, setIntro] = useState("");
  const [consigli, setConsigli] = useState<Consiglio[]>([]);
  const [visti, setVisti] = useState<string[]>([]);
  // True while the advice is still being written: the missing bottles show as empty boxes.
  const [inArrivo, setInArrivo] = useState(false);
  // The advice is taking longer than usual: say so instead of leaving the same line on screen.
  const [lento, setLento] = useState(false);
  const consigliRef = useRef<Consiglio[]>([]);
  // The advice id the voice reads back, and which part is playing: "tutto", a bottle number, or nothing.
  const [consiglioId, setConsiglioId] = useState<number | null>(null);
  const [parla, setParla] = useState<string | null>(null);
  const [voceKo, setVoceKo] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const [ascolta, setAscolta] = useState(false);
  const [puoDettare, setPuoDettare] = useState(false);
  const ultima = useRef<{ scelte?: string[]; gusto?: string; testo?: string }>({});
  const voce = useRef<Riconoscimento | null>(null);
  const risultati = useRef<HTMLDivElement>(null);
  const lang = i18n.language.startsWith("en") ? "en" : "it";
  useEffect(() => {
    consigliRef.current = consigli;
  }, [consigli]);

  // While the advice loads or the voice speaks, the shop iPad must not reset itself for the next customer.
  useEffect(() => {
    document.body.dataset.occupato = inArrivo || parla ? "1" : "";
  }, [inArrivo, parla]);

  useEffect(() => {
    if (!inArrivo) return;
    const id = setTimeout(() => setLento(true), 8000);
    return () => { clearTimeout(id); setLento(false); };
  }, [inArrivo]);

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    // Read after mount: the server render has no window, and the check must not differ between the two.
    const id = requestAnimationFrame(() => setPuoDettare(!!(w.SpeechRecognition || w.webkitSpeechRecognition)));
    return () => cancelAnimationFrame(id);
  }, []);

  // Back from a card: the three bottles come back as they were, not an empty page.
  useEffect(() => {
    if (sessionStorage.getItem("sommelier_torna") !== "1") return;
    let s: { scelte: string[]; stile: string; testo: string; intro: string; consigli: Consiglio[]; visti: string[]; consiglioId: number | null; ultima: typeof ultima.current } | null = null;
    try { s = JSON.parse(sessionStorage.getItem("sommelier_ultimo") || "null"); } catch {}
    if (!s?.consigli?.length) return;
    const ultimo = s;
    const id = requestAnimationFrame(() => {
      sessionStorage.removeItem("sommelier_torna");
      ultima.current = ultimo.ultima;
      setScelte(ultimo.scelte);
      setStile(ultimo.stile);
      setTesto(ultimo.testo);
      setIntro(ultimo.intro);
      setConsigli(ultimo.consigli);
      setVisti(ultimo.visti);
      setConsiglioId(ultimo.consiglioId);
      setStato("pronto");
      // Once the bottles are drawn, land on them rather than on the empty form.
      setTimeout(() => risultati.current?.scrollIntoView({ block: "start" }), 60);
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const chiedi = async (richiesta: { scelte?: string[]; gusto?: string; testo?: string }, altri = false) => {
    ultima.current = richiesta;
    setStato("carica");
    setInArrivo(true);
    const escludi = altri ? visti : [];
    setIntro("");
    setConsigli([]);
    setConsiglioId(null);
    ferma();
    // Straight to the results: the empty cards show at once, so the tap is never left unanswered.
    requestAnimationFrame(() => risultati.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    try {
      const res = await fetch("/api/sommelier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...richiesta, lang, escludi }),
      });
      if (res.status === 401) return window.location.reload();
      if (!res.ok || !res.body) throw new Error();
      // One line per event: each bottle goes on screen as soon as its line arrives.
      const lettore = res.body.getReader();
      const decodifica = new TextDecoder();
      let resto = "";
      let arrivati: Consiglio[] = [];
      let finito = false;
      while (!finito) {
        const { done, value } = await lettore.read();
        if (done) break;
        resto += decodifica.decode(value, { stream: true });
        const righe = resto.split("\n");
        resto = righe.pop() || "";
        for (const riga of righe.filter(Boolean)) {
          const e = JSON.parse(riga);
          if (e.tipo === "intro") setIntro(e.testo);
          if (e.tipo === "consiglio") {
            arrivati = [...arrivati, e.consiglio];
            setConsigli(arrivati);
            if (arrivati.length === 1) setStato("pronto");
          }
          if (e.tipo === "nessuno") return setStato("nessuno");
          if (e.tipo === "errore") throw new Error();
          if (e.tipo === "fine") {
            finito = true;
            setConsiglioId(e.id);
          }
        }
      }
      if (!arrivati.length) throw new Error();
      setVisti((v) => [...(altri ? v : []), ...arrivati.map((c) => c.id)]);
      setInArrivo(false);
      setStato("pronto");
    } catch {
      setInArrivo(false);
      setStato((s) => (s === "pronto" && consigliRef.current.length ? "pronto" : "errore"));
    }
  };

  function ferma() {
    audio.current?.pause();
    audio.current = null;
    setParla(null);
  }

  // Played only on a tap: no sound starts by itself in the shop. The audio element is created
  // inside the tap, which is what Safari needs to allow playback.
  const leggi = (parte: string) => {
    if (parla === parte) return ferma();
    ferma();
    if (!consiglioId) return;
    const a = new Audio(`/api/voce?consiglio=${consiglioId}${parte === "tutto" ? "" : `&n=${parte}`}`);
    audio.current = a;
    setParla(parte);
    setVoceKo(false);
    a.onended = () => audio.current === a && setParla(null);
    a.onerror = () => {
      if (audio.current !== a) return;
      setParla(null);
      setVoceKo(true);
    };
    a.play().catch(() => a.onerror?.(new Event("error")));
  };

  useEffect(() => () => audio.current?.pause(), []);

  const tocca = (s: string) => setScelte((v) => (v.includes(s) ? v.filter((x) => x !== s) : [...v, s]));
  const puoChiedere = scelte.length > 0 || testo.trim().length > 0;
  const conStile = testo.trim().length > 0 || scelte.some((s) => !SENZA_STILE.has(s));
  const invia = () => {
    if (!puoChiedere) return;
    chiedi({ scelte, gusto: conStile && stile !== "voi" ? stile : undefined, testo: testo.trim() || undefined });
  };

  const detta = () => {
    if (ascolta) return voce.current?.stop();
    const w = window as unknown as { SpeechRecognition?: new () => Riconoscimento; webkitSpeechRecognition?: new () => Riconoscimento };
    const R = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!R) return;
    const r = new R();
    r.lang = lang === "en" ? "en-US" : "it-IT";
    r.interimResults = true;
    r.onresult = (e) => setTesto(Array.from(e.results).map((x) => x[0].transcript).join(" "));
    r.onend = () => setAscolta(false);
    voce.current = r;
    setAscolta(true);
    r.start();
  };

  const apri = async (c: Consiglio) => {
    const res = await fetch(`/api/sommelier?id=${encodeURIComponent(c.id)}`).catch(() => null);
    if (!res?.ok) return setStato("errore");
    const d = await res.json();
    // The result page is the scan's: clear what a previous scan left, and don't count this as a scan.
    localStorage.setItem("lastWineAnalysis", JSON.stringify(d));
    localStorage.removeItem("wineBottleImage");
    sessionStorage.removeItem("lastScanThumbnail");
    sessionStorage.removeItem("cronometro");
    sessionStorage.setItem(`scan_saved_${d.it?.nome_vino}_${d.it?.annata}`, "1");
    sessionStorage.setItem("sommelier_ultimo", JSON.stringify({ scelte, stile, testo, intro, consigli, visti, consiglioId, ultima: ultima.current }));
    sessionStorage.setItem("indietro", "/sommelier");
    sessionStorage.setItem("consiglio_perche", c.perche);
    router.push("/result");
  };

  const opzione = (attiva: boolean) => ({
    background: attiva ? C.crema : "#fff",
    color: C.inchiostro,
    border: `1.5px solid ${attiva ? C.vino : C.linea}`,
  });
  const etichetta = "block text-xs font-bold uppercase mb-3";
  const etichettaStile = { color: C.muto, letterSpacing: "0.14em" };

  const opzioni = (voci: readonly string[], gruppo: "choices" | "taste", colonne: string) => (
    <div className={`grid gap-2.5 ${colonne}`}>
      {voci.map((v) => {
        const attiva = gruppo === "choices" ? scelte.includes(v) : stile === v;
        return (
          <button
            key={v}
            onClick={() => (gruppo === "choices" ? tocca(v) : setStile(v))}
            aria-pressed={attiva}
            className="min-h-[56px] px-3 sm:px-4 rounded-[14px] text-[15px] sm:text-base font-medium leading-tight flex items-center justify-between gap-1.5 text-left transition-colors duration-150"
            style={opzione(attiva)}
          >
            <span>{t(`sommelier.${gruppo}.${v}`)}</span>
            {attiva && <span style={{ color: C.vino }}><Spunta /></span>}
          </button>
        );
      })}
    </div>
  );

  return (
    <main
      className="min-h-dvh px-6 md:px-12"
      style={{ background: C.carta, color: C.inchiostro, paddingTop: "calc(env(safe-area-inset-top) + 16px)", paddingBottom: "calc(env(safe-area-inset-bottom) + 40px)" }}
    >
      <LanguageToggle />
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-4 min-h-[44px]">
          <button onClick={() => router.push("/")} className="min-h-[44px] pr-2 text-sm" style={{ color: C.muto }}>
            ← {t("sommelier.back")}
          </button>
          <span className="hidden sm:inline text-xs font-bold uppercase" style={{ color: C.oro, letterSpacing: "0.18em" }}>{t("sommelier.brand")}</span>
        </div>

        <h1 className="mt-8 md:mt-12 text-[40px] md:text-[54px] leading-[1.05] font-medium" style={{ fontFamily: "var(--font-playfair)", color: C.oro, textWrap: "balance" }}>
          {t("sommelier.title")}
        </h1>
        <p className="mt-4 text-[17px] md:text-lg leading-relaxed max-w-[38ch]" style={{ color: C.muto }}>{t("sommelier.sub")}</p>

        <section className="mt-10">
          <h2 className={etichetta} style={etichettaStile}>{t("sommelier.group_table")}</h2>
          {opzioni(TAVOLA, "choices", "grid-cols-3 sm:grid-cols-5")}
        </section>
        <section className="mt-7">
          <h2 className={etichetta} style={etichettaStile}>{t("sommelier.group_occasion")}</h2>
          {opzioni(OCCASIONE, "choices", "grid-cols-3")}
          <p className="mt-2.5 text-sm" style={{ color: C.muto }}>{t("sommelier.multi")}</p>
        </section>
        <section className="mt-7">
          <h2 className={etichetta} style={etichettaStile}>{t("sommelier.group_text")}</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              invia();
            }}
            className="flex items-center gap-2 rounded-[14px] p-1.5 pl-4 bg-white transition-colors duration-150 focus-within:border-[var(--color-bordeaux)]"
            style={{ border: `1.5px solid ${C.linea}` }}
          >
            <input
              value={testo}
              onChange={(e) => setTesto(e.target.value)}
              placeholder={ascolta ? t("sommelier.listening") : t("sommelier.placeholder")}
              aria-label={t("sommelier.placeholder")}
              enterKeyHint="send"
              className="flex-1 min-w-0 min-h-[48px] text-base bg-transparent outline-none"
              style={{ color: C.inchiostro }}
            />
            {puoDettare && (
              <button type="button" onClick={detta} aria-label={t("sommelier.dictate")} aria-pressed={ascolta} className="w-12 h-12 rounded-[10px] grid place-items-center shrink-0 transition-colors duration-150" style={{ background: ascolta ? C.vino : C.crema, color: ascolta ? "#fff" : C.vino }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
              </button>
            )}
          </form>
        </section>

        {conStile && (
          <section className="mt-7">
            <h2 className={etichetta} style={etichettaStile}>{t("sommelier.group_style")}</h2>
            {opzioni(STILI, "taste", "grid-cols-2 sm:grid-cols-4")}
          </section>
        )}

        <button
          onClick={invia}
          disabled={!puoChiedere || inArrivo}
          className="mt-8 w-full min-h-[56px] rounded-[14px] text-base md:text-lg font-medium transition-colors duration-150"
          style={puoChiedere ? { background: C.vino, color: "#fff" } : { background: C.crema, color: C.muto }}
        >
          {inArrivo ? (
            <span className="inline-flex items-center gap-3">
              <span aria-hidden="true" className="w-5 h-5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
              {t("sommelier.searching")}
            </span>
          ) : (
            t("sommelier.send")
          )}
        </button>

        <div ref={risultati} className="scroll-mt-6">
          {stato === "errore" && <p className="mt-8 text-base" style={{ color: "#c0392b" }}>{t("sommelier.error")}</p>}
          {stato === "nessuno" && <p className="mt-8 text-base" style={{ color: C.muto }}>{t("sommelier.none")}</p>}
          {(stato === "pronto" || stato === "carica") && (
            <section className="mt-14">
              <div className="flex items-end justify-between gap-4 flex-wrap">
                <h2 className="text-[30px] md:text-4xl font-medium leading-tight" style={{ fontFamily: "var(--font-playfair)", color: C.inchiostro }}>
                  {t("sommelier.advice")}
                </h2>
                {consiglioId && (
                  <button onClick={() => leggi("tutto")} aria-pressed={parla === "tutto"} className="min-h-[48px] px-4 rounded-[12px] flex items-center gap-2 text-base font-medium transition-colors duration-150" style={parla === "tutto" ? { background: C.vino, color: "#fff", border: `1.5px solid ${C.vino}` } : { background: "#fff", color: C.vino, border: `1.5px solid ${C.vino}` }}>
                    <Altoparlante />
                    {parla === "tutto" ? t("sommelier.stop") : t("sommelier.listen")}
                  </button>
                )}
              </div>
              {intro ? (
                <p className="mt-3 text-[17px] leading-relaxed max-w-[52ch]" style={{ color: C.muto }}>{intro}</p>
              ) : (
                inArrivo && <p className="mt-3 text-[17px] leading-relaxed" style={{ color: C.oro }} role="status">{t(lento ? "sommelier.slow" : "sommelier.loading")}</p>
              )}
              {voceKo && <p className="mt-2 text-sm" style={{ color: "#c0392b" }}>{t("sommelier.voice_error")}</p>}

              <ol className="mt-6 grid gap-3">
                {consigli.map((c, i) => (
                  <li key={c.id} className="rounded-2xl bg-white p-4 md:p-5 flex gap-4 md:gap-5" style={{ border: `1px solid ${C.linea}`, animation: "fadeInUp 0.3s ease both" }}>
                    <button onClick={() => apri(c)} aria-label={`${t("sommelier.open")}: ${c.nome_vino}`} className="w-[84px] md:w-[96px] h-[150px] md:h-[170px] shrink-0 rounded-xl grid place-items-center" style={{ background: C.crema }}>
                      {c.bottle_image && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.bottle_image} alt="" className="max-h-[136px] md:max-h-[156px] max-w-[72px] md:max-w-[84px] object-contain" />
                      )}
                    </button>
                    <div className="min-w-0 flex flex-col">
                      <span className="text-xs font-bold uppercase" style={{ color: C.oro, letterSpacing: "0.14em" }}>{i + 1}</span>
                      <h3 className="mt-1 text-xl font-semibold leading-snug" style={{ color: C.inchiostro }}>{c.nome_vino}</h3>
                      <p className="text-sm mt-0.5" style={{ color: C.muto }}>
                        {[c.produttore, c.annata !== "N.V." ? c.annata : ""].filter(Boolean).join(" · ")}
                      </p>
                      <p className="mt-2.5 text-base leading-relaxed" style={{ color: C.inchiostro }}>{c.perche}</p>
                      <div className="mt-auto pt-3 flex items-center gap-5 flex-wrap">
                        <button onClick={() => apri(c)} className="min-h-[44px] text-[15px] font-medium" style={{ color: C.vino }}>
                          {t("sommelier.open")} →
                        </button>
                        {consiglioId && (
                          <button onClick={() => leggi(String(i + 1))} aria-pressed={parla === String(i + 1)} className="min-h-[44px] flex items-center gap-1.5 text-[15px]" style={{ color: parla === String(i + 1) ? C.vino : C.muto }}>
                            <Altoparlante />
                            {parla === String(i + 1) ? t("sommelier.stop") : t("sommelier.listen_one")}
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
                {inArrivo &&
                  Array.from({ length: Math.max(0, 3 - consigli.length) }, (_, i) => (
                    <li key={`attesa-${i}`} aria-hidden="true" className="rounded-2xl bg-white p-4 md:p-5 flex gap-4 md:gap-5 animate-pulse" style={{ border: `1px solid ${C.linea}` }}>
                      <div className="w-[84px] md:w-[96px] h-[150px] md:h-[170px] shrink-0 rounded-xl" style={{ background: C.crema }} />
                      <div className="grow grid content-start gap-2.5 pt-5">
                        <div className="h-5 w-1/2 rounded" style={{ background: C.crema }} />
                        <div className="h-4 w-1/3 rounded" style={{ background: C.crema }} />
                        <div className="h-4 w-5/6 rounded" style={{ background: C.crema }} />
                      </div>
                    </li>
                  ))}
              </ol>
              <div className="mt-6" style={{ visibility: inArrivo ? "hidden" : "visible" }}>
                <p className="rounded-2xl px-5 py-5 text-center text-xl md:text-2xl leading-snug" style={{ background: C.crema, color: C.inchiostro, fontFamily: "var(--font-playfair)" }}>
                  {t("sommelier.counter")}
                </p>
                <div className="mt-3 text-center">
                  <button onClick={() => chiedi(ultima.current, true)} className="min-h-[48px] px-4 text-base underline underline-offset-4" style={{ color: C.muto }}>
                    {t("sommelier.more")}
                  </button>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
