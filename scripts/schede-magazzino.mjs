// Turns every wine registered in the warehouse into a full card, read from its
// front and back photos. One card per wine: identical rows share it.
//   node scripts/schede-magazzino.mjs prova        8 hard bottles, full price, nothing saved
//   node scripts/schede-magazzino.mjs invia        sends the batch, prints its id
//   node scripts/schede-magazzino.mjs stato <id>   progress of a batch
//   node scripts/schede-magazzino.mjs salva <id>   writes the finished cards
// New or corrected bottles have no card: "invia" picks up only those.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const root = new URL("..", import.meta.url).pathname;
require("@next/env").loadEnvConfig(root);
const { neon } = await import("@neondatabase/serverless");
const { default: Anthropic } = await import("@anthropic-ai/sdk");
const sql = neon(process.env.DATABASE_URL);
const client = new Anthropic();

const MODEL = "claude-sonnet-5-5";
const CATEGORIE = ["vino-rosso", "vino-bianco", "vino-rosato", "spumante", "franciacorta", "champagne", "vino-frizzante", "passito", "muffato", "recioto", "vin-santo", "moscato", "marsala", "porto", "grappa", "cognac", "armagnac", "whisky", "rum", "gin", "vodka", "tequila", "mezcal", "amaro", "limoncello", "sambuca", "liquori"];
const ABBINAMENTI = ["Aperitivo", "Liscio", "Pesce", "Dolci", "Fine pasto", "Cocktail", "Formaggi stagionati", "Salumi", "Crudi di mare", "Cioccolato", "Carne rossa", "Pizza", "Primi di mare", "Arrosti", "Primi di carne"];
const OCCASIONI = ["A fine pasto", "Da regalare", "Cena tra amici", "Aperitivo", "Tutti i giorni", "Grande occasione"];
const str = { type: "string" };
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    testo_etichetta: str, nome_vino: str, produttore: str, annata: str, regione: str, paese: str,
    denominazione: str, vitigni: { type: "array", items: str }, gradazione: str, formato: str,
    temperatura_servizio: str, note_visive: str, note_olfattive: str, note_gustative: str,
    abbinamenti: { type: "array", items: str }, descrizione: str,
    confidenza: { type: "string", enum: ["alta", "media", "bassa", "nulla"] },
    categoria: { type: "string", enum: CATEGORIE },
    metodo: { type: "string", enum: ["", "Classico", "Martinotti", "Ancestrale"] },
    abbinamenti_sito: { type: "array", items: { type: "string", enum: ABBINAMENTI } },
    occasione: { type: "string", enum: OCCASIONI },
    dubbi: str,
  },
  required: ["testo_etichetta", "nome_vino", "produttore", "annata", "regione", "paese", "denominazione", "vitigni", "gradazione", "formato", "temperatura_servizio", "note_visive", "note_olfattive", "note_gustative", "abbinamenti", "descrizione", "confidenza", "categoria", "metodo", "abbinamenti_sito", "occasione", "dubbi"],
};

