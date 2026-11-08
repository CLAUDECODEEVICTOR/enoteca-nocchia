"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Gate from "@/components/Gate";

const AREE = [
  { href: "/magazzino", nome: "Magazzino", testo: "Registra le bottiglie, correggi le righe, verifica le annate" },
  { href: "/archivio", nome: "Archivio", testo: "Le schede complete di tutte le bottiglie" },
  { href: "/verifica", nome: "Verifica schede", testo: "Controlla i dati delle schede con le fonti dei produttori" },
  { href: "/feedback", nome: "Feedback", testo: "Le schede che i clienti hanno segnalato" },
  { href: "/cronometro", nome: "Cronometro", testo: "Quanto ci mette ogni scan" },
];

function Admin() {
  const router = useRouter();
  const [errore, setErrore] = useState(false);

  // The tablet stays in the shop: leaving has to lock, or the next customer walks in.
  const esci = async () => {
    const res = await fetch("/api/auth?scope=admin", { method: "DELETE" }).catch(() => null);
    if (res?.ok) router.push("/");
    else setErrore(true);
  };

  return (
    <main
      className="min-h-dvh flex flex-col items-center justify-center gap-6 p-6"
      style={{ background: "var(--color-bg)", paddingTop: "calc(env(safe-area-inset-top) + 24px)", paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)" }}
    >
      <h1 className="text-3xl md:text-4xl font-bold" style={{ fontFamily: "var(--font-playfair)", color: "var(--color-gold)" }}>
        Admin
      </h1>
      <nav className="w-full max-w-md grid gap-3">
        {AREE.map((a) => (
          <button
            key={a.href}
            onClick={() => router.push(a.href)}
            className="min-h-[80px] rounded-xl p-4 text-left"
            style={{ background: "var(--color-surface)", border: "1px solid rgba(120,94,20,0.25)" }}
          >
            <span className="block text-lg font-medium" style={{ color: "var(--color-text)" }}>{a.nome}</span>
            <span className="block text-sm mt-1" style={{ color: "var(--color-muted)" }}>{a.testo}</span>
          </button>
        ))}
      </nav>
      <button
        onClick={esci}
        className="w-full max-w-md min-h-[52px] rounded-xl font-medium text-white"
        style={{ background: "var(--color-bordeaux)" }}
      >
        Esci e torna ai clienti
      </button>
      {errore && <p className="text-sm text-center" style={{ color: "#c0392b" }}>Area non bloccata: controlla la connessione e riprova.</p>}
    </main>
  );
}

export default function AdminPage() {
  return (
    <Gate scope="admin" title="Admin" subtitle="Area riservata. Inserisci il PIN amministratore." showBackLink>
      <Admin />
    </Gate>
  );
}
