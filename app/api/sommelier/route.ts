import { NextRequest, NextResponse } from "next/server";
import { requireScope } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { ensureSommelierSchema } from "@/lib/db";
import { consiglia } from "@/lib/sommelier";
import { schedaScelta } from "@/lib/catalogo";

export const maxDuration = 30;

const SCELTE = ["carne", "pesce", "pizza", "formaggi", "aperitivo", "regalo", "dopocena"];
const GUSTI = ["leggero", "importante"];

// Three bottles of the shop for what the customer is eating or celebrating.
export async function POST(req: NextRequest) {
  const denied = requireScope(req, "app");
  if (denied) return denied;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  if (!rateLimit(`sommelier:${ip}`, 12)) return NextResponse.json({ error: "Troppe richieste. Riprova tra un minuto." }, { status: 429 });
  try {
    const b = await req.json();
    const scelta = SCELTE.includes(b?.scelta) ? (b.scelta as string) : undefined;
    const gusto = GUSTI.includes(b?.gusto) ? (b.gusto as string) : undefined;
    const testo = typeof b?.testo === "string" && b.testo.trim() ? b.testo.trim().slice(0, 400) : undefined;
    const escludi = Array.isArray(b?.escludi) ? b.escludi.filter((x: unknown): x is string => typeof x === "string").slice(0, 30) : [];
    const lang = b?.lang === "en" ? "en" : "it";
    if (!scelta && !testo) return NextResponse.json({ error: "Dimmi cosa mangi o per quale occasione" }, { status: 400 });
    await ensureSommelierSchema();
    const r = await consiglia({ scelta, gusto, testo, lang, escludi });
    if (!r || r.consigli.length < 3) return NextResponse.json({ error: "Nessuna bottiglia adatta in negozio" }, { status: 404 });
    return NextResponse.json(r);
  } catch (error) {
    console.error("[sommelier]", error);
    return NextResponse.json({ error: "Consiglio non riuscito, riprova" }, { status: 500 });
  }
}

// The full card of an advised bottle, as the result page shows it.
export async function GET(req: NextRequest) {
  const denied = requireScope(req, "app");
  if (denied) return denied;
  const id = req.nextUrl.searchParams.get("id") || "";
  try {
    const scheda = id ? await schedaScelta(id) : null;
    if (!scheda) return NextResponse.json({ error: "Scheda non trovata" }, { status: 404 });
    const it: Record<string, unknown> = { ...scheda };
    delete it.origine;
    return NextResponse.json({ it });
  } catch (error) {
    console.error("[sommelier:scheda]", error);
    return NextResponse.json({ error: "Scheda non caricata" }, { status: 500 });
  }
}
