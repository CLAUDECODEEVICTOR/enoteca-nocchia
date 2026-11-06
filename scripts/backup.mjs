// Copia del database fuori da Neon, foto comprese. Non scrive nulla sul database.
//   node scripts/backup.mjs             crea ~/Backup/enoteca-nocchia/AAAA-MM-GG.ndjson.gz
//   node scripts/backup.mjs verifica    rilegge l'ultima copia e la confronta col database
import { createGunzip, createGzip } from "node:zlib";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, mkdirSync, readdirSync, statSync } from "node:fs";
import { once } from "node:events";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { neon } from "@neondatabase/serverless";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());
const sql = neon(process.env.DATABASE_URL);
const CARTELLA = join(homedir(), "Backup", "enoteca-nocchia");
const TABELLE = ["stock_items", "wine_scans", "scan_feedback", "scan_tempi"];
const A_LOTTI = 25; // the photos are heavy: a few rows at a time

const md5 = (s) => createHash("md5").update(s ?? "").digest("hex");
const chiave = (r) => String(r.id);

if (process.argv[2] === "verifica") {
  const ultima = readdirSync(CARTELLA).filter((f) => f.endsWith(".ndjson.gz")).sort().pop();
  if (!ultima) throw new Error("Nessuna copia trovata");
  const copia = new Map(TABELLE.map((t) => [t, 0]));
  const foto = new Map();
  const righe = createInterface({ input: createReadStream(join(CARTELLA, ultima)).pipe(createGunzip()), crlfDelay: Infinity });
  for await (const riga of righe) {
    const { t, r } = JSON.parse(riga);
    copia.set(t, copia.get(t) + 1);
    if (t === "stock_items") foto.set(chiave(r), md5(r.photo) + md5(r.photo_back));
  }
  let diverse = 0;
  const db = await sql`SELECT id, md5(COALESCE(photo, '')) f, md5(COALESCE(photo_back, '')) b FROM stock_items`;
  for (const r of db) if (foto.get(chiave(r)) !== r.f + r.b) diverse++;
  console.log("copia:", ultima, Object.fromEntries(copia));
  console.log("foto del database assenti o diverse nella copia:", diverse, "su", db.length);
  process.exit(diverse ? 1 : 0);
}

mkdirSync(CARTELLA, { recursive: true });
const percorso = join(CARTELLA, `${new Date().toISOString().slice(0, 10)}.ndjson.gz`);
const zip = createGzip();
const file = zip.pipe(createWriteStream(percorso));
for (const tabella of TABELLE) {
  const ids = (await sql.query(`SELECT id FROM ${tabella} ORDER BY id`)).map((r) => r.id);
  for (let i = 0; i < ids.length; i += A_LOTTI) {
    const rows = await sql.query(`SELECT * FROM ${tabella} WHERE id = ANY($1)`, [ids.slice(i, i + A_LOTTI)]);
    for (const r of rows) {
      if (!zip.write(JSON.stringify({ t: tabella, r }) + "\n")) await once(zip, "drain");
    }
  }
  console.log(tabella, ids.length);
}
zip.end();
await once(file, "finish");
console.log("creata:", percorso, `${(statSync(percorso).size / 1e6).toFixed(0)} MB`);
