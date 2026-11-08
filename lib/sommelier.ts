import { sql } from "./db";
import { anthropicClient } from "./anthropic";
import { PAROLE, PIATTI, OCCASIONI, TIPI, CORPI, type Etichette } from "./etichette";

// The advice of Enoteca Nocchia: the shop's bottles narrowed by their tags (no model, no cost),
// then the model picks three of a few dozen and says why, from what their cards say.

type Bottiglia = {
  id: string;
  nome_vino: string;
  produttore: string;
  annata: string;
  denominazione: string;
  etichette: Etichette;
  abbinamenti: string[];
  descrizione: string;
  note_gustative: string;
  bottle_image: string | null;
};

export type Richiesta = { scelta?: string; gusto?: string; testo?: string; lang: "it" | "en"; escludi?: string[] };

// The quick choices on screen and the tags they stand for.
const SCELTE: Record<string, Partial<Pick<Etichette, "piatti" | "occasioni">> & { tipi?: Etichette["tipo"][] }> = {
  carne: { piatti: ["carne-rossa", "carne-bianca", "selvaggina"] },
  pesce: { piatti: ["pesce", "crudi-di-mare", "primi-di-mare"] },
  pizza: { piatti: ["pizza"] },
  formaggi: { piatti: ["formaggi-stagionati", "formaggi-freschi"] },
  aperitivo: { occasioni: ["aperitivo"], piatti: ["antipasti", "salumi"] },
  regalo: { occasioni: ["regalo", "grande-occasione"] },
  dopocena: { occasioni: ["dopo-cena", "meditazione"], tipi: ["dolce", "distillato", "liquore"] },
};

const CANDIDATE = 24;
const CACHE_MS = 5 * 60_000;
let cache: { lista: Bottiglia[]; scade: number } | null = null;

// The shop's bottles still on the shelf, with their tags.
async function bottiglie(): Promise<Bottiglia[]> {
  if (cache && cache.scade > Date.now()) return cache.lista;
  const rows = await sql`
    SELECT w.id, w.nome_vino, w.produttore, w.annata, w.denominazione, w.etichette,
           COALESCE(w.abbinamenti, '[]'::jsonb) AS abbinamenti, COALESCE(w.descrizione, '') AS descrizione,
           COALESCE(w.note_gustative, '') AS note_gustative,
           CASE WHEN w.foto_il IS NOT NULL THEN w.bottle_image END AS bottle_image
    FROM wine_scans w
    WHERE w.origine = 'magazzino' AND w.etichette IS NOT NULL
      AND EXISTS (SELECT 1 FROM stock_items s WHERE s.scheda_id = w.id AND s.eliminato_il IS NULL AND s.quantita > 0)`;
  cache = { lista: rows as Bottiglia[], scade: Date.now() + CACHE_MS };
  return cache.lista;
}

// What the customer asked for, as tags: the quick choice plus the words of the free text.
export function cosaCerca(r: Richiesta) {
  const piatti = new Set<string>();
  const occasioni = new Set<string>();
  const tipi = new Set<string>();
  let corpo: string | null = r.gusto === "leggero" ? "leggero" : r.gusto === "importante" ? "strutturato" : null;
  const s = r.scelta ? SCELTE[r.scelta] : undefined;
  s?.piatti?.forEach((p) => piatti.add(p));
  s?.occasioni?.forEach((o) => occasioni.add(o));
  s?.tipi?.forEach((t) => tipi.add(t));
  for (const [re, tag] of PAROLE) {
    if (!r.testo || !re.test(r.testo)) continue;
    tag.piatti?.forEach((p) => piatti.add(p));
    tag.occasioni?.forEach((o) => occasioni.add(o));
    if (tag.tipo) tipi.add(tag.tipo);
    if (tag.corpo && !corpo) corpo = tag.corpo;
  }
  return { piatti, occasioni, tipi, corpo };
}

// Bottles shown often lately lose a little ground, so equally good ones take turns.
async function mostrateDiRecente(): Promise<Map<string, number>> {
  const rows = await sql`
    SELECT u.bottiglia, COUNT(*)::int AS n FROM sommelier_consigli c, UNNEST(c.scelte) AS u(bottiglia)
    WHERE c.creato_il > NOW() - INTERVAL '14 days' GROUP BY u.bottiglia`;
  return new Map(rows.map((r) => [r.bottiglia as string, r.n as number]));
}

