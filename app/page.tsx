"use client";

import { useTranslation } from "react-i18next";
import { useRouter } from "next/navigation";
import LanguageToggle from "@/components/LanguageToggle";
import "@/lib/i18n";

export default function HomePage() {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <div
      className="relative min-h-dvh flex flex-col items-center justify-center px-6 md:px-12"
      style={{ background: "var(--color-bg)" }}
    >
      <LanguageToggle />

      {/* Contenuto centrato con animazione staggered */}
      <div className="relative z-10 flex flex-col items-center gap-6 md:gap-8 text-center max-w-lg">
        {/* Logo */}
        <img
          src="/icons/icon-192.png"
          alt="Enoteca Nocchia"
          className="w-20 h-20 md:w-24 md:h-24 rounded-2xl animate-fade-in-1 shadow-lg"
        />

        {/* Titolo */}
        <h1
          className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-wide animate-fade-in-1"
          style={{
            fontFamily: "var(--font-playfair)",
            color: "var(--color-gold)",
          }}
        >
          Enoteca Nocchia
        </h1>

        {/* Sottotitolo */}
        <p
          className="text-base md:text-lg lg:text-xl max-w-xs md:max-w-md animate-fade-in-2 text-center"
          style={{ color: "var(--color-muted)" }}
        >
          {t("home.subheadline_1")}
          <br />
          {t("home.subheadline_2")}
        </p>

        {/* Linea decorativa */}
        <div
          className="w-16 md:w-24 animate-fade-in-2"
          style={{ background: "var(--color-gold)", opacity: 0.4, height: "2px" }}
        />

        {/* CTA */}
        <button
          onClick={() => router.push("/scan")}
          className="w-full max-w-xs px-8 py-4 rounded-xl text-base md:text-lg font-medium transition-all duration-300 hover:scale-[1.02] active:scale-95 active:brightness-90 animate-fade-in-3"
          style={{
            background: "var(--color-bordeaux)",
            color: "#FFFFFF",
            boxShadow: "0 4px 20px rgba(139,26,26,0.2)",
          }}
        >
          {t("home.cta")}
        </button>
      </div>

      {/* Archive link — discreet, staff only */}
      <button
        onClick={() => router.push("/archivio")}
        className="fixed bottom-4 left-4 text-xs opacity-40 hover:opacity-80 transition-opacity"
        style={{ color: "var(--color-muted)", paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Archivio"
      >
        Archivio
      </button>

      {/* Feedback admin link — discreet, staff only */}
      <button
        onClick={() => router.push("/feedback")}
        className="fixed bottom-4 right-4 text-xs opacity-40 hover:opacity-80 transition-opacity"
        style={{ color: "var(--color-muted)", paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Feedback"
      >
        Feedback
      </button>
    </div>
  );
}
