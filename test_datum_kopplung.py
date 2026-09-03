"""Von/Bis-Kopplung: Ende folgt dem Beginn (mind. gleicher Tag)."""
import sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8123/index.html"
OK, FAIL = "\033[92m OK \033[0m", "\033[91mFAIL\033[0m"
results = []
def check(name, cond, info=""):
    results.append((name, bool(cond)))
    print(f"{OK if cond else FAIL} {name}" + (f"  -- {info}" if info else ""))

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.goto(BASE)
    page.evaluate("localStorage.clear()")
    page.reload()
    page.wait_for_selector(".kpis")

    # 1) Wartungen: Bis zieht beim späteren Von nach (Tippen)
    bid = page.evaluate("App.state.buses[0].id")
    page.click("button[data-tab='busse']")
    page.wait_for_selector("table.tbl")
    page.click(f"table.tbl button[data-act='wart'][data-id='{bid}']")
    page.wait_for_selector("#wa-list")
    page.click("#wa-add")
    row = page.query_selector_all("#wa-list .entryrow")[0]
    row.query_selector(".w-von").fill("10.09.2026")
    page.wait_for_timeout(100)
    bis_val = row.query_selector(".w-bis").input_value()
    check("Wartungen (Tippen): Bis folgt Von", bis_val == "10.09.2026", bis_val)
    # 2) Kalender-Klick auf Von: Bis folgt ebenfalls
    row.query_selector(".w-von").fill("01.09.2026")   # Bis bleibt 10.09 (größer, unangetastet)
    page.wait_for_timeout(100)
    check("Früheres Von lässt größeres Bis stehen", row.query_selector(".w-bis").input_value() == "10.09.2026",
          row.query_selector(".w-bis").input_value())
    row.query_selector(".w-von").fill("20.09.2026")
    page.wait_for_timeout(100)
    check("Späteres Von zieht Bis wieder nach", row.query_selector(".w-bis").input_value() == "20.09.2026",
          row.query_selector(".w-bis").input_value())
    # Kalender-Picker auf Von: Bis vorher auf früheres Datum setzen, dann späteren Tag wählen
    row.query_selector(".w-von").fill("01.09.2026")
    row.query_selector(".w-bis").fill("10.09.2026")
    page.click("#wa-list .entryrow .calbtn")  # Picker für Von (erstes datefield der ersten Zeile)
    page.wait_for_selector(".datepicker")
    # 15. September anklicken (September-Ansicht ist offen, da Von = 01.09.2026)
    page.click(".datepicker .dp-day:has-text('15')")
    page.wait_for_timeout(150)
    check("Wartungen (Kalender): Bis folgt Von", row.query_selector(".w-bis").input_value() == "15.09.2026",
          row.query_selector(".w-bis").input_value())
    # Speichern funktioniert mit gekoppelten Werten
    row.query_selector(".w-notiz").fill("Kopplungstest")
    page.click(".modal .save")
    page.wait_for_timeout(400)
    w = page.evaluate(f"App.state.buses.find(x => x.id === '{bid}').wartungen")
    check("Gekoppelte Werte werden gespeichert", len(w) == 1 and w[0]["von"] == "2026-09-15" and w[0]["bis"] == "2026-09-15", str(w))

    # 3) Abwesenheiten: gleiche Kopplung
    fid = page.evaluate("App.state.fahrer[0].id")
    page.click("button[data-tab='fahrer']")
    page.wait_for_selector("table.tbl")
    page.click(f"table.tbl button[data-act='abw'][data-id='{fid}']")
    page.wait_for_selector("#ab-list")
    page.click("#ab-add")
    row = page.query_selector_all("#ab-list .entryrow")[0]
    row.query_selector(".e-von").fill("12.10.2026")
    page.wait_for_timeout(100)
    check("Abwesenheiten: Bis folgt Von", row.query_selector(".e-bis").input_value() == "12.10.2026",
          row.query_selector(".e-bis").input_value())
    page.keyboard.press("Escape")
    page.wait_for_timeout(200)
    cancel = page.query_selector(".modal .btn:not(.primary):not(.danger)")
    if page.query_selector("#ab-list") and cancel: cancel.click()

    # 4) Fahrer-Modal: Verfügbar von/bis (Felder in .frm, nicht entryrow)
    page.click(f"table.tbl button[data-act='edit'][data-id='{fid}']")
    page.wait_for_selector("#f-name")
    page.evaluate("document.querySelector('#f-bis').value = '20.10.2026'")
    page.fill("#f-von", "25.10.2026")
    page.wait_for_timeout(100)
    bis_f = page.evaluate("document.querySelector('#f-bis').value")
    check("Fahrer (Verfügbarkeit): Bis folgt Von", bis_f == "25.10.2026", bis_f)
    cancel = page.query_selector(".modal .btn:not(.primary):not(.danger)")
    if cancel: cancel.click()
    page.wait_for_timeout(200)

    check("Keine Konsolen-/Seitenfehler", not errs, "; ".join(errs[:2]))
    b.close()

failed = [n for n, ok in results if not ok]
print(f"\n{len(results)-len(failed)}/{len(results)} bestanden")
sys.exit(1 if failed else 0)
