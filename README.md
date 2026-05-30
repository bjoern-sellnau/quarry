# QUARRY

Ein **6-Degrees-of-Freedom-Shooter** im Geist von *Descent* — geflogen wird
mit voller Bewegungsfreiheit (Pitch, Yaw, Roll + Strafe in alle Richtungen)
durch ein verzweigtes Minen-Tunnelsystem voller feindlicher Roboter.

Komplett im Browser, gebaut mit [Three.js](https://threejs.org/) — kein
Build-Schritt nötig.

## Starten

Wegen ES-Modulen muss das Spiel über einen kleinen Webserver laufen
(`file://` funktioniert nicht). Eine der folgenden Varianten:

```bash
# Variante 1: npm (lädt serve via npx)
npm start

# Variante 2: Python
python3 -m http.server 8080

# Variante 3: irgendein statischer Server im Projektordner
```

Dann im Browser öffnen: <http://localhost:8080>

## Steuerung

| Eingabe | Aktion |
| --- | --- |
| `W` / `S` | Schub vor / zurück |
| `A` / `D` | Strafe links / rechts |
| `Space` / `Ctrl` | Strafe hoch / runter |
| `Q` / `E` | Roll links / rechts |
| Maus | Pitch / Yaw (Zielen) |
| Linke Maustaste | Laser feuern |
| `Shift` | Boost |
| `Esc` | Maus freigeben |

Ein Klick aufs Spielfeld aktiviert die Maussteuerung (Pointer Lock).

## Ziel

Zerstöre alle Roboter in der Mine, bevor dein Schiff zerstört wird. Der
Schild regeneriert sich langsam, die Hülle nicht — bleib in Bewegung.

## Aufbau des Codes

| Datei | Aufgabe |
| --- | --- |
| `index.html` | Einstiegspunkt, HUD- und Menü-Markup, Three.js-Importmap |
| `src/style.css` | HUD- und Overlay-Styling |
| `src/main.js` | Szene, Spielschleife, Treffer-Logik, Sieg/Niederlage |
| `src/ship.js` | Quaternion-basierte 6DOF-Flugphysik des Spielerschiffs |
| `src/input.js` | Tastatur + Pointer-Lock-Maus |
| `src/level.js` | Minen-Geometrie + automatische Türöffnungen + Kollision |
| `src/enemies.js` | Roboter-Gegner mit Wander-/Verfolgungs-/Feuer-KI |
| `src/weapons.js` | Laser-Projektile (Spieler & Gegner) |
| `src/hud.js` | HUD-Anbindung ans DOM |

## Wie das Level funktioniert

Das Level ist eine Liste achsenausgerichteter Boxen (`CELLS` in
`level.js`). Boxen, die sich an einer Fläche berühren, werden automatisch
durch eine Tür verbunden — daraus werden sowohl die sichtbare Geometrie
(Wände mit Löchern) als auch die Kollision (Durchflug) abgeleitet. Neue
Räume baust du, indem du der Liste weitere Boxen hinzufügst, die an
bestehende anstoßen.
