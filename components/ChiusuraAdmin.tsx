"use client";

import { useEffect } from "react";

const LIMITE_MS = 20 * 60_000;
const RINNOVO_MS = 60_000;
const CONTROLLO_MS = 15_000;

/**
 * Closes the admin area after 20 minutes without a touch. The clock runs here so
 * the screen actually leaves; the cookie is only renewed while someone is using
 * the area, so a sleeping or closed tablet expires on the server as well.
 */
export default function ChiusuraAdmin() {
  useEffect(() => {
    let ultimoUso = Date.now();
    let ultimoRinnovo = 0;
    let chiusa = false;

    const chiudi = () => {
      if (chiusa) return;
      chiusa = true;
      fetch("/api/auth?scope=admin", { method: "DELETE", keepalive: true })
        .catch(() => {})
        .finally(() => window.location.replace("/"));
    };

    const rinnova = () => {
      ultimoRinnovo = Date.now();
      fetch("/api/auth?scope=admin", { method: "PATCH" })
        .then((res) => {
          if (res.status === 401) chiudi();
        })
        .catch(() => {});
    };

    const controlla = () => {
      if (Date.now() - ultimoUso >= LIMITE_MS) chiudi();
    };

    const uso = () => {
      // A sleeping iPad freezes timers: the first touch after waking must not reopen it.
      controlla();
      if (chiusa) return;
      ultimoUso = Date.now();
      if (Date.now() - ultimoRinnovo >= RINNOVO_MS) rinnova();
    };

    rinnova();
    const timer = setInterval(controlla, CONTROLLO_MS);
    const opzioni = { capture: true, passive: true };
    window.addEventListener("pointerdown", uso, opzioni);
    window.addEventListener("keydown", uso, opzioni);
    document.addEventListener("visibilitychange", controlla);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pointerdown", uso, opzioni);
      window.removeEventListener("keydown", uso, opzioni);
      document.removeEventListener("visibilitychange", controlla);
    };
  }, []);

  return null;
}
