# Freie, benennbare Fahrplan-Zeiträume statt Winter/Sommer/Jahres-Schema

**Ziel:** Die feste Einteilung `fahrplan: 'jahres'|'winter'|'sommer'` wird ersetzt durch frei definierte, benennbare Zeiträume (z. B. „Winter Vorsaison"), denen jeder Umlauf zugeordnet werden kann. Ein Umlauf ist an einem Tag aktiv, sobald einer seiner Zeiträume den Tag abdeckt. Anlegen/Aktivieren/Deaktivieren/Löschen von Umläufen existiert bereits (Tab „Touren & Fahrplan") und bleibt unverändert erhalten.

**Treffende Standardentscheidungen (ohne Rückmeldung):** Zeiträume jährlich wiederkehrend als TT.MM. (Winter darf über Silvester reichen — wie bisher), mehrere Zeiträume pro Umlauf erlaubt, Demo bekommt eine Beispiel-Zwischensaison.

## 1. Datenmodell — js/data.js
- `v: 6` (bisher 5) → localStorage wird ungültig, Demo regeneriert sauber (bewährtes Muster, keine Migration nötig).
- Neu in State: `perioden: [{id:'p1', name:'Jahresfahrplan', von:'01-01', bis:'12-31'}, {id:'p2', name:'Winter', von:'12-01', bis:'04-19'}, {id:'p3', name:'Sommer', von:'06-20', bis:'11-02'}, {id:'p4', name:'Zwischensaison Frühjahr', von:'04-20', bis:'06-19'}]`. `state.saison` entfällt.
- Dienste: Feld `fahrplan` → `perioden: ['p1']` bzw. `['p2']` / `['p3']`. Zwei zusätzliche plausible Umläufe für p4 (z. B. ein Linien-Verstärker und ein Übergangs-Shuttle) → 32 Dienste gesamt.

## 2. Regeln — js/rules.js
- Entfernen: `SAISON`, `setSaison`, `getSaison`, `winterAktiv`, `sommerAktiv`, `fahrplanName`, string-basiertes `periodText`.
- Neu: `periodeAktiv(p, datum)` (nutzt bestehendes `imMmdd` mit Jahreswechsel-Support), `varianteAktiv(st, d, datum)` → prüft `d.perioden` gegen `st.perioden`, `aktivePerioden(st, datum)` (ersetzt `aktiveFahrplanVarianten`), `periodText(p)` → „1.12. – 19.4.".
- `aktiveDienste(st, datum)` baut auf neuer `varianteAktiv` auf (Signatur bleibt gleich → planner unverändert hier).

## 3. Folgestellen
- **js/planner.js:** replan Schritt 1 („Dienst gilt nicht mehr"-Filter) → `R.varianteAktiv(st, d, e.datum)`.
- **js/app.js:** Versionscheck `s.v === 6`; beide `Rules.setSaison`-Aufrufe entfernen; `kannZuweisen` → neue Signatur.
- **js/modals.js:**
  - Neues Modal `perioden(st)` (ersetztes saison-Modal): Zeilen mit [Name][von TT.MM.][bis TT.MM.][🗑 löschen], „+ Zeitraum hinzufügen"-Button (gleiches Zeilen-Muster wie Abwesenheiten), Auto-Punkt-Eingabe, Hinweis zum Silvester-Übergang; Speichern validiert Namen/Daten, dann großer 12-Wochen-Sweep via `App.replanBereich` (löst automatisch entfernte/neue Einsätze aus).
  - `dienst`-Modal: `#d-fp`-Select → Checkbox-Gruppe aller Perioden (Name + Datumspanne), Mindestens-eine-Prüfung, Standard für neue Umläufe = aktuell gültige Periode.
  - Einsatz-Modal: Label statt `fahrplanName` → Periodennamen des Dienstes.
- **js/ui.js:**
  - Dashboard-Kopfzeile: aktive Perioden statt fahrplanName-Verkettung.
  - `tourGridHTML` (Dashboard): Sektionen dynamisch aus `st.perioden` („Name · 1.12. – 19.4."), Umläufe via `d.perioden.includes(p.id)`; statische Hartkodier-Labels entfernt.
  - `htmlTouren`: Banner zeigt heute aktive Perioden + Button „✎ Zeiträume bearbeiten" (`#saison-edit` → `Modals.perioden`); Sektionen pro Periode + Zusatz-Sektion „Kein Zeitraum zugeordnet" (sichtbar für Umläufe ohne Zuordnung, damit nichts verschwindet); Tooltip-Text „Gilt in: … – an diesem Tag nicht aktiv".

## 4. Verifikation (Playwright + Judge)
- Frischer Laden mit v6: 0 Konsolenfehler, 32 Dienste, Dashboard-Grid zeigt 4 Perioden-Sektionen.
- Funktionsdurchlauf: neuen Zeitraum „Winter Vorsaison" (z. B. 20.10.–30.11.) anlegen, einem Winter-Umlauf zusätzlich zuordnen → Einsätze werden in diesem Fenster erzeugt; Perioden-Löschen entfernt Zuordnungen; Umlauf anlegen/deaktivieren/löschen; Autodispo in ferner leerer Woche respektiert Perioden.
- Judge-Sichtprüfung Dashboard + Touren-Tab (hell + dunkel).