"use client";

import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useRouter } from "next/navigation";
import CameraStream from "@/components/CameraStream";
import LoadingWine from "@/components/LoadingWine";
import LanguageToggle from "@/components/LanguageToggle";
import "@/lib/i18n";

export default function ScanPage() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

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

  const handleAnalyze = async () => {
    if (!capturedImage) return;
    setIsAnalyzing(true);

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
    const uploadImage = capturedImage;

    try {
      const res = await fetch("/api/analyze-wine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: uploadImage, lang: i18n.language.startsWith("en") ? "en" : "it" }),
      });

      const data = await res.json();
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
            className="max-w-full max-h-[65vh] md:max-h-[70vh] rounded-xl object-contain"
            style={{ border: "1px solid var(--color-border)" }}
          />
        </div>

        {/* Bottoni azione */}
        <div className="flex gap-4 justify-center px-6 md:px-12 pb-8 max-w-lg mx-auto w-full">
          <button
            onClick={handleRetake}
            className="flex-1 min-h-[52px] py-4 rounded-xl text-base md:text-lg font-medium transition-colors"
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
            className="flex-1 min-h-[52px] py-4 rounded-xl text-base md:text-lg font-medium transition-colors"
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
