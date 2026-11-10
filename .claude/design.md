# Design: Nocchia Wine Bar (app al banco)

Lo stesso sistema del sito Nocchia (`~/Lavoro/clienti/demo-enoteca-nocchia/risorse/demo.css`),
ricavato dal logo NOCCHIA / WINE BAR. Non introdurre caratteri o colori fuori da qui.

## Caratteri
- Titoli: **Gilda Display** 400 (`app/fonts/gilda.woff2`, variabile `--font-titoli`). Un solo peso:
  niente grassetto, `font-synthesis: none` impedisce quello finto.
- Testo, pulsanti, campi: **Hanken Grotesk** 400-800 (`app/fonts/hanken.woff2`, `--font-testo`).
- Etichette di sezione: maiuscolo spaziato, come WINE BAR nel logo.
- Vietati Playfair, DM Sans, Inter e simili.

## Colori (`app/globals.css`)
- Fondo bianco `#FFFFFF`, testo inchiostro `#111111`, secondario `#66625D`.
- Pietra `#F4F2ED` per i riquadri, filetto `#E3E0DA` per bordi e linee.
- Un solo colore d'azione: verde alloro `#3E6B2A` (variabile `--color-bordeaux`, nome storico).
- Niente oro: `--color-gold` è inchiostro e resta solo per compatibilità.

## Forme
- Pulsanti e campi: angoli 4 px (`rounded`). Riquadri e card: 8 px (`rounded-lg`). Pillole: tonde.
- Pulsante principale pieno verde; spento = stesso verde al 40%, mai beige.

## Logo
- `public/logo-nocchia.png` (840 px, fondo trasparente), dall'originale del cliente. In alto al
  centro nelle pagine cliente; icona dell'app: N bianca su nero.
