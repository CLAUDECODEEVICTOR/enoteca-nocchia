import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireScope } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const denied = requireScope(req, "admin");
  if (denied) return denied;
  const id = req.nextUrl.searchParams.get("id") || "";
  try {
    const column = req.nextUrl.searchParams.get("lato") === "retro" ? sql`photo_back` : sql`photo`;
    const rows = await sql`SELECT ${column} AS foto FROM stock_items WHERE id = ${id}`;
    if (!rows[0]?.foto) return new NextResponse(null, { status: 404 });
    return new NextResponse(Buffer.from(rows[0].foto as string, "base64"), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" },
    });
  } catch (error) {
    console.error("[stock:photo]", error);
    return new NextResponse(null, { status: 503 });
  }
}
