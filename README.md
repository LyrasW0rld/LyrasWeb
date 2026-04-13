# Lyra Archiv

Statisches Webarchiv fuer GitHub Pages mit drei Startseiten-Bereichen:

- `Neu` (Top 8 zuletzt geaenderte Dateien)
- `AI Vorlagen`
- `Recherchen` als baumartiger Explorer mit Breadcrumb-Navigation

Artikel werden als Vollseitenansicht geoeffnet (nicht als Modal), inklusive Share-Link, Original-Download und optionalem Audio-Player.

## Datenquellen

- `./AI/` fuer AI Vorlagen (`.txt`, `.md`)
- `./Recherchen/` fuer Kategorien, Unterkategorien und Artikel (`.txt`, `.md`, `.pdf`)
- `./Recherchen/tts/` fuer zentrale Vorlesedateien (`.mp3`, `.mp4`, `.m4a`, `.mp4a`, `.wav`, `.ogg`)

Audiodateien werden ueber denselben Dateinamen wie der Artikel erkannt, bevorzugt pfadgenau.

## Wichtige Dateien

- `scripts/generate_archive.py` erzeugt `data/archive.json` und `data/archive.js`
- `assets/app.js` rendert Explorer, Artikelansicht, Deep-Linking und Sharing
- `assets/styles.css` enthaelt das NatGeo-inspirierte UI
- `content.config.json` steuert Rubriken, Ordner und erlaubte Dateitypen

## Lokale Nutzung

1. `py -3.10 .\scripts\generate_archive.py`
2. `py -m http.server 8080`
3. `http://localhost:8080` aufrufen

## Deep-Linking

- `?entry=<share_key>` oeffnet einen Artikel direkt in der Vollseitenansicht.
- Bestehende AI-Share-Keys bleiben stabil (`ai-vorlagen--...`).
