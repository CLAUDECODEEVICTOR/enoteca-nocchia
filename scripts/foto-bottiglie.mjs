// A clean photo (no background) for every warehouse card, found once, checked, and kept in
// our own Blob store: the iPad shows it with the card, the online shop will reuse it.
// For each card: Bing images with a transparent background (the producer's own site first),
// the photo must open, then the model compares it with the warehouse photo of that bottle.
// Where it came from is saved too: on the online shop only photos usable by right go up.
//   node scripts/foto-bottiglie.mjs prova 12     12 cards, nothing saved, a page to look at
//   node scripts/foto-bottiglie.mjs tutte        every card without a checked photo yet
// Stops at TETTO dollars of model calls.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const root = new URL("..", import.meta.url).pathname;
require("@next/env").loadEnvConfig(root);
const { neon } = await import("@neondatabase/serverless");
const { default: Anthropic } = await import("@anthropic-ai/sdk");
const { put } = await import("@vercel/blob");
const sharp = (await import("sharp")).default;
const sql = neon(process.env.DATABASE_URL);
const client = new Anthropic();

const TETTO = 6;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const VUOTE = new Set("di del della dello dei degli delle da de du la le il lo i gli l d e ed et and the az agr agricola azienda societa srl spa ss sas sa cantina cantine tenuta tenute vini vino wine doc docg igt igp aoc aop classico".split(" "));
const parole = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").split(" ").filter((p) => p.length > 2 && !VUOTE.has(p));
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

