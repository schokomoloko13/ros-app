// Tool-Definitionen für Jarvis — geteilt zwischen realtime und talk.
// Jede Änderung hier gilt sofort für alle Kanal-Varianten.

export const JARVIS_WERKZEUGE = [
  {
    type: 'function' as const,
    name: 'artikel_suchen',
    description:
      'Sucht Artikel im aktiven Bestand nach Name, Marke oder Referenznummer. ' +
      'Immer zuerst aufrufen, bevor preis_setzen, status_setzen oder ' +
      'ähnliche Aktionen ausgeführt werden — alle anderen Werkzeuge brauchen die item_id. ' +
      'Gibt bis zu 8 Treffer zurück.',
    parameters: {
      type: 'object' as const,
      properties: {
        suchbegriff: {
          type: 'string',
          description: 'Freitext, z.B. "Rolex Submariner" oder "ref 16610"',
        },
      },
      required: ['suchbegriff'],
    },
  },
  {
    type: 'function' as const,
    name: 'preis_setzen',
    description:
      'Setzt den Zielpreis (und optional den Mindestpreis) eines Artikels. ' +
      'Vorher artikel_suchen aufrufen, um die item_id zu erhalten.',
    parameters: {
      type: 'object' as const,
      properties: {
        item_id: {
          type: 'string',
          description: 'UUID des Artikels (aus artikel_suchen)',
        },
        target_price: {
          type: 'number',
          description: 'Neuer Zielpreis in Euro',
        },
        min_price: {
          type: 'number',
          description: 'Neuer Mindestpreis in Euro (optional)',
        },
      },
      required: ['item_id', 'target_price'],
    },
  },
  {
    type: 'function' as const,
    name: 'status_setzen',
    description:
      'Ändert den Status eines Artikels. ' +
      'Reihenfolge: purchased → checked → photographed → listed → sold. ' +
      'Bei sold optional Verkaufspreis und -datum angeben.',
    parameters: {
      type: 'object' as const,
      properties: {
        item_id: {
          type: 'string',
          description: 'UUID des Artikels (aus artikel_suchen)',
        },
        status: {
          type: 'string',
          enum: ['purchased', 'checked', 'photographed', 'listed', 'sold'],
          description: 'Neuer Status',
        },
        sold_price: {
          type: 'number',
          description: 'Verkaufspreis in Euro — nur bei status=sold',
        },
        sold_at: {
          type: 'string',
          description: 'Verkaufsdatum YYYY-MM-DD — nur bei status=sold',
        },
      },
      required: ['item_id', 'status'],
    },
  },
  {
    type: 'function' as const,
    name: 'ausgabe_buchen',
    description:
      'Bucht eine Ausgabe. ' +
      'Kategorien: transport (Uber/Taxi/Fahrt), versand, verpackung, ' +
      'gebuehren (Plattformgebühren), pauschale, sonstiges.',
    parameters: {
      type: 'object' as const,
      properties: {
        betrag: {
          type: 'number',
          description: 'Betrag in Euro',
        },
        kategorie: {
          type: 'string',
          enum: ['transport', 'versand', 'verpackung', 'gebuehren', 'pauschale', 'sonstiges'],
        },
        notiz: {
          type: 'string',
          description: 'Optionaler Freitext, z.B. "DHL Päckchen Rolex"',
        },
        datum: {
          type: 'string',
          description: 'YYYY-MM-DD — Standard: heute',
        },
        item_id: {
          type: 'string',
          description: 'UUID des Artikels, wenn die Ausgabe einem Artikel zugeordnet wird',
        },
      },
      required: ['betrag', 'kategorie'],
    },
  },
  {
    type: 'function' as const,
    name: 'artikel_anlegen',
    description:
      'Legt einen neuen Artikel als Einkauf an (Status: eingekauft). ' +
      'Wenn Kategorie oder Quelle nicht eindeutig sind, kurz nachfragen — ' +
      'das ist die einzige erlaubte Ausnahme von "kein Nachfragen".',
    parameters: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string',
          description: 'Artikelname, z.B. "Rolex Submariner 16610"',
        },
        einkaufspreis: {
          type: 'number',
          description: 'Einkaufspreis in Euro',
        },
        marke: {
          type: 'string',
          description: 'Marke, z.B. "Rolex"',
        },
        zielpreis: {
          type: 'number',
          description: 'Geplanter Verkaufspreis in Euro',
        },
        kategorie: {
          type: 'string',
          description: 'Kategoriename oder Schlüsselwort, z.B. "Uhren"',
        },
        quelle: {
          type: 'string',
          description: 'Herkunft, z.B. "Chrono24", "Privatverkauf", "Flohmarkt"',
        },
      },
      required: ['name', 'einkaufspreis'],
    },
  },
  {
    type: 'function' as const,
    name: 'rueckgaengig',
    description:
      'Macht die letzte von Jarvis ausgeführte Aktion rückgängig. ' +
      'Suchen und Rückgängig-Aktionen selbst können nicht rückgängig gemacht werden.',
    parameters: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
]

// Anhang zum Systemprompt — Verhaltensregeln für alle Werkzeuge.
export const WERKZEUG_REGELN = `
DU HAST JETZT WERKZEUGE UND KANNST HANDELN:
- artikel_suchen: Immer zuerst — nie raten, immer suchen, dann die id holen.
- preis_setzen: Zielpreis (und optional Mindestpreis) eines Artikels setzen.
- status_setzen: Status ändern (purchased → checked → photographed → listed → sold). Bei "verkauft" Preis und Datum mitgeben, wenn Roberto sie nennt.
- ausgabe_buchen: Kosten direkt buchen — transport, versand, verpackung, gebuehren, pauschale, sonstiges.
- artikel_anlegen: Neuen Einkauf anlegen. Nur bei Kategorie oder Quelle kurz nachfragen, wenn unklar.
- rueckgaengig: Letzte Aktion zurücknehmen.

VERHALTENSREGELN:
- Handle sofort. Kein "Soll ich ...?", kein "Sind Sie sicher?".
- Nach jeder Aktion ein Satz: Was getan wurde und das Ergebnis.
- Wenn die Suche mehrere Artikel liefert: die ersten drei nennen und fragen "Welchen?".
- Bei Misserfolg: kurze Fehlermeldung, dann Ursache in einem Satz.
`
