import { NextRequest, NextResponse } from "next/server";
import { sql, ensureFeedbackSchema, wineKey } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { requireScope } from "@/lib/auth";

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
    const denied = requireScope(req, "app");
    if (denied) return denied;

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    if (!rateLimit(`feedback:${ip}`, 10)) {
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

    // A draft a customer calls wrong is not offered again: the next scan writes the card anew.
    // Warehouse cards are left to the staff, who read the feedback.
    if (!body.isCorrect) {
      const risposta = body.aiResponse as { it?: { catalogo_id?: string }; en?: { catalogo_id?: string } } | undefined;
      const scheda = risposta?.it?.catalogo_id || risposta?.en?.catalogo_id || wineKey(body.wineName || "", body.producer || "", body.vintage || "");
      if (scheda) await sql`UPDATE wine_scans SET confidenza = 'da_correggere' WHERE id = ${scheda} AND origine = 'scan'`;
    }

    return NextResponse.json({ ok: true, id });
  } catch (error) {
    console.error("[feedback]", error);
    return NextResponse.json({ error: "Errore salvataggio" }, { status: 500 });
  }
}
