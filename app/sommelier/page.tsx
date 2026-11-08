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

const SCELTE = ["carne", "pesce", "pizza", "formaggi", "aperitivo", "regalo", "dopocena"] as const;
// After a gift or after dinner the body of the wine is not the question: advice comes at once.
const SENZA_GUSTO = new Set(["regalo", "dopocena"]);

type Riconoscimento = { lang: string; interimResults: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void; start: () => void; stop: () => void };

export default function SommelierPage() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [scelta, setScelta] = useState<string | null>(null);
  const [testo, setTesto] = useState("");
  const [chiediGusto, setChiediGusto] = useState(false);
  const [stato, setStato] = useState<"scegli" | "carica" | "pronto" | "errore" | "nessuno">("scegli");
  const [intro, setIntro] = useState("");
  const [consigli, setConsigli] = useState<Consiglio[]>([]);
  const [visti, setVisti] = useState<string[]>([]);
  const [ascolta, setAscolta] = useState(false);
  const [puoDettare, setPuoDettare] = useState(false);
  const ultima = useRef<{ scelta?: string; gusto?: string; testo?: string }>({});
  const voce = useRef<Riconoscimento | null>(null);
  const risultati = useRef<HTMLDivElement>(null);
  const lang = i18n.language.startsWith("en") ? "en" : "it";

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    // Read after mount: the server render has no window, and the check must not differ between the two.
    const id = requestAnimationFrame(() => setPuoDettare(!!(w.SpeechRecognition || w.webkitSpeechRecognition)));
    return () => cancelAnimationFrame(id);
  }, []);

  const chiedi = async (richiesta: { scelta?: string; gusto?: string; testo?: string }, altri = false) => {
    ultima.current = richiesta;
    setChiediGusto(false);
    setStato("carica");
    const escludi = altri ? visti : [];
    try {
      const res = await fetch("/api/sommelier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...richiesta, lang, escludi }),
      });
      if (res.status === 401) return window.location.reload();
      if (res.status === 404) return setStato("nessuno");
      if (!res.ok) throw new Error();
      const d = await res.json();
      setIntro(d.intro);
      setConsigli(d.consigli);
      setVisti((v) => [...(altri ? v : []), ...d.consigli.map((c: Consiglio) => c.id)]);
      setStato("pronto");
      requestAnimationFrame(() => risultati.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch {
      setStato("errore");
    }
  };

  const tocca = (s: string) => {
    setScelta(s);
    if (SENZA_GUSTO.has(s)) return chiedi({ scelta: s, testo: testo.trim() || undefined });
    setChiediGusto(true);
    setStato("scegli");
  };

  const invia = () => {
    if (!testo.trim()) return;
    setChiediGusto(true);
    setStato("scegli");
  };

  const gusto = (g: string) => chiedi({ scelta: scelta || undefined, gusto: g === "voi" ? undefined : g, testo: testo.trim() || undefined });

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
    router.push("/result");
  };

  const chip = (attivo: boolean) =>
    attivo
      ? { background: "var(--color-bordeaux)", color: "#fff", border: "1px solid var(--color-bordeaux)" }
      : { background: "#fff", color: "var(--color-text)", border: "1px solid var(--color-border)" };

  return (
    <main
      className="min-h-dvh px-5 md:px-10"
      style={{ background: "var(--color-bg)", paddingTop: "calc(env(safe-area-inset-top) + 16px)", paddingBottom: "calc(env(safe-area-inset-bottom) + 32px)" }}
    >
      <LanguageToggle />
      <div className="max-w-2xl mx-auto">
        <button onClick={() => router.push("/")} className="min-h-[44px] pr-3 text-sm" style={{ color: "var(--color-muted)" }}>
          ← {t("sommelier.back")}
        </button>
        <h1 className="text-4xl md:text-5xl font-semibold mt-4" style={{ fontFamily: "var(--font-playfair)", color: "var(--color-gold)", textWrap: "balance" }}>
          {t("sommelier.title")}
        </h1>
        <p className="text-base md:text-lg mt-2 mb-6 max-w-md" style={{ color: "var(--color-muted)" }}>{t("sommelier.sub")}</p>

        <div className="flex flex-wrap gap-2.5">
          {SCELTE.map((s) => (
            <button key={s} onClick={() => tocca(s)} aria-pressed={scelta === s} className="min-h-[48px] px-5 rounded-full text-base" style={chip(scelta === s)}>
              {t(`sommelier.choices.${s}`)}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            invia();
          }}
          className="flex items-center gap-2 mt-4 rounded-2xl p-1.5 pl-4"
          style={{ border: "1px solid var(--color-border)" }}
        >
          <input
            value={testo}
            onChange={(e) => setTesto(e.target.value)}
            placeholder={ascolta ? t("sommelier.listening") : t("sommelier.placeholder")}
            aria-label={t("sommelier.placeholder")}
            enterKeyHint="send"
            className="flex-1 min-w-0 min-h-[48px] text-base bg-transparent outline-none"
            style={{ color: "var(--color-text)" }}
          />
          {puoDettare && (
            <button type="button" onClick={detta} aria-label={t("sommelier.dictate")} aria-pressed={ascolta} className="w-12 h-12 rounded-xl grid place-items-center shrink-0" style={{ background: ascolta ? "var(--color-bordeaux)" : "var(--color-surface)", color: ascolta ? "#fff" : "var(--color-bordeaux)" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
            </button>
          )}
          {testo.trim() && (
            <button type="submit" className="min-h-[48px] px-4 rounded-xl text-base font-medium text-white shrink-0" style={{ background: "var(--color-bordeaux)" }}>
              {t("sommelier.send")}
            </button>
          )}
        </form>

        {chiediGusto && (
          <div className="mt-6">
            <p className="text-sm mb-2.5" style={{ color: "var(--color-muted)" }}>{t("sommelier.taste_q")}</p>
            <div className="flex flex-wrap gap-2.5">
              {(["leggero", "importante", "voi"] as const).map((g) => (
                <button key={g} onClick={() => gusto(g)} className="min-h-[48px] px-5 rounded-full text-base" style={chip(false)}>
                  {t(`sommelier.taste.${g}`)}
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={risultati} className="scroll-mt-4">
          {stato === "carica" && (
            <p className="mt-10 text-base animate-pulse" style={{ color: "var(--color-gold)" }}>{t("sommelier.loading")}</p>
          )}
          {stato === "errore" && <p className="mt-8 text-base" style={{ color: "#c0392b" }}>{t("sommelier.error")}</p>}
          {stato === "nessuno" && <p className="mt-8 text-base" style={{ color: "var(--color-muted)" }}>{t("sommelier.none")}</p>}
          {stato === "pronto" && (
            <section className="mt-8">
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <h2 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-playfair)" }}>{t("sommelier.advice")}</h2>
                <span className="text-sm shrink-0" style={{ color: "var(--color-muted)" }}>{t("sommelier.in_shop")}</span>
              </div>
              {intro && <p className="text-base mb-4" style={{ color: "var(--color-muted)" }}>{intro}</p>}
              <ul className="grid gap-3">
                {consigli.map((c) => (
                  <li key={c.id}>
                    <button onClick={() => apri(c)} className="w-full flex gap-4 items-center rounded-2xl p-4 text-left" style={{ background: "var(--color-surface)", border: "1px solid rgba(120,94,20,0.2)" }}>
                      <div className="w-16 h-32 shrink-0 grid place-items-center">
                        {c.bottle_image && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.bottle_image} alt="" className="max-h-32 max-w-16 object-contain" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>{c.nome_vino}</p>
                        <p className="text-sm mb-2" style={{ color: "var(--color-muted)" }}>
                          {[c.produttore, c.annata !== "N.V." ? c.annata : ""].filter(Boolean).join(" · ")}
                        </p>
                        <p className="text-base leading-snug" style={{ color: "var(--color-text)" }}>{c.perche}</p>
                        <span className="block text-sm mt-2" style={{ color: "var(--color-gold)" }}>{t("sommelier.open")} →</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between gap-3 mt-4 flex-wrap">
                <p className="text-sm" style={{ color: "var(--color-muted)" }}>{t("sommelier.counter")}</p>
                <button onClick={() => chiedi(ultima.current, true)} className="min-h-[48px] px-5 rounded-xl text-base" style={chip(false)}>
                  {t("sommelier.more")}
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
