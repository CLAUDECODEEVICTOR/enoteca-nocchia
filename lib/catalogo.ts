import type Anthropic from "@anthropic-ai/sdk";
import { anthropicClient } from "@/lib/anthropic";
import { sql, ensureSchema, ensureStockSchema } from "@/lib/db";
import { vitigniInEtichetta } from "@/lib/vitigni";

// The shop's wines already have a card, written from their front and back photos.
// A scan only has to work out which bottle it is: reading the label and looking it
// up takes about 2 seconds, against 5 or 6 to write a card from scratch.

interface Lettura {
  nome_vino: string;
  produttore: string;
  annata: string;
  testo: string;
}

interface Voce {
  id: string;
  nome_vino: string;
  produttore: string;
  annata: string;
  parole: string[];
  // Words that come only from the producer's name: "Marchesi" in "Marchesi Antinori".
  ditta?: string[];
  // Words on the front label, as read from the warehouse photo: what a customer's photo can show.
  fronte?: string[];
}

const LETTURA_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    nome_vino: { type: "string" },
    produttore: { type: "string" },
    annata: { type: "string" },
    testo: { type: "string" },
  },
  required: ["nome_vino", "produttore", "annata", "testo"],
};

const LETTURA_SYSTEM =
  "Leggi l'etichetta della bottiglia nella foto. testo: tutte le parole leggibili, così come sono scritte. nome_vino, produttore: solo se li leggi davvero, altrimenti vuoti. annata: solo l'anno di vendemmia o il millesimo, mai la data di fondazione della cantina; vuota se non si legge. Non dedurre nulla.";

const VUOTE = new Set(
  "di del della dello dei degli delle da de du la le il lo i gli l d e ed et and the az agr agricola azienda societa srl spa ss sas sa cantina cantine tenuta tenute vini vino wine doc docg igt igp aoc aop classico".split(" ")
);

const parole = (s: string | null | undefined) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((p) => p.length > 1 && !VUOTE.has(p) && !/^(19|20)\d\d$/.test(p));

const anno = (s: string) => s.match(/(19|20)\d\d/)?.[0] ?? null;

// Words that tell a wine from its sibling of another colour: "Cordon Bleu Brut" and
// "Cordon Bleu Brut Rosé" differ only by one of these.
const COLORE = new Set(["rose", "rosato", "rosado", "blanc", "blancs", "bianco", "rosso", "noir", "noirs", "nero"]);

const SOGLIA = 0.8;
const RARA = 3; // a word on at most this many cards tells one wine from the others
const MARGINE = 0.15;

// Exported for the tests in scripts/: decides on the reading alone, so the rules can
// be replayed over saved readings without paying for the model again.
export function cerca(voci: Voce[], lettura: Lettura): { voce?: Voce; motivo: string } {
  const frequenza = new Map<string, number>();
  for (const v of voci) for (const p of v.parole) frequenza.set(p, (frequenza.get(p) || 0) + 1);
  // A rare word says more than a common one: "Zacapa" identifies a bottle, "Brut" doesn't.
  const peso = (p: string) => Math.log(1 + voci.length / (frequenza.get(p) || 1));
  const somma = (ps: string[]) => ps.reduce((a, p) => a + peso(p), 0);

  const visto = new Set(parole(`${lettura.nome_vino} ${lettura.produttore} ${lettura.testo}`));
  const principale = new Set(parole(`${lettura.nome_vino} ${lettura.produttore}`));
  const nominate = parole(lettura.nome_vino);

  const candidate: { v: Voce; preso: number; manca: number }[] = [];
  for (const v of voci) {
    if (!v.parole.length) continue;
    // One word of the producer in the photo is enough: "Antinori" stands for "Marchesi Antinori".
    const ditta = v.ditta?.some((p) => visto.has(p)) ? new Set(v.ditta.filter((p) => !visto.has(p))) : new Set<string>();
    const sue = v.parole.filter((p) => !ditta.has(p));
    const tutto = somma(sue);
    const preso = somma(sue.filter((p) => visto.has(p)));
    if (preso / tutto < SOGLIA) continue;
    // Words seen only in the fine print may belong to the bottles next to it on the shelf,
    // unless this bottle's own front label prints them ("Grattamacco ... Bolgheri Superiore").
    if (somma(sue.filter((p) => principale.has(p) || (visto.has(p) && v.fronte?.includes(p)))) / tutto < 0.5) continue;
    // "Maximum Rosé" must not settle for "Maximum": a word that names other wines has to be on
    // this one, in its name or on its front label ("Nozzole Chianti Classico").
    if (nominate.some((p) => !v.parole.includes(p) && frequenza.has(p) && !v.fronte?.includes(p))) continue;
    candidate.push({ v, preso, manca: tutto - preso });
  }
  if (!candidate.length) return dalFronte(voci, lettura, principale, visto);

  // On a tie, the card with fewer words the photo doesn't show: "Brut" over "Brut Rosé".
  candidate.sort((a, b) => b.preso - a.preso || a.manca - b.manca);
  const prima = candidate[0];
  // A candidate whose words are all inside the winner's is the same wine or a less precise name.
  const rivale = candidate.find(
    (c) => !c.v.parole.every((p) => prima.v.parole.includes(p)) && c.preso >= prima.preso * (1 - MARGINE)
  );
  if (rivale) return { motivo: `ambiguo con ${rivale.v.id}` };
  // A sibling with the same name plus a colour the photo doesn't show, and whose own front
  // label doesn't print it either (Cuvée Prestige Rosé): the text can't tell them apart, the
  // full scan sees the colour.
  const sorella = voci.find(
    (w) =>
      w.id !== prima.v.id &&
      prima.v.parole.every((p) => w.parole.includes(p)) &&
      w.parole.some((p) => COLORE.has(p) && !prima.v.parole.includes(p) && !visto.has(p) && !w.fronte?.includes(p))
  );
  if (sorella) return { motivo: `colore ambiguo con ${sorella.id}` };
  // A word of the winner's name printed on its front label but missing from the photo:
  // the photo is of another bottle (an Extra Dry is not the Brut, a Nere is not the Oro).
  const assente = prima.v.parole.find((p) => !prima.v.ditta?.includes(p) && prima.v.fronte?.includes(p) && !visto.has(p));
  if (assente) return { motivo: `manca "${assente}" del fronte di ${prima.v.id}` };

  const firma = (v: Voce) => [...v.parole].sort().join(" ");
  const annate = candidate.filter((c) => firma(c.v) === firma(prima.v));
  const letto = anno(lettura.annata);
  if (letto) {
    const giusta = annate.find((c) => anno(c.v.annata) === letto);
    return giusta ? { voce: giusta.v, motivo: "annata" } : { motivo: `annata ${letto} non in catalogo` };
  }
  // Vintage not on the front: with only one in the shop, it's that one.
  return annate.length === 1 ? { voce: annate[0].v, motivo: "unica annata" } : { motivo: "piu annate" };
}

