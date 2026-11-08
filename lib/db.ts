import { neon } from "@neondatabase/serverless";

// Single shared client — Neon serverless driver handles pooling
export const sql = neon(process.env.DATABASE_URL!);

// Slugify wine identity for deduplication (nome + produttore + annata)
export function wineKey(nome: string, produttore: string, annata: string): string {
  const norm = (s: string) =>
    (s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80);
  return [norm(nome), norm(produttore), norm(annata)].filter(Boolean).join("__");
}

// Ensure table exists. Called lazily on first access.
let schemaReady: Promise<void> | null = null;
export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS wine_scans (
          id TEXT PRIMARY KEY,
          nome_vino TEXT NOT NULL,
          produttore TEXT,
          annata TEXT,
          regione TEXT,
          paese TEXT,
          denominazione TEXT,
          vitigni JSONB,
          gradazione TEXT,
          temperatura_servizio TEXT,
          note_visive TEXT,
          note_olfattive TEXT,
          note_gustative TEXT,
          abbinamenti JSONB,
          descrizione TEXT,
          bottle_image TEXT,
          lang TEXT NOT NULL DEFAULT 'it',
          scan_count INTEGER NOT NULL DEFAULT 1,
          first_scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `;
      await sql`CREATE INDEX IF NOT EXISTS idx_last_scanned ON wine_scans (last_scanned_at DESC);`;
      // Cards written from the warehouse photos: origine = 'magazzino'.
      await sql`
        ALTER TABLE wine_scans
          ADD COLUMN IF NOT EXISTS origine TEXT,
          ADD COLUMN IF NOT EXISTS categoria TEXT,
          ADD COLUMN IF NOT EXISTS metodo TEXT,
          ADD COLUMN IF NOT EXISTS occasione TEXT,
          ADD COLUMN IF NOT EXISTS testo_etichetta TEXT,
          ADD COLUMN IF NOT EXISTS dubbi TEXT,
          ADD COLUMN IF NOT EXISTS confidenza TEXT,
          ADD COLUMN IF NOT EXISTS abbinamenti_sito JSONB,
          ADD COLUMN IF NOT EXISTS verificati JSONB,
          ADD COLUMN IF NOT EXISTS foto_fonte TEXT,
          ADD COLUMN IF NOT EXISTS foto_tipo TEXT,
          ADD COLUMN IF NOT EXISTS foto_il TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS verificata_da TEXT,
          ADD COLUMN IF NOT EXISTS verificata_il TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS etichette JSONB;
      `;
      // What the automatic check against producers' sources found, field by field, per card.
      await sql`
        CREATE TABLE IF NOT EXISTS scheda_verifiche (
          id TEXT PRIMARY KEY,
          creato_il TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          risultato JSONB NOT NULL
        );
      `;
    })();
  }
  return schemaReady;
}

// Feedback table — separate from archive, captures every proprietor verdict on scan accuracy
let feedbackSchemaReady: Promise<void> | null = null;
export function ensureFeedbackSchema(): Promise<void> {
  if (!feedbackSchemaReady) {
    feedbackSchemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS scan_feedback (
          id TEXT PRIMARY KEY,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          is_correct BOOLEAN NOT NULL,
          wine_name TEXT,
          producer TEXT,
          vintage TEXT,
          testo_etichetta TEXT,
          ai_response JSONB,
          original_photo TEXT,
          user_correction TEXT,
          notes TEXT,
          lang TEXT
        );
      `;
      await sql`CREATE INDEX IF NOT EXISTS idx_feedback_created ON scan_feedback (created_at DESC);`;
      await sql`CREATE INDEX IF NOT EXISTS idx_feedback_correct ON scan_feedback (is_correct);`;
    })();
  }
  return feedbackSchemaReady;
}

