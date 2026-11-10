"use client";

import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CameraStream from "@/components/CameraStream";
import LoadingWine from "@/components/LoadingWine";
import LanguageToggle from "@/components/LanguageToggle";
import "@/lib/i18n";
import * as cronometro from "@/lib/cronometro";

interface Bottiglia {
  id: string;
  nome_vino: string;
  produttore: string;
  annata: string;
  formati: string | null;
  bottle_image: string | null;
}

export default function ScanPage() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  // The front matched more than one bottle of the shop: the back label decides.
  const [retro, setRetro] = useState<{ fronte: string; dubbio: string[]; bottiglie: Bottiglia[] } | null>(null);
  const [elenco, setElenco] = useState(false);

  // Preview of the back-label step, local only: /scan?anteprima=retro
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" && new URLSearchParams(window.location.search).get("anteprima") === "retro") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the URL is only readable after mount
      setRetro({
        fronte: "",
        dubbio: ["a", "b"],
        bottiglie: [
          { id: "a", nome_vino: "Cuvée Prestige", produttore: "Ca' del Bosco", annata: "N.V.", formati: "750 ml", bottle_image: null },
          { id: "b", nome_vino: "Cuvée Prestige Rosé 46ª Edizione Extra Brut", produttore: "Ca' del Bosco", annata: "N.V.", formati: "750 ml", bottle_image: null },
        ],
      });
    }
  }, []);

  const handleCapture = (base64: string) => {
    setCapturedImage(base64);
  };

  const handleRetake = () => {
    setCapturedImage(null);
  };

  // Downscale a base64 JPEG to a max long-side dimension, return new base64 (no data: prefix).
  // Used to keep feedback thumbnails small enough to store in DB.
  const downscaleImage = async (base64: string, maxSize = 600, quality = 0.72): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(base64);
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve(dataUrl.replace(/^data:image\/\w+;base64,/, ""));
      };
      img.onerror = () => resolve(base64);
      img.src = `data:image/jpeg;base64,${base64}`;
    });
  };

  const lingua = () => (i18n.language.startsWith("en") ? "en" : "it");

  const handleAnalyze = async () => {
    if (!capturedImage) return;
    setIsAnalyzing(true);
    cronometro.avvia();

    // Persist a thumbnail in sessionStorage so the feedback panel on /result can attach it.
    try {
      const thumb = await downscaleImage(capturedImage, 600, 0.72);
      sessionStorage.setItem("lastScanThumbnail", thumb);
    } catch {
      // Non-blocking: feedback will just have no photo if this fails
    }

    // CameraStream already captures at 1400px / q=0.85, the size Claude Vision
    // works with, so the photo goes up as-is. Re-encoding it here would only
    // throw away label detail a second time.
    await invia({ imageBase64: capturedImage, lang: lingua() }, capturedImage);
  };

  // The back label, photographed when the front matched more than one bottle of the shop.
  const handleRetro = async (retroImage: string) => {
    if (!retro) return;
    setIsAnalyzing(true);
    await invia({ imageBase64: retroImage, lang: lingua(), retro: { dubbio: retro.dubbio, fronte: retro.fronte } }, retro.fronte);
  };

  // The customer picked the bottle from the list.
  const handleScegli = async (id: string) => {
    if (!retro) return;
    setElenco(false);
    setIsAnalyzing(true);
    await invia({ imageBase64: retro.fronte, lang: lingua(), scegli: id }, retro.fronte);
  };

  // None of the bottles in the list: the card is written from the front, as before.
  const handleSalta = async () => {
    if (!retro) return;
    setElenco(false);
    setIsAnalyzing(true);
    await invia({ imageBase64: retro.fronte, lang: lingua(), salta: true }, retro.fronte);
  };

  const invia = async (richiesta: Record<string, unknown>, fronte: string) => {
    try {
      const res = await fetch("/api/analyze-wine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(richiesta),
      });

      // Session over: back to the PIN screen, not an error dressed up as a wine card.
      if (res.status === 401) {
        window.location.reload();
        return;
      }

      const data = await res.json();
      // The front fits more than one bottle of the shop: ask for the back.
      if (res.ok && data.retro?.dubbio) {
        setCapturedImage(null);
        setRetro({ fronte, dubbio: data.retro.dubbio, bottiglie: data.retro.bottiglie || [] });
        setIsAnalyzing(false);
        return;
      }
      if (res.ok) {
        const scheda = data.it || data.en;
        cronometro.rispostaArrivata({
          fonte: res.headers.get("x-fonte") || "completo",
          lang: data.it ? "it" : "en",
          vino: [scheda?.nome_vino, scheda?.produttore, scheda?.annata].filter(Boolean).join(" "),
        });
      }
      let bilingualData = null;

      const emptyWine = {
        nome_vino: "",
        produttore: "",
        annata: "",
        regione: "",
        paese: "",
        denominazione: "",
        vitigni: [] as string[],
        gradazione: "",
        temperatura_servizio: "",
        note_visive: "",
        note_olfattive: "",
        note_gustative: "",
        abbinamenti: [] as string[],
        descrizione: data.error || t("error.api_error"),
        confidenza: "nulla" as const,
      };

      if (!res.ok) {
        if (data.data) {
          bilingualData = data.data;
        } else {
          bilingualData = { it: emptyWine, en: { ...emptyWine, descrizione: data.error || "Analysis error" } };
        }
      } else {
        bilingualData = data;
      }

      localStorage.setItem("lastWineAnalysis", JSON.stringify(bilingualData));
      localStorage.removeItem("wineBottleImage"); // Will be fetched on result page
      sessionStorage.removeItem("indietro");
      sessionStorage.removeItem("consiglio_perche");
      router.push("/result");
    } catch {
      setIsAnalyzing(false);
      alert(t("error.api_error"));
    }
  };

  if (isAnalyzing) {
    return <LoadingWine />;
  }

  // Preview dell'immagine catturata
  if (capturedImage) {
    return (
      <div
        className="fixed inset-0 flex flex-col"
        style={{
          background: "var(--color-bg)",
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <LanguageToggle />

        {/* Preview immagine */}
        <div className="flex-1 flex items-center justify-center p-4 md:p-8">
          <img
            src={`data:image/jpeg;base64,${capturedImage}`}
            alt="Preview"
            className="max-w-full max-h-[65vh] md:max-h-[70vh] rounded-lg object-contain"
            style={{ border: "1px solid var(--color-border)" }}
          />
        </div>

        {/* Bottoni azione */}
        <div className="flex gap-4 justify-center px-6 md:px-12 pb-8 max-w-lg mx-auto w-full">
          <button
            onClick={handleRetake}
            className="flex-1 min-h-[52px] py-4 rounded-lg text-base md:text-lg font-medium transition-colors"
            style={{
              border: "1px solid var(--color-border)",
              color: "var(--color-text)",
              background: "transparent",
            }}
          >
            {t("scan.retake")}
          </button>
          <button
            onClick={handleAnalyze}
            className="flex-1 min-h-[52px] py-4 rounded-lg text-base md:text-lg font-medium transition-colors"
            style={{
              background: "var(--color-bordeaux)",
              color: "#FFFFFF",
            }}
          >
            {t("scan.analyze")}
          </button>
        </div>
      </div>
    );
  }

  if (retro && elenco) {
    return (
      <div
        className="fixed inset-0 overflow-y-auto"
        style={{ background: "var(--color-bg)", paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <LanguageToggle />
        <div className="max-w-xl mx-auto px-4 md:px-8 pt-20 pb-10 grid gap-3">
          <h1 className="text-2xl md:text-3xl font-medium mb-2" style={{ color: "var(--color-bordeaux)" }}>{t("scan.retro_list_title")}</h1>
          {retro.bottiglie.map((b) => (
            <button
              key={b.id}
              onClick={() => handleScegli(b.id)}
              className="w-full flex items-center gap-4 p-3 rounded-lg text-left min-h-[88px]"
              style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
            >
              <div className="w-14 h-20 shrink-0 flex items-center justify-center">
                {b.bottle_image && <img src={b.bottle_image} alt="" className="max-h-20 max-w-14 object-contain" />}
              </div>
              <div className="min-w-0">
                <p className="text-base md:text-lg font-medium" style={{ color: "var(--color-text)" }}>{b.nome_vino}</p>
                <p className="text-sm" style={{ color: "var(--color-muted)" }}>
                  {[b.produttore, b.annata, b.formati].filter(Boolean).join(" · ")}
                </p>
              </div>
            </button>
          ))}
          <button
            onClick={handleSalta}
            className="w-full min-h-[52px] rounded-lg text-base font-medium mt-2"
            style={{ border: "1px solid var(--color-border)", color: "var(--color-text)", background: "transparent" }}
          >
            {t("scan.retro_none")}
          </button>
          <button onClick={() => setElenco(false)} className="min-h-[44px] text-sm" style={{ color: "var(--color-muted)" }}>
            {t("scan.retro_back")}
          </button>
        </div>
      </div>
    );
  }

  if (retro) {
    const vetro = { background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", color: "#FFFFFF" };
    return (
      <>
        <LanguageToggle />
        <div className="fixed inset-x-0 z-50 flex justify-center px-4" style={{ top: "calc(env(safe-area-inset-top, 0px) + 72px)" }}>
          <div className="max-w-md w-full rounded-lg px-5 py-4 text-center" style={vetro}>
            <p className="text-base md:text-lg font-medium">{t("scan.retro_title")}</p>
            <p className="text-sm md:text-base mt-1" style={{ opacity: 0.9 }}>{t("scan.retro_text")}</p>
            <button
              onClick={() => (retro.bottiglie.length ? setElenco(true) : handleSalta())}
              className="mt-3 min-h-[48px] px-6 rounded-lg text-base font-medium"
              style={{ border: "1px solid rgba(255,255,255,0.6)", color: "#FFFFFF", background: "rgba(255,255,255,0.08)" }}
            >
              {retro.bottiglie.length ? t("scan.retro_list") : t("scan.retro_skip")}
            </button>
          </div>
        </div>
        <CameraStream onCapture={handleRetro} instruction={t("scan.retro_instruction")} />
      </>
    );
  }

  // Camera stream
  return (
    <>
      <LanguageToggle />
      <button
        onClick={() => router.push("/")}
        aria-label="Indietro"
        className="fixed top-4 left-4 z-50 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg"
        style={{
          paddingTop: "env(safe-area-inset-top)",
          background: "rgba(0,0,0,0.4)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          color: "#FFFFFF",
        }}
      >
        <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <CameraStream onCapture={handleCapture} />
    </>
  );
}