// Second chance when no card's name matches: the card's name was written from front and back,
// the customer photographs the front ("The Original" for "The Original 10 Anni", "Terlan" for
// "Cantina Terlano"). The bottle is the one whose front label prints every word of the name
// read in the photo, if exactly one wine in the shop does and one of those words is rare.
function dalFronte(voci: Voce[], lettura: Lettura, principale: Set<string>, visto: Set<string>): { voce?: Voce; motivo: string } {
  const chiave = [...principale];
  if (!chiave.length) return { motivo: "nessuno" };
  const frequenza = new Map<string, number>();
  for (const v of voci) for (const p of new Set([...(v.fronte || []), ...v.parole])) frequenza.set(p, (frequenza.get(p) || 0) + 1);
  if (!chiave.some((p) => (frequenza.get(p) || 0) > 0 && (frequenza.get(p) || 0) <= RARA)) return { motivo: "nessuno" };
  const trovate = voci.filter(
    (v) =>
      v.fronte?.length &&
      chiave.every((p) => v.fronte!.includes(p) || v.parole.includes(p)) &&
      // a colour its front prints and the photo doesn't show: the sibling, not this one
      !v.fronte.some((p) => COLORE.has(p) && !visto.has(p))
  );
  if (!trovate.length) return { motivo: "nessuno" };
  const firma = (v: Voce) => [...v.parole].sort().join(" ");
  if (new Set(trovate.map(firma)).size > 1) return { motivo: `fronte ambiguo: ${trovate.map((v) => v.id).join(", ")}` };
  const letto = anno(lettura.annata);
  if (letto) {
    const giusta = trovate.find((v) => anno(v.annata) === letto);
    return giusta ? { voce: giusta, motivo: "fronte, annata" } : { motivo: `annata ${letto} non in catalogo` };
  }
  return trovate.length === 1 ? { voce: trovate[0], motivo: "fronte, unica annata" } : { motivo: "piu annate" };
}

// The card's own doubts, in plain words. A customer must not read as certain a fact the
// card itself says to check, so it stays out until a person confirms it; a false alarm
// only hides a detail.
const INCERTI = {
  vitigni: /vitign|uvaggio|composizione|assemblaggio|blend/i,
  gradazione: /gradazione|% ?vol/i,
  annata: /annata|millesim|vintage/i,
  denominazione: /denominazione|\bdocg?\b|\bigt\b|\bigp\b/i,
};

function senzaDatiIncerti(dubbi: string, annataLetta: string) {
  return {
    ...(INCERTI.vitigni.test(dubbi) && { vitigni: [] }),
    ...(INCERTI.gradazione.test(dubbi) && { gradazione: "" }),
    ...(INCERTI.annata.test(dubbi) && { annata: annataLetta }),
    ...(INCERTI.denominazione.test(dubbi) && { denominazione: "" }),
  };
}

