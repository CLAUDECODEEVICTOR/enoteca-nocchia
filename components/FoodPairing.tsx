"use client";

import { BolloIcona, IconUtensils } from "./Icons";

interface FoodPairingProps {
  title: string;
  pairings: string[];
}

export default function FoodPairing({ title, pairings }: FoodPairingProps) {
  return (
    <div
      className="rounded-lg p-4 md:p-6"
      style={{
        background: "var(--color-surface)",
        border: "1px solid rgba(17,17,17,0.15)",
      }}
    >
      <div className="flex items-center gap-3 mb-4">
        <BolloIcona><IconUtensils size={22} /></BolloIcona>
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
      <div className="flex flex-wrap gap-2">
        {pairings.map((item, i) => (
          <span
            key={i}
            className="px-2.5 py-1 rounded-full text-xs md:text-sm font-medium"
            style={{
              background: "rgba(62,107,42,0.08)",
              color: "var(--color-bordeaux)",
              border: "1px solid rgba(62,107,42,0.25)",
            }}
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
