export interface WineAnalysis {
  nome_vino: string;
  produttore: string;
  annata: string;
  regione: string;
  paese: string;
  denominazione: string;
  vitigni: string[];
  gradazione: string;
  temperatura_servizio: string;
  note_visive: string;
  note_olfattive: string;
  note_gustative: string;
  abbinamenti: string[];
  descrizione: string;
  confidenza: "alta" | "media" | "bassa" | "nulla";
  // Verbatim transcription of the label text — produced by the analyze-wine prompt
  // step 1. Used for feedback/debugging only; not rendered on WineCard.
  testo_etichetta?: string;
}

export interface BilingualWineAnalysis {
  it: WineAnalysis;
  en: WineAnalysis;
}

export const FORMATI = ["187 ml", "200 ml", "350 ml", "375 ml", "500 ml", "700 ml", "750 ml", "1 l", "1,5 l", "2 l", "3 l", "5 l", "6 l"];

export const OPERATORI = ["Matteo", "Filippo", "Maurizio", "Edoardo"];
