"use client";

import Gate from "./Gate";

export default function FeedbackGate({ children }: { children: React.ReactNode }) {
  return (
    <Gate
      scope="admin"
      title="Feedback"
      subtitle="Area riservata. Inserisci il PIN amministratore."
      showBackLink
    >
      {children}
    </Gate>
  );
}
