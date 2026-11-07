import { NextRequest, NextResponse } from "next/server";
import { sql, ensureTempiSchema } from "@/lib/db";
import { requireScope } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const denied = requireScope(req, "app");
  if (denied) return denied;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  if (!rateLimit(`tempi:${ip}`, 30)) return NextResponse.json({ error: "Troppe richieste" }, { status: 429 });
  try {
    const b = await req.json();
    const ms = Math.round(Number(b?.ms));
    if (!Number.isFinite(ms) || ms <= 0 || ms > 300_000) {
      return NextResponse.json({ error: "Tempo non valido" }, { status: 400 });
    }
    const fonte = b?.fonte === "catalogo" ? "catalogo" : "completo";
    const lang = b?.lang === "en" ? "en" : "it";
    const vino = typeof b?.vino === "string" ? b.vino.slice(0, 200) : null;
    const dopo = (v: unknown) => {
      const n = Math.round(Number(v));
      return v !== null && Number.isFinite(n) && n >= ms && n <= 300_000 ? n : null;
    };
    const msScheda = dopo(b?.ms_scheda);
    const msFoto = dopo(b?.ms_foto);
    await ensureTempiSchema();
    await sql`INSERT INTO scan_tempi (fonte, lang, ms, vino, ms_scheda, ms_foto) VALUES (${fonte}, ${lang}, ${ms}, ${vino}, ${msScheda}, ${msFoto})`;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[tempi:save]", error);
    return NextResponse.json({ error: "Errore salvataggio" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const denied = requireScope(req, "admin");
  if (denied) return denied;
  try {
    await ensureTempiSchema();
    const riepilogo = await sql`
      SELECT fase, fonte, COUNT(*)::int AS n,
             ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ms))::int AS mediana,
             ROUND(AVG(ms))::int AS media, MAX(ms)::int AS massimo,
             ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ms) FILTER (WHERE ms_scheda IS NOT NULL))::int AS mediana_risposta,
             ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ms_scheda))::int AS mediana_scheda,
             ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ms_foto))::int AS mediana_foto,
             COUNT(ms_scheda)::int AS n_completi
      FROM scan_tempi GROUP BY GROUPING SETS ((fase), (fase, fonte))`;
    const ultimi = await sql`
      SELECT id, created_at, fonte, ms, ms_scheda, ms_foto, vino FROM scan_tempi
      WHERE fase = 'reale' ORDER BY created_at DESC LIMIT 30`;
    return NextResponse.json({ riepilogo, ultimi });
  } catch (error) {
    console.error("[tempi:list]", error);
    return NextResponse.json({ error: "Errore caricamento" }, { status: 500 });
  }
}
