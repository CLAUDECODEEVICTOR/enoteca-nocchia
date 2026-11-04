import type Anthropic from "@anthropic-ai/sdk";
import { anthropicClient } from "@/lib/anthropic";
import { FORMATI } from "@/lib/types";

export interface LabelReading {
  nome_vino: string;
  produttore: string;
  annata: string;
  denominazione: string;
  gradazione: string;
  formato: string;
  confidenza: "alta" | "media" | "bassa" | "nulla";
}

const LABEL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    nome_vino: { type: "string" },
    produttore: { type: "string" },
    annata: { type: "string" },
    denominazione: { type: "string" },
    gradazione: { type: "string" },
    formato: { type: "string", enum: ["", ...FORMATI] },
    confidenza: { type: "string", enum: ["alta", "media", "bassa", "nulla"] },
  },
  required: ["nome_vino", "produttore", "annata", "denominazione", "gradazione", "formato", "confidenza"],
};

const SYSTEM =
  "Le due foto mostrano la stessa bottiglia: la prima il fronte, la seconda il retro. Riporta solo ciò che è scritto e leggibile su una delle due: nome del vino, produttore, annata, denominazione, gradazione, formato (la capacità: 75 cl è 750 ml, 1500 ml è 1,5 l). Un dato non leggibile resta stringa vuota: non dedurlo. confidenza indica quanto sono leggibili le etichette.";

// Sonnet 5.5 at low effort: on real shop photos it left unreadable fields empty,
// where Haiku 5.5 invented producers. A wrong producer is worse than a blank one.
export async function readLabel(front: string, back: string): Promise<LabelReading> {
  const response = await anthropicClient.messages.create({
    model: "claude-sonnet-5-5",
    max_tokens: 2500,
    system: SYSTEM,
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: LABEL_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: front } },
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: back } },
        ],
      },
    ],
  });

  if (response.stop_reason !== "end_turn") {
    throw new Error(`Lettura interrotta: ${response.stop_reason}`);
  }
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .pop()?.text;
  if (!text) throw new Error("Risposta senza testo");
  return JSON.parse(text) as LabelReading;
}
