"use client";

import { ReactNode } from "react";
import { BolloIcona } from "./Icons";

interface TastingNotesProps {
  icon: ReactNode;
  title: string;
  text: string;
}

export default function TastingNotes({ icon, title, text }: TastingNotesProps) {
  return (
    <div
      className="rounded-lg p-4 md:p-6"
      style={{
        background: "var(--color-surface)",
        border: "1px solid rgba(17,17,17,0.15)",
      }}
    >
      <div className="flex items-center gap-3 mb-3">
        <BolloIcona>{icon}</BolloIcona>
        <h3
          className="font-bold uppercase tracking-wider text-sm"
          style={{
            fontFamily: "var(--font-titoli)",
            color: "var(--color-gold)",
          }}
        >
          {title}
        </h3>
      </div>
      <p
        className="text-[0.95rem] md:text-base leading-relaxed"
        style={{ color: "var(--color-text)", textAlign: "left", wordBreak: "normal", overflowWrap: "break-word" }}
      >
        {text}
      </p>
    </div>
  );
}
