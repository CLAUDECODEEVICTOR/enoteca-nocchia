import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema, wineKey } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { requireScope } from "@/lib/auth";

interface ScanPayload {
  nome_vino: string;
  produttore?: string;
  annata?: string;
  regione?: string;
  paese?: string;
  denominazione?: string;
  vitigni?: string[];
  gradazione?: string;
  temperatura_servizio?: string;
  note_visive?: string;
  note_olfattive?: string;
  note_gustative?: string;
  abbinamenti?: string[];
  descrizione?: string;
  bottleImage?: string | null;
  lang?: "it" | "en";
}

export async function POST(req: NextRequest) {
  try {
    const denied = requireScope(req, "app");
    if (denied) return denied;

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    if (!rateLimit(ip, 30)) {
      return NextResponse.json({ error: "Troppe richieste" }, { status: 429 });
    }

    const body = (await req.json()) as ScanPayload;

    if (!body.nome_vino || typeof body.nome_vino !== "string") {
      return NextResponse.json({ error: "Dati incompleti" }, { status: 400 });
    }

    await ensureSchema();

    const id = wineKey(body.nome_vino, body.produttore || "", body.annata || "");
    if (!id) {
      return NextResponse.json({ error: "ID invalido" }, { status: 400 });
    }

    const lang = body.lang === "en" ? "en" : "it";

    // Upsert: if row exists, increment scan_count and update last_scanned_at
    await sql`
      INSERT INTO wine_scans (
        id, nome_vino, produttore, annata, regione, paese, denominazione,
        vitigni, gradazione, temperatura_servizio, note_visive, note_olfattive,
        note_gustative, abbinamenti, descrizione, bottle_image, lang
      )
      VALUES (
        ${id},
        ${body.nome_vino},
        ${body.produttore || null},
        ${body.annata || null},
        ${body.regione || null},
        ${body.paese || null},
        ${body.denominazione || null},
        ${JSON.stringify(body.vitigni || [])}::jsonb,
        ${body.gradazione || null},
        ${body.temperatura_servizio || null},
        ${body.note_visive || null},
        ${body.note_olfattive || null},
        ${body.note_gustative || null},
        ${JSON.stringify(body.abbinamenti || [])}::jsonb,
        ${body.descrizione || null},
        ${body.bottleImage || null},
        ${lang}
      )
      ON CONFLICT (id) DO UPDATE SET
        scan_count = wine_scans.scan_count + 1,
        last_scanned_at = NOW(),
        bottle_image = COALESCE(EXCLUDED.bottle_image, wine_scans.bottle_image);
    `;

    return NextResponse.json({ ok: true, id });
  } catch (error) {
    console.error("[save-scan]", error);
    return NextResponse.json({ error: "Errore salvataggio" }, { status: 500 });
  }
}