function candidate(lista: Bottiglia[], cerca: ReturnType<typeof cosaCerca>, recenti: Map<string, number>, escludi: Set<string>) {
  const conPiatto = cerca.piatti.size > 0;
  const punteggi = lista
    .filter((b) => !escludi.has(b.id))
    .filter((b) => !cerca.tipi.size || cerca.tipi.has(b.etichette.tipo))
    // With food, spirits and liqueurs are not what the customer is after.
    .filter((b) => !conPiatto || cerca.tipi.size > 0 || !["distillato", "liquore", "analcolico"].includes(b.etichette.tipo))
    .map((b) => {
      const e = b.etichette;
      let p = 0;
      p += 3 * e.piatti.filter((x) => cerca.piatti.has(x)).length;
      p += 2 * e.occasioni.filter((x) => cerca.occasioni.has(x)).length;
      if (cerca.corpo) p += e.corpo === cerca.corpo ? 1.5 : e.corpo === "medio" ? 0 : -1.5;
      p -= Math.min(2, 0.5 * (recenti.get(b.id) || 0));
      // A bottle the customer can see on screen is a little better than one without a photo.
      if (b.bottle_image) p += 0.5;
      return { b, p: p + Math.random() * 0.8 };
    })
    .filter((x) => (conPiatto ? x.b.etichette.piatti.some((y) => cerca.piatti.has(y)) : true))
    .sort((a, b) => b.p - a.p);
  return punteggi.slice(0, CANDIDATE).map((x) => x.b);
}

const SISTEMA: Record<"it" | "en", string> = {
  it: `Sei il sommelier di Enoteca Nocchia, enoteca di famiglia. Un cliente in negozio ti chiede un consiglio.
Scegli 3 bottiglie dall'elenco, tutte adatte alla richiesta, e diverse tra loro: non tre vini quasi uguali.
Per ognuna scrivi "perche": una sola frase di massimo 20 parole, concreta, detta al cliente come la direbbe il titolare al banco. Spiega perché va bene con quel piatto o quell'occasione.
Usa solo quello che c'è nelle informazioni della bottiglia: niente annate, premi o dettagli che non vedi. Non parlare di prezzi né di "più economico" o "più caro": i prezzi non li conosci. Parla del vino e del piatto, mai dell'elenco o delle informazioni che hai ricevuto: niente "scheda", "tra gli abbinamenti", "l'unico qui". Niente frasi generiche come "ottimo equilibrio".
"intro": una frase di massimo 15 parole, calda, che introduce i consigli, senza nominare le bottiglie.
Rispondi in italiano.`,
  en: `You are the sommelier of Enoteca Nocchia, a family wine shop. A customer in the shop asks for advice.
Pick 3 bottles from the list, all suited to the request and different from each other: not three nearly identical wines.
For each write "perche": one sentence of at most 20 words, concrete, said to the customer the way the owner would say it at the counter. Explain why it works with that dish or occasion.
Use only what is in the bottle's information: no vintages, awards or details you cannot see. Never mention prices, "cheaper" or "more expensive": you do not know the prices. Talk about the wine and the dish, never about the list or the information you were given: no "card", "listed with", "the only one here". No generic phrases like "great balance".
"intro": one warm sentence of at most 15 words introducing the advice, without naming the bottles.
Answer in English.`,
};

const SCHEMA = {
  type: "object",
  properties: {
    intro: { type: "string" },
    consigli: {
      type: "array",
      items: {
        type: "object",
        properties: { n: { type: "integer" }, perche: { type: "string" } },
        required: ["n", "perche"],
        additionalProperties: false,
      },
    },
  },
  required: ["intro", "consigli"],
  additionalProperties: false,
} as const;

// Free words the word list does not know ("a romantic dinner"): a short model call turns them into tags.
const TAG_SCHEMA = {
  type: "object",
  properties: {
    piatti: { type: "array", items: { type: "string", enum: [...PIATTI] } },
    occasioni: { type: "array", items: { type: "string", enum: [...OCCASIONI] } },
    tipi: { type: "array", items: { type: "string", enum: [...TIPI] } },
    corpo: { type: "string", enum: [...CORPI, "nessuno"] },
  },
  required: ["piatti", "occasioni", "tipi", "corpo"],
  additionalProperties: false,
} as const;

async function tagDalTesto(testo: string, cerca: ReturnType<typeof cosaCerca>) {
  const r = await anthropicClient.messages.create({
    model: "claude-sonnet-5-5",
    max_tokens: 300,
    system: "Un cliente di un'enoteca descrive cosa cerca. Traduci la richiesta nelle etichette: i piatti che mangerà, l'occasione, il tipo di vino solo se lo chiede, il corpo solo se lo chiede. Liste vuote se non c'è niente.",
    output_config: { effort: "low", format: { type: "json_schema", schema: TAG_SCHEMA } },
    messages: [{ role: "user", content: testo.slice(0, 400) }],
  }, { timeout: 10_000, maxRetries: 0 });
  const t = r.content.find((b) => b.type === "text");
  if (!t || t.type !== "text") return 0;
  const e = JSON.parse(t.text) as { piatti: string[]; occasioni: string[]; tipi: string[]; corpo: string };
  e.piatti.forEach((p) => cerca.piatti.add(p));
  e.occasioni.forEach((o) => cerca.occasioni.add(o));
  e.tipi.forEach((x) => cerca.tipi.add(x));
  if (e.corpo !== "nessuno") cerca.corpo = e.corpo;
  return (r.usage.input_tokens * 2 + r.usage.output_tokens * 10) / 1e6;
}

