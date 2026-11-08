// The English texts of every shop card, written once so English customers read the card in their
// language (and an English scan can use the ready card instead of writing its own).
// Only the descriptive texts: names, producers, appellations, grapes and numbers stay as they are.
//   node scripts/traduci-schede.mjs prova 5    5 cards, printed, nothing saved
//   node scripts/traduci-schede.mjs tutte      every shop card without English yet
// Stops at TETTO dollars of model calls (TRADUZIONE_TETTO overrides it).
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const root = new URL("..", import.meta.url).pathname;
require("@next/env").loadEnvConfig(root);
const { neon } = await import("@neondatabase/serverless");
const { default: Anthropic } = await import("@anthropic-ai/sdk");
const sql = neon(process.env.DATABASE_URL);
const client = new Anthropic();

const TETTO = Number(process.env.TRADUZIONE_TETTO) || 4;
const [modo, quante] = [process.argv[2], Number(process.argv[3]) || 5];
if (!["prova", "tutte"].includes(modo)) { console.log("uso: prova N | tutte"); process.exit(1); }

const testo = { type: "string" };
const SCHEMA = {
  type: "object",
  properties: {
    regione: testo, paese: testo, temperatura_servizio: testo, note_visive: testo,
    note_olfattive: testo, note_gustative: testo, descrizione: testo,
    abbinamenti: { type: "array", items: testo },
  },
  required: ["regione", "paese", "temperatura_servizio", "note_visive", "note_olfattive", "note_gustative", "descrizione", "abbinamenti"],
  additionalProperties: false,
};

const SISTEMA = `You translate an Italian wine shop's bottle card into natural British-friendly English for tourists in the shop.
- Translate every field you receive, keeping its meaning and length. Same number of items in "abbinamenti", same order.
- Keep proper names as they are: wine names, producers, appellations (DOC, DOCG, IGT), grape varieties, Italian dishes with no common English name (translate the rest: "tagliata di manzo" → "sliced beef tagliata").
- Regions and countries in their English form (Toscana → Tuscany, Italia → Italy, Francia → France).
- Temperatures and numbers unchanged.
- An empty field stays empty.
Write as a sommelier talking to a customer: plain, warm, no flourish added.`;

const righe = await sql`
  SELECT w.id, w.regione, w.paese, w.temperatura_servizio, w.note_visive, w.note_olfattive, w.note_gustative,
         COALESCE(w.abbinamenti, '[]'::jsonb) AS abbinamenti, w.descrizione
  FROM wine_scans w
  WHERE w.origine = 'magazzino' AND w.en IS NULL
    AND EXISTS (SELECT 1 FROM stock_items s WHERE s.scheda_id = w.id AND s.eliminato_il IS NULL)
  ORDER BY w.nome_vino`;
const lista = modo === "prova" ? righe.sort(() => Math.random() - 0.5).slice(0, quante) : righe;
console.log(`schede da tradurre: ${lista.length}`);

let spesa = 0, fatte = 0;
async function traduci(w) {
  const { id, ...campi } = w;
  const r = await client.messages.create({
    model: "claude-sonnet-5-5",
    max_tokens: 1200,
    system: SISTEMA,
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content: JSON.stringify(campi) }],
  });
  spesa += (r.usage.input_tokens * 2 + r.usage.output_tokens * 10) / 1e6;
  const en = JSON.parse(r.content.find((b) => b.type === "text").text);
  // Never more pairings than the Italian card has: the two lists must match one to one.
  en.abbinamenti = en.abbinamenti.slice(0, campi.abbinamenti.length);
  return { id, en };
}

// Six at a time: quick, and well under the rate limits.
for (let i = 0; i < lista.length && spesa < TETTO; i += 6) {
  const gruppo = await Promise.allSettled(lista.slice(i, i + 6).map(traduci));
  for (const [k, g] of gruppo.entries()) {
    const w = lista[i + k];
    if (g.status === "rejected") { console.log(`ERRORE ${w.id}: ${g.reason?.message}`); continue; }
    const { en } = g.value;
    if (modo === "prova") console.log(`\n${w.id}\n  IT: ${w.descrizione}\n  EN: ${en.descrizione}\n  ${w.regione}, ${w.paese} → ${en.regione}, ${en.paese}\n  ${w.abbinamenti.join(" / ")}\n  → ${en.abbinamenti.join(" / ")}\n  ${w.temperatura_servizio}\n  → ${en.temperatura_servizio}`);
    if (modo === "tutte") await sql`UPDATE wine_scans SET en = ${JSON.stringify(en)}::jsonb WHERE id = ${w.id}`;
    fatte++;
  }
  if (modo === "tutte") process.stdout.write(`\r${fatte}/${lista.length}  $${spesa.toFixed(2)}`);
}
console.log(`\nfatte ${fatte} su ${lista.length}, spesa modello $${spesa.toFixed(3)}${spesa >= TETTO ? " (TETTO raggiunto)" : ""}`);
