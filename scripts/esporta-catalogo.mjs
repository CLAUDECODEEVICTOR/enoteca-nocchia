// Writes catalogo-sito.json: what the e-commerce needs, one product per wine and size.
// Same fields as dati/righe.js of the demo site, plus quantita and the card's texts.
// prezzo stays null until the shop gives it, frase is the shop's own voice: never generated.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const root = new URL("..", import.meta.url).pathname;
require("@next/env").loadEnvConfig(root);
const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);

const slug = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const litri = (f) => {
  const m = String(f).replace(",", ".").match(/([\d.]+)\s*(ml|cl|l)/);
  if (!m) return null;
  return Number(m[1]) * { ml: 0.001, cl: 0.01, l: 1 }[m[2]];
};
const rows = await sql`
  SELECT scheda, scheda_id, formato, quantita, prezzo, status, id FROM stock_items
  WHERE scheda_id IS NOT NULL AND eliminato_il IS NULL ORDER BY scheda_id, formato`;
const prodotti = new Map();
for (const r of rows) {
  const c = r.scheda;
  const key = `${r.scheda_id}|${r.formato}`;
  const p = prodotti.get(key);
  if (p) {
    p.quantita += r.quantita;
    p.prezzo ??= r.prezzo === null ? null : Number(r.prezzo);
    p.da_controllare ||= r.status !== "ok";
    continue;
  }
  const annata = /^\d{4}$/.test(c.annata) ? Number(c.annata) : null;
  prodotti.set(key, {
    slug: slug(`${c.produttore} ${c.nome_vino} ${c.annata === "N.V." ? "" : c.annata} ${r.formato === "750 ml" || r.formato === "700 ml" ? "" : r.formato}`),
    cat: c.categoria,
    produttore: c.produttore,
    nome: c.nome_vino,
    annata,
    regione: c.regione,
    paese: c.paese,
    denominazione: c.denominazione,
    uve: c.vitigni.join(", "),
    formato: litri(r.formato),
    formato_letto: !!c.formato,
    gradi: Number(String(c.gradazione).replace(",", ".").match(/[\d.]+/)?.[0]) || null,
    metodo: c.metodo || null,
    prezzo: r.prezzo === null ? null : Number(r.prezzo),
    frase: null,
    abbinamenti: c.abbinamenti_sito,
    occasione: c.occasione,
    quantita: r.quantita,
    descrizione: c.descrizione,
    note_visive: c.note_visive,
    note_olfattive: c.note_olfattive,
    note_gustative: c.note_gustative,
    temperatura_servizio: c.temperatura_servizio,
    da_controllare: r.status !== "ok",
    dubbi: c.dubbi,
  });
}
const lista = [...prodotti.values()];
// Two rows that are really one wine still need two addresses until someone merges them.
const usati = new Map();
for (const p of lista) {
  const n = (usati.get(p.slug) || 0) + 1;
  usati.set(p.slug, n);
  if (n > 1) p.slug += `-${n}`;
}
writeFileSync(`${root}catalogo-sito.json`, JSON.stringify(lista, null, 1));
console.log({ prodotti: lista.length, con_prezzo: lista.filter((p) => p.prezzo !== null).length, da_controllare: lista.filter((p) => p.da_controllare).length, formato_non_letto: lista.filter((p) => !p.formato_letto).length });
