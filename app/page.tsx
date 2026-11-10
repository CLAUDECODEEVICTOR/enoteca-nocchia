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
        {/* The site's logo, drawn at half its pixel width so it stays sharp on the iPad's screen. */}
        <h1 className="animate-fade-in-1 m-0">
          <img src="/logo-nocchia.png" alt="Nocchia Wine Bar" width={200} height={50} className="block w-[200px] md:w-[280px] h-auto" />
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
          className="w-full max-w-xs px-8 py-4 rounded-lg text-base md:text-lg font-medium transition-all duration-300 hover:scale-[1.02] active:scale-95 active:brightness-90 animate-fade-in-3"
          style={{
            background: "var(--color-bordeaux)",
            color: "#FFFFFF",
            boxShadow: "0 4px 20px rgba(62,107,42,0.2)",
          }}
        >
          {t("home.cta")}
        </button>

        <button
          onClick={() => router.push("/sommelier")}
          className="w-full max-w-xs -mt-2 px-8 py-4 rounded-lg text-base md:text-lg font-medium transition-all duration-300 active:scale-95 animate-fade-in-3"
          style={{ background: "transparent", color: "var(--color-bordeaux)", border: "1px solid var(--color-bordeaux)" }}
        >
          {t("sommelier.cta")}
        </button>
      </div>

      {/* Staff door: everything reserved sits behind the admin PIN */}
      <button
        onClick={() => router.push("/admin")}
        className="fixed left-1/2 -translate-x-1/2 min-h-[44px] px-4 text-xs opacity-60 hover:opacity-100 transition-opacity"
        style={{ color: "var(--color-muted)", bottom: "calc(env(safe-area-inset-bottom) + 8px)" }}
      >
        Admin
      </button>
    </div>
  );
}
