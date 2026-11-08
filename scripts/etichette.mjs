// The sommelier's tags for every shop bottle (type, body, sweetness, dishes, occasions), written
// once from its card so the advice can narrow the shop down without calling the model.
//   node scripts/etichette.mjs prova 10    10 bottles, printed, nothing saved
//   node scripts/etichette.mjs tutte       every shop bottle without tags yet
// Stops at TETTO dollars of model calls (ETICHETTE_TETTO overrides it).
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const root = new URL("..", import.meta.url).pathname;
require("@next/env").loadEnvConfig(root);
const { neon } = await import("@neondatabase/serverless");
const { default: Anthropic } = await import("@anthropic-ai/sdk");
const { createJiti } = await import("jiti");
const { ETICHETTE_SCHEMA } = await createJiti(import.meta.url).import(root + "lib/etichette.ts");
const sql = neon(process.env.DATABASE_URL);
const client = new Anthropic();

const TETTO = Number(process.env.ETICHETTE_TETTO) || 3;
const [modo, quante] = [process.argv[2], Number(process.argv[3]) || 10];
if (!["prova", "tutte"].includes(modo)) { console.log("uso: prova N | tutte"); process.exit(1); }

const SISTEMA = `Sei il sommelier di un'enoteca. Ricevi la scheda di una bottiglia del negozio e le assegni le etichette che servono a consigliarla.
- tipo: rosso, bianco, rosato, bollicine (ogni spumante, Champagne, Franciacorta, Prosecco), dolce (passiti, vini dolci e liquorosi, Porto, Marsala), distillato, liquore, analcolico.
- corpo: leggero, medio o strutturato, come si percepisce in bocca. Per distillati e liquori: leggero se delicato, strutturato se invecchiato e intenso.
- dolcezza: secco, morbido (abboccato, rotondo, appena dolce) o dolce.
- piatti: da 2 a 6, quelli con cui il vino sta davvero bene, partendo dagli abbinamenti della scheda.
- occasioni: da 1 a 3.
Usa la scheda e quello che sai con certezza di quel vino. Nel dubbio scegli meno piatti, non di più.`;

const righe = await sql`
  SELECT w.id, w.nome_vino, w.produttore, w.annata, w.categoria, w.denominazione, w.vitigni, w.gradazione,
         w.note_gustative, w.abbinamenti, w.abbinamenti_sito, w.occasione, w.descrizione
  FROM wine_scans w
  WHERE w.origine = 'magazzino' AND w.etichette IS NULL
    AND EXISTS (SELECT 1 FROM stock_items s WHERE s.scheda_id = w.id AND s.eliminato_il IS NULL)
  ORDER BY w.nome_vino`;
const lista = modo === "prova" ? righe.sort(() => Math.random() - 0.5).slice(0, quante) : righe;
console.log(`bottiglie da fare: ${lista.length}`);

let spesa = 0, fatte = 0;
async function etichetta(w) {
  const { id, ...scheda } = w;
  const r = await client.messages.create({
    model: "claude-sonnet-5-5",
    max_tokens: 400,
    system: SISTEMA,
    output_config: { effort: "low", format: { type: "json_schema", schema: ETICHETTE_SCHEMA } },
    messages: [{ role: "user", content: JSON.stringify(scheda) }],
  });
  spesa += (r.usage.input_tokens * 2 + r.usage.output_tokens * 10) / 1e6;
  const e = JSON.parse(r.content.find((b) => b.type === "text").text);
  e.piatti = [...new Set(e.piatti)].slice(0, 6);
  e.occasioni = [...new Set(e.occasioni)].slice(0, 3);
  return { id, e };
}

// Six at a time: quick, and well under the rate limits.
for (let i = 0; i < lista.length && spesa < TETTO; i += 6) {
  const gruppo = await Promise.allSettled(lista.slice(i, i + 6).map(etichetta));
  for (const [k, g] of gruppo.entries()) {
    const w = lista[i + k];
    if (g.status === "rejected") { console.log(`ERRORE ${w.id}: ${g.reason?.message}`); continue; }
    const { e } = g.value;
    console.log(`${w.nome_vino} (${w.produttore}) | ${e.tipo}, ${e.corpo}, ${e.dolcezza} | ${e.piatti.join(", ")} | ${e.occasioni.join(", ")}`);
    if (modo === "tutte") await sql`UPDATE wine_scans SET etichette = ${JSON.stringify(e)}::jsonb WHERE id = ${w.id}`;
    fatte++;
  }
}
console.log(`\nfatte ${fatte} su ${lista.length}, spesa modello $${spesa.toFixed(3)}${spesa >= TETTO ? " (TETTO raggiunto)" : ""}`);
