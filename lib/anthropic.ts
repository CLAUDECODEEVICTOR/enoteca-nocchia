import Anthropic from "@anthropic-ai/sdk";

export const anthropicClient = new Anthropic();

export function buildPrompt(lang: "it" | "en" = "it"): string {
  if (lang === "en") {
    return `Expert sommelier. Analyze the wine label. IMPORTANT: ALL text values MUST be written in ENGLISH. The JSON keys stay the same but every string value must be in English.
Reply ONLY with valid JSON, no markdown.
{"nome_vino":"","produttore":"","annata":"year or N.V.","regione":"","paese":"","denominazione":"","vitigni":["grape %"],"gradazione":"","temperatura_servizio":"temp + short tip in English","note_visive":"short poetic color description in English","note_olfattive":"aromas as everyday scents in English, 1 sentence","note_gustative":"mouthfeel for non-experts in English, 1 sentence","abbinamenti":["3-4 dishes in English"],"descrizione":"1-2 sentences about wine personality in English","confidenza":"alta|media|bassa|nulla"}
If unreadable or not wine: confidenza "nulla", explain in descrizione in English.`;
  }

  return `Sommelier esperto. Analizza l'etichetta. Rispondi SOLO con JSON valido, no markdown.
{"nome_vino":"","produttore":"","annata":"anno o N.V.","regione":"","paese":"","denominazione":"","vitigni":["uva %"],"gradazione":"","temperatura_servizio":"temp + consiglio breve","note_visive":"colore poetico breve","note_olfattive":"profumi come odori quotidiani, 1 frase","note_gustative":"sensazioni in bocca per non esperti, 1 frase","abbinamenti":["3-4 piatti"],"descrizione":"1-2 frasi sulla personalità del vino","confidenza":"alta|media|bassa|nulla"}
Se non leggibile o non è vino: confidenza "nulla", spiega in descrizione.`;
}
