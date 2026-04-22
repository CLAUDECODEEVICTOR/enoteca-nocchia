import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    await ensureSchema();

    const searchQuery = req.nextUrl.searchParams.get("q")?.trim().toLowerCase() || "";
    const limit = Math.min(
      Number(req.nextUrl.searchParams.get("limit")) || 100,
      500
    );

    const rows = searchQuery
      ? await sql`
          SELECT id, nome_vino, produttore, annata, regione, paese,
                 denominazione, bottle_image, scan_count, last_scanned_at,
                 first_scanned_at, lang
          FROM wine_scans
          WHERE LOWER(nome_vino) LIKE ${"%" + searchQuery + "%"}
             OR LOWER(COALESCE(produttore, '')) LIKE ${"%" + searchQuery + "%"}
             OR LOWER(COALESCE(regione, '')) LIKE ${"%" + searchQuery + "%"}
             OR LOWER(COALESCE(paese, '')) LIKE ${"%" + searchQuery + "%"}
          ORDER BY last_scanned_at DESC
          LIMIT ${limit};
        `
      : await sql`
          SELECT id, nome_vino, produttore, annata, regione, paese,
                 denominazione, bottle_image, scan_count, last_scanned_at,
                 first_scanned_at, lang
          FROM wine_scans
          ORDER BY last_scanned_at DESC
          LIMIT ${limit};
        `;

    const totalRows = await sql`SELECT COUNT(*)::int AS total, COALESCE(SUM(scan_count), 0)::int AS total_scans FROM wine_scans;`;
    const total = totalRows[0]?.total || 0;
    const totalScans = totalRows[0]?.total_scans || 0;

    return NextResponse.json({
      wines: rows,
      total,
      totalScans,
    });
  } catch (error) {
    console.error("[archive]", error);
    return NextResponse.json({ error: "Errore caricamento archivio" }, { status: 500 });
  }
}
