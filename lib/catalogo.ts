import type Anthropic from "@anthropic-ai/sdk";
import { anthropicClient } from "@/lib/anthropic";
import { sql, ensureSchema } from "@/lib/db";

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

const SOGLIA = 0.8;
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

  const candidate: { v: Voce; preso: number }[] = [];
  for (const v of voci) {
    if (!v.parole.length) continue;
    const tutto = somma(v.parole);
    const preso = somma(v.parole.filter((p) => visto.has(p)));
    if (preso / tutto < SOGLIA) continue;
    // Words seen only in the fine print may belong to the bottles next to it on the shelf.
    if (somma(v.parole.filter((p) => principale.has(p))) / tutto < 0.5) continue;
    // "Maximum Rosé" must not settle for "Maximum": a word that names other wines has to be on this one.
    if (nominate.some((p) => !v.parole.includes(p) && frequenza.has(p))) continue;
    candidate.push({ v, preso });
  }
  if (!candidate.length) return { motivo: "nessuno" };

  candidate.sort((a, b) => b.preso - a.preso);
  const prima = candidate[0];
  // A candidate whose words are all inside the winner's is the same wine or a less precise name.
  const rivale = candidate.find(
    (c) => !c.v.parole.every((p) => prima.v.parole.includes(p)) && c.preso >= prima.preso * (1 - MARGINE)
  );
  if (rivale) return { motivo: `ambiguo con ${rivale.v.id}` };

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

let cache: { voci: Voce[]; scade: number } | null = null;
const CACHE_MS = 5 * 60 * 1000;

async function voci(): Promise<Voce[]> {
  if (cache && cache.scade > Date.now()) return cache.voci;
  await ensureSchema();
  const rows = await sql`
    SELECT id, nome_vino, produttore, annata FROM wine_scans
    WHERE origine = 'magazzino' AND confidenza IN ('alta', 'media') AND COALESCE(annata, '') <> ''`;
  const lista = rows.map((r) => ({
    id: r.id as string,
    nome_vino: r.nome_vino as string,
    produttore: (r.produttore as string) || "",
    annata: (r.annata as string) || "",
    parole: [...new Set(parole(`${r.nome_vino} ${r.produttore}`))],
  }));
  cache = { voci: lista, scade: Date.now() + CACHE_MS };
  return lista;
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
  });
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
    const { voce, motivo } = cerca(lista, lettura);
    console.log("[catalogo]", voce ? "trovato" : "non trovato", "|", voce?.id ?? motivo, "|", Date.now() - inizio, "ms");
    if (!voce) return null;
    const rows = await sql`
      SELECT nome_vino, produttore, annata, regione, paese, denominazione, vitigni, gradazione,
             temperatura_servizio, note_visive, note_olfattive, note_gustative, abbinamenti, descrizione, confidenza
      FROM wine_scans WHERE id = ${voce.id}`;
    return rows[0] ? { ...rows[0], testo_etichetta: lettura.testo } : null;
  } catch (error) {
    console.error("[catalogo] passo allo scan completo:", error);
    return null;
  }
}
