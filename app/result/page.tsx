"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { BilingualWineAnalysis } from "@/lib/types";
import WineCard from "@/components/WineCard";
import LanguageToggle from "@/components/LanguageToggle";
import { IconWineGlass } from "@/components/Icons";
import "@/lib/i18n";

export default function ResultPage() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [bilingualWine, setBilingualWine] = useState<BilingualWineAnalysis | null>(null);
  const [bottleImage, setBottleImage] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("lastWineAnalysis");
    if (!stored) {
      router.push("/scan");
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(stored);
    } catch {
      router.push("/scan");
      return;
    }
    setBilingualWine(parsed);

    // Check cached image first
    const cachedImg = localStorage.getItem("wineBottleImage");
    if (cachedImg) {
      setBottleImage(cachedImg);
      return;
    }

    // Fetch bottle image async (doesn't block page render)
    const wineData = parsed.it || parsed.en;
    if (wineData?.confidenza !== "nulla" && wineData?.nome_vino) {
      const q = [wineData.nome_vino, wineData.produttore, wineData.annata].filter(Boolean).join(" ");
      fetch(`/api/wine-image?q=${encodeURIComponent(q)}`)
        .then(res => res.json())
        .then(data => {
          if (data.imageUrl) {
            localStorage.setItem("wineBottleImage", data.imageUrl);
            setBottleImage(data.imageUrl);
          }
        })
        .catch(() => {}); // Silently fail — page works without image
    }
  }, [router]);

  if (!bilingualWine) return null;

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
          onClick={() => router.push("/scan")}
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

      {/* Hero bottiglia */}
      {bottleImage && (
        <div className="flex justify-center items-center pt-8 pb-4 animate-fade-in-1">
          <img
            src={bottleImage}
            alt={wine.nome_vino}
            className="object-contain drop-shadow-xl rounded-2xl"
            style={{ maxHeight: "340px", maxWidth: "260px", width: "auto", height: "auto" }}
            onError={() => setBottleImage(null)}
          />
        </div>
      )}

      <div className="px-5 md:px-8 lg:px-12 py-6 md:py-8" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1.5rem)" }}>
        <div className="max-w-2xl mx-auto">
          {/* Wine Card */}
          <WineCard wine={wine} />

          {/* Bottone altra bottiglia */}
          <div className="mt-8 mb-8">
            <button
              onClick={() => router.push("/scan")}
              className="w-full min-h-[52px] py-4 rounded-xl text-base md:text-lg font-medium transition-all duration-300 hover:scale-[1.02] active:scale-95 active:brightness-90"
              style={{
                background: "var(--color-bordeaux)",
                color: "#FFFFFF",
              }}
            >
              {t("result.another")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
