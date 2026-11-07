// The whole wait as the customer lives it, from the tap on Analizza to the card on screen
// and then to the bottle photo. One scan at a time; the record goes out once the photo
// shows up, fails, or is not coming. Never in the customer's way: errors are ignored.

const CHIAVE = "cronometro";

interface Misura {
  inizio: number;
  ms?: number;
  ms_scheda?: number;
  fonte?: string;
  lang?: string;
  vino?: string;
}

const leggi = (): Misura | null => {
  try {
    return JSON.parse(sessionStorage.getItem(CHIAVE) || "null");
  } catch {
    return null;
  }
};
const scrivi = (m: Misura | null) => {
  try {
    if (m) sessionStorage.setItem(CHIAVE, JSON.stringify(m));
    else sessionStorage.removeItem(CHIAVE);
  } catch {}
};

export function avvia() {
  scrivi({ inizio: Date.now() });
}

export function rispostaArrivata(dati: { fonte: string; lang: string; vino: string }) {
  const m = leggi();
  if (m) scrivi({ ...m, ...dati, ms: Date.now() - m.inizio });
}

// The card is painted: two frames after React commits it.
export function schedaVisibile() {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const m = leggi();
      if (m?.ms !== undefined && m.ms_scheda === undefined) scrivi({ ...m, ms_scheda: Date.now() - m.inizio });
    })
  );
}

// Ends the measure: with the photo's time, or without when there is no photo.
export function fotoVisibile(arrivata: boolean) {
  const m = leggi();
  if (m?.ms === undefined) return;
  scrivi(null);
  // A photo that fails at once can beat the two frames: the card is on screen anyway.
  const ms_scheda = m.ms_scheda ?? Date.now() - m.inizio;
  fetch("/api/tempi", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body: JSON.stringify({ ...m, ms_scheda, ms_foto: arrivata ? Date.now() - m.inizio : null }),
  }).catch(() => {});
}
