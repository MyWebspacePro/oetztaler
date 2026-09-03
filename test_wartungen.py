"""Wartungen-Modal bei Bussen: anlegen, speichern, Persistenz, Planwirkung."""
import sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8123/index.html"
OK, FAIL = "\033[92m OK \033[0m", "\033[91mFAIL\033[0m"
results = []
def check(name, cond, info=""):
    results.append((name, bool(cond)))
    print(f"{OK if cond else FAIL} {name}" + (f"  -- {info}" if info else ""))

def toasts_clear(page):
    t = page.eval_on_selector_all("#toast-root .toast", "els => els.map(e => e.textContent.trim().replace(/\\s+/g,' '))")
    page.evaluate("document.getElementById('toast-root').innerHTML = ''")
    return t

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.goto(BASE)
    page.evaluate("localStorage.clear()")
    page.reload()
    page.wait_for_selector(".kpis")

    bid = page.evaluate("App.state.buses[0].id")   # OVG-101, ohne Wartungen im Seed
    n_vor = page.evaluate(f"App.state.buses.find(x => x.id === '{bid}').wartungen.length")

    # Modal im Busse-Tab öffnen
    page.click("button[data-tab='busse']")
    page.wait_for_selector("table.tbl")
    page.click(f"table.tbl button[data-act='wart'][data-id='{bid}']")
    page.wait_for_selector("#wa-list")
    check("Wartungen-Modal öffnet", page.query_selector(".modal") is not None)

    # Fehlpfad: leeres Datum -> Fehlermeldung, Modal bleibt offen
    page.click("#wa-add")
    rows = page.query_selector_all("#wa-list .entryrow")
    check("Plus-Button fügt Zeile hinzu", len(rows) == 1, f"{len(rows)}")
    rows[0].query_selector(".w-von").fill("")
    rows[0].query_selector(".w-bis").fill("")
    page.click(".modal .save")
    page.wait_for_timeout(200)
    fehler = page.evaluate("document.querySelector('.modal .err, #modal-root .err')?.textContent || ''")
    modal_offen = page.query_selector("#wa-list") is not None
    check("Validierung greift (leeres Datum)", modal_offen, fehler)
    # Modal schließen (Abbrechen), neu öffnen und korrekt ausfüllen
    page.evaluate("Modals.close && Modals.close()") if hasattr(page, "dummy") else None
    page.keyboard.press("Escape")
    page.wait_for_timeout(200)
    if page.query_selector("#wa-list"):
        # falls kein Escape-Handler: über Abbrechen-Button
        cancel = page.query_selector(".modal .cancel, .modal button:not(.save)")
        if cancel: cancel.click()
        page.wait_for_timeout(200)
    # Frisch öffnen und sauber speichern
    page.click(f"table.tbl button[data-act='wart'][data-id='{bid}']")
    page.wait_for_selector("#wa-list")
    page.click("#wa-add")
    rows = page.query_selector_all("#wa-list .entryrow")
    rows[0].query_selector(".w-art").select_option("wartung")
    rows[0].query_selector(".w-von").fill("01.09.2026")
    rows[0].query_selector(".w-bis").fill("03.09.2026")
    rows[0].query_selector(".w-notiz").fill("Test-TÜV")
    page.click(".modal .save")
    page.wait_for_timeout(500)
    toasts_clear(page)

    w = page.evaluate(f"""() => {{
      const b = App.state.buses.find(x => x.id === '{bid}');
      return b.wartungen.map(x => ({{ art: x.art, von: x.von, bis: x.bis, notiz: x.notiz }}));
    }}""")
    check("Wartung wurde gespeichert", len(w) == n_vor + 1, str(w))
    check("Daten korrekt (von/bis/notiz)", len(w) and w[-1]["von"] == "2026-09-01" and w[-1]["bis"] == "2026-09-03" and w[-1]["notiz"] == "Test-TÜV", str(w[-1] if w else None))

    # Planwirkung: Bus darf im Zeitraum keine Einsätze mehr haben
    frei = page.evaluate(f"""() => {{
      return App.state.einsaetze.filter(e => e.busId === '{bid}' && e.datum >= '2026-09-01' && e.datum <= '2026-09-03').length;
    }}""")
    check("Bus im Wartungszeitraum aus dem Plan genommen", frei == 0, f"{frei} Einsätze noch")

    # Persistenz über Reload
    page.reload()
    page.wait_for_selector("#view .section-head")
    w2 = page.evaluate(f"App.state.buses.find(x => x.id === '{bid}').wartungen.length")
    check("Nach Reload persistiert", w2 == n_vor + 1, f"{w2}")

    # Bestehenden Eintrag bearbeiten (Datum ändern + speichern)
    page.click(f"table.tbl button[data-act='wart'][data-id='{bid}']")
    page.wait_for_selector("#wa-list")
    rows = page.query_selector_all("#wa-list .entryrow")
    check("Gespeicherter Eintrag erscheint im Modal", len(rows) == n_vor + 1, f"{len(rows)}")
    rows[-1].query_selector(".w-bis").fill("05.09.2026")
    page.click(".modal .save")
    page.wait_for_timeout(400)
    bis_neu = page.evaluate(f"App.state.buses.find(x => x.id === '{bid}').wartungen.slice(-1)[0].bis")
    check("Bearbeiten + erneutes Speichern funktioniert", bis_neu == "2026-09-05", bis_neu)

    # Eintrag löschen
    page.click(f"table.tbl button[data-act='wart'][data-id='{bid}']")
    page.wait_for_selector("#wa-list")
    page.query_selector_all("#wa-list .entryrow")[-1].query_selector(".del").click()
    page.click(".modal .save")
    page.wait_for_timeout(400)
    n_end = page.evaluate(f"App.state.buses.find(x => x.id === '{bid}').wartungen.length")
    check("Eintrag löschen + speichern funktioniert", n_end == n_vor, f"{n_end}")

    check("Keine Konsolen-/Seitenfehler", not errs, "; ".join(errs[:2]))
    b.close()

failed = [n for n, ok in results if not ok]
print(f"\n{len(results)-len(failed)}/{len(results)} bestanden")
sys.exit(1 if failed else 0)
