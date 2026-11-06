import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema, ensureStockSchema } from "@/lib/db";
import { requireScope } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  try {
    const denied = requireScope(req, "admin");
    if (denied) return denied;

    // Its own key: opening cards must not use up the customers' scan allowance.
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    if (!rateLimit(`archive:${ip}`, 120)) {
      return NextResponse.json({ error: "Troppe richieste" }, { status: 429 });
    }

    await ensureSchema();
    await ensureStockSchema();

    const id = req.nextUrl.searchParams.get("id");
    if (id) {
      const rows = await sql`
        SELECT w.id, w.nome_vino, w.produttore, w.annata, w.regione, w.paese, w.denominazione,
               COALESCE(w.vitigni, '[]'::jsonb) AS vitigni, w.gradazione, w.temperatura_servizio,
               w.note_visive, w.note_olfattive, w.note_gustative,
               COALESCE(w.abbinamenti, '[]'::jsonb) AS abbinamenti, w.descrizione, w.confidenza,
               w.categoria, w.metodo, w.occasione, w.testo_etichetta, w.dubbi, w.origine,
               w.bottle_image, w.scan_count
        FROM wine_scans w WHERE w.id = ${id}`;
      if (!rows[0]) return NextResponse.json({ error: "Scheda non trovata" }, { status: 404 });
      const bottiglie = await sql`
        SELECT id, formato, quantita, prezzo FROM stock_items WHERE scheda_id = ${id} ORDER BY created_at`;
      return NextResponse.json({ scheda: rows[0], bottiglie });
    }

    const wines = await sql`
      SELECT w.id, w.nome_vino, w.produttore, w.annata, w.regione, w.paese, w.denominazione,
             w.bottle_image, w.scan_count, w.last_scanned_at, w.categoria, w.origine,
             s.foto_id, s.formati, s.pezzi
      FROM wine_scans w
      LEFT JOIN (
        SELECT scheda_id, MIN(id::text) AS foto_id, ARRAY_AGG(DISTINCT formato) AS formati, SUM(quantita)::int AS pezzi
        FROM stock_items WHERE scheda_id IS NOT NULL GROUP BY scheda_id
      ) s ON s.scheda_id = w.id
      ORDER BY LOWER(w.nome_vino)
      LIMIT 2000`;

    const senzaScheda = await sql`
      SELECT id, nome_vino, produttore, formato FROM stock_items
      WHERE scheda_id IS NULL OR scheda IS NULL
      ORDER BY created_at`;

    return NextResponse.json({ wines, senzaScheda });
  } catch (error) {
    console.error("[archive]", error);
    return NextResponse.json({ error: "Errore caricamento archivio" }, { status: 500 });
  }
}
