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
    })();
  }
  return schemaReady;
}
