"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ArchiveGate from "@/components/ArchiveGate";
import CameraStream from "@/components/CameraStream";
import { addShot, allShots, removeShot, type QueuedShot } from "@/lib/stock-queue";
import { FORMATI, OPERATORI } from "@/lib/types";
import "@/lib/i18n";

interface StockItem {
  id: string;
  created_at: string;
  operatore: string | null;
  modificato_da: string | null;
  status: "da_leggere" | "ok" | "da_controllare" | "errore";
  nome_vino: string;
  produttore: string;
  annata: string;
  denominazione: string;
  gradazione: string;
  formato: string;
  quantita: number;
  prezzo: string | null;
  duplicate_of: string | null;
  dubbi: string | null;
  categoria: string | null;
}

const PARALLEL = 3;
const SEMPRE_CON_ANNATA = ["vino-rosso", "vino-bianco", "vino-rosato", "passito", "muffato", "recioto"];

// Nothing read, or "N.V." on a kind of wine that normally has a vintage. Once a person
// has been through the row, "N.V." is their answer.
const annataDaVerificare = (i: StockItem) =>
  !i.annata || (i.annata === "N.V." && !i.modificato_da && SEMPRE_CON_ANNATA.includes(i.categoria ?? ""));
// A tap this soon after the last one is a double tap, not the other side of the bottle.
const MIN_GAP_MS = 700;

function shrink(base64: string, maxSize: number, quality: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const r = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * r);
      canvas.height = Math.round(img.height * r);
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality).split(",")[1]);
    };
    img.onerror = () => resolve(base64);
    img.src = `data:image/jpeg;base64,${base64}`;
  });
}

const fieldStyle = {
  background: "var(--color-bg)",
  border: "1px solid rgba(120,94,20,0.3)",
  color: "var(--color-text)",
};

