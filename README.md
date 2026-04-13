# Lyra Archiv

Statisches Webarchiv für GitHub Pages mit News-Startseite:

- `Neu im Archiv` (Top 8 zuletzt geänderte Dateien, inkl. Kategorie)
- `AI-Vorlagen`
- `Recherchen` als baumartiger Explorer mit Breadcrumb und Zurück-Navigation

Artikel werden als Vollseitenansicht geöffnet, inklusive Share-Link, Original-Download, Browser-Webwiedergabe (TTS) und optionalem Audio-/Video-Player.

## Datenquellen

- `./AI/` für AI-Vorlagen (`.txt`, `.md`)
- `./Recherchen/` für Kategorien, Unterkategorien und Artikel (`.txt`, `.md`, `.pdf`)
- `./Recherchen/tts/` für Vorlesedateien (`.mp3`, `.mp4`, `.m4a`, `.mp4a`, `.wav`, `.ogg`)

Audiodateien werden robust erkannt (pfadgenau plus Dateiname), inklusive Umlaut-/Schreibvarianten.

## Wichtige Dateien

- `scripts/generate_archive.py` erzeugt `data/archive.json` und `data/archive.js`
- `assets/app.js` rendert Explorer, News-Karten, Artikelansicht und Wiedergabe
- `assets/styles.css` enthält das moderne UI
- `content.config.json` steuert Rubriken, Ordner und erlaubte Dateitypen

## Lokale Nutzung

1. `py -3.10 .\scripts\generate_archive.py`
2. `py -m http.server 8080`
3. `http://localhost:8080` aufrufen

## Auto-Sync nach GitHub

### GitHub Action

Bei Änderungen in `AI/**`, `Recherchen/**` oder `content.config.json` läuft automatisch:

- `.github/workflows/sync-archive-data.yml`
- regeneriert `data/archive.json` und `data/archive.js`
- committet die generierten Dateien zurück nach `main`

### Lokaler Auto-Push

Für automatische Uploads neuer/aktualisierter TXT- und Audiodateien lokal:

`powershell -ExecutionPolicy Bypass -File .\scripts\auto-sync-to-github.ps1`

Das Skript prüft regelmäßig auf Änderungen, generiert das Archiv neu und führt `git add/commit/push` aus.

## Deep-Linking

- `?entry=<share_key>` öffnet einen Artikel direkt in der Vollseitenansicht.
- Bestehende AI-Share-Keys bleiben stabil (`ai-vorlagen--...`).
