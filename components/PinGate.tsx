"use client";

import Gate from "./Gate";
import { PIN_CLIENTI } from "@/lib/pin";

export default function PinGate({ children }: { children: React.ReactNode }) {
  if (!PIN_CLIENTI) return <>{children}</>;
  return (
    <Gate
      scope="app"
      title="Enoteca Nocchia"
      subtitle="Inserisci il PIN per accedere"
    >
      {children}
    </Gate>
  );
}
