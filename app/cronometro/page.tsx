"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ArchiveGate from "@/components/ArchiveGate";

interface Riga {
  fase: string;
  fonte: string | null;
  n: number;
  mediana: number;
  media: number;
  massimo: number;
  mediana_risposta: number | null;
  mediana_scheda: number | null;
  mediana_foto: number | null;
  n_completi: number;
}

interface Scan {
  id: number;
  created_at: string;
  fonte: string;
  ms: number;
  ms_scheda: number | null;
  ms_foto: number | null;
  vino: string | null;
}

const sec = (ms?: number | null) => (ms === undefined || ms === null ? "-" : `${(ms / 1000).toFixed(1).replace(".", ",")} s`);
const cardStyle = { background: "var(--color-surface)", border: "1px solid rgba(17,17,17,0.2)" };

function Tempo({ titolo, riga, forte }: { titolo: string; riga?: Riga; forte?: boolean }) {
  return (
    <div className="rounded-xl p-4" style={cardStyle}>
      <p className="text-sm" style={{ color: "var(--color-muted)" }}>{titolo}</p>
      <p className="text-4xl font-medium my-2" style={{ color: forte ? "var(--color-bordeaux)" : "var(--color-text)" }}>
        {sec(riga?.mediana)}
      </p>
      <p className="text-xs" style={{ color: "var(--color-muted)" }}>
        {riga ? `${riga.n} scan, media ${sec(riga.media)}, massimo ${sec(riga.massimo)}` : "Nessuno scan ancora"}
      </p>
    </div>
  );
}

function Cronometro() {
  const router = useRouter();
  const [righe, setRighe] = useState<Riga[]>([]);
  const [ultimi, setUltimi] = useState<Scan[]>([]);
  const [errore, setErrore] = useState(false);

  useEffect(() => {
    fetch("/api/tempi", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        setRighe(d.riepilogo || []);
        setUltimi(d.ultimi || []);
      })
      .catch(() => setErrore(true));
  }, []);

  const riga = (fase: string, fonte: string | null = null) => righe.find((r) => r.fase === fase && r.fonte === fonte);
  const prima = riga("prova_prima");
  const dopo = riga("prova_dopo");
  const reali = riga("reale");
  const catalogo = riga("reale", "catalogo");
  const guadagno = prima && dopo ? Math.round((1 - dopo.mediana / prima.mediana) * 100) : null;

  return (
    <main className="min-h-screen p-4" style={{ background: "var(--color-bg)", color: "var(--color-text)" }}>
      <div className="max-w-3xl mx-auto grid gap-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/admin")} className="min-h-[44px] pr-3 text-sm" style={{ color: "var(--color-muted)" }}>
            ← Admin
          </button>
          <h1 className="text-2xl font-medium">Cronometro scan</h1>
        </div>
        {errore && <p className="text-sm" style={{ color: "#c0392b" }}>Dati non caricati: controlla la connessione.</p>}

        <section className="grid gap-3">
          <h2 className="text-lg font-medium">Le stesse 12 bottiglie, prima e dopo</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <Tempo titolo="Prima, tempo mediano" riga={prima} />
            <Tempo titolo="Dopo, tempo mediano" riga={dopo} forte />
          </div>
          {guadagno !== null && (
            <p className="text-sm" style={{ color: "var(--color-muted)" }}>
              {guadagno > 0 ? `Il ${guadagno}% più veloce.` : "Nessun guadagno."} Misurato sul sito online da un computer, senza il tablet.
            </p>
          )}
        </section>

        <section className="grid gap-3">
          <h2 className="text-lg font-medium">Scan veri dal tablet</h2>
          <div className="grid sm:grid-cols-3 gap-3">
            <Tempo titolo="Tutti" riga={reali} forte />
            <Tempo titolo="Trovati in catalogo" riga={catalogo} />
            <Tempo titolo="Scheda scritta da zero" riga={riga("reale", "completo")} />
          </div>
          {reali && (
            <p className="text-sm" style={{ color: "var(--color-muted)" }}>
              Trovati in catalogo: {Math.round(((catalogo?.n ?? 0) / reali.n) * 100)}%. Tempo dal tocco su Analizza alla risposta.
            </p>
          )}
        </section>

        <section className="grid gap-3">
          <h2 className="text-lg font-medium">L&apos;attesa intera del cliente</h2>
          <div className="grid sm:grid-cols-3 gap-3">
            {[
              ["Risposta arrivata", reali?.mediana_risposta],
              ["Scheda sullo schermo", reali?.mediana_scheda],
              ["Foto della bottiglia", reali?.mediana_foto],
            ].map(([titolo, ms]) => (
              <div key={titolo as string} className="rounded-xl p-4" style={cardStyle}>
                <p className="text-sm" style={{ color: "var(--color-muted)" }}>{titolo}</p>
                <p className="text-4xl font-medium my-2">{sec(ms as number | null | undefined)}</p>
              </div>
            ))}
          </div>
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            Tempo mediano dal tocco su Analizza. {reali?.n_completi ? `Misurato su ${reali.n_completi} scan.` : "Si misura dagli scan nuovi."}
          </p>
        </section>

        {ultimi.length > 0 && (
          <section className="grid gap-3">
            <h2 className="text-lg font-medium">Ultimi scan</h2>
            <ul className="rounded-xl overflow-hidden" style={cardStyle}>
              {ultimi.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-3 py-2 text-sm" style={{ borderTop: "1px solid rgba(17,17,17,0.12)" }}>
                  <span className="w-14 shrink-0 font-medium">{sec(s.ms)}</span>
                  {s.ms_scheda !== null && (
                    <span className="shrink-0 text-xs" style={{ color: "var(--color-muted)" }}>
                      scheda {sec(s.ms_scheda)}, foto {sec(s.ms_foto)}
                    </span>
                  )}
                  <span className="flex-1 min-w-0 truncate">{s.vino || "Bottiglia non indicata"}</span>
                  <span className="shrink-0 text-xs" style={{ color: "var(--color-muted)" }}>
                    {s.fonte === "catalogo" ? "catalogo" : "da zero"},{" "}
                    {new Date(s.created_at).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}

export default function CronometroPage() {
  return (
    <ArchiveGate>
      <Cronometro />
    </ArchiveGate>
  );
}