function Row({
  item,
  twin,
  operatore,
  onChange,
  onRefresh,
}: {
  item: StockItem;
  twin: StockItem | undefined;
  operatore: string;
  onChange: (next: StockItem) => void;
  onRefresh: () => void;
}) {
  const [draft, setDraft] = useState(item);
  const [failed, setFailed] = useState(false);
  const [fotoAperta, setFotoAperta] = useState<string | null>(null);
  const reading = item.status === "da_leggere";

  const save = async (next: StockItem) => {
    setDraft(next);
    const res = await fetch("/api/stock", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...next, modificato_da: operatore }),
    }).catch(() => null);
    if (res?.ok) {
      setFailed(false);
      const data = await res.json();
      if (data.item) onChange(data.item);
    } else setFailed(true);
  };

  const action = async (body: object) => {
    await fetch("/api/stock", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, modificato_da: operatore, ...body }),
    });
    onRefresh();
  };

  const retry = async () => {
    await fetch("/api/stock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, retry: true }),
    });
    onRefresh();
  };

  const remove = async () => {
    if (!window.confirm(`Eliminare ${item.nome_vino || "questa bottiglia"}?`)) return;
    await fetch(`/api/stock?id=${item.id}`, { method: "DELETE" });
    onRefresh();
  };

  const input = (key: "nome_vino" | "produttore" | "annata", label: string) => (
    <label className="block text-xs" style={{ color: "var(--color-muted)" }}>
      {label}
      <input
        value={draft[key]}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        onBlur={() => draft[key] !== item[key] && save(draft)}
        className="mt-1 w-full min-h-[44px] px-3 rounded-lg text-base outline-none"
        style={fieldStyle}
      />
    </label>
  );

  const warn = item.status === "da_controllare" || item.status === "errore";

  return (
    <li
      className="rounded-xl p-3 flex gap-3"
      style={{
        background: "var(--color-surface)",
        border: warn ? "2px solid #c0392b" : "1px solid rgba(120,94,20,0.2)",
      }}
    >
      {fotoAperta && <FotoGrande id={item.id} lato={fotoAperta} onLato={setFotoAperta} onClose={() => setFotoAperta(null)} />}
      <div className="flex flex-col gap-2 shrink-0">
        {[["fronte", "Fronte della bottiglia"], ["retro", "Retro della bottiglia"]].map(([lato, alt]) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={lato}
            src={`/api/stock/photo?id=${item.id}&lato=${lato}`}
            alt={alt}
            // Each photo is a database read: all of them at once take the database down.
            loading="lazy"
            decoding="async"
            onClick={() => setFotoAperta(lato)}
            className="w-24 md:w-40 h-36 md:h-56 rounded-lg object-cover cursor-pointer"
            style={{ background: "rgba(120,94,20,0.08)" }}
          />
        ))}
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <p className="text-xs" style={{ color: "var(--color-muted)" }}>
          {item.operatore || "Senza nome"},{" "}
          {new Date(item.created_at).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
          {item.modificato_da ? `. Modificata da ${item.modificato_da}` : ""}
        </p>
        {reading && <p className="text-sm" style={{ color: "var(--color-muted)" }}>Lettura in corso…</p>}
        {item.status === "errore" && (
          <button onClick={retry} className="min-h-[44px] rounded-lg text-sm font-medium text-white" style={{ background: "var(--color-bordeaux)" }}>
            Lettura fallita: riprova
          </button>
        )}
        {item.status === "da_controllare" && (
          <p className="text-sm font-medium" style={{ color: "#c0392b" }}>Da controllare: {item.dubbi || "confronta con la foto"}</p>
        )}
        {twin && (
          <div className="rounded-lg p-2 text-sm" style={{ background: "rgba(120,94,20,0.1)", color: "var(--color-text)" }}>
            Già presente: {twin.nome_vino} {twin.annata} ({twin.quantita} pz)
            <div className="flex gap-2 mt-2">
              <button onClick={() => action({ mergeInto: twin.id })} className="flex-1 min-h-[44px] rounded-lg font-medium text-white" style={{ background: "var(--color-bordeaux)" }}>
                Somma quantità
              </button>
              <button onClick={() => action({ keepSeparate: true })} className="flex-1 min-h-[44px] rounded-lg" style={{ border: "1px solid rgba(120,94,20,0.3)" }}>
                Tieni separata
              </button>
            </div>
          </div>
        )}
        {input("nome_vino", "Vino")}
        <div className="grid grid-cols-[1fr_6rem] gap-2">
          {input("produttore", "Produttore")}
          {input("annata", "Annata")}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <span className="block text-xs mb-1" style={{ color: "var(--color-muted)" }}>Quantità</span>
            <div className="flex items-center gap-1">
              <button aria-label="Togli una" onClick={() => save({ ...draft, quantita: Math.max(0, draft.quantita - 1) })} className="w-11 h-11 rounded-lg text-xl" style={fieldStyle}>−</button>
              <span className="w-10 text-center text-lg font-medium" style={{ color: "var(--color-text)" }}>{draft.quantita}</span>
              <button aria-label="Aggiungi una" onClick={() => save({ ...draft, quantita: draft.quantita + 1 })} className="w-11 h-11 rounded-lg text-xl" style={fieldStyle}>+</button>
            </div>
          </div>
          <label className="block text-xs" style={{ color: "var(--color-muted)" }}>
            Formato
            <select value={draft.formato} onChange={(e) => save({ ...draft, formato: e.target.value })} className="mt-1 block min-h-[44px] px-2 rounded-lg text-base" style={fieldStyle}>
              {[...new Set([...FORMATI, draft.formato])].map((f) => <option key={f}>{f}</option>)}
            </select>
          </label>
          <label className="block text-xs" style={{ color: "var(--color-muted)" }}>
            Prezzo €
            <input
              inputMode="decimal"
              value={draft.prezzo ?? ""}
              onChange={(e) => setDraft({ ...draft, prezzo: e.target.value })}
              onBlur={() => (draft.prezzo ?? "") !== (item.prezzo ?? "") && save(draft)}
              placeholder="facoltativo"
              className="mt-1 block w-28 min-h-[44px] px-3 rounded-lg text-base outline-none"
              style={fieldStyle}
            />
          </label>
          <button onClick={remove} className="min-h-[44px] px-3 text-sm ml-auto" style={{ color: "#c0392b" }}>Elimina</button>
        </div>
        {failed && <p className="text-sm" style={{ color: "#c0392b" }}>Modifica non salvata: controlla la connessione.</p>}
      </div>
    </li>
  );
}

