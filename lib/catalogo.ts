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
// dubbio: the shop's bottles the front can't tell apart; the back label decides among them.
export function cerca(voci: Voce[], lettura: Lettura): { voce?: Voce; motivo: string; dubbio?: Voce[] } {
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
  if (rivale) {
    const vicine = candidate.filter((c) => c.preso >= prima.preso * (1 - MARGINE)).map((c) => c.v);
    return { motivo: `ambiguo con ${rivale.v.id}`, dubbio: vicine };
  }
  // A sibling with the same name plus a colour the photo doesn't show, and whose own front
  // label doesn't print it either (Cuvée Prestige Rosé): the text can't tell them apart, the
  // full scan sees the colour.
  const sorella = voci.find(
    (w) =>
      w.id !== prima.v.id &&
      prima.v.parole.every((p) => w.parole.includes(p)) &&
      w.parole.some((p) => COLORE.has(p) && !prima.v.parole.includes(p) && !visto.has(p) && !w.fronte?.includes(p))
  );
  if (sorella) return { motivo: `colore ambiguo con ${sorella.id}`, dubbio: [prima.v, sorella] };
  // A word of the winner's name printed on its front label but missing from the photo:
  // the photo is of another bottle (an Extra Dry is not the Brut, a Nere is not the Oro).
  const assente = prima.v.parole.find((p) => !prima.v.ditta?.includes(p) && prima.v.fronte?.includes(p) && !visto.has(p));
  if (assente) return { motivo: `manca "${assente}" del fronte di ${prima.v.id}` };

  const firma = (v: Voce) => [...v.parole].sort().join(" ");
  const annate = candidate.filter((c) => firma(c.v) === firma(prima.v));
  const letto = anno(lettura.annata);
  if (letto) {
    const giusta = annate.find((c) => anno(c.v.annata) === letto);
    // All the shop's bottles are in the warehouse: a vintage not there was misread.
    return giusta ? { voce: giusta.v, motivo: "annata" } : { motivo: `annata ${letto} non in catalogo`, dubbio: annate.map((c) => c.v) };
  }
  // Vintage not on the front: with only one in the shop, it's that one.
  return annate.length === 1 ? { voce: annate[0].v, motivo: "unica annata" } : { motivo: "piu annate", dubbio: annate.map((c) => c.v) };
}

