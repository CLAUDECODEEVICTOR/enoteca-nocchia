import { NextRequest, NextResponse } from "next/server";
import { sql, ensureFeedbackSchema } from "@/lib/db";

// GET — list all feedback ordered by most recent. No server-side auth: the page
// gating is client-side via FeedbackGate. This matches the existing archive pattern.
export async function GET(req: NextRequest) {
  try {
    await ensureFeedbackSchema();
    const url = new URL(req.url);
    const filter = url.searchParams.get("filter"); // "wrong" | "correct" | undefined

    let rows;
    if (filter === "wrong") {
      rows = await sql`
        SELECT id, created_at, is_correct, wine_name, producer, vintage,
               testo_etichetta, user_correction, notes, lang, original_photo
        FROM scan_feedback
        WHERE is_correct = false
        ORDER BY created_at DESC
        LIMIT 200;
      `;
    } else if (filter === "correct") {
      rows = await sql`
        SELECT id, created_at, is_correct, wine_name, producer, vintage,
               testo_etichetta, user_correction, notes, lang, original_photo
        FROM scan_feedback
        WHERE is_correct = true
        ORDER BY created_at DESC
        LIMIT 200;
      `;
    } else {
      rows = await sql`
        SELECT id, created_at, is_correct, wine_name, producer, vintage,
               testo_etichetta, user_correction, notes, lang, original_photo
        FROM scan_feedback
        ORDER BY created_at DESC
        LIMIT 200;
      `;
    }

    return NextResponse.json({ items: rows });
  } catch (error) {
    console.error("[feedback/list]", error);
    return NextResponse.json({ error: "Errore lettura" }, { status: 500 });
  }
}
