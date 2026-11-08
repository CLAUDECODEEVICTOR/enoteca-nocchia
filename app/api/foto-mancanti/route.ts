import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { sql, ensureSchema, ensureStockSchema } from "@/lib/db";
import { requireScope } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

const SPIRITI = new Set(["rum", "grappa", "whisky", "gin", "liquori", "cognac", "amaro", "limoncello", "vodka", "armagnac", "mezcal", "tequila", "sambuca", "marsala"]);

// The likely reason no clean photo was found online, from what the card says. A guess to group
// the bottles, not a certainty: the search itself did not keep its reasons.
function causa(w: { nome_vino: string; annata: string | null; categoria: string | null; formati: string | null }): string {
  if (/cofanetto|confezione|\bbox\b|trilogy|astuccio|gift/i.test(w.nome_vino)) return "Confezione o cofanetto";
  const formati = (w.formati || "").split(",").map((f) => f.trim());
  if (formati.length && formati.every((f) => f && f !== "750 ml" && f !== "700 ml")) return "Formato speciale";
  const anno = Number(w.annata);
  if (anno >= 2024) return "Annata appena uscita";
  if (anno && anno <= 2015) return "Annata vecchia";
  if (w.categoria && SPIRITI.has(w.categoria)) return "Distillato o liquore";
  return "Nessuna foto pulita online";
}

export async function GET(req: NextRequest) {
  const denied = requireScope(req, "admin");
  if (denied) return denied;
  try {
    await ensureSchema();
    await ensureStockSchema();
    const rows = await sql`
      SELECT w.id, w.nome_vino, w.produttore, w.annata, w.categoria,
             (SELECT string_agg(DISTINCT s.formato, ', ') FROM stock_items s WHERE s.scheda_id = w.id AND s.eliminato_il IS NULL) AS formati,
             (SELECT s.id FROM stock_items s WHERE s.scheda_id = w.id AND s.eliminato_il IS NULL AND s.photo IS NOT NULL ORDER BY s.created_at LIMIT 1) AS foto_magazzino
      FROM wine_scans w
      WHERE w.foto_tipo = 'nessuna'
        AND EXISTS (SELECT 1 FROM stock_items s WHERE s.scheda_id = w.id AND s.eliminato_il IS NULL)
      ORDER BY LOWER(w.nome_vino)`;
    return NextResponse.json({ bottiglie: rows.map((r) => ({ ...r, causa: causa(r as never) })) });
  } catch (error) {
    console.error("[foto-mancanti:get]", error);
    return NextResponse.json({ error: "Errore caricamento" }, { status: 500 });
  }
}

// A photo taken in the shop on a white background becomes the bottle photo customers see.
export async function POST(req: NextRequest) {
  const denied = requireScope(req, "admin");
  if (denied) return denied;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  if (!rateLimit(`foto-mancanti:${ip}`, 30)) return NextResponse.json({ error: "Troppe richieste" }, { status: 429 });
  try {
    const b = await req.json();
    const id = typeof b?.id === "string" ? b.id : "";
    const foto = typeof b?.foto === "string" ? b.foto.replace(/^data:image\/\w+;base64,/, "") : "";
    if (!id || !foto || foto.length > 4_000_000) return NextResponse.json({ error: "Foto non valida" }, { status: 400 });
    const dati = Buffer.from(foto, "base64");
    if (dati[0] !== 0xff || dati[1] !== 0xd8) return NextResponse.json({ error: "Foto non valida" }, { status: 400 });
    const [w] = await sql`SELECT id FROM wine_scans WHERE id = ${id}`;
    if (!w) return NextResponse.json({ error: "Scheda non trovata" }, { status: 404 });
    const blob = await put(`bottiglie/${id}-negozio.jpg`, dati, { access: "public", contentType: "image/jpeg", addRandomSuffix: false, allowOverwrite: true });
    await sql`UPDATE wine_scans SET bottle_image = ${blob.url}, foto_fonte = 'negozio', foto_tipo = 'negozio', foto_il = NOW() WHERE id = ${id}`;
    return NextResponse.json({ ok: true, url: blob.url });
  } catch (error) {
    console.error("[foto-mancanti:post]", error);
    return NextResponse.json({ error: "Errore salvataggio" }, { status: 500 });
  }
}
