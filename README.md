# Zone Rush

Ein eigenes 3D-Battle-Royale-Browserspiel mit schräger Kamera von oben (Three.js + TypeScript + Vite).
25 Kämpfer landen auf einer zufällig erzeugten Insel – nur einer überlebt.
25 Kämpfer landen auf einer zufällig erzeugten Karte – nur einer überlebt.

## Spielen

```bash
npm install
npm run dev      # Entwicklungsserver, dann die angezeigte URL öffnen
npm run build    # fertige Version nach dist/ bauen
```

## Steuerung

| Aktion | PC | Handy |
| --- | --- | --- |
| Absprung | Leertaste | Knopf „Springen“ |
| Laufen | WASD / Pfeiltasten | linker Stick (Seite in den Einstellungen tauschbar) |
| Zielen und schießen | Maus zielen, Linksklick | rechter Stick, weit ziehen = schießen |
| Waffe aufheben | E | kurz auf der Waffe stehen bleiben |
| Waffe wechseln | Q / 1 / 2 | auf den zweiten Waffenplatz tippen |
| Nachladen | R | Knopf „Laden“ |
| Pause / Einstellungen | Esc | Zahnrad |

## Features

- **Absprung:** Flugzeug fliegt über die Insel, Absprung mit lenkbarem Fallschirm
- **Kampf:** selbst zielen und schießen (Maus oder rechter Stick), gepunktete Ziellinie mit
  Waffenreichweite, Treffermarker, Anzeige der Schadensrichtung
- **7 Waffen:** Pistole, Maschinenpistole, Schrotflinte, Sturmgewehr, Scharfschützengewehr sowie
  Minigun (mit Anlaufzeit) und Raketenwerfer nur aus Versorgungspaketen; zwei Waffenplätze
- **Loot:** Aufheben mit Fortschrittsring am Boden, Medikits heilen nach kurzer Nutzungszeit,
  schwarze Loot-Kisten nur in Häusern, Versorgungspakete am Fallschirm
- **Karte:** zufällige Insel mit Dorf, Häusern mit einem oder zwei Räumen (Dach blendet beim
  Betreten aus), Teichen, Wäldern, Feldern, Büschen zum Verstecken
- **Bots:** 24 Gegner mit drei Spielstilen, Deckungssuche, Verstecken in Büschen, fairem Zielen
- **Fortschritt:** Erfahrungspunkte, Level, freischaltbare Farben, tägliche Aufgaben
- **Komfort:** Einführung in der ersten Runde, Zuschauen nach dem Tod, automatische Grafikanpassung,
  Einstellungen für Steuerungsseite, Stick-Größe, Grafik und Ton, Sound per Web Audio

## Tests

```bash
npm test
```

Prüft unter anderem Loot-Abstände, Heil-Regeln, Minigun-Anlaufzeit, Waffenplätze und dass
Kisten-Inhalte im Haus bleiben.

## Struktur

- `src/sim/game.ts` – Spiellogik (Kampf, Bots, Zone, Loot, Kisten, Absprung)
- `src/render/renderer.ts` – 3D-Darstellung mit Three.js
- `src/ui/hud.ts` – Menü, Anzeigen, Joystick, Knöpfe
- `src/mapgen.ts` – Kartengenerator
- `src/weapons.ts` – Waffenwerte
- Alle 3D-Modelle werden per Code aus einfachen Formen gebaut (keine Bilddateien nötig)

## Nächste Schritte (Version 2)

Figuren mit Fähigkeiten, Granaten, Fortschritt/Level/Skins, tägliche Aufgaben –
danach optional Online-Multiplayer (Version 3).