const SYSTEM = `Sei il sommelier di un'enoteca e prepari la scheda di una bottiglia in vendita: vino, bollicine, vino dolce, distillato, amaro o liquore. Ricevi la foto del fronte e quella del retro, più i dati letti in precedenza, che possono contenere errori.

COME LAVORARE
- Trascrivi in testo_etichetta ciò che leggi davvero su fronte e retro. Parola incerta: scrivila con [?].
- nome_vino e produttore: la forma con cui il prodotto è conosciuto e venduto, senza ragioni sociali. "Le Marchesine", non "Az. Agr. Le Marchesine S.S.". Nome e produttore non si ripetono a vicenda.
- annata: l'anno scritto in etichetta. "N.V." se il prodotto non ha annata (distillati, liquori, spumanti senza millesimo) e l'etichetta è leggibile. Vuota solo se dovrebbe esserci ma non si legge. Non dedurla mai.
- formato: la capacità scritta in etichetta, in ml fino a 999 e in litri oltre: "700 ml", "750 ml", "1 l", "1,5 l". Vuoto se non si legge.
- gradazione, denominazione, vitigni: prima l'etichetta, poi ciò che sai con certezza di quel prodotto. Per un distillato vitigni resta vuoto, salvo le grappe e le acquaviti d'uva.
- Usa web_search solo se il prodotto ti è davvero sconosciuto. Mai inventare: un campo vuoto è meglio di un dato falso.
- dubbi: una frase su ciò che una persona dovrebbe ricontrollare (dati precedenti in contrasto con le foto, foto illeggibile). Vuoto se è tutto chiaro.

TESTI PER IL CLIENTE, in italiano semplice
- temperatura_servizio: temperatura e un consiglio breve.
- note_visive: il colore in poche parole. note_olfattive e note_gustative: una frase ciascuna, con odori e sensazioni comuni, adatte a chi non è esperto. Se non conosci questo prodotto preciso, descrivi lo stile della tipologia senza attribuirgli dettagli specifici.
- abbinamenti: 3 o 4 piatti o momenti. abbinamenti_sito: 1 o 2 voci dall'elenco. occasione: una voce dall'elenco.
- descrizione: 1 o 2 frasi sul carattere del prodotto.
- Mai il trattino lungo.

confidenza: "alta" se la bottiglia è identificata con certezza, "media" se qualche campo è incerto, "bassa" se l'identificazione è incerta, "nulla" se le foto non mostrano un'etichetta leggibile.

Rispondi con il JSON richiesto e nient'altro.`;

function request(row) {
  const hint = [`Nome: ${row.nome_vino}`, `Produttore: ${row.produttore}`, `Annata: ${row.annata}`, `Denominazione: ${row.denominazione}`, `Gradazione: ${row.gradazione}`]
    .join("\n");
  const fixed = row.modificato_da ? "Questi dati sono stati controllati da una persona: valgono più della foto." : "Dati letti in automatico, possono contenere errori.";
  return {
    model: MODEL,
    max_tokens: 6000,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 1 }],
    messages: [{
      role: "user",
      content: [
        { type: "text", text: "Fronte:" },
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: row.photo } },
        { type: "text", text: "Retro:" },
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: row.photo_back } },
        { type: "text", text: `${fixed}\n${hint}` },
      ],
    }],
  };
}

function cost(usage, batch) {
  const k = batch ? 0.5 : 1;
  const tokens = ((usage.input_tokens || 0) * 2 + (usage.cache_creation_input_tokens || 0) * 2.5 + (usage.cache_read_input_tokens || 0) * 0.2 + (usage.output_tokens || 0) * 10) / 1e6 * k;
  return tokens + (usage.server_tool_use?.web_search_requests || 0) * 0.01;
}

function parse(message) {
  if (message.stop_reason !== "end_turn") throw new Error(`stop ${message.stop_reason}`);
  const text = message.content.filter((b) => b.type === "text").pop()?.text;
  return JSON.parse(text);
}

const [mode, arg] = process.argv.slice(2);

if (mode === "prova") {
  const rows = await sql`
    (SELECT * FROM stock_items WHERE status = 'errore' LIMIT 1)
    UNION ALL (SELECT * FROM stock_items WHERE nome_vino = '' AND produttore = 'Veuve Clicquot' LIMIT 1)
    UNION ALL (SELECT * FROM stock_items WHERE nome_vino ILIKE 'Ron Zacapa%' LIMIT 1)
    UNION ALL (SELECT * FROM stock_items WHERE nome_vino = 'Nitens Brut' LIMIT 1)
    UNION ALL (SELECT * FROM stock_items WHERE nome_vino = 'Sangue Amaro' LIMIT 1)
    UNION ALL (SELECT * FROM stock_items WHERE nome_vino = 'Praepositus Sylvaner' LIMIT 1)
    UNION ALL (SELECT * FROM stock_items WHERE nome_vino = 'Muffato della Sala' LIMIT 1)
    UNION ALL (SELECT * FROM stock_items WHERE nome_vino ILIKE '%Barolo%' AND status = 'ok' LIMIT 1)`;
  let total = 0;
  for (const row of rows) {
    const t = Date.now();
    try {
      const m = await client.messages.create(request(row));
      const c = parse(m);
      const usd = cost(m.usage, false);
      total += usd;
      console.log(`\n[${((Date.now() - t) / 1000).toFixed(1)}s, $${usd.toFixed(4)}, ricerche ${m.usage.server_tool_use?.web_search_requests || 0}, tok ${m.usage.input_tokens}+${m.usage.cache_read_input_tokens || 0}/${m.usage.output_tokens}] magazzino: "${row.nome_vino}" | "${row.produttore}" | "${row.annata}" | ${row.formato}`);
      const { testo_etichetta, ...rest } = c;
      console.log(JSON.stringify(rest, null, 0));
    } catch (e) {
      console.log(`\nERRORE ${row.nome_vino}: ${e.message}`);
    }
  }
  console.log(`\nTotale prezzo pieno $${total.toFixed(3)}, media $${(total / rows.length).toFixed(4)}`);
}

