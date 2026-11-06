import { NextRequest, NextResponse } from "next/server";
import { clearAuthCookie, isAuthorized, pinMatches, setAuthCookie, type Scope } from "@/lib/auth";
import { clearFailures, isLocked, rateLimit, recordFailure } from "@/lib/rate-limit";

function parseScope(raw: unknown): Scope | null {
  return raw === "app" || raw === "admin" ? raw : null;
}

// GET — does this browser already hold a valid cookie for the scope?
// Used by the gate on mount so a staff member isn't asked for the PIN twice.
export async function GET(req: NextRequest) {
  const scope = parseScope(req.nextUrl.searchParams.get("scope"));
  if (!scope) {
    return NextResponse.json({ error: "Scope non valido" }, { status: 400 });
  }
  return NextResponse.json({ ok: isAuthorized(req, scope) });
}

// POST — verify the PIN server-side and hand back a signed cookie.
// The PIN itself never reaches the client bundle.
export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    // Tight limit: a 4-digit PIN is only 10.000 combinations, so throttle guesses.
    if (!rateLimit(`auth:${ip}`, 8)) {
      return NextResponse.json(
        { error: "Troppi tentativi. Riprova tra un minuto." },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => null);
    const scope = parseScope(body?.scope);
    if (!scope) {
      return NextResponse.json({ error: "Scope non valido" }, { status: 400 });
    }

    // By scope: a customer guessing the admin PIN must not lock the shop out of the scanner.
    const key = `${scope}:${ip}`;
    if (isLocked(key)) {
      return NextResponse.json(
        { error: "Troppi PIN sbagliati. Riprova tra 10 minuti." },
        { status: 429 }
      );
    }

    if (!pinMatches(scope, body?.pin)) {
      recordFailure(key);
      return NextResponse.json({ error: "PIN errato" }, { status: 401 });
    }

    clearFailures(key);
    return setAuthCookie(NextResponse.json({ ok: true }), scope);
  } catch (error) {
    console.error("[auth]", error);
    return NextResponse.json({ error: "Errore autenticazione" }, { status: 500 });
  }
}

// PATCH — someone is using the area: extend a session that is still valid, never revive one.
export async function PATCH(req: NextRequest) {
  const scope = parseScope(req.nextUrl.searchParams.get("scope"));
  if (!scope) {
    return NextResponse.json({ error: "Scope non valido" }, { status: 400 });
  }
  if (!isAuthorized(req, scope)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  return setAuthCookie(NextResponse.json({ ok: true }), scope);
}

// DELETE — lock this browser again when staff leave the reserved area.
export async function DELETE(req: NextRequest) {
  const scope = parseScope(req.nextUrl.searchParams.get("scope"));
  if (!scope) {
    return NextResponse.json({ error: "Scope non valido" }, { status: 400 });
  }
  return clearAuthCookie(NextResponse.json({ ok: true }), scope);
}
