import { NextRequest, NextResponse } from "next/server";
import { anthropicClient, buildPrompt } from "@/lib/anthropic";
import { rateLimit } from "@/lib/rate-limit";

const MAX_BASE64_LENGTH = 10_000_000; // ~7.5MB decoded

export async function POST(req: NextRequest) {
  try {
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

    // Validate base64 size
    if (imageBase64.length > MAX_BASE64_LENGTH) {
      return NextResponse.json(
        { error: "Immagine troppo grande (max 7MB)" },
        { status: 413 }
      );
    }

    const prompt = buildPrompt(lang);

    const response = await anthropicClient.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 700,
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

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: "Impossibile analizzare l'immagine" },
        { status: 422 }
      );
    }

    let wineData;
    try {
      wineData = JSON.parse(jsonMatch[0]);
    } catch {
      return NextResponse.json(
        { error: "Risposta AI non valida" },
        { status: 422 }
      );
    }

    // Wrap in bilingual format: { it: data } or { en: data }
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