if (mode === "invia") {
  await sql`ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS scheda JSONB`;
  // One card per wine: the row a person corrected speaks for its identical rows.
  const rows = await sql`
    SELECT DISTINCT ON (COALESCE(wine_key, id)) id FROM stock_items
    WHERE scheda IS NULL
    ORDER BY COALESCE(wine_key, id), (modificato_da IS NOT NULL) DESC, (confidenza = 'alta') DESC, created_at`;
  console.log(`vini da analizzare: ${rows.length}`);
  // A batch holds at most 256 MB and two photos weigh about 430 KB.
  const SIZE = 150;
  for (let i = 0; i < rows.length; i += SIZE) {
    const ids = rows.slice(i, i + SIZE).map((r) => r.id);
    const full = await sql`SELECT * FROM stock_items WHERE id = ANY(${ids})`;
    const batch = await client.messages.batches.create({
      requests: full.map((row) => ({ custom_id: row.id, params: request(row) })),
    }, { timeout: 10 * 60 * 1000 });
    console.log(`lotto ${i / SIZE + 1}: ${batch.id} (${ids.length} vini)`);
    writeFileSync(`${root}.schede-lotti`, `${batch.id}\n`, { flag: "a" });
  }
}

if (mode === "stato") {
  for (const id of arg.split(",")) {
    const b = await client.messages.batches.retrieve(id);
    console.log(id, b.processing_status, JSON.stringify(b.request_counts));
  }
}

