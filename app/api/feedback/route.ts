import { NextRequest, NextResponse } from "next/server";
import { sql, ensureFeedbackSchema } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

interface FeedbackPayload {
  isCorrect: boolean;
  wineName?: string;
  producer?: string;
  vintage?: string;
  testoEtichetta?: string;
  aiResponse?: unknown;
  originalPhoto?: string | null; // base64 thumbnail without data: prefix
  userCorrection?: string;
  notes?: string;
  lang?: "it" | "en";
}

// Cap stored photo at ~300KB (~225KB binary). Reject larger payloads.
const MAX_PHOTO_LENGTH = 300_000;

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    if (!rateLimit(ip, 10)) {
      return NextResponse.json({ error: "Troppe richieste" }, { status: 429 });
    }

    const body = (await req.json()) as FeedbackPayload;

    if (typeof body.isCorrect !== "boolean") {
      return NextResponse.json({ error: "Verdetto mancante" }, { status: 400 });
    }

    if (body.originalPhoto && body.originalPhoto.length > MAX_PHOTO_LENGTH) {
      return NextResponse.json({ error: "Foto troppo grande" }, { status: 413 });
    }

    await ensureFeedbackSchema();

    const id = crypto.randomUUID();
    const lang = body.lang === "en" ? "en" : "it";

    await sql`
      INSERT INTO scan_feedback (
        id, is_correct, wine_name, producer, vintage,
        testo_etichetta, ai_response, original_photo,
        user_correction, notes, lang
      )
      VALUES (
        ${id},
        ${body.isCorrect},
        ${body.wineName || null},
        ${body.producer || null},
        ${body.vintage || null},
        ${body.testoEtichetta || null},
        ${body.aiResponse ? JSON.stringify(body.aiResponse) : null}::jsonb,
        ${body.originalPhoto || null},
        ${body.userCorrection || null},
        ${body.notes || null},
        ${lang}
      );
    `;

    return NextResponse.json({ ok: true, id });
  } catch (error) {
    console.error("[feedback]", error);
    return NextResponse.json({ error: "Errore salvataggio" }, { status: 500 });
  }
}
