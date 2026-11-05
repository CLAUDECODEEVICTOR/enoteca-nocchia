import { NextRequest, NextResponse } from "next/server";
import { sql, ensureStockSchema } from "@/lib/db";
import { requireScope } from "@/lib/auth";

// Semicolons and a BOM: what Excel opens correctly on an Italian system. A leading
// = + - @ is neutralised so a misread label can't run as a spreadsheet formula.
function cell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(req: NextRequest) {
  const denied = requireScope(req, "admin");
  if (denied) return denied;
  await ensureStockSchema();
  const rows = await sql`
    SELECT nome_vino, produttore, annata, denominazione, gradazione, formato, quantita, prezzo, status, operatore, scheda->>'categoria' AS categoria, id
    FROM stock_items ORDER BY LOWER(produttore), LOWER(nome_vino), annata`;
  const head = ["Vino", "Produttore", "Annata", "Denominazione", "Gradazione", "Formato", "Quantità", "Prezzo", "Stato", "Operatore", "Categoria", "ID"];
  const body = rows.map((r) =>
    [r.nome_vino, r.produttore, r.annata, r.denominazione, r.gradazione, r.formato, r.quantita, r.prezzo, r.status, r.operatore, r.categoria, r.id]
      .map(cell)
      .join(";")
  );
  const csv = "﻿" + [head.map(cell).join(";"), ...body].join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="magazzino-nocchia.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