let cache: { voci: Voce[]; scade: number } | null = null;
const CACHE_MS = 5 * 60 * 1000;

// Exported with cerca, for the same replay tests.
export const voce = (r: Record<string, unknown>): Voce => ({
  id: r.id as string,
  nome_vino: r.nome_vino as string,
  produttore: (r.produttore as string) || "",
  annata: (r.annata as string) || "",
  parole: [...new Set(parole(`${r.nome_vino} ${r.produttore}`))],
  ditta: parole(r.produttore as string).filter((p) => !parole(r.nome_vino as string).includes(p)),
  fronte: [...new Set(parole(((r.testo_etichetta as string) || "").split(/retro\s*:/i)[0]))],
});

async function voci(): Promise<Voce[]> {
  if (cache && cache.scade > Date.now()) return cache.voci;
  await ensureSchema();
  await ensureStockSchema();
  // Only cards a live stock row still stands behind: correcting or deleting the row retires its card.
  const rows = await sql`
    SELECT id, nome_vino, produttore, annata, testo_etichetta FROM wine_scans w
    WHERE origine = 'magazzino' AND confidenza IN ('alta', 'media') AND COALESCE(annata, '') <> ''
      AND EXISTS (SELECT 1 FROM stock_items s WHERE s.scheda_id = w.id AND s.scheda IS NOT NULL AND s.eliminato_il IS NULL)`;
  cache = { voci: rows.map(voce), scade: Date.now() + CACHE_MS };
  return cache.voci;
}

// Drafts: cards a full scan wrote for a bottle not in the warehouse, sure of the bottle and
// not reported wrong. Read fresh on every miss, never cached: each server function keeps its
// own memory, so a new or reported draft must count from the very next scan.
async function bozze(): Promise<Voce[]> {
  const rows = await sql`
    SELECT id, nome_vino, produttore, annata FROM wine_scans
    WHERE origine = 'scan' AND lang = 'it' AND confidenza = 'alta' AND COALESCE(annata, '') <> ''`;
  return rows.map(voce);
}

async function leggi(imageBase64: string): Promise<Lettura> {
  const response = await anthropicClient.messages.create({
    model: "claude-sonnet-5-5",
    max_tokens: 1500,
    system: LETTURA_SYSTEM,
    output_config: { effort: "low", format: { type: "json_schema", schema: LETTURA_SCHEMA } },
    messages: [
      {
        role: "user",
        content: [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: imageBase64 } }],
      },
    ],
  }, { timeout: 12_000, maxRetries: 0 }); // stuck here, the full scan still has time to answer
  if (response.stop_reason !== "end_turn") throw new Error(`Lettura interrotta: ${response.stop_reason}`);
  const text = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text").pop()?.text;
  if (!text) throw new Error("Risposta senza testo");
  return JSON.parse(text) as Lettura;
}

// The card for this photo if it's a wine of the shop, null otherwise. Never throws:
// whatever goes wrong here, the full scan is still there to answer the customer.
export async function schedaDalCatalogo(imageBase64: string) {
  const inizio = Date.now();
  try {
    const [lista, lettura] = await Promise.all([voci(), leggi(imageBase64)]);
    // The warehouse first: a draft only answers for a bottle the shop's cards don't know.
    let { voce, motivo } = cerca(lista, lettura);
    if (!voce) ({ voce, motivo } = cerca(await bozze(), lettura));
    console.log("[catalogo]", voce ? "trovato" : "non trovato", "|", voce?.id ?? motivo, "|", Date.now() - inizio, "ms");
    if (!voce) return null;
    const rows = await sql`
      SELECT nome_vino, produttore, annata, regione, paese, denominazione, vitigni, gradazione,
             temperatura_servizio, note_visive, note_olfattive, note_gustative, abbinamenti, descrizione, confidenza, dubbi,
             testo_etichetta, verificati, bottle_image, origine
      FROM wine_scans WHERE id = ${voce.id}`;
    if (!rows[0]) return null;
    const { dubbi, testo_etichetta, verificati, ...scheda } = rows[0];
    // A field a person checked against a source is shown even if the card had doubts on it.
    const certi = (verificati as Record<string, unknown> | null) || {};
    const incerti = Object.fromEntries(
      Object.entries(senzaDatiIncerti((dubbi as string) || "", lettura.annata)).filter(([campo]) => !(campo in certi))
    );
    const vitigni = "vitigni" in certi ? scheda.vitigni : vitigniInEtichetta(scheda.vitigni, `${testo_etichetta || ""} ${lettura.testo}`);
    return { ...scheda, vitigni, ...incerti, origine: scheda.origine as string, catalogo_id: voce.id, testo_etichetta: lettura.testo };
  } catch (error) {
    console.error("[catalogo] passo allo scan completo:", error);
    return null;
  }
}