export type Consiglio = { id: string; nome_vino: string; produttore: string; annata: string; bottle_image: string | null; perche: string };
export type Evento = { tipo: "intro"; testo: string } | { tipo: "consiglio"; consiglio: Consiglio } | { tipo: "fine"; ms: number };

// The three bottles, in the order the model writes them: each goes out as soon as its sentence
// is complete, so the first bottle is on screen while the others are still being written.
// Returns false when the shop has fewer than three bottles that fit.
export async function consiglia(r: Richiesta, invia: (e: Evento) => void): Promise<boolean> {
  const inizio = Date.now();
  const cerca = cosaCerca(r);
  let costo = 0;
  if (r.testo && !cerca.piatti.size && !cerca.occasioni.size && !cerca.tipi.size) costo += await tagDalTesto(r.testo, cerca).catch(() => 0);
  const [lista, recenti] = await Promise.all([bottiglie(), mostrateDiRecente()]);
  const scelte = candidate(lista, cerca, recenti, new Set(r.escludi || []));
  if (scelte.length < 3) return false;

  const elenco = scelte
    .map((b, i) => {
      const e = b.etichette;
      return `${i + 1}. ${b.nome_vino}, ${b.produttore}${b.denominazione ? `, ${b.denominazione}` : ""} | ${e.tipo}, ${e.corpo}, ${e.dolcezza} | abbinamenti: ${b.abbinamenti.join("; ")} | ${b.note_gustative} ${b.descrizione}`;
    })
    .join("\n");
  const domanda = [
    r.scelta && `Scelta: ${r.scelta}`,
    r.gusto && `Gusto: ${r.gusto}`,
    r.testo && `Parole del cliente: "${r.testo.slice(0, 400)}"`,
  ].filter(Boolean).join("\n");

  const consigli: Consiglio[] = [];
  const presi = new Set<number>();
  let intro = false;
  const prendi = (n: number, perche: string) => {
    if (consigli.length >= 3 || n < 1 || n > scelte.length || presi.has(n)) return;
    presi.add(n);
    const b = scelte[n - 1];
    const c = { id: b.id, nome_vino: b.nome_vino, produttore: b.produttore, annata: b.annata, bottle_image: b.bottle_image, perche };
    consigli.push(c);
    invia({ tipo: "consiglio", consiglio: c });
  };

  const flusso = anthropicClient.messages.stream({
    model: "claude-sonnet-5-5",
    max_tokens: 700,
    system: SISTEMA[r.lang],
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content: `${domanda}\n\nBottiglie in negozio:\n${elenco}` }],
  }, { timeout: 20_000, maxRetries: 1 });

  // The JSON arrives in pieces: a field counts once its closing quote has arrived.
  const STRINGA = '"((?:[^"\\\\]|\\\\.)*)"';
  let testo = "";
  for await (const ev of flusso) {
    if (ev.type !== "content_block_delta" || ev.delta.type !== "text_delta") continue;
    testo += ev.delta.text;
    if (!intro) {
      const m = testo.match(new RegExp(`"intro"\\s*:\\s*${STRINGA}`));
      if (m) {
        intro = true;
        invia({ tipo: "intro", testo: JSON.parse(`"${m[1]}"`) });
      }
    }
    for (const m of testo.matchAll(new RegExp(`\\{\\s*"n"\\s*:\\s*(\\d+)\\s*,\\s*"perche"\\s*:\\s*${STRINGA}`, "g"))) {
      prendi(Number(m[1]), JSON.parse(`"${m[2]}"`));
    }
  }
  const risposta = await flusso.finalMessage();
  if (risposta.stop_reason !== "end_turn") throw new Error(`Consiglio interrotto: ${risposta.stop_reason}`);
  // Whatever the pieces missed, the whole reply has.
  const out = JSON.parse(testo) as { intro: string; consigli: { n: number; perche: string }[] };
  if (!intro) invia({ tipo: "intro", testo: out.intro });
  for (const c of out.consigli) prendi(c.n, c.perche);

  const ms = Date.now() - inizio;
  costo += (risposta.usage.input_tokens * 2 + risposta.usage.output_tokens * 10) / 1e6;
  await sql`INSERT INTO sommelier_consigli (richiesta, scelte, ms, costo)
    VALUES (${JSON.stringify({ scelta: r.scelta, gusto: r.gusto, testo: r.testo, lang: r.lang })}::jsonb, ${consigli.map((c) => c.id)}, ${ms}, ${costo})`;
  invia({ tipo: "fine", ms });
  return true;
}
