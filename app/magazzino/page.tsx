"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ArchiveGate from "@/components/ArchiveGate";
import CameraStream from "@/components/CameraStream";
import { addShot, allShots, removeShot, type QueuedShot } from "@/lib/stock-queue";
import "@/lib/i18n";

interface StockItem {
  id: string;
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
}

const FORMATI = ["187 ml", "375 ml", "500 ml", "750 ml", "1,5 l", "3 l", "5 l", "6 l"];
const PARALLEL = 3;

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
  onChange,
  onRefresh,
}: {
  item: StockItem;
  twin: StockItem | undefined;
  onChange: (next: StockItem) => void;
  onRefresh: () => void;
}) {
  const [draft, setDraft] = useState(item);
  const [failed, setFailed] = useState(false);
  const reading = item.status === "da_leggere";

  const save = async (next: StockItem) => {
    setDraft(next);
    const res = await fetch("/api/stock", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
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
      body: JSON.stringify({ id: item.id, ...body }),
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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/stock/photo?id=${item.id}`}
        alt="Foto bottiglia"
        className="w-24 md:w-40 h-36 md:h-56 rounded-lg object-cover shrink-0"
        style={{ background: "rgba(120,94,20,0.08)" }}
      />
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        {reading && <p className="text-sm" style={{ color: "var(--color-muted)" }}>Lettura in corso…</p>}
        {item.status === "errore" && (
          <button onClick={retry} className="min-h-[44px] rounded-lg text-sm font-medium text-white" style={{ background: "var(--color-bordeaux)" }}>
            Lettura fallita: riprova
          </button>
        )}
        {item.status === "da_controllare" && (
          <p className="text-sm font-medium" style={{ color: "#c0392b" }}>Da controllare: confronta con la foto</p>
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
              {FORMATI.map((f) => <option key={f}>{f}</option>)}
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
      setFlash(true);
      setTimeout(() => setFlash(false), 150);
      const photoBase64 = await shrink(base64, 800, 0.7);
      await addShot({ id: crypto.randomUUID(), imageBase64: base64, photoBase64 });
      pump();
    },
    [pump]
  );

  const totale = items.reduce((n, i) => n + i.quantita, 0);
  const daControllare = items.filter((i) => i.status === "da_controllare" || i.status === "errore" || i.duplicate_of).length;

  return (
    <>
      <CameraStream onCapture={capture} />
      {flash && <div className="fixed inset-0 z-30 bg-white/70 pointer-events-none" />}

      <div className="fixed top-3 left-3 right-3 z-30 flex items-center gap-2 text-white" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <button onClick={() => router.push("/")} className="min-h-[44px] px-4 rounded-lg" style={{ background: "rgba(0,0,0,0.55)" }}>Esci</button>
        <div className="min-h-[44px] px-4 rounded-lg flex items-center text-sm" style={{ background: "rgba(0,0,0,0.55)" }}>
          {items.length} vini, {totale} bottiglie{pending > 0 ? `, ${pending} in lettura` : ""}
        </div>
        <button onClick={() => setShowList(true)} className="min-h-[44px] px-4 rounded-lg ml-auto font-medium" style={{ background: "var(--color-bordeaux)" }}>
          Lista{daControllare > 0 ? ` (${daControllare} da controllare)` : ""}
        </button>
      </div>

      {(offline || expired) && (
        <div className="fixed top-20 left-3 right-3 z-30 rounded-lg p-3 text-sm text-white" style={{ background: "#c0392b" }}>
          {expired
            ? "Sessione scaduta: ricarica la pagina e reinserisci il PIN. Le foto restano salvate sul tablet."
            : "Connessione assente: le foto restano sul tablet e partono appena torna."}
        </div>
      )}

      {showList && (
        <div className="fixed inset-0 z-40 overflow-y-auto" style={{ background: "var(--color-bg)", paddingTop: "env(safe-area-inset-top)" }}>
          <div className="sticky top-0 z-10 flex items-center gap-2 p-3" style={{ background: "var(--color-bg)", borderBottom: "1px solid rgba(120,94,20,0.15)" }}>
            <button onClick={() => setShowList(false)} className="min-h-[44px] px-4 rounded-lg font-medium text-white" style={{ background: "var(--color-bordeaux)" }}>
              Torna agli scatti
            </button>
            <span className="text-sm" style={{ color: "var(--color-muted)" }}>{items.length} vini, {totale} bottiglie</span>
            <a href="/api/stock/export" className="min-h-[44px] px-4 rounded-lg ml-auto flex items-center text-sm" style={{ border: "1px solid rgba(120,94,20,0.3)", color: "var(--color-text)" }}>
              Esporta CSV
            </a>
          </div>
          <ul className="max-w-4xl mx-auto p-3 grid gap-3">
            {items.map((item) => (
              <Row
                key={`${item.id}:${item.status}`}
                item={item}
                twin={items.find((t) => t.id === item.duplicate_of)}
                onChange={(next) => setItems((prev) => prev.map((p) => (p.id === next.id ? next : p)))}
                onRefresh={refresh}
              />
            ))}
          </ul>
          {items.length === 0 && (
            <p className="text-center py-12" style={{ color: "var(--color-muted)" }}>Nessuna bottiglia registrata.</p>
          )}
        </div>
      )}
    </>
  );
}

export default function MagazzinoPage() {
  return (
    <ArchiveGate>
      <Magazzino />
    </ArchiveGate>
  );
}