function Magazzino() {
  const router = useRouter();
  const [items, setItems] = useState<StockItem[]>([]);
  const [pending, setPending] = useState(0);
  const [showList, setShowList] = useState(false);
  const [flash, setFlash] = useState(false);
  const [expired, setExpired] = useState(false);
  const [offline, setOffline] = useState(false);
  const [operatore, setOperatore] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<string | null>(null);
  const [soloAnnata, setSoloAnnata] = useState(false);
  const [hasFront, setHasFront] = useState(false);
  const front = useRef<Promise<string> | null>(null);
  const lastTap = useRef(0);
  const active = useRef(new Set<string>());
  // Each finished upload starts the next one, so the queue reaches itself through a ref.
  const pumpRef = useRef<() => void>(() => {});

  const refresh = useCallback(async () => {
    const res = await fetch("/api/stock", { cache: "no-store" }).catch(() => null);
    if (res?.status === 401) setExpired(true);
    if (res?.ok) setItems((await res.json()).items || []);
  }, []);

  const pump = useCallback(async () => {
    const shots: QueuedShot[] = await allShots();
    setPending(shots.length);
    for (const shot of shots) {
      if (active.current.size >= PARALLEL) return;
      if (active.current.has(shot.id)) continue;
      // Left by the single-photo version: the server can't accept it, it would retry forever.
      if (!shot.frontBase64) {
        await removeShot(shot.id);
        continue;
      }
      active.current.add(shot.id);
      fetch("/api/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(shot),
      })
        .then(async (res) => {
          if (res.status === 401) {
            setExpired(true);
            return false;
          }
          if (!res.ok) throw new Error(String(res.status));
          await removeShot(shot.id);
          setOffline(false);
          const { item } = await res.json();
          setItems((prev) => [item, ...prev.filter((p) => p.id !== item.id)]);
          return true;
        })
        .catch(() => {
          setOffline(true);
          return false;
        })
        .then((sent) => {
          active.current.delete(shot.id);
          if (sent) pumpRef.current();
          else setTimeout(() => pumpRef.current(), 5000);
        });
    }
  }, []);

  useEffect(() => {
    pumpRef.current = pump;
    refresh();
    pump();
    const again = () => pump();
    window.addEventListener("online", again);
    return () => window.removeEventListener("online", again);
  }, [refresh, pump]);

  const capture = useCallback(
    async (base64: string) => {
      const now = Date.now();
      if (now - lastTap.current < MIN_GAP_MS) return;
      lastTap.current = now;
      setFlash(true);
      setTimeout(() => setFlash(false), 150);
      // Sharp enough to be read again later for the full card, small enough for the database.
      const shot = shrink(base64, 1200, 0.75);
      if (!front.current) {
        front.current = shot;
        setHasFront(true);
        return;
      }
      const frontBase64 = await front.current;
      front.current = null;
      setHasFront(false);
      await addShot({ id: crypto.randomUUID(), frontBase64, backBase64: await shot, operatore: operatore ?? "" });
      pump();
    },
    [pump, operatore]
  );

  const cambiaOperatore = () => {
    front.current = null;
    setHasFront(false);
    setOperatore(null);
  };

  if (!operatore) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-6" style={{ background: "var(--color-bg)" }}>
        <h1 className="text-2xl font-medium text-center" style={{ color: "var(--color-text)" }}>Chi sta registrando?</h1>
        <div className="w-full max-w-md grid grid-cols-2 gap-3">
          {OPERATORI.map((nome) => (
            <button
              key={nome}
              onClick={() => setOperatore(nome)}
              className="min-h-[96px] rounded-xl text-lg font-medium text-white"
              style={{ background: "var(--color-bordeaux)" }}
            >
              {nome}
            </button>
          ))}
        </div>
        <button onClick={() => router.push("/admin")} className="min-h-[44px] px-4" style={{ color: "var(--color-muted)" }}>← Admin</button>
      </main>
    );
  }

  // Sorted by producer here, to work along the shelf rather than in shooting order.
  const visibili = soloAnnata
    ? items.filter(annataDaVerificare).sort((a, b) => a.produttore.localeCompare(b.produttore, "it") || a.nome_vino.localeCompare(b.nome_vino, "it"))
    : filtro
      ? items.filter((i) => i.operatore === filtro)
      : items;
  const totale = visibili.reduce((n, i) => n + i.quantita, 0);
  const daControllare = items.filter((i) => i.status === "da_controllare" || i.status === "errore" || i.duplicate_of).length;

  return (
    <>
      <CameraStream
        onCapture={capture}
        instruction={hasFront ? "2 di 2: gira la bottiglia e fotografa il retro" : "1 di 2: fotografa il fronte"}
      />
      {flash && <div className="fixed inset-0 z-30 bg-white/70 pointer-events-none" />}

      <div className="fixed top-3 left-3 right-3 z-30 flex items-center gap-2 text-white" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <button onClick={() => router.push("/admin")} className="min-h-[44px] px-4 rounded-lg" style={{ background: "rgba(0,0,0,0.55)" }}>← Admin</button>
        <button onClick={cambiaOperatore} aria-label={`Cambia persona, ora ${operatore}`} className="min-h-[44px] px-4 rounded-lg" style={{ background: "rgba(0,0,0,0.55)" }}>{operatore}</button>
        <div className="min-h-[44px] px-4 rounded-lg flex items-center text-sm" style={{ background: "rgba(0,0,0,0.55)" }}>
          {visibili.length} prodotti, {totale} bottiglie{pending > 0 ? `, ${pending} in lettura` : ""}
        </div>
        <button onClick={() => setShowList(true)} className="min-h-[44px] px-4 rounded-lg ml-auto font-medium" style={{ background: "var(--color-bordeaux)" }}>
          Lista{daControllare > 0 ? ` (${daControllare} da controllare)` : ""}
        </button>
      </div>

      {hasFront && (
        <button
          onClick={() => {
            front.current = null;
            setHasFront(false);
          }}
          className="fixed z-30 left-3 min-h-[44px] px-4 rounded-lg text-white"
          style={{ background: "rgba(0,0,0,0.55)", bottom: "calc(env(safe-area-inset-bottom, 0px) + 46px)" }}
        >
          Rifai il fronte
        </button>
      )}

      {(offline || expired) && (
        <div className="fixed top-20 left-3 right-3 z-50 rounded-lg p-3 text-sm text-white flex flex-wrap items-center gap-3" style={{ background: "#c0392b" }}>
          <span className="flex-1">
            {expired
              ? "Sessione scaduta: reinserisci il PIN. Le foto restano salvate sul tablet."
              : "Connessione assente: le foto restano sul tablet e partono appena torna."}
          </span>
          {expired && (
            <button onClick={() => window.location.reload()} className="min-h-[44px] px-4 rounded-lg font-medium" style={{ background: "#fff", color: "#c0392b" }}>
              Inserisci il PIN
            </button>
          )}
        </div>
      )}

      {showList && (
        <div className="fixed inset-0 z-40 overflow-y-auto" style={{ background: "var(--color-bg)", paddingTop: "env(safe-area-inset-top)" }}>
          <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 p-3" style={{ background: "var(--color-bg)", borderBottom: "1px solid rgba(120,94,20,0.15)" }}>
            <button onClick={() => setShowList(false)} className="min-h-[44px] px-4 rounded-lg font-medium text-white" style={{ background: "var(--color-bordeaux)" }}>
              Torna agli scatti
            </button>
            <span className="text-sm" style={{ color: "var(--color-muted)" }}>{visibili.length} prodotti, {totale} bottiglie</span>
            <a href="/api/stock/export" download className="min-h-[44px] px-4 rounded-lg ml-auto flex items-center text-sm" style={{ border: "1px solid rgba(120,94,20,0.3)", color: "var(--color-text)" }}>
              Esporta CSV
            </a>
            <div className="w-full flex flex-wrap gap-2">
              {[null, ...OPERATORI].map((nome) => (
                <button
                  key={nome ?? "tutti"}
                  onClick={() => {
                    setSoloAnnata(false);
                    setFiltro(nome);
                  }}
                  aria-pressed={!soloAnnata && filtro === nome}
                  className="min-h-[44px] px-3 rounded-lg text-sm"
                  style={
                    !soloAnnata && filtro === nome
                      ? { background: "var(--color-bordeaux)", color: "#fff" }
                      : { border: "1px solid rgba(120,94,20,0.3)", color: "var(--color-text)" }
                  }
                >
                  {nome ?? "Tutti"} ({nome ? items.filter((i) => i.operatore === nome).length : items.length})
                </button>
              ))}
              <button
                onClick={() => setSoloAnnata(true)}
                aria-pressed={soloAnnata}
                className="min-h-[44px] px-3 rounded-lg text-sm font-medium"
                style={soloAnnata ? { background: "#c0392b", color: "#fff" } : { border: "1px solid #c0392b", color: "#c0392b" }}
              >
                Annata da verificare ({items.filter(annataDaVerificare).length})
              </button>
            </div>
          </div>
          <ul className="max-w-4xl mx-auto p-3 grid gap-3">
            {visibili.map((item) => (
              <Row
                key={`${item.id}:${item.status}`}
                item={item}
                twin={items.find((t) => t.id === item.duplicate_of)}
                operatore={operatore}
                onChange={(next) => setItems((prev) => prev.map((p) => (p.id === next.id ? next : p)))}
                onRefresh={refresh}
              />
            ))}
          </ul>
          {visibili.length === 0 && (
            <p className="text-center py-12" style={{ color: "var(--color-muted)" }}>
              {soloAnnata ? "Tutte le annate sono verificate." : "Nessuna bottiglia registrata."}
            </p>
          )}
        </div>
      )}
    </>
  );
}

