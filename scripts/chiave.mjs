// Same identity as wineKey in lib/db.ts: the archive id of a wine.
export function wineKey(nome, produttore, annata) {
  const norm = (s) =>
    (s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80);
  return [norm(nome), norm(produttore), norm(annata)].filter(Boolean).join("__");
}
