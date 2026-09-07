"use client";

import Gate from "./Gate";

export default function ArchiveGate({ children }: { children: React.ReactNode }) {
  return (
    <Gate
      scope="admin"
      title="Archivio"
      subtitle="Area riservata. Inserisci il PIN amministratore."
      showBackLink
    >
      {children}
    </Gate>
  );
}
