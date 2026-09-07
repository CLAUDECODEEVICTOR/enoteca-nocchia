"use client";

import Gate from "./Gate";

export default function PinGate({ children }: { children: React.ReactNode }) {
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
