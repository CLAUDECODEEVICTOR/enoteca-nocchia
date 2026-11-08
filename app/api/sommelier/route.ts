import { NextRequest, NextResponse } from "next/server";
import { requireScope } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { sql, ensureSommelierSchema } from "@/lib/db";
import { consiglia } from "@/lib/sommelier";
import { schedaScelta, perLingue } from "@/lib/catalogo";

export const maxDuration = 30;

const SCELTE = ["pesce", "carne", "pizza", "formaggi", "dolci", "aperitivo", "dopocena", "regalo"];
const GUSTI = ["leggero", "morbido", "intenso"];
// Without a PIN, a ceiling per day keeps a leaked link from running up the bill.
const MASSIMO_AL_GIORNO = 400;

// Three bottles of the shop for what the customer is eating or celebrating.
export async function POST(req: NextRequest) {
  const denied = requireScope(req, "app");
  if (denied) return denied;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  if (!rateLimit(`sommelier:${ip}`, 12)) return NextResponse.json({ error: "Troppe richieste. Riprova tra un minuto." }, { status: 429 });
  try {
    const b = await req.json();
    const scelte = Array.isArray(b?.scelte) ? [...new Set(b.scelte.filter((x: unknown): x is string => typeof x === "string" && SCELTE.includes(x)))].slice(0, 4) as string[] : [];
    const gusto = GUSTI.includes(b?.gusto) ? (b.gusto as string) : undefined;
    const testo = typeof b?.testo === "string" && b.testo.trim() ? b.testo.trim().slice(0, 400) : undefined;
    const escludi = Array.isArray(b?.escludi) ? b.escludi.filter((x: unknown): x is string => typeof x === "string").slice(0, 30) : [];
    const lang = b?.lang === "en" ? "en" : "it";
    if (!scelte.length && !testo) return NextResponse.json({ error: "Dimmi cosa mangi o per quale occasione" }, { status: 400 });
    await ensureSommelierSchema();
    const [oggi] = await sql`SELECT COUNT(*)::int AS n FROM sommelier_consigli WHERE creato_il > date_trunc('day', NOW())`;
    if (oggi.n >= MASSIMO_AL_GIORNO) return NextResponse.json({ error: "Il sommelier riposa: riprova domani." }, { status: 429 });
    // One JSON line per event, sent as it happens: the page shows each bottle as soon as it arrives.
    const codifica = new TextEncoder();
    const corpo = new ReadableStream({
      async start(controller) {
        const invia = (e: unknown) => controller.enqueue(codifica.encode(JSON.stringify(e) + "\n"));
        try {
          if (!(await consiglia({ scelte, gusto, testo, lang, escludi }, invia))) invia({ tipo: "nessuno" });
        } catch (error) {
          console.error("[sommelier]", error);
          invia({ tipo: "errore" });
        }
        controller.close();
      },
    });
    return new Response(corpo, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
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
    return NextResponse.json(perLingue(scheda));
  } catch (error) {
    console.error("[sommelier:scheda]", error);
    return NextResponse.json({ error: "Scheda non caricata" }, { status: 500 });
  }
}