// Second chance when no card's name matches: the card's name was written from front and back,
// the customer photographs the front ("The Original" for "The Original 10 Anni", "Terlan" for
// "Cantina Terlano"). The bottle is the one whose front label prints every word of the name
// read in the photo, if exactly one wine in the shop does and one of those words is rare.
function dalFronte(voci: Voce[], lettura: Lettura, principale: Set<string>, visto: Set<string>): { voce?: Voce; motivo: string; dubbio?: Voce[] } {
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
  if (new Set(trovate.map(firma)).size > 1) return { motivo: `fronte ambiguo: ${trovate.map((v) => v.id).join(", ")}`, dubbio: trovate };
  const letto = anno(lettura.annata);
  if (letto) {
    const giusta = trovate.find((v) => anno(v.annata) === letto);
    return giusta ? { voce: giusta, motivo: "fronte, annata" } : { motivo: `annata ${letto} non in catalogo`, dubbio: trovate };
  }
  return trovate.length === 1 ? { voce: trovate[0], motivo: "fronte, unica annata" } : { motivo: "piu annate", dubbio: trovate };
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

// The card as the customer gets it, from the shop's cards or a draft.
async function componi(id: string, lettura: Lettura) {
  const rows = await sql`
    SELECT nome_vino, produttore, annata, regione, paese, denominazione, vitigni, gradazione,
           temperatura_servizio, note_visive, note_olfattive, note_gustative, abbinamenti, descrizione, confidenza, dubbi,
           testo_etichetta, verificati, bottle_image, origine, foto_il
    FROM wine_scans WHERE id = ${id}`;
  if (!rows[0]) return null;
  const { dubbi, testo_etichetta, verificati, foto_il, ...scheda } = rows[0];
  // A field a person checked against a source is shown even if the card had doubts on it.
  const certi = (verificati as Record<string, unknown> | null) || {};
  const incerti = Object.fromEntries(
    Object.entries(senzaDatiIncerti((dubbi as string) || "", lettura.annata)).filter(([campo]) => !(campo in certi))
  );
  const vitigni = "vitigni" in certi ? scheda.vitigni : vitigniInEtichetta(scheda.vitigni, `${testo_etichetta || ""} ${lettura.testo}`);
  // foto_controllata: the photo (or its absence) was checked once; the scan must not search another.
  return { ...scheda, vitigni, ...incerti, origine: scheda.origine as string, foto_controllata: !!foto_il, catalogo_id: id, testo_etichetta: lettura.testo };
}

// The card for this photo if it's a wine of the shop; or the shop's bottles it could be, when
// only the back label can tell; null otherwise. Never throws: whatever goes wrong here, the
// full scan is still there to answer the customer.
export async function schedaDalCatalogo(imageBase64: string) {
  const inizio = Date.now();
  try {
    const [lista, lettura] = await Promise.all([voci(), leggi(imageBase64)]);
    const trovata = cerca(lista, lettura);
    // The warehouse first: a draft only answers for a bottle the shop's cards don't know.
    const { voce, motivo } = trovata.voce || trovata.dubbio ? trovata : cerca(await bozze(), lettura);
    console.log("[catalogo]", voce ? "trovato" : "non trovato", "|", voce?.id ?? motivo, "|", Date.now() - inizio, "ms");
    if (voce) {
      const scheda = await componi(voce.id, lettura);
      return scheda ? { scheda } : null;
    }
    if (trovata.dubbio && trovata.dubbio.length >= 2 && trovata.dubbio.length <= MAX_DUBBIO) {
      return { dubbio: trovata.dubbio.map((v) => v.id) };
    }
    return null;
  } catch (error) {
    console.error("[catalogo] passo allo scan completo:", error);
    return null;
  }
}

const MAX_DUBBIO = 6;

// Among the bottles in doubt, the one the back label points to. Only what tells them apart
// counts: a word of one's name and not the others' ("Rosé") weighs most, then the vintage read,
// then other label words, the rarer in the shop the more ("Montepulciano" yes, "contains
// sulphites" hardly). Every distinctive word the photo shows that a bottle lacks counts
// against it. The back must point to one clearly, or null: then the full scan decides.
type SchedaRetro = { id: string; nome_vino: string; produttore: string; annata: string; testo_etichetta: string | null };
export function decidiRetro(schede: SchedaRetro[], lettura: Lettura, quante: Map<string, number>, totale: number) {
  const nomi = schede.map((s) => new Set(parole(`${s.nome_vino} ${s.produttore}`)));
  const testi = schede.map((s, i) => new Set([...nomi[i], ...parole(s.testo_etichetta || "")]));
  const distinte = (insiemi: Set<string>[]) => {
    const comuni = insiemi.reduce((a, t) => new Set([...a].filter((p) => t.has(p))));
    return new Set(insiemi.flatMap((t) => [...t].filter((p) => !comuni.has(p))));
  };
  const daNome = distinte(nomi);
  const daTesto = distinte(testi);
  const letto = `${lettura.nome_vino} ${lettura.produttore} ${lettura.testo}`;
  const visto = new Set(parole(letto));
  // The back must be of one of these bottles: what their names share (producer, wine) is on it.
  // Read as the back's own name or producer, not in its prose; and rare in the shop: a word as
  // common as "Brut" or "Cuvée" proves nothing.
  const nomeLetto = new Set(parole(`${lettura.nome_vino} ${lettura.produttore}`));
  const insieme = [...nomi.reduce((a, t) => new Set([...a].filter((p) => t.has(p))))].filter((p) => (quante.get(p) || 0) <= totale * 0.025);
  if (!insieme.some((p) => nomeLetto.has(p))) return null;
  // A name word in the photo settles it: the label texts then only add noise (one card has
  // the English translation transcribed, its sibling not).
  const perNome = [...daNome].some((p) => visto.has(p));
  const peso = (p: string) =>
    daNome.has(p) ? 4 : perNome || (quante.get(p) || 0) > totale * 0.05 ? 0 : Math.log(totale / (quante.get(p) || 1)) / Math.log(totale);
  const anni = new Set(letto.match(/(19|20)\d\d/g) || []);
  const annataLetta = anno(lettura.annata);
  const annateDiverse = new Set(schede.map((x) => anno(x.annata))).size > 1;
  const punti = schede.map((s, i) => {
    let n = 0;
    for (const p of daTesto) if (visto.has(p)) n += testi[i].has(p) ? peso(p) : -peso(p);
    // its own distinctive name word missing from the back: a "Cuvée Rosé" without "Rosé"
    for (const p of nomi[i]) if (daNome.has(p) && !visto.has(p)) n -= 2;
    const suo = anno(s.annata);
    if (suo && annateDiverse) n += annataLetta === suo ? 5 : anni.has(suo) ? 2 : annataLetta ? -5 : 0;
    return n;
  });
  const ordine = punti.map((n, i) => ({ n, i })).sort((a, b) => b.n - a.n);
  const [prima, seconda] = ordine;
  return prima.n >= 3 && prima.n - (seconda?.n ?? 0) >= 2 ? schede[prima.i].id : null;
}

// How many shop cards print each word: a word on many labels tells little.
let diffusione: { quante: Map<string, number>; totale: number; scade: number } | null = null;
async function paroleDelNegozio() {
  if (diffusione && diffusione.scade > Date.now()) return diffusione;
  const rows = await sql`SELECT nome_vino, produttore, testo_etichetta FROM wine_scans WHERE origine = 'magazzino'`;
  const quante = new Map<string, number>();
  for (const r of rows) for (const p of new Set(parole(`${r.nome_vino} ${r.produttore} ${r.testo_etichetta || ""}`))) quante.set(p, (quante.get(p) || 0) + 1);
  diffusione = { quante, totale: rows.length, scade: Date.now() + CACHE_MS };
  return diffusione;
}

// The bottles in doubt as the customer sees them in the list: name, vintage, formats, photo.
export async function riassunti(ids: string[]) {
  const rows = await sql`
    SELECT w.id, w.nome_vino, w.produttore, w.annata, w.bottle_image,
      (SELECT string_agg(DISTINCT s.formato, ', ') FROM stock_items s WHERE s.scheda_id = w.id AND s.eliminato_il IS NULL) AS formati
    FROM wine_scans w WHERE w.id = ANY(${ids}) AND w.origine = 'magazzino'`;
  return ids.map((id) => rows.find((r) => r.id === id)).filter(Boolean);
}

// The bottle the customer picked from the list: a shop card, as the scan would give it.
export async function schedaScelta(id: string) {
  const [r] = await sql`SELECT 1 FROM wine_scans w WHERE id = ${id} AND origine = 'magazzino'
    AND EXISTS (SELECT 1 FROM stock_items s WHERE s.scheda_id = w.id AND s.eliminato_il IS NULL)`;
  return r ? componi(id, { nome_vino: "", produttore: "", annata: "", testo: "" }) : null;
}

// The back-label step: the card of the bottle it points to, or null.
export async function schedaDalRetro(imageBase64: string, ids: string[]) {
  const inizio = Date.now();
  try {
    const [schede, lettura, negozio] = await Promise.all([
      sql`SELECT id, nome_vino, produttore, annata, testo_etichetta FROM wine_scans w
          WHERE id = ANY(${ids}) AND origine = 'magazzino'
            AND EXISTS (SELECT 1 FROM stock_items s WHERE s.scheda_id = w.id AND s.eliminato_il IS NULL)`,
      leggi(imageBase64),
      paroleDelNegozio(),
    ]);
    if (schede.length < 2) return null;
    const id = decidiRetro(schede as SchedaRetro[], lettura, negozio.quante, negozio.totale);
    console.log("[retro]", id ?? "incerto", "|", Date.now() - inizio, "ms");
    return id ? await componi(id, lettura) : null;
  } catch (error) {
    console.error("[retro] passo allo scan completo:", error);
    return null;
  }
}
