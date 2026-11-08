// The tags each shop bottle carries, so the sommelier can narrow 528 bottles to a few dozen
// without asking the model. Written once per bottle by scripts/etichette.mjs.

export const TIPI = ["rosso", "bianco", "rosato", "bollicine", "dolce", "distillato", "liquore", "analcolico"] as const;
export const CORPI = ["leggero", "medio", "strutturato"] as const;
export const DOLCEZZE = ["secco", "morbido", "dolce"] as const;
export const PIATTI = [
  "antipasti", "salumi", "formaggi-freschi", "formaggi-stagionati", "crudi-di-mare", "pesce", "primi-di-mare",
  "primi-di-terra", "carne-bianca", "carne-rossa", "selvaggina", "pizza", "verdure", "cucina-speziata", "dolci", "cioccolato",
] as const;
export const OCCASIONI = ["aperitivo", "tutti-i-giorni", "cena-tra-amici", "grande-occasione", "regalo", "dopo-cena", "meditazione"] as const;

export type Etichette = {
  tipo: (typeof TIPI)[number];
  corpo: (typeof CORPI)[number];
  dolcezza: (typeof DOLCEZZE)[number];
  piatti: (typeof PIATTI)[number][];
  occasioni: (typeof OCCASIONI)[number][];
};

export const ETICHETTE_SCHEMA = {
  type: "object",
  properties: {
    tipo: { type: "string", enum: [...TIPI] },
    corpo: { type: "string", enum: [...CORPI] },
    dolcezza: { type: "string", enum: [...DOLCEZZE] },
    piatti: { type: "array", items: { type: "string", enum: [...PIATTI] } },
    occasioni: { type: "array", items: { type: "string", enum: [...OCCASIONI] } },
  },
  required: ["tipo", "corpo", "dolcezza", "piatti", "occasioni"],
  additionalProperties: false,
} as const;

// Words a customer may say or write, and the tag they point to. Checked on the text before the
// model is called, so the narrowing costs nothing.
export const PAROLE: [RegExp, { piatti?: Etichette["piatti"]; occasioni?: Etichette["occasioni"]; tipo?: Etichette["tipo"]; corpo?: Etichette["corpo"] }][] = [
  [/pesce|orata|branzino|spigola|salmone|tonno|baccal|merluzzo|fish/i, { piatti: ["pesce"] }],
  [/crud[io]|ostric|tartar|sushi|carpacci|oyster|raw/i, { piatti: ["crudi-di-mare"] }],
  [/frutti di mare|vongol|cozz|scamp|gamber|crostace|aragost|astice|seafood|shrimp|lobster/i, { piatti: ["primi-di-mare", "crudi-di-mare"] }],
  [/bistecca|fiorentina|manzo|tagliata|brasato|arrost|griglia|grigliat|agnello|beef|steak|lamb|bbq/i, { piatti: ["carne-rossa"] }],
  [/pollo|tacchino|coniglio|maiale|vitello|chicken|pork|veal/i, { piatti: ["carne-bianca"] }],
  [/cinghiale|selvaggin|cervo|lepre|anatra|game|duck/i, { piatti: ["selvaggina"] }],
  [/pizza/i, { piatti: ["pizza"] }],
  [/pasta|ragù|ragu|lasagn|carbonara|amatriciana|risotto|gnocchi|tortellin/i, { piatti: ["primi-di-terra"] }],
  [/salum|prosciutt|tagliere|affettat|cold cuts|charcuterie/i, { piatti: ["salumi"] }],
  [/formagg|pecorino|parmigiano|gorgonzola|cheese/i, { piatti: ["formaggi-stagionati", "formaggi-freschi"] }],
  [/mozzarell|burrata|ricotta|caprin/i, { piatti: ["formaggi-freschi"] }],
  [/verdur|vegetarian|vegan|insalat|ortagg|vegetable|salad/i, { piatti: ["verdure"] }],
  [/speziat|piccant|curry|indian|thai|cines|giappones|asiatic|messican|spicy|asian/i, { piatti: ["cucina-speziata"] }],
  [/dolc[ei]|dessert|torta|pasticc|panettone|tiramis|crostata|cake/i, { piatti: ["dolci"], tipo: "dolce" }],
  [/cioccolat|chocolate/i, { piatti: ["cioccolato"] }],
  [/antipast|stuzzich|appetizer|starter/i, { piatti: ["antipasti"] }],
  [/aperitiv|aperitif|spritz/i, { occasioni: ["aperitivo"] }],
  [/regal|gift|present/i, { occasioni: ["regalo"] }],
  [/compleann|anniversar|festegg|laurea|matrimon|important|special|celebrat|birthday/i, { occasioni: ["grande-occasione"] }],
  [/amici|friends|grigliata/i, { occasioni: ["cena-tra-amici"] }],
  [/dopo cena|fine pasto|digestiv|after dinner/i, { occasioni: ["dopo-cena"] }],
  [/meditazion|sorseggiar|sipping/i, { occasioni: ["meditazione"] }],
  [/bollicin|spumant|champagne|prosecco|franciacorta|sparkling/i, { tipo: "bollicine" }],
  [/rosso|red wine/i, { tipo: "rosso" }],
  [/bianco|white wine/i, { tipo: "bianco" }],
  [/rosato|rosé|rose wine/i, { tipo: "rosato" }],
  [/whisk|rum|grappa|gin|cognac|distillat|vodka|spirit/i, { tipo: "distillato" }],
  [/leggero|fresco|light/i, { corpo: "leggero" }],
  [/struttur|corpos|importante|full.bodied|robust/i, { corpo: "strutturato" }],
];
