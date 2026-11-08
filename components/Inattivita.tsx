"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";

// The iPad on the counter is shared: a minute without a touch asks "still there?", and fifteen
// seconds later the next customer finds the home page, with nothing left of the previous one.
// Only on the customer pages; staff pages (admin, magazzino…) are never reset.
const PAGINE = ["/sommelier", "/result", "/scan"];
const AVVISO = 60_000;
const RITORNO = 15_000;
const TRACCE = ["sommelier_ultimo", "sommelier_torna", "indietro", "consiglio_perche", "lastScanThumbnail", "cronometro"];

export default function Inattivita() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const [avviso, setAvviso] = useState(false);
  const attiva = PAGINE.includes(pathname);

  useEffect(() => {
    if (!attiva) return;
    let avvisoId: ReturnType<typeof setTimeout>;
    let ritornoId: ReturnType<typeof setTimeout>;
    const occupato = () => document.body.dataset.occupato === "1";
    const riparti = () => {
      clearTimeout(avvisoId);
      clearTimeout(ritornoId);
      setAvviso(false);
      avvisoId = setTimeout(mostra, AVVISO);
    };
    const mostra = () => {
      // Loading advice or the voice speaking: wait, the customer is still there.
      if (occupato()) return riparti();
      setAvviso(true);
      ritornoId = setTimeout(() => {
        for (const k of TRACCE) sessionStorage.removeItem(k);
        setAvviso(false);
        router.push("/");
      }, RITORNO);
    };
    const eventi = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    for (const e of eventi) window.addEventListener(e, riparti, { passive: true });
    riparti();
    return () => {
      clearTimeout(avvisoId);
      clearTimeout(ritornoId);
      for (const e of eventi) window.removeEventListener(e, riparti);
    };
  }, [attiva, router]);

  if (!attiva || !avviso) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] p-4 flex justify-center" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)" }}>
      <div role="alertdialog" aria-live="assertive" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl flex items-center gap-4" style={{ border: "1px solid #E8E1D6" }}>
        <div className="grow">
          <p className="text-lg font-medium" style={{ color: "#302D28", fontFamily: "var(--font-playfair)" }}>{t("sommelier.idle_title")}</p>
          <p className="text-sm mt-0.5" style={{ color: "#746E65" }}>{t("sommelier.idle_text")}</p>
        </div>
        <button className="min-h-[48px] px-5 rounded-xl text-base font-medium shrink-0" style={{ background: "var(--color-bordeaux)", color: "#fff" }}>
          {t("sommelier.idle_stay")}
        </button>
      </div>
    </div>
  );
}