if (mode === "salva") {
  const { wineKey } = await import(`${root}scripts/chiave.mjs`);
  await sql`ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS scheda JSONB`;
  await sql`ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS scheda_id TEXT`;
  for (const col of ["origine", "categoria", "metodo", "occasione", "testo_etichetta", "dubbi", "confidenza"]) {
    await sql.query(`ALTER TABLE wine_scans ADD COLUMN IF NOT EXISTS ${col} TEXT`);
  }
  await sql`ALTER TABLE wine_scans ADD COLUMN IF NOT EXISTS abbinamenti_sito JSONB`;

  const stats = { salvate: 0, nulla: 0, errori: [], spesa: 0, ricerche: 0 };
  for (const batchId of arg.split(",")) {
    for await (const entry of await client.messages.batches.results(batchId)) {
      const repId = entry.custom_id;
      if (entry.result.type !== "succeeded") {
        stats.errori.push(`${repId}: ${entry.result.type}`);
        continue;
      }
      const message = entry.result.message;
      stats.spesa += cost(message.usage, true);
      stats.ricerche += message.usage.server_tool_use?.web_search_requests || 0;
      let c;
      try {
        c = parse(message);
      } catch (e) {
        stats.errori.push(`${repId}: ${e.message}`);
        continue;
      }
      const [rep] = await sql`SELECT wine_key FROM stock_items WHERE id = ${repId}`;
      const group = await sql`SELECT id, modificato_da, formato FROM stock_items WHERE COALESCE(wine_key, id) = ${rep.wine_key ?? repId}`;
      const usable = c.confidenza !== "nulla" && c.nome_vino;
      const schedaId = usable ? wineKey(c.nome_vino, c.produttore, c.annata) : null;
      const sameFormat = group.every((r) => r.formato === group[0].formato);

      if (usable) {
        await sql`
          INSERT INTO wine_scans (id, nome_vino, produttore, annata, regione, paese, denominazione, vitigni, gradazione,
            temperatura_servizio, note_visive, note_olfattive, note_gustative, abbinamenti, descrizione, lang, scan_count,
            origine, categoria, metodo, occasione, testo_etichetta, dubbi, confidenza, abbinamenti_sito)
          VALUES (${schedaId}, ${c.nome_vino}, ${c.produttore}, ${c.annata}, ${c.regione}, ${c.paese}, ${c.denominazione},
            ${JSON.stringify(c.vitigni)}::jsonb, ${c.gradazione}, ${c.temperatura_servizio}, ${c.note_visive}, ${c.note_olfattive},
            ${c.note_gustative}, ${JSON.stringify(c.abbinamenti)}::jsonb, ${c.descrizione}, 'it', 0,
            'magazzino', ${c.categoria}, ${c.metodo}, ${c.occasione}, ${c.testo_etichetta}, ${c.dubbi}, ${c.confidenza},
            ${JSON.stringify(c.abbinamenti_sito)}::jsonb)
          ON CONFLICT (id) DO UPDATE SET
            nome_vino = EXCLUDED.nome_vino, produttore = EXCLUDED.produttore, annata = EXCLUDED.annata,
            regione = EXCLUDED.regione, paese = EXCLUDED.paese, denominazione = EXCLUDED.denominazione,
            vitigni = EXCLUDED.vitigni, gradazione = EXCLUDED.gradazione, temperatura_servizio = EXCLUDED.temperatura_servizio,
            note_visive = EXCLUDED.note_visive, note_olfattive = EXCLUDED.note_olfattive, note_gustative = EXCLUDED.note_gustative,
            abbinamenti = EXCLUDED.abbinamenti, descrizione = EXCLUDED.descrizione, lang = 'it',
            origine = 'magazzino', categoria = EXCLUDED.categoria, metodo = EXCLUDED.metodo, occasione = EXCLUDED.occasione,
            testo_etichetta = EXCLUDED.testo_etichetta, dubbi = EXCLUDED.dubbi, confidenza = EXCLUDED.confidenza,
            abbinamenti_sito = EXCLUDED.abbinamenti_sito`;
        stats.salvate++;
      } else {
        stats.nulla++;
      }

      const clear = usable && c.annata && (c.confidenza === "alta" || c.confidenza === "media");
      for (const row of group) {
        // What a person corrected stays as it is; the card only fills what is missing.
        const human = !!row.modificato_da;
        const formato = !human && sameFormat && c.formato && row.formato === "750 ml" ? c.formato : null;
        await sql`
          UPDATE stock_items SET
            scheda = ${JSON.stringify(c)}::jsonb, scheda_id = ${schedaId},
            nome_vino = CASE WHEN nome_vino = '' THEN ${c.nome_vino} ELSE nome_vino END,
            produttore = CASE WHEN produttore = '' THEN ${c.produttore} ELSE produttore END,
            annata = CASE WHEN annata = '' THEN ${c.annata} ELSE annata END,
            denominazione = CASE WHEN denominazione = '' THEN ${c.denominazione} ELSE denominazione END,
            gradazione = CASE WHEN gradazione = '' THEN ${c.gradazione} ELSE gradazione END,
            formato = COALESCE(${formato}, formato),
            status = CASE WHEN ${human} THEN status WHEN ${!!clear} THEN 'ok' ELSE 'da_controllare' END,
            updated_at = NOW()
          WHERE id = ${row.id}`;
      }
    }
  }
  // The same wine in another size is a different product, not a duplicate to merge.
  const freed = await sql`
    UPDATE stock_items s SET duplicate_of = NULL
    FROM stock_items t WHERE s.duplicate_of = t.id AND s.formato <> t.formato RETURNING s.id`;
  console.log({ ...stats, spesa: Number(stats.spesa.toFixed(2)), falsi_doppioni_tolti: freed.length, errori: stats.errori.slice(0, 20), n_errori: stats.errori.length });
}
