import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireScope } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const denied = requireScope(req, "admin");
  if (denied) return denied;
  const id = req.nextUrl.searchParams.get("id") || "";
  const rows = await sql`SELECT photo, photo_back FROM stock_items WHERE id = ${id}`;
  const photo = req.nextUrl.searchParams.get("lato") === "retro" ? rows[0]?.photo_back : rows[0]?.photo;
  if (!photo) return new NextResponse(null, { status: 404 });
  return new NextResponse(Buffer.from(photo as string, "base64"), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" },
  });
}
