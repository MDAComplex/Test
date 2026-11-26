# Zone Rush

Ein eigenes Battle-Royale-Browserspiel mit Ansicht von oben (Phaser 3 + TypeScript + Vite).
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
| Laufen | WASD / Pfeiltasten | linke Bildschirmhälfte antippen und ziehen |
| Schießen | automatisch, sobald ein Gegner in Reichweite und in Sicht ist | automatisch |
| Heilen (Medikit) | H | Knopf „Heilen“ |
| Nachladen | R | Knopf „Laden“ |
| Waffe tauschen | E | Knopf „Nehmen“ |

## Features (Version 1)

- Landeplatz-Wahl auf der Karte, zufällige Karte bei jeder Runde
- Häuser, Felsen, Bäume (Kronen werden durchsichtig, wenn man darunter steht),
  zerstörbare Kisten mit Loot, Büsche zum Verstecken
- 5 Waffen mit Seltenheitsstufen: Pistole, Maschinenpistole, Schrotflinte, Sturmgewehr,
  Scharfschützengewehr
- Loot: Munition, Rüstung, Medikits; besiegte Gegner lassen ihre Ausrüstung fallen
- Schrumpfende Zone in 5 Phasen mit steigendem Schaden
- 24 Bots mit eigener KI (looten, kämpfen, ausweichen, fliehen, heilen, Zone meiden)
- HUD mit Minikarte, Kill-Feed, Lebens- und Rüstungsbalken, Ergebnis-Bildschirm
- Statistik (Spiele, Siege, beste Platzierung) wird im Browser gespeichert

## Struktur

- `src/scenes/` – Boot, Menü, Absprung, Spiel, HUD
- `src/mapgen.ts` – Kartengenerator
- `src/weapons.ts` – Waffenwerte
- `src/textures.ts` – alle Grafiken werden per Code gezeichnet (keine Bilddateien nötig)

## Nächste Schritte (Version 2)

Figuren mit Fähigkeiten, Granaten, Fortschritt/Level/Skins, tägliche Aufgaben –
danach optional Online-Multiplayer (Version 3).
