import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema, ensureStockSchema } from "@/lib/db";
import { requireScope } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { OPERATORI } from "@/lib/types";

// The fields a person can check and correct. formato is not here: it comes from the warehouse rows.
const TESTO = ["produttore", "denominazione", "annata", "gradazione", "temperatura_servizio", "descrizione"] as const;
const ELENCO = ["vitigni", "abbinamenti"] as const;

export async function GET(req: NextRequest) {
  const denied = requireScope(req, "admin");
  if (denied) return denied;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  if (!rateLimit(`verifica:${ip}`, 120)) return NextResponse.json({ error: "Troppe richieste" }, { status: 429 });
  try {
    await ensureSchema();
    await ensureStockSchema();
    const id = req.nextUrl.searchParams.get("id");
    if (id) {
      const rows = await sql`
        SELECT w.id, w.nome_vino, w.produttore, w.annata, w.denominazione, COALESCE(w.vitigni, '[]'::jsonb) AS vitigni,
               w.gradazione, w.temperatura_servizio, COALESCE(w.abbinamenti, '[]'::jsonb) AS abbinamenti, w.descrizione,
               w.bottle_image, COALESCE(w.verificati, '{}'::jsonb) AS verificati, w.verificata_da, w.verificata_il,
               v.risultato
        FROM wine_scans w LEFT JOIN scheda_verifiche v ON v.id = w.id WHERE w.id = ${id}`;
      if (!rows[0]) return NextResponse.json({ error: "Scheda non trovata" }, { status: 404 });
      const bottiglie = await sql`
        SELECT id, formato, photo IS NOT NULL AS fronte, photo_back IS NOT NULL AS retro
        FROM stock_items WHERE scheda_id = ${id} AND eliminato_il IS NULL ORDER BY created_at`;
      return NextResponse.json({ scheda: rows[0], bottiglie });
    }

    // An error is open until a person checks that field; a card is done when someone marks it.
    const schede = await sql`
      SELECT w.id, w.nome_vino, w.produttore, w.annata, w.verificata_da, w.verificata_il,
             v.id IS NOT NULL AS controllata,
             COALESCE((SELECT COUNT(*) FROM jsonb_array_elements(v.risultato->'campi') c
                       WHERE c->>'esito' = 'errato' AND NOT (COALESCE(w.verificati, '{}'::jsonb) ? (c->>'campo'))), 0)::int AS errori,
             COALESCE((SELECT COUNT(*) FROM jsonb_array_elements(v.risultato->'campi') c
                       WHERE c->>'esito' = 'errato' AND c->>'gravita' = 'grave' AND NOT (COALESCE(w.verificati, '{}'::jsonb) ? (c->>'campo'))), 0)::int AS gravi
      FROM wine_scans w LEFT JOIN scheda_verifiche v ON v.id = w.id
      WHERE w.origine IS DISTINCT FROM 'magazzino'
         OR EXISTS (SELECT 1 FROM stock_items s WHERE s.scheda_id = w.id AND s.eliminato_il IS NULL)
      ORDER BY LOWER(w.nome_vino)
      LIMIT 2000`;
    return NextResponse.json({ schede });
  } catch (error) {
    console.error("[verifica:get]", error);
    return NextResponse.json({ error: "Errore caricamento" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = requireScope(req, "admin");
  if (denied) return denied;
  try {
    const b = await req.json();
    const id = typeof b?.id === "string" ? b.id : "";
    const chi = OPERATORI.includes(b?.chi) ? (b.chi as string) : "";
    if (!id || !chi) return NextResponse.json({ error: "Manca la scheda o chi verifica" }, { status: 400 });
    await ensureSchema();

    if (b.riapri) {
      await sql`UPDATE wine_scans SET verificata_da = NULL, verificata_il = NULL WHERE id = ${id}`;
      return NextResponse.json({ ok: true });
    }

    const rows = await sql`
      SELECT w.produttore, w.annata, w.denominazione, COALESCE(w.vitigni, '[]'::jsonb) AS vitigni, w.gradazione,
             w.temperatura_servizio, COALESCE(w.abbinamenti, '[]'::jsonb) AS abbinamenti, w.descrizione,
             COALESCE(w.verificati, '{}'::jsonb) AS verificati, v.risultato
      FROM wine_scans w LEFT JOIN scheda_verifiche v ON v.id = w.id WHERE w.id = ${id}`;
    const r = rows[0];
    if (!r) return NextResponse.json({ error: "Scheda non trovata" }, { status: 404 });

    const valori = (b.valori || {}) as Record<string, unknown>;
    const campi = ((r.risultato?.campi || []) as { campo: string; fonte_url?: string; citazione?: string }[]);
    const il = new Date().toISOString();
    const verificati = { ...(r.verificati as Record<string, unknown>) };
    const nuovi: Record<string, string | string[]> = { ...r } as never;
    // Every field shown is confirmed by whoever presses the button; the old value stays in "prima".
    for (const campo of [...TESTO, ...ELENCO]) {
      const prima = r[campo];
      let dopo: string | string[] = prima;
      const v = valori[campo];
      if ((TESTO as readonly string[]).includes(campo) && typeof v === "string") dopo = v.trim().slice(0, 2000);
      if ((ELENCO as readonly string[]).includes(campo) && Array.isArray(v)) {
        dopo = v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean).slice(0, 20);
      }
      const cambiato = JSON.stringify(dopo) !== JSON.stringify(prima);
      const f = campi.find((c) => c.campo === campo);
      verificati[campo] = {
        da: chi,
        il,
        fonte: f?.fonte_url || "",
        citazione: f?.citazione || "",
        ...(cambiato ? { prima } : {}),
      };
      nuovi[campo] = dopo;
    }

    // A corrected text makes its English version stale: scripts/traduci-schede.mjs writes it again.
    const tradotti = ["temperatura_servizio", "abbinamenti", "descrizione"];
    const azzeraInglese = tradotti.some((c) => JSON.stringify(nuovi[c]) !== JSON.stringify(r[c]));
    await sql`
      UPDATE wine_scans SET
        produttore = ${nuovi.produttore}, annata = ${nuovi.annata}, denominazione = ${nuovi.denominazione},
        vitigni = ${JSON.stringify(nuovi.vitigni)}::jsonb, gradazione = ${nuovi.gradazione},
        temperatura_servizio = ${nuovi.temperatura_servizio}, abbinamenti = ${JSON.stringify(nuovi.abbinamenti)}::jsonb,
        descrizione = ${nuovi.descrizione}, verificati = ${JSON.stringify(verificati)}::jsonb,
        verificata_da = ${chi}, verificata_il = ${il},
        en = CASE WHEN ${azzeraInglese} THEN NULL ELSE en END
      WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[verifica:post]", error);
    return NextResponse.json({ error: "Errore salvataggio" }, { status: 500 });
  }
}
