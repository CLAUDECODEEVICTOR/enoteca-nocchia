// Grapes written from memory were wrong on 13 of 85 checked cards. A customer only sees
// the ones printed on the label or confirmed by a person with a source.
const SINONIMI: [RegExp, string][] = [
  [/\bnero\b/g, "noir"], [/\bbianco\b/g, "blanc"], [/\bgrigio\b/g, "gris"],
  [/\bmoscato\b/g, "muscat"], [/\bsyrah\b/g, "shiraz"], [/\bpinot meunier\b/g, "meunier"],
];
const INVERSI: [RegExp, string][] = SINONIMI.map(([it, fr]) => [new RegExp(`\\b${fr}\\b`, "g"), it.source.replace(/\\b/g, "")]);
const piano = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\(.*?\)/g, " ").replace(/[^a-z]+/g, " ").trim();

export function vitigniInEtichetta(vitigni: unknown, testo: string): string[] {
  const lista = Array.isArray(vitigni) ? vitigni.filter((v): v is string => typeof v === "string" && v.trim() !== "") : [];
  if (!lista.length) return [];
  const etichetta = ` ${piano(testo)} `;
  const letto = (v: string) => {
    const nome = piano(v);
    if (!nome) return false;
    const forme = [nome, SINONIMI.reduce((s, [it, fr]) => s.replace(it, fr), nome), INVERSI.reduce((s, [fr, it]) => s.replace(fr, it), nome)];
    return forme.some((f) => etichetta.includes(` ${f} `));
  };
  return lista.every(letto) ? lista : [];
}
