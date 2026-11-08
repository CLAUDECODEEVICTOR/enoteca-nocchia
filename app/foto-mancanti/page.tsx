"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Gate from "@/components/Gate";

interface Bottiglia {
  id: string;
  nome_vino: string;
  produttore: string | null;
  annata: string | null;
  formati: string | null;
  foto_magazzino: string | null;
  causa: string;
}

const cardStyle = { background: "var(--color-surface)", border: "1px solid rgba(120,94,20,0.2)" };

// The iPad camera gives 4000px photos: 1400px is plenty for the result page and stays well under the upload limit.
function riduci(file: File, lato = 1400, qualita = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const r = Math.min(1, lato / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * r);
      canvas.height = Math.round(img.height * r);
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("canvas"));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", qualita));
    };
    img.onerror = () => reject(new Error("foto"));
    img.src = url;
  });
}

function FotoMancanti() {
  const router = useRouter();
  const [bottiglie, setBottiglie] = useState<Bottiglia[] | null>(null);
  const [causa, setCausa] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [fatte, setFatte] = useState<Record<string, string>>({});
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/foto-mancanti", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setBottiglie(d.bottiglie || []))
      .catch(() => setErrore("Elenco non caricato: controlla la connessione."));
  }, []);

  const cause = useMemo(() => {
    const n: Record<string, number> = {};
    for (const b of bottiglie || []) if (!fatte[b.id]) n[b.causa] = (n[b.causa] || 0) + 1;
    return Object.entries(n).sort((a, b) => b[1] - a[1]);
  }, [bottiglie, fatte]);

  const elenco = (bottiglie || []).filter((b) => !causa || b.causa === causa);
  const mancano = (bottiglie || []).filter((b) => !fatte[b.id]).length;

  const carica = async (b: Bottiglia, file?: File) => {
    if (!file) return;
    setInCorso(b.id);
    setErrore(null);
    try {
      const foto = await riduci(file);
      const res = await fetch("/api/foto-mancanti", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: b.id, foto }) });
      if (!res.ok) throw new Error();
      setFatte((f) => ({ ...f, [b.id]: foto }));
    } catch {
      setErrore(`Foto di ${b.nome_vino} non salvata: riprova.`);
    } finally {
      setInCorso(null);
    }
  };

  const chip = (valore: string | null, nome: string, n: number) => (
    <button
      key={nome}
      onClick={() => setCausa(valore)}
      aria-pressed={causa === valore}
      className="min-h-[44px] px-4 rounded-full text-sm"
      style={causa === valore ? { background: "var(--color-bordeaux)", color: "#fff" } : { border: "1px solid var(--color-border, #E0DCD4)" }}
    >
      {nome} ({n})
    </button>
  );

  return (
    <main className="min-h-screen p-4" style={{ background: "var(--color-bg)", color: "var(--color-text)" }}>
      <div className="max-w-3xl mx-auto grid gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/admin")} className="min-h-[44px] pr-3 text-sm" style={{ color: "var(--color-muted)" }}>
            ← Admin
          </button>
          <h1 className="text-2xl font-medium">Foto mancanti</h1>
        </div>
        <p className="text-sm" style={{ color: "var(--color-muted)" }}>
          Per queste bottiglie non si è trovata online una foto pulita, e ai clienti si mostra la foto che hanno scattato.
          Fotografatele su fondo bianco: bottiglia dritta, etichetta al centro, senza riflessi. La foto vale subito per tutti gli scan.
        </p>
        {errore && <p className="text-sm" style={{ color: "#c0392b" }}>{errore}</p>}
        {!bottiglie && !errore && <p className="text-sm" style={{ color: "var(--color-muted)" }}>Carico l&apos;elenco…</p>}
        {bottiglie && (
          <>
            <p className="font-medium">{mancano ? `Ne mancano ${mancano}` : "Tutte le bottiglie hanno la foto"}</p>
            <div className="flex gap-2 flex-wrap">
              {chip(null, "Tutte", mancano)}
              {cause.map(([c, n]) => chip(c, c, n))}
            </div>
            <ul className="grid gap-2">
              {elenco.map((b) => (
                <li key={b.id} className="rounded-xl p-3 flex gap-3 items-center" style={cardStyle}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={fatte[b.id] || (b.foto_magazzino ? `/api/stock/photo?id=${b.foto_magazzino}` : "/icons/icon-192.png")}
                    alt={b.nome_vino}
                    loading="lazy"
                    className="h-20 w-14 object-cover rounded-md bg-white shrink-0"
                  />
                  <div className="min-w-0 grow">
                    <p className="font-medium">{b.nome_vino}</p>
                    <p className="text-sm" style={{ color: "var(--color-muted)" }}>{[b.produttore, b.annata, b.formati].filter(Boolean).join(" · ")}</p>
                    <p className="text-xs mt-1" style={{ color: fatte[b.id] ? "#2F5D2A" : "var(--color-gold)" }}>
                      {fatte[b.id] ? "Foto salvata: i clienti la vedono già" : b.causa}
                    </p>
                  </div>
                  <label
                    className="shrink-0 min-h-[48px] px-4 rounded-xl flex items-center text-sm font-medium cursor-pointer"
                    style={fatte[b.id] ? { border: "1px solid var(--color-border, #E0DCD4)" } : { background: "var(--color-bordeaux)", color: "#fff" }}
                  >
                    {inCorso === b.id ? "Salvo…" : fatte[b.id] ? "Rifai" : "Fotografa"}
                    <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={!!inCorso} onChange={(e) => carica(b, e.target.files?.[0])} />
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </main>
  );
}

export default function FotoMancantiPage() {
  return (
    <Gate scope="admin" title="Foto mancanti" subtitle="Area riservata. Inserisci il PIN amministratore." showBackLink>
      <FotoMancanti />
    </Gate>
  );
}