// Stays inside the app: on the tablet's home-screen app a new tab has no way back.
function FotoGrande({ id, lato, onLato, onClose }: { id: string; lato: string; onLato: (lato: string) => void; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Foto ${lato} della bottiglia`}
      onClick={onClose}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overscroll-contain"
      style={{
        background: "rgba(0,0,0,0.92)",
        paddingTop: "calc(env(safe-area-inset-top) + 68px)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 76px)",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/stock/photo?id=${id}&lato=${lato}`}
        alt={`${lato === "retro" ? "Retro" : "Fronte"} della bottiglia`}
        onClick={(e) => e.stopPropagation()}
        className="max-w-full max-h-full object-contain"
      />
      <button
        onClick={onClose}
        aria-label="Chiudi la foto"
        className="fixed right-3 w-14 h-14 rounded-full flex items-center justify-center text-white"
        style={{ top: "calc(env(safe-area-inset-top) + 8px)", background: "var(--color-bordeaux)" }}
      >
        <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
      <div className="fixed left-0 right-0 flex justify-center gap-2" style={{ bottom: "calc(env(safe-area-inset-bottom) + 12px)" }}>
        {["fronte", "retro"].map((l) => (
          <button
            key={l}
            onClick={(e) => {
              e.stopPropagation();
              onLato(l);
            }}
            aria-pressed={lato === l}
            className="min-h-[52px] min-w-[110px] px-5 rounded-lg font-medium capitalize"
            style={lato === l ? { background: "#fff", color: "#000" } : { background: "rgba(255,255,255,0.15)", color: "#fff" }}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function MagazzinoPage() {
  return (
    <ArchiveGate>
      <Magazzino />
    </ArchiveGate>
  );
}
