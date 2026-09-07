import { NextRequest, NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { anthropicClient, buildPrompt } from "@/lib/anthropic";
import { rateLimit } from "@/lib/rate-limit";
import { requireScope } from "@/lib/auth";

const MAX_BASE64_LENGTH = 10_000_000; // ~7.5MB decoded

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
    console.log("[analyze-wine] rawLang:", rawLang, "→ lang:", lang);

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

    const prompt = buildPrompt(lang);

    const response = await anthropicClient.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      tools: [
        {
          type: "web_search_20250305",
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
            { type: "text", text: prompt },
          ],
        },
      ],
    });

    // Response may contain multiple blocks: text, server_tool_use, web_search_tool_result, text.
    // We want the LAST text block, which carries the final JSON.
    const textBlocks = response.content.filter(
      (b): b is Anthropic.TextBlock => b.type === "text"
    );
    const finalText = textBlocks.length > 0 ? textBlocks[textBlocks.length - 1].text : "";

    console.log("[analyze-wine] stop_reason:", response.stop_reason, "blocks:", response.content.map(b => b.type).join(","));

    const jsonMatch = finalText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[analyze-wine] no JSON in final text:", finalText.slice(0, 500));
      return NextResponse.json(
        { error: "Impossibile analizzare l'immagine" },
        { status: 422 }
      );
    }

    let wineData;
    try {
      wineData = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error("[analyze-wine] JSON parse error:", e);
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
