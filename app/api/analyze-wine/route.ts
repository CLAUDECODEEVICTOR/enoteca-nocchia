import { NextRequest, NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { anthropicClient, buildPrompt } from "@/lib/anthropic";
import { rateLimit } from "@/lib/rate-limit";
import { requireScope } from "@/lib/auth";

const MAX_BASE64_LENGTH = 10_000_000; // ~7.5MB decoded

// Vision plus an occasional web lookup can take a while; without this the
// platform would cut the request off and the customer would see a bare error.
export const maxDuration = 60;

// Structured outputs: the API enforces this shape, so the reply is always valid
// JSON with every field present. No regex fishing for braces in prose.
const WINE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    testo_etichetta: { type: "string" },
    nome_vino: { type: "string" },
    produttore: { type: "string" },
    annata: { type: "string" },
    regione: { type: "string" },
    paese: { type: "string" },
    denominazione: { type: "string" },
    vitigni: { type: "array", items: { type: "string" } },
    gradazione: { type: "string" },
    temperatura_servizio: { type: "string" },
    note_visive: { type: "string" },
    note_olfattive: { type: "string" },
    note_gustative: { type: "string" },
    abbinamenti: { type: "array", items: { type: "string" } },
    descrizione: { type: "string" },
    confidenza: { type: "string", enum: ["alta", "media", "bassa", "nulla"] },
  },
  required: [
    "testo_etichetta",
    "nome_vino",
    "produttore",
    "annata",
    "regione",
    "paese",
    "denominazione",
    "vitigni",
    "gradazione",
    "temperatura_servizio",
    "note_visive",
    "note_olfattive",
    "note_gustative",
    "abbinamenti",
    "descrizione",
    "confidenza",
  ],
} as const;

export async function POST(req: NextRequest) {
  try {
    // Unlocked customers only — this is the endpoint that spends Claude credits.
    const denied = requireScope(req, "app");
    if (denied) return denied;

    // Rate limit: max 15 requests per minute per IP
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    if (!rateLimit(ip, 15)) {
      return NextResponse.json(
        { error: "Troppe richieste. Riprova tra un minuto." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const imageBase64 = body?.imageBase64 as string | undefined;
    const rawLang = body?.lang;
    const lang = (String(rawLang || "").startsWith("en") ? "en" : "it") as "it" | "en";

    if (!imageBase64 || typeof imageBase64 !== "string") {
      return NextResponse.json(
        { error: "Immagine mancante" },
        { status: 400 }
      );
    }

    if (imageBase64.length > MAX_BASE64_LENGTH) {
      return NextResponse.json(
        { error: "Immagine troppo grande (max 7MB)" },
        { status: 413 }
      );
    }

    // The prompt goes in `system`, ahead of the photo, so it stays a stable
    // prefix across scans and can be served from cache instead of re-billed:
    // measured, a second scan within five minutes reads ~7.4k tokens from cache.
    const response = await anthropicClient.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 4000,
      system: [
        {
          type: "text",
          text: buildPrompt(lang),
          cache_control: { type: "ephemeral" },
        },
      ],
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: WINE_SCHEMA as unknown as Record<string, unknown> },
      },
      tools: [
        {
          type: "web_search_20260209",
          name: "web_search",
          max_uses: 1,
        },
      ],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: imageBase64,
              },
            },
          ],
        },
      ],
    });

    console.log(
      "[analyze-wine] lang:", lang,
      "| stop_reason:", response.stop_reason,
      "| input:", response.usage.input_tokens,
      "| cache_read:", response.usage.cache_read_input_tokens,
      "| output:", response.usage.output_tokens
    );

    // A truncated answer used to surface as a generic parse failure. Name it.
    if (response.stop_reason === "max_tokens") {
      console.error("[analyze-wine] risposta troncata: alzare max_tokens");
      return NextResponse.json(
        { error: "Analisi interrotta. Riprova." },
        { status: 422 }
      );
    }

    if (response.stop_reason === "refusal") {
      console.error("[analyze-wine] richiesta rifiutata dai filtri di sicurezza");
      return NextResponse.json(
        { error: "Non posso analizzare questa immagine. Riscatta la foto dell'etichetta." },
        { status: 422 }
      );
    }

    // With web search on, the reply carries several blocks: the schema-shaped
    // JSON is the last text one.
    const textBlocks = response.content.filter(
      (b): b is Anthropic.TextBlock => b.type === "text"
    );
    const finalText = textBlocks.length > 0 ? textBlocks[textBlocks.length - 1].text : "";

    if (!finalText) {
      console.error(
        "[analyze-wine] nessun blocco di testo:",
        response.content.map((b) => b.type).join(",")
      );
      return NextResponse.json(
        { error: "Impossibile analizzare l'immagine" },
        { status: 422 }
      );
    }

    let wineData;
    try {
      wineData = JSON.parse(finalText);
    } catch (e) {
      console.error("[analyze-wine] JSON parse error:", e, finalText.slice(0, 300));
      return NextResponse.json(
        { error: "Risposta AI non valida" },
        { status: 422 }
      );
    }

    const result = { [lang]: wineData };

    if (wineData.confidenza === "nulla") {
      return NextResponse.json(
        { error: wineData.descrizione, data: result },
        { status: 422 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Errore analisi vino:", error);
    return NextResponse.json(
      { error: "Errore durante l'analisi. Riprova." },
      { status: 500 }
    );
  }
}