async function bing(query) {
  const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC3&first=1&qft=+filterui:photo-transparent`;
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "it-IT,it;q=0.9,en;q=0.8" }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) return [];
  const html = await res.text();
  const urls = (html.match(/murl&quot;:&quot;(https?:\/\/[^&]+)/g) || []).map((m) => m.replace("murl&quot;:&quot;", ""));
  return [...new Set(urls)].filter((u) => u.startsWith("https://") && !/favicon|logo|banner|6-bott|12-bott|cassa|case-of|pack-of|riflesso|reflection|mirror/i.test(u)).slice(0, 15);
}

async function scarica(url) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) });
    if (!res.ok || !(res.headers.get("content-type") || "").startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const meta = await sharp(buf).metadata();
    if (!meta.width || !meta.height || meta.height < 400 || meta.height < meta.width * 1.5) return null; // a bottle stands tall
    return { buf, meta };
  } catch {
    return null;
  }
}

const SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    stessa_bottiglia: { type: "string", enum: ["si", "no", "incerto"] },
    annata: { type: "string", enum: ["uguale", "diversa", "non_visibile"] },
    sfondo_pulito: { type: "boolean" },
    una_sola_bottiglia: { type: "boolean" },
    motivo: { type: "string" },
  },
  required: ["stessa_bottiglia", "annata", "sfondo_pulito", "una_sola_bottiglia", "motivo"],
};
const SYSTEM = `Confronti due immagini. La prima è una foto fatta a mano nel magazzino di un'enoteca: serve solo da riferimento. La seconda è una foto trovata online, candidata a rappresentare quella bottiglia su un sito di vendita.
stessa_bottiglia: "si" solo se è lo stesso prodotto (stesso produttore, stesso nome, stessa versione: un rosé non è il brut, una riserva non è il base, un 12 anni non è un 18 anni). "incerto" se l'etichetta della candidata non si legge abbastanza.
annata: confronta l'annata se si legge in entrambe.
sfondo_pulito: true se lo sfondo è trasparente o bianco uniforme, senza scaffali, mani o ambientazioni.
una_sola_bottiglia: true se si vede una bottiglia sola, senza astucci o bicchieri accanto.
motivo: una frase breve in italiano.`;

let spesa = 0;
async function controlla(scheda, magazzino, candidata) {
  const rif = (await sharp(Buffer.from(magazzino, "base64")).resize({ height: 768, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer()).toString("base64");
  const cand = (await sharp(candidata).flatten({ background: "#ffffff" }).resize({ height: 512, withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer()).toString("base64");
  const m = await client.messages.create({
    model: "claude-sonnet-5-5", max_tokens: 600,
    system: SYSTEM,
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content: [
      { type: "text", text: `Scheda: ${scheda.nome_vino} | ${scheda.produttore} | ${scheda.annata}` },
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: rif } },
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: cand } },
    ] }],
  }, { timeout: 60_000, maxRetries: 2 });
  spesa += (m.usage.input_tokens * 2 + m.usage.output_tokens * 10) / 1e6;
  return JSON.parse(m.content.filter((b) => b.type === "text").pop().text);
}

async function fotoPer(scheda) {
  const nomi = parole(scheda.produttore);
  const q = `${scheda.nome_vino} ${scheda.produttore} bottiglia png`;
  const trovate = await bing(q);
  // The producer's own site first: its photos are the ones a shop may use.
  const dominio = (u) => new URL(u).hostname.replace(/^www\./, "");
  const delProduttore = (u) => nomi.some((p) => p.length > 3 && dominio(u).replace(/[^a-z0-9]/g, "").includes(p));
  const ordinate = [...trovate.filter(delProduttore), ...trovate.filter((u) => !delProduttore(u))];
  const esiti = [];
  let controlli = 0;
  for (const url of ordinate) {
    if (controlli >= 3) break;
    const img = await scarica(url);
    if (!img) continue;
    controlli++;
    const v = await controlla(scheda, scheda.photo, img.buf);
    esiti.push({ url, ...v });
    if (v.stessa_bottiglia === "si" && v.annata !== "diversa" && v.sfondo_pulito && v.una_sola_bottiglia) {
      return { url, img, tipo: delProduttore(url) ? "produttore" : "altro", esiti };
    }
  }
  return { esiti };
}

const [modo, quante] = process.argv.slice(2);
await sql`ALTER TABLE wine_scans ADD COLUMN IF NOT EXISTS foto_fonte TEXT, ADD COLUMN IF NOT EXISTS foto_tipo TEXT, ADD COLUMN IF NOT EXISTS foto_il TIMESTAMPTZ`;
const schede = await sql`
  SELECT w.id, w.nome_vino, w.produttore, w.annata,
    (SELECT s.id FROM stock_items s WHERE s.scheda_id = w.id AND s.eliminato_il IS NULL AND s.photo <> '' LIMIT 1) AS riga
  FROM wine_scans w
  WHERE w.origine = 'magazzino' AND w.foto_il IS NULL
    AND EXISTS (SELECT 1 FROM stock_items s WHERE s.scheda_id = w.id AND s.eliminato_il IS NULL)
  ORDER BY ${modo === "prova" ? sql`md5('foto-' || w.id)` : sql`w.id`}
  ${modo === "prova" ? sql`LIMIT ${Number(quante) || 12}` : sql``}`;
console.log(`schede da fare: ${schede.length}`);

const report = [];
let fatte = 0, trovate = 0;
for (const s of schede) {
  if (spesa > TETTO) { console.log(`TETTO raggiunto: $${spesa.toFixed(2)}`); break; }
  if (!s.riga) continue;
  const [{ photo }] = await sql`SELECT photo FROM stock_items WHERE id = ${s.riga}`;
  let r;
  try { r = await fotoPer({ ...s, photo }); } catch (e) { console.log(`ERRORE ${s.id}: ${e.message}`); continue; }
  fatte++;
  if (r.url) trovate++;
  console.log(`${r.url ? "OK " : "-- "} ${s.nome_vino} | ${s.produttore} | ${r.tipo || ""} ${r.url ? new URL(r.url).hostname : ""} | $${spesa.toFixed(3)}`);
  report.push({ s, r, photo });
  if (modo !== "tutte") continue;
  if (r.url) {
    const webp = await sharp(r.img.buf).resize({ height: 1000, withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
    const blob = await put(`bottiglie/${s.id}.webp`, webp, { access: "public", contentType: "image/webp", addRandomSuffix: false, allowOverwrite: true });
    await sql`UPDATE wine_scans SET bottle_image = ${blob.url}, foto_fonte = ${r.url}, foto_tipo = ${r.tipo}, foto_il = NOW() WHERE id = ${s.id}`;
  } else {
    // Checked and nothing good found: no photo is better than a wrong one.
    await sql`UPDATE wine_scans SET bottle_image = NULL, foto_fonte = NULL, foto_tipo = 'nessuna', foto_il = NOW() WHERE id = ${s.id}`;
  }
  await pausa(800);
}
console.log(`\nschede ${fatte}, foto trovate ${trovate}, spesa modello $${spesa.toFixed(2)}`);

if (modo === "prova") {
  const cella = ({ s, r, photo }) => `<div class="c"><p><b>${s.nome_vino}</b><br>${s.produttore} ${s.annata}</p>
    <div class="f"><img src="data:image/jpeg;base64,${photo}"><span>magazzino</span></div>
    <div class="f">${r.url ? `<img src="${r.url}"><span>${r.tipo} · ${new URL(r.url).hostname}</span>` : `<span>nessuna foto buona</span>`}</div>
    <p class="m">${r.esiti.map((e) => `${e.stessa_bottiglia}: ${e.motivo}`).join("<br>")}</p></div>`;
  writeFileSync(process.argv[4] || "foto-prova.html", `<!doctype html><meta charset="utf-8"><title>Prova foto</title><style>body{font-family:system-ui;background:#f6f3ee;margin:16px}.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px}.c{background:#fff;border-radius:12px;padding:12px}.f{display:inline-block;width:48%;vertical-align:top;text-align:center}.f img{max-height:220px;max-width:100%;background:repeating-conic-gradient(#eee 0 25%,#fff 0 50%) 0/16px 16px}.f span{display:block;font-size:12px;color:#666}.m{font-size:12px;color:#444}</style><div class="g">${report.map(cella).join("")}</div>`);
}
