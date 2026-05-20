"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";

type Verdict = "correct" | "wrong";
type State = "idle" | "verdict_wrong" | "submitting" | "done_correct" | "done_wrong";

interface WineForFeedback {
  nome_vino: string;
  produttore?: string;
  annata?: string;
  testo_etichetta?: string;
}

interface Props {
  wine: WineForFeedback;
  fullResponse: unknown;
  originalPhoto: string | null; // base64 without data: prefix
  lang: "it" | "en";
}

const COPY = {
  it: {
    prompt: "Questa analisi è corretta?",
    correct: "Sì, corretta",
    wrong: "No, sbagliata",
    correctionLabel: "Qual è il vino giusto? (facoltativo)",
    correctionPlaceholder: "Es. Brunello di Montalcino 2018, Casanova di Neri",
    notesLabel: "Note (facoltativo)",
    notesPlaceholder: "Cosa c'era di sbagliato? Annata? Produttore?",
    submit: "Invia feedback",
    cancel: "Annulla",
    thanksCorrect: "Grazie! Feedback positivo registrato.",
    thanksWrong: "Grazie, useremo il tuo feedback per migliorare lo strumento.",
    errorSend: "Errore invio. Riprova.",
  },
  en: {
    prompt: "Is this analysis correct?",
    correct: "Yes, correct",
    wrong: "No, wrong",
    correctionLabel: "What is the correct wine? (optional)",
    correctionPlaceholder: "e.g. Brunello di Montalcino 2018, Casanova di Neri",
    notesLabel: "Notes (optional)",
    notesPlaceholder: "What was wrong? Vintage? Producer?",
    submit: "Send feedback",
    cancel: "Cancel",
    thanksCorrect: "Thanks! Positive feedback recorded.",
    thanksWrong: "Thanks, we'll use your feedback to improve the tool.",
    errorSend: "Send error. Try again.",
  },
};

export default function FeedbackPanel({ wine, fullResponse, originalPhoto, lang }: Props) {
  const { i18n } = useTranslation();
  const effectiveLang = (i18n.language?.startsWith("en") ? "en" : lang) as "it" | "en";
  const t = COPY[effectiveLang];

  const [state, setState] = useState<State>("idle");
  const [correction, setCorrection] = useState("");
  const [notes, setNotes] = useState("");

  const submit = async (verdict: Verdict) => {
    setState("submitting");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isCorrect: verdict === "correct",
          wineName: wine.nome_vino,
          producer: wine.produttore,
          vintage: wine.annata,
          testoEtichetta: wine.testo_etichetta,
          aiResponse: fullResponse,
          originalPhoto,
          userCorrection: verdict === "wrong" ? correction.trim() || undefined : undefined,
          notes: verdict === "wrong" ? notes.trim() || undefined : undefined,
          lang: effectiveLang,
        }),
      });
      if (!res.ok) throw new Error("Bad status");
      setState(verdict === "correct" ? "done_correct" : "done_wrong");
    } catch {
      alert(t.errorSend);
      setState(verdict === "wrong" ? "verdict_wrong" : "idle");
    }
  };

  if (state === "done_correct" || state === "done_wrong") {
    return (
      <div
        className="mt-6 rounded-xl px-5 py-4 text-center text-sm animate-fade-in-1"
        style={{
          background: "var(--color-surface)",
          border: "1px solid rgba(120,94,20,0.25)",
          color: "var(--color-muted)",
        }}
      >
        {state === "done_correct" ? t.thanksCorrect : t.thanksWrong}
      </div>
    );
  }

  return (
    <div
      className="mt-6 rounded-xl px-5 py-4"
      style={{
        background: "var(--color-surface)",
        border: "1px solid rgba(120,94,20,0.25)",
      }}
    >
      <p
        className="text-sm mb-3 font-medium"
        style={{ color: "var(--color-text)" }}
      >
        {t.prompt}
      </p>

      {state === "idle" && (
        <div className="flex gap-3">
          <button
            onClick={() => submit("correct")}
            className="flex-1 min-h-[44px] rounded-lg text-sm font-medium transition-all duration-200 active:scale-95"
            style={{
              background: "transparent",
              color: "var(--color-text)",
              border: "1px solid rgba(31,138,58,0.5)",
            }}
          >
            ✓ {t.correct}
          </button>
          <button
            onClick={() => setState("verdict_wrong")}
            className="flex-1 min-h-[44px] rounded-lg text-sm font-medium transition-all duration-200 active:scale-95"
            style={{
              background: "transparent",
              color: "var(--color-text)",
              border: "1px solid rgba(192,57,43,0.5)",
            }}
          >
            ✗ {t.wrong}
          </button>
        </div>
      )}

      {state === "verdict_wrong" && (
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs mb-1 block" style={{ color: "var(--color-muted)" }}>
              {t.correctionLabel}
            </label>
            <input
              type="text"
              value={correction}
              onChange={(e) => setCorrection(e.target.value)}
              placeholder={t.correctionPlaceholder}
              maxLength={200}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{
                background: "var(--color-bg)",
                border: "1px solid rgba(120,94,20,0.3)",
                color: "var(--color-text)",
              }}
            />
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: "var(--color-muted)" }}>
              {t.notesLabel}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t.notesPlaceholder}
              maxLength={500}
              rows={2}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
              style={{
                background: "var(--color-bg)",
                border: "1px solid rgba(120,94,20,0.3)",
                color: "var(--color-text)",
              }}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setState("idle")}
              className="flex-1 min-h-[40px] rounded-lg text-sm transition-all duration-200"
              style={{
                background: "transparent",
                color: "var(--color-muted)",
                border: "1px solid rgba(120,94,20,0.25)",
              }}
            >
              {t.cancel}
            </button>
            <button
              onClick={() => submit("wrong")}
              className="flex-1 min-h-[40px] rounded-lg text-sm font-medium transition-all duration-200"
              style={{
                background: "var(--color-bordeaux)",
                color: "#FFFFFF",
              }}
            >
              {t.submit}
            </button>
          </div>
        </div>
      )}

      {state === "submitting" && (
        <p className="text-center text-sm py-2" style={{ color: "var(--color-muted)" }}>
          ...
        </p>
      )}
    </div>
  );
}
