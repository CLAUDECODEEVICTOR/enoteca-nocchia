import { NextRequest, NextResponse } from "next/server";
import { sql, ensureFeedbackSchema } from "@/lib/db";
import { requireScope } from "@/lib/auth";

// GET — list all feedback ordered by most recent. Staff only: the signed admin
// cookie is checked here, not just on the page, because the raw rows carry the
// photos taken in the shop and the owner's notes.
export async function GET(req: NextRequest) {
  try {
    const denied = requireScope(req, "admin");
    if (denied) return denied;

    await ensureFeedbackSchema();
    const url = new URL(req.url);
    // One photo at a time: all of them together would pass the platform's 4.5 MB response limit.
    const foto = url.searchParams.get("foto");
    if (foto) {
      const [riga] = await sql`SELECT original_photo FROM scan_feedback WHERE id = ${foto}`;
      if (!riga?.original_photo) return new NextResponse(null, { status: 404 });
      return new NextResponse(Buffer.from(riga.original_photo as string, "base64"), {
        headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" },
      });
    }

    const filter = url.searchParams.get("filter"); // "wrong" | "correct" | undefined

    let rows;
    if (filter === "wrong") {
      rows = await sql`
        SELECT id, created_at, is_correct, wine_name, producer, vintage,
               testo_etichetta, user_correction, notes, lang, original_photo IS NOT NULL AS con_foto
        FROM scan_feedback
        WHERE is_correct = false
        ORDER BY created_at DESC
        LIMIT 200;
      `;
    } else if (filter === "correct") {
      rows = await sql`
        SELECT id, created_at, is_correct, wine_name, producer, vintage,
               testo_etichetta, user_correction, notes, lang, original_photo IS NOT NULL AS con_foto
        FROM scan_feedback
        WHERE is_correct = true
        ORDER BY created_at DESC
        LIMIT 200;
      `;
    } else {
      rows = await sql`
        SELECT id, created_at, is_correct, wine_name, producer, vintage,
               testo_etichetta, user_correction, notes, lang, original_photo IS NOT NULL AS con_foto
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
