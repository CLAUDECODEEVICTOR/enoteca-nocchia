"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { BilingualWineAnalysis } from "@/lib/types";
import WineCard from "@/components/WineCard";
import LanguageToggle from "@/components/LanguageToggle";
import FeedbackPanel from "@/components/FeedbackPanel";
import { IconWineGlass } from "@/components/Icons";
import "@/lib/i18n";
import * as cronometro from "@/lib/cronometro";

// Fire-and-forget save to Neon DB. Never blocks UI or throws to caller.
function saveScan(
  wine: { nome_vino: string; produttore?: string; annata?: string; [k: string]: unknown },
  bottleImage: string | null,
  lang: string
) {
  try {
    fetch("/api/save-scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...wine,
        bottleImage,
        lang: lang.startsWith("en") ? "en" : "it",
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Silent
  }
}

// Top left, opposite the language toggle: back to the sommelier's three bottles if the card came
// from there, otherwise home. Read on tap, so the server render and the first paint stay the same.
function tornaIndietro(router: ReturnType<typeof useRouter>) {
  if (sessionStorage.getItem("indietro") === "/sommelier") {
    sessionStorage.setItem("sommelier_torna", "1");
    return router.push("/sommelier");
  }
  router.push("/");
}

function Indietro() {
  const { t } = useTranslation();
  const router = useRouter();
  const vai = () => tornaIndietro(router);
  return (
    <button
      onClick={vai}
      className="fixed top-4 left-4 z-50 min-h-[44px] px-3 flex items-center gap-1.5 rounded-lg text-sm font-medium"
      style={{
        marginTop: "env(safe-area-inset-top)",
        background: "rgba(255,255,255,0.85)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        color: "var(--color-muted)",
      }}
    >
      <span aria-hidden="true">←</span> {t("result.back")}
    </button>
  );
}

export default function ResultPage() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [bilingualWine, setBilingualWine] = useState<BilingualWineAnalysis | null>(null);
  const [bottleImage, setBottleImage] = useState<string | null>(null);
  const [scanThumbnail, setScanThumbnail] = useState<string | null>(null);
  // No clean bottle photo for this wine: the customer's own shot stands in, so every scan shows a bottle.
  const [senzaFoto, setSenzaFoto] = useState(false);
  // Opened from the sommelier: the card shows why it was suggested and leads back to the counter,
  // not to the scan's feedback and "analyse another bottle".
  const [perche, setPerche] = useState<string | null>(null);

  useEffect(() => {
    // Read the original scan photo (thumbnail) stored by /scan
    const thumb = sessionStorage.getItem("lastScanThumbnail");
    const daSommelier = sessionStorage.getItem("indietro") === "/sommelier";
    const id = requestAnimationFrame(() => {
      if (thumb) setScanThumbnail(thumb);
      if (daSommelier) setPerche(sessionStorage.getItem("consiglio_perche") || "");
    });
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem("lastWineAnalysis");
    if (!stored) {
      router.push("/");
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(stored);
    } catch {
      router.push("/");
      return;
    }
    setBilingualWine(parsed);
    cronometro.schedaVisibile();

    const wineData = parsed.it || parsed.en;
    const validWine =
      wineData?.confidenza !== "nulla" && !!wineData?.nome_vino;

    // Avoid saving the same scan twice if user navigates back and forth
    const savedKey = `scan_saved_${wineData?.nome_vino}_${wineData?.annata}`;
    const alreadySaved = sessionStorage.getItem(savedKey) === "1";

    // A catalogue card brings the photo found on its first scan: no new search.
    const cachedImg = localStorage.getItem("wineBottleImage") || wineData?.bottle_image || null;
    if (!validWine) cronometro.fotoVisibile(false);
    if (cachedImg) {
      setBottleImage(cachedImg);
      if (validWine && !alreadySaved) {
        saveScan(wineData, cachedImg, i18n.language);
        sessionStorage.setItem(savedKey, "1");
      }
      return;
    }

    // A shop card whose photo was checked and none was good: no search, no photo.
    if (validWine && wineData?.foto_controllata) {
      cronometro.fotoVisibile(false);
      setSenzaFoto(true);
      if (!alreadySaved) {
        saveScan(wineData, null, i18n.language);
        sessionStorage.setItem(savedKey, "1");
      }
      return;
    }

    // Fetch bottle image async (doesn't block page render)
    if (validWine) {
      const q = [wineData.nome_vino, wineData.produttore, wineData.annata].filter(Boolean).join(" ");
      fetch(`/api/wine-image?q=${encodeURIComponent(q)}`)
        .then(res => res.json())
        .then(data => {
          const img = data.imageUrl || null;
          if (img) {
            localStorage.setItem("wineBottleImage", img);
            setBottleImage(img);
          } else {
            cronometro.fotoVisibile(false);
            setSenzaFoto(true);
          }
          if (!alreadySaved) {
            saveScan(wineData, img, i18n.language);
            sessionStorage.setItem(savedKey, "1");
          }
        })
        .catch(() => {
          cronometro.fotoVisibile(false);
          setSenzaFoto(true);
          // Save anyway without image
          if (!alreadySaved) {
            saveScan(wineData, null, i18n.language);
            sessionStorage.setItem(savedKey, "1");
          }
        });
    }
  }, [router, i18n.language]);

  // No bottle chosen yet (opened directly, or after the reset): the brand and a way home, never a blank page.
  if (!bilingualWine)
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4 px-6 text-center" style={{ background: "var(--color-bg)" }}>
        <h1 className="text-3xl font-bold" style={{ fontFamily: "var(--font-playfair)", color: "var(--color-gold)" }}>Enoteca Nocchia</h1>
        <button onClick={() => router.push("/")} className="min-h-[48px] px-5 text-base underline underline-offset-4" style={{ color: "var(--color-muted)" }}>
          {t("result.go_home")}
        </button>
      </div>
    );

  const lang = (i18n.language === "en" ? "en" : "it") as "it" | "en";
  const wine = bilingualWine[lang] || bilingualWine.it || bilingualWine.en;

  // Schermata errore se confidenza nulla
  if (wine.confidenza === "nulla") {
    return (
      <div
        className="min-h-dvh flex flex-col items-center justify-center px-6 md:px-12 gap-6 text-center"
        style={{
          background: "var(--color-bg)",
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <LanguageToggle />

        <div className="animate-fade-in-1" style={{ color: "var(--color-bordeaux)" }}>
          <IconWineGlass size={72} />
        </div>

        <h2
          className="text-2xl md:text-3xl font-bold animate-fade-in-2"
          style={{
            fontFamily: "var(--font-playfair)",
            color: "var(--color-gold)",
          }}
        >
          {t("error.not_recognized")}
        </h2>

        <p
          className="text-base md:text-lg max-w-sm md:max-w-md animate-fade-in-2"
          style={{ color: "var(--color-muted)" }}
        >
          {wine.descrizione || t("error.retry")}
        </p>

        <button
          onClick={() => router.push("/")}
          className="mt-4 px-8 py-4 rounded-xl text-base md:text-lg font-medium transition-all duration-300 hover:scale-105 active:scale-95 animate-fade-in-3"
          style={{
            background: "var(--color-bordeaux)",
            color: "#FFFFFF",
          }}
        >
          {t("error.retry")}
        </button>
      </div>
    );
  }

  return (
    <div
      className="min-h-dvh"
      style={{
        background: "var(--color-bg)",
        paddingTop: "env(safe-area-inset-top)",
      }}
    >
      <LanguageToggle />
      <Indietro />

      {/* Hero bottiglia */}
      {bottleImage && (
        <div className="flex justify-center items-center pt-8 pb-4 animate-fade-in-1">
          <img
            src={bottleImage}
            alt={wine.nome_vino}
            className="object-contain drop-shadow-xl rounded-2xl"
            style={{ maxHeight: "340px", maxWidth: "260px", width: "auto", height: "auto" }}
            onLoad={() => cronometro.fotoVisibile(true)}
            onError={() => {
              cronometro.fotoVisibile(false);
              setBottleImage(null);
              setSenzaFoto(true);
            }}
          />
        </div>
      )}

      {!bottleImage && senzaFoto && scanThumbnail && (
        <figure className="flex flex-col items-center gap-2 pt-8 pb-4 m-0 animate-fade-in-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={scanThumbnail.startsWith("data:") ? scanThumbnail : `data:image/jpeg;base64,${scanThumbnail}`}
            alt={wine.nome_vino}
            className="object-contain rounded-2xl shadow-lg"
            style={{ maxHeight: "340px", maxWidth: "260px", width: "auto", height: "auto" }}
          />
          <figcaption className="text-sm" style={{ color: "var(--color-muted)" }}>{t("result.your_photo")}</figcaption>
        </figure>
      )}

      <div className="px-5 md:px-8 lg:px-12 py-6 md:py-8" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1.5rem)" }}>
        <div className="max-w-2xl mx-auto">
          {/* Wine Card */}
          <WineCard wine={wine} nota={perche ? (
            <div className="rounded-xl p-4 md:p-5 bg-white" style={{ border: "1px solid rgba(62,107,42,0.3)", borderLeft: "4px solid var(--color-bordeaux)" }}>
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--color-bordeaux)" }}>{t("result.why_label")}</p>
              <p className="mt-1.5 text-base md:text-[17px] leading-relaxed" style={{ color: "var(--color-text)" }}>{perche}</p>
            </div>
          ) : undefined} />

          {/* Feedback panel — only shown when we actually have a wine identification.
              The confidenza === "nulla" branch returns earlier, so here it's never "nulla". */}
          {wine.nome_vino && perche === null && (
            <FeedbackPanel
              wine={wine}
              fullResponse={bilingualWine}
              originalPhoto={scanThumbnail}
              lang={lang}
            />
          )}

          {perche !== null ? (
            <div className="mt-8 mb-8 text-center">
              <p className="text-lg md:text-xl" style={{ fontFamily: "var(--font-playfair)", color: "var(--color-text)" }}>{t("result.ask_counter")}</p>
              <button
                onClick={() => tornaIndietro(router)}
                className="mt-4 w-full min-h-[52px] py-4 rounded-xl text-base md:text-lg font-medium"
                style={{ background: "var(--color-bordeaux)", color: "#FFFFFF" }}
              >
                ← {t("result.back_advice")}
              </button>
            </div>
          ) : (
          <div className="mt-8 mb-8">
            <button
              onClick={() => router.push("/")}
              className="w-full min-h-[52px] py-4 rounded-xl text-base md:text-lg font-medium transition-all duration-300 hover:scale-[1.02] active:scale-95 active:brightness-90"
              style={{
                background: "var(--color-bordeaux)",
                color: "#FFFFFF",
              }}
            >
              {t("result.another")}
            </button>
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
