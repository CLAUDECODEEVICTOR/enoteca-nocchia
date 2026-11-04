import { NextRequest, NextResponse } from "next/server";
import { sql, ensureStockSchema, wineKey } from "@/lib/db";
import { requireScope } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { readLabel } from "@/lib/stock";

export const maxDuration = 120;

const MAX_IMAGE = 4_000_000; // stays under the 4.5 MB function body limit
const ID = /^[0-9a-f-]{36}$/i;
const COLUMNS = sql`id, created_at, status, nome_vino, produttore, annata, denominazione, gradazione, formato, quantita, prezzo, confidenza, duplicate_of`;

function guard(req: NextRequest): NextResponse | null {
  const denied = requireScope(req, "admin");
  if (denied) return denied;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  if (!rateLimit(`stock:${ip}`, 240)) {
    return NextResponse.json({ error: "Troppe richieste" }, { status: 429 });
  }
  return null;
}

const text = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function GET(req: NextRequest) {
  const blocked = guard(req);
  if (blocked) return blocked;
  try {
    await ensureStockSchema();
    const items = await sql`SELECT ${COLUMNS} FROM stock_items ORDER BY created_at DESC LIMIT 5000`;
    return NextResponse.json({ items });
  } catch (error) {
    console.error("[stock:list]", error);
    return NextResponse.json({ error: "Errore caricamento" }, { status: 500 });
  }
}

// POST — register a bottle. The row and its photo are written before the label is
// read, so a failed reading leaves a row to retry instead of a lost bottle. The id
// comes from the client: resending after a dropped connection never duplicates.
export async function POST(req: NextRequest) {
  const blocked = guard(req);
  if (blocked) return blocked;
  try {
    const body = await req.json();
    const id = String(body?.id || "");
    if (!ID.test(id)) return NextResponse.json({ error: "ID non valido" }, { status: 400 });
    await ensureStockSchema();

    let image: string;
    if (body?.retry) {
      const rows = await sql`SELECT photo FROM stock_items WHERE id = ${id}`;
      if (!rows[0]?.photo) return NextResponse.json({ error: "Foto mancante" }, { status: 404 });
      image = rows[0].photo as string;
    } else {
      image = String(body?.imageBase64 || "");
      const photo = String(body?.photoBase64 || "");
      if (!image || !photo) return NextResponse.json({ error: "Immagine mancante" }, { status: 400 });
      if (image.length + photo.length > MAX_IMAGE) {
        return NextResponse.json({ error: "Immagine troppo grande" }, { status: 413 });
      }
      await sql`INSERT INTO stock_items (id, photo) VALUES (${id}, ${photo}) ON CONFLICT (id) DO NOTHING`;
      const existing = await sql`SELECT ${COLUMNS} FROM stock_items WHERE id = ${id} AND status <> 'da_leggere' AND status <> 'errore'`;
      if (existing[0]) return NextResponse.json({ item: existing[0] });
    }

    try {
      const r = await readLabel(image);
      const key = r.nome_vino ? wineKey(r.nome_vino, r.produttore, r.annata) : null;
      const twin = key
        ? await sql`SELECT id FROM stock_items WHERE wine_key = ${key} AND id <> ${id} AND duplicate_of IS NULL ORDER BY created_at LIMIT 1`
        : [];
      const clear = r.nome_vino && r.annata && (r.confidenza === "alta" || r.confidenza === "media");
      const rows = await sql`
        UPDATE stock_items SET
          status = ${clear ? "ok" : "da_controllare"},
          nome_vino = ${r.nome_vino}, produttore = ${r.produttore}, annata = ${r.annata},
          denominazione = ${r.denominazione}, gradazione = ${r.gradazione},
          confidenza = ${r.confidenza}, wine_key = ${key},
          duplicate_of = ${twin[0]?.id ?? null}, updated_at = NOW()
        WHERE id = ${id}
        RETURNING ${COLUMNS}`;
      return NextResponse.json({ item: rows[0] });
    } catch (error) {
      console.error("[stock:read]", error);
      const rows = await sql`UPDATE stock_items SET status = 'errore', updated_at = NOW() WHERE id = ${id} RETURNING ${COLUMNS}`;
      return NextResponse.json({ item: rows[0] });
    }
  } catch (error) {
    console.error("[stock:create]", error);
    return NextResponse.json({ error: "Errore salvataggio" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const blocked = guard(req);
  if (blocked) return blocked;
  try {
    const b = await req.json();
    const id = String(b?.id || "");
    if (!ID.test(id)) return NextResponse.json({ error: "ID non valido" }, { status: 400 });

    if (b.mergeInto) {
      const into = String(b.mergeInto);
      if (!ID.test(into)) return NextResponse.json({ error: "ID non valido" }, { status: 400 });
      // One statement, so the quantity can't be lost between the delete and the update.
      await sql`
        WITH src AS (
          DELETE FROM stock_items WHERE id = ${id}
            AND EXISTS (SELECT 1 FROM stock_items WHERE id = ${into})
          RETURNING quantita
        )
        UPDATE stock_items SET quantita = quantita + (SELECT quantita FROM src), updated_at = NOW()
        WHERE id = ${into} AND EXISTS (SELECT 1 FROM src)`;
      return NextResponse.json({ ok: true });
    }

    if (b.keepSeparate) {
      await sql`UPDATE stock_items SET duplicate_of = NULL, updated_at = NOW() WHERE id = ${id}`;
      return NextResponse.json({ ok: true });
    }

    const nome = text(b.nome_vino);
    const produttore = text(b.produttore);
    const annata = text(b.annata, 20);
    const quantita = Math.max(0, Math.min(9999, Math.round(Number(b.quantita)) || 0));
    const rawPrice = String(b.prezzo ?? "").replace(",", ".").trim();
    const prezzo = rawPrice && Number.isFinite(Number(rawPrice)) ? Number(rawPrice) : null;
    const key = nome ? wineKey(nome, produttore, annata) : null;
    const rows = await sql`
      UPDATE stock_items SET
        nome_vino = ${nome}, produttore = ${produttore}, annata = ${annata},
        formato = ${text(b.formato, 30) || "750 ml"}, quantita = ${quantita}, prezzo = ${prezzo},
        wine_key = ${key}, status = ${nome ? "ok" : "da_controllare"}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING ${COLUMNS}`;
    return NextResponse.json({ item: rows[0] });
  } catch (error) {
    console.error("[stock:update]", error);
    return NextResponse.json({ error: "Errore salvataggio" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const blocked = guard(req);
  if (blocked) return blocked;
  try {
    const id = req.nextUrl.searchParams.get("id") || "";
    if (!ID.test(id)) return NextResponse.json({ error: "ID non valido" }, { status: 400 });
    await sql`DELETE FROM stock_items WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[stock:delete]", error);
    return NextResponse.json({ error: "Errore eliminazione" }, { status: 500 });
  }
}
