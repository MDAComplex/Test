# Zone Rush

Ein eigenes 3D-Battle-Royale-Browserspiel mit schräger Kamera von oben (Three.js + TypeScript + Vite).
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
| Laufen | WASD / Pfeiltasten | linke Bildschirmhälfte antippen und ziehen |
| Schießen | automatisch, sobald ein Gegner in Reichweite und in Sicht ist | automatisch |
| Heilen (Medikit) | H | Knopf „Heilen“ |
| Nachladen | R | Knopf „Laden“ |
| Waffe tauschen | E | Knopf „Nehmen“ |

## Features (Version 1)

- Flugzeug fliegt über die Karte, Absprung mit lenkbarem Fallschirm
- Zufällige 3D-Karte bei jeder Runde: Häuser (Dach verschwindet beim Betreten), Felsen,
  Bäume (Kronen werden durchsichtig), Büsche zum Verstecken
- Kisten öffnen sich, wenn man daneben steht – Deckel klappt auf, Loot springt heraus
- 5 Waffen mit Seltenheitsstufen: Pistole, Maschinenpistole, Schrotflinte, Sturmgewehr,
  Scharfschützengewehr
- Loot: Munition, Rüstung, Medikits; besiegte Gegner lassen ihre Ausrüstung fallen
- Schrumpfende Zone in 5 Phasen mit steigendem Schaden
- 24 Bots mit eigener KI (looten, kämpfen, ausweichen, fliehen, heilen, Zone meiden)
- HUD mit Minikarte, Kill-Feed, Lebens- und Rüstungsbalken, Ergebnis-Bildschirm
- Statistik (Spiele, Siege, beste Platzierung) wird im Browser gespeichert

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