// Stock table — the shop's inventory, kept apart from customer scans in wine_scans.
let stockSchemaReady: Promise<void> | null = null;
export function ensureStockSchema(): Promise<void> {
  if (!stockSchemaReady) {
    stockSchemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS stock_items (
          id TEXT PRIMARY KEY,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          status TEXT NOT NULL DEFAULT 'da_leggere',
          nome_vino TEXT NOT NULL DEFAULT '',
          produttore TEXT NOT NULL DEFAULT '',
          annata TEXT NOT NULL DEFAULT '',
          denominazione TEXT NOT NULL DEFAULT '',
          gradazione TEXT NOT NULL DEFAULT '',
          formato TEXT NOT NULL DEFAULT '750 ml',
          quantita INTEGER NOT NULL DEFAULT 1,
          prezzo NUMERIC(10,2),
          confidenza TEXT,
          wine_key TEXT,
          duplicate_of TEXT,
          photo TEXT
        );
      `;
      await sql`ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS photo_back TEXT;`;
      await sql`ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS operatore TEXT;`;
      await sql`ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS modificato_da TEXT;`;
      await sql`ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS scheda JSONB;`;
      await sql`ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS scheda_id TEXT;`;
      await sql`ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS eliminato_il TIMESTAMPTZ;`;
      await sql`ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS unito_in TEXT;`;
      await sql`CREATE INDEX IF NOT EXISTS idx_stock_created ON stock_items (created_at DESC);`;
      await sql`CREATE INDEX IF NOT EXISTS idx_stock_key ON stock_items (wine_key);`;
    })().catch((e) => {
      stockSchemaReady = null;
      throw e;
    });
  }
  return stockSchemaReady;
}

// How long a scan took, as the customer felt it. fase 'reale' is a scan from the shop;
// 'prova_prima' and 'prova_dopo' are the same 12 bottles timed before and after the catalogue.
let tempiSchemaReady: Promise<void> | null = null;
export function ensureTempiSchema(): Promise<void> {
  if (!tempiSchemaReady) {
    tempiSchemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS scan_tempi (
          id SERIAL PRIMARY KEY,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          fase TEXT NOT NULL DEFAULT 'reale',
          fonte TEXT NOT NULL,
          lang TEXT,
          ms INTEGER NOT NULL,
          vino TEXT
        );
      `;
      // ms runs from the tap on Analizza to the answer; ms_scheda to the card on screen,
      // ms_foto to the bottle photo on screen (null when no photo came).
      await sql`ALTER TABLE scan_tempi ADD COLUMN IF NOT EXISTS ms_scheda INTEGER, ADD COLUMN IF NOT EXISTS ms_foto INTEGER`;
    })().catch((e) => {
      tempiSchemaReady = null;
      throw e;
    });
  }
  return tempiSchemaReady;
}

// Every piece of advice the sommelier gave: what was asked, the three bottles, time and cost.
// The bottles shown lately weigh a little less next time, so the shop's bottles take turns.
let sommelierSchemaReady: Promise<void> | null = null;
export function ensureSommelierSchema(): Promise<void> {
  if (!sommelierSchemaReady) {
    sommelierSchemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS sommelier_consigli (
          id SERIAL PRIMARY KEY,
          creato_il TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          richiesta JSONB NOT NULL,
          scelte TEXT[] NOT NULL,
          ms INTEGER,
          costo NUMERIC(10,5)
        );
      `;
      // What the sommelier said, so the voice can read it back without taking text from the browser.
      await sql`ALTER TABLE sommelier_consigli ADD COLUMN IF NOT EXISTS testi JSONB`;
      // Every spoken answer: characters and cost, to bill the shop for what the voice consumes.
      await sql`
        CREATE TABLE IF NOT EXISTS voce_usi (
          id SERIAL PRIMARY KEY,
          creato_il TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          consiglio INTEGER,
          caratteri INTEGER NOT NULL,
          modello TEXT NOT NULL,
          costo NUMERIC(10,5)
        );
      `;
    })().catch((e) => {
      sommelierSchemaReady = null;
      throw e;
    });
  }
  return sommelierSchemaReady;
}
