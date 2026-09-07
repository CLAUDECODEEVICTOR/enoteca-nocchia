import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { requireScope } from "@/lib/auth";

function isValidImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    // Block internal/private IPs
    const host = parsed.hostname;
    if (host === "localhost" || host.startsWith("127.") || host.startsWith("10.") || host.startsWith("192.168.")) return false;
    return true;
  } catch {
    return false;
  }
}

async function searchBingImages(query: string, preferPng = false): Promise<string | null> {
  try {
    const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC3&first=1&qft=+filterui:photo-transparent`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    const matches = html.match(/murl&quot;:&quot;(https?:\/\/[^&]+)/g);
    if (!matches || matches.length === 0) return null;

    const candidates: string[] = [];
    for (const m of matches.slice(0, 12)) {
      const imgUrl = m.replace('murl&quot;:&quot;', '');
      const lower = imgUrl.toLowerCase();
      if (lower.includes("favicon") || lower.includes("logo") || lower.includes("banner")) continue;
      if (lower.includes("6-bott") || lower.includes("12-bott") || lower.includes("cassa") || lower.includes("case-of") || lower.includes("pack-of")) continue;
      if (lower.includes("riflesso") || lower.includes("reflection") || lower.includes("mirror")) continue;
      if (!isValidImageUrl(imgUrl)) continue;
      candidates.push(imgUrl);
    }

    if (candidates.length === 0) return null;

    if (preferPng) {
      const pngUrl = candidates.find(u => u.toLowerCase().endsWith(".png"));
      if (pngUrl) return pngUrl;
    }

    return candidates[0];
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const denied = requireScope(req, "app");
  if (denied) return denied;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  if (!rateLimit(ip, 30)) {
    return NextResponse.json({ error: "Troppe richieste" }, { status: 429 });
  }

  const query = req.nextUrl.searchParams.get("q");
  if (!query || query.length > 200) {
    return NextResponse.json({ error: "Query mancante o troppo lunga" }, { status: 400 });
  }

  const imageUrl = await searchBingImages(`${query} bottiglia png`, true);

  if (imageUrl) {
    return NextResponse.json(
      { imageUrl },
      { headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" } }
    );
  }

  const fallback = await searchBingImages(`${query} bottiglia vino`, true);
  return NextResponse.json(
    { imageUrl: fallback },
    { headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" } }
  );
}
