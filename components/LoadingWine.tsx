"use client";

import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";

export default function LoadingWine() {
  const { t } = useTranslation();
  const messages = t("loading.messages", { returnObjects: true }) as string[];
  const [index, setIndex] = useState(0);
  const [fade, setFade] = useState(true);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % messages.length);
        setFade(true);
      }, 300);
    }, 2000);
    return () => clearInterval(interval);
  }, [messages.length]);

  // Simulated progress: fast at start, slows toward 90%, never reaches 100% until redirect
  useEffect(() => {
    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) return prev + 0.1;
        if (prev >= 70) return prev + 0.3;
        if (prev >= 40) return prev + 0.8;
        return prev + 2;
      });
    }, 200);
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8"
      style={{
        background: "var(--color-bg)",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <h2
        className="text-2xl md:text-3xl font-bold text-center px-6"
        style={{
          fontFamily: "var(--font-titoli)",
          color: "var(--color-gold)",
        }}
      >
        {t("loading.headline")}
      </h2>

      <div className="relative w-16 h-16 md:w-20 md:h-20">
        <div
          className="absolute inset-0 rounded-full animate-spin"
          style={{
            border: "3px solid rgba(17,17,17,0.2)",
            borderTopColor: "var(--color-gold)",
          }}
        />
      </div>

      {/* Progress bar */}
      <div className="w-48 md:w-64 h-1 rounded-full overflow-hidden" style={{ background: "rgba(17,17,17,0.15)" }}>
        <div
          className="h-full rounded-full transition-all duration-300 ease-out"
          style={{
            width: `${Math.min(progress, 95)}%`,
            background: "var(--color-gold)",
          }}
        />
      </div>

      <p
        className="text-lg md:text-xl italic transition-opacity duration-300 px-6 text-center"
        style={{
          color: "var(--color-muted)",
          fontFamily: "var(--font-titoli)",
          opacity: fade ? 1 : 0,
        }}
      >
        {messages[index]}
      </p>
    </div>
  );
}
