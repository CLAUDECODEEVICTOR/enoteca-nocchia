"use client";

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import it from "@/locales/it.json";
import en from "@/locales/en.json";

// Persist language choice across page navigations
const savedLang = typeof window !== "undefined" ? localStorage.getItem("lang") : null;

i18n.use(initReactI18next).init({
  resources: {
    it: { translation: it },
    en: { translation: en },
  },
  lng: savedLang || "it",
  fallbackLng: "it",
  interpolation: {
    escapeValue: false,
  },
});

// Save language whenever it changes
i18n.on("languageChanged", (lng) => {
  if (typeof window !== "undefined") {
    localStorage.setItem("lang", lng);
  }
});

export default i18n;
