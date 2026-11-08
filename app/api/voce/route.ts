import { NextRequest, NextResponse } from "next/server";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { requireScope } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { sql, ensureSommelierSchema } from "@/lib/db";

// The sommelier's advice read aloud by ElevenLabs. Only text the sommelier wrote is spoken,
// looked up by the advice id: the endpoint never reads arbitrary text sent by a browser.

export const maxDuration = 30;

// Rossana, a warm Italian conversational voice from the ElevenLabs library (to confirm with the shop).
const VOCE = "MuTiG4dbrEGYEy3XP4iP";
const MODELLO = "eleven_v4";
const DOLLARI_PER_MILLE = 0.08; // eleven_v4, official API price per 1000 characters
// Without a PIN, a ceiling per day keeps a leaked link from emptying the monthly credits.
const CARATTERI_AL_GIORNO = 30_000;

const client = new ElevenLabsClient();

type Testi = { lang: "it" | "en"; intro: string; consigli: { nome: string; produttore: string; perche: string }[] };

// The whole advice (intro and the three bottles) or a single bottle, n from 1.
function daLeggere(t: Testi, n: number | null): string {
  const bottiglia = (c: Testi["consigli"][number]) => `${c.nome}, ${c.produttore}. ${c.perche}`;
  if (n) return t.consigli[n - 1] ? bottiglia(t.consigli[n - 1]) : "";
  return [t.intro, ...t.consigli.map(bottiglia)].join("\n\n");
}

export async function GET(req: NextRequest) {
  const denied = requireScope(req, "app");
  if (denied) return denied;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  if (!rateLimit(`voce:${ip}`, 20)) return NextResponse.json({ error: "Troppe richieste" }, { status: 429 });
  const consiglio = Number(req.nextUrl.searchParams.get("consiglio"));
  const n = Number(req.nextUrl.searchParams.get("n")) || null;
  if (!Number.isInteger(consiglio) || consiglio <= 0) return NextResponse.json({ error: "Consiglio non valido" }, { status: 400 });
  try {
    await ensureSommelierSchema();
    const [oggi] = await sql`SELECT COALESCE(SUM(caratteri), 0)::int AS n FROM voce_usi WHERE creato_il > date_trunc('day', NOW())`;
    if (oggi.n >= CARATTERI_AL_GIORNO) return NextResponse.json({ error: "Voce esaurita per oggi" }, { status: 429 });
    // Only fresh advice: a customer listens right after asking, not days later.
    const [riga] = await sql`SELECT testi FROM sommelier_consigli WHERE id = ${consiglio} AND creato_il > NOW() - INTERVAL '2 hours'`;
    const testi = riga?.testi as Testi | undefined;
    const testo = testi ? daLeggere(testi, n) : "";
    if (!testi || !testo) return NextResponse.json({ error: "Consiglio non trovato" }, { status: 404 });

    const audio = await client.textToSpeech.stream(VOCE, {
      text: testo,
      modelId: MODELLO,
      languageCode: testi.lang,
      outputFormat: "mp3_44100_128",
    });
    await sql`INSERT INTO voce_usi (consiglio, caratteri, modello, costo)
      VALUES (${consiglio}, ${testo.length}, ${MODELLO}, ${(testo.length / 1000) * DOLLARI_PER_MILLE})`;
    return new Response(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600" } });
  } catch (error) {
    console.error("[voce]", error);
    return NextResponse.json({ error: "Voce non disponibile" }, { status: 502 });
  }
}
