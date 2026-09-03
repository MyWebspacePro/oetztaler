"""User-Flows: (1) Urlaub/Krank im Fahrer-Tab, (2) Einsatz löschen -> Autodispo."""
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

    fid = page.evaluate("App.state.fahrer[0].id")
    furlaub_vor = page.evaluate("App.state.fahrer[0].urlaub.length")
    fkrank_vor = page.evaluate("App.state.fahrer[0].krank.length")

    # --- Flow 1: Urlaub im Fahrer-Tab hinzufügen ---
    page.click("button[data-tab='fahrer']")
    page.wait_for_selector("table.tbl")
    page.click(f"table.tbl button[data-act='abw'][data-id='{fid}']")
    page.wait_for_selector("#ab-list")
    check("Abwesenheiten-Modal öffnet", page.query_selector(".modal") is not None)
    page.click("#ab-add")
    page.wait_for_timeout(150)
    rows = page.query_selector_all("#ab-list .entryrow")
    check("Plus-Button fügt Zeile hinzu", len(rows) >= 1, f"{len(rows)} Zeilen")
    last = rows[-1]
    last.query_selector(".e-art").select_option("urlaub")
    last.query_selector(".e-von").fill("02.09.2026")
    last.query_selector(".e-bis").fill("04.09.2026")
    page.click(".modal .save")
    page.wait_for_timeout(400)
    toasts_clear(page)
    nU = page.evaluate("App.state.fahrer[0].urlaub.length")
    check("Urlaub wurde gespeichert", nU == furlaub_vor + 1, f"{furlaub_vor} -> {nU}")
    check("Fahrer am 03.09. nicht verfügbar", page.evaluate(
        "!Rules.fahrerVerfuegbar(App.state, App.state.fahrer[0], '2026-09-03')"))

    # --- Flow 2: Krankheit hinzufügen ---
    page.click(f"table.tbl button[data-act='abw'][data-id='{fid}']")
    page.wait_for_selector("#ab-list")
    page.click("#ab-add")
    rows = page.query_selector_all("#ab-list .entryrow")
    last = rows[-1]
    last.query_selector(".e-art").select_option("krank")
    last.query_selector(".e-von").fill("10.09.2026")
    last.query_selector(".e-bis").fill("11.09.2026")
    page.click(".modal .save")
    page.wait_for_timeout(400)
    toasts_clear(page)
    nK = page.evaluate("App.state.fahrer[0].krank.length")
    check("Krankheit wurde gespeichert", nK == fkrank_vor + 1, f"{fkrank_vor} -> {nK}")

    # --- Flow 3: Einsatz löschen -> Autodispo -> ANDERER Fahrer ---
    page.click("button[data-tab='dashboard']")
    page.wait_for_selector(".kpis")
    info = page.evaluate("""() => {
      const st = App.state;
      const e = st.einsaetze.find(x => x.fahrerId && x.busId && x.datum >= App.planRange().von && !x.fixiert);
      return { id: e.id, dienstId: e.dienstId, datum: e.datum, fahrerId: e.fahrerId, busId: e.busId };
    }""")
    print("   Testeinsatz:", info)
    # Zelle anklicken -> Einsatz-Modal -> Löschen
    page.evaluate(f"""() => {{
      const e = App.state.einsaetze.find(x => x.id === '{info['id']}');
      Modals.einsatz(App.state, e);
    }}""")
    page.wait_for_selector(".modal")
    page.click("#e-del")
    page.wait_for_selector(".modal")  # confirm-Dialog
    page.click(".modal .save")
    page.wait_for_timeout(400)
    toasts_clear(page)
    weg = page.evaluate(f"""() => {{
      const st = App.state;
      return !st.einsaetze.some(x => x.dienstId === '{info['dienstId']}' && x.datum === '{info['datum']}')
          && !!st.weg['{info['dienstId']}|{info['datum']}'];
    }}""")
    check("Einsatz gelöscht + gestrichen", weg)
    page.click("#dash-autodispo")
    page.wait_for_timeout(500)
    toasts_clear(page)
    neu = page.evaluate(f"""() => {{
      const st = App.state;
      const e = st.einsaetze.find(x => x.dienstId === '{info['dienstId']}' && x.datum === '{info['datum']}');
      return e ? {{ fahrerId: e.fahrerId, busId: e.busId, quelle: e.quelle }} : null;
    }}""")
    check("Autodispo erzeugt Einsatz neu", neu is not None, str(neu))
    if neu:
        check("NEUER Fahrer (nicht der gelöschte)", neu["fahrerId"] != info["fahrerId"],
              f"alt={info['fahrerId']} neu={neu['fahrerId']}")
        check("Einsatz besetzt (Fahrer+Bus)", neu["fahrerId"] and neu["busId"], str(neu))

    # --- Flow 4: Bus-Lösch-Fall: gleicher Bus darf nicht zurückkommen ---
    info_b = page.evaluate("""() => {
      const st = App.state;
      const e = st.einsaetze.find(x => x.fahrerId && x.busId && x.datum >= App.planRange().von && !x.fixiert);
      return { dienstId: e.dienstId, datum: e.datum, busId: e.busId, id: e.id };
    }""")
    page.evaluate(f"""() => {{
      const e = App.state.einsaetze.find(x => x.id === '{info_b['id']}');
      Modals.einsatz(App.state, e);
    }}""")
    page.wait_for_selector(".modal")
    page.click("#e-del")
    page.wait_for_timeout(150)
    page.click(".modal .save")
    page.wait_for_timeout(400)
    toasts_clear(page)
    page.evaluate("App.autodispo()")
    page.wait_for_timeout(500)
    toasts_clear(page)
    neu_b = page.evaluate(f"""() => {{
      const st = App.state;
      const e = st.einsaetze.find(x => x.dienstId === '{info_b['dienstId']}' && x.datum === '{info_b['datum']}');
      return e ? {{ busId: e.busId }} : null;
    }}""")
    check("Autodispo wählt ANDEREN Bus", neu_b is not None and neu_b["busId"] != info_b["busId"],
          f"alt={info_b['busId']} neu={neu_b}")

    # --- Flow 5: manuelle Zuweisung übersteuert Ausschluss (ausgeschlossener, freier Bus) ---
    manuell = page.evaluate(f"""() => {{
      const st = App.state;
      const chk = App.kannZuweisen('bus', '{info_b['busId']}', '{info_b['dienstId']}', '{info_b['datum']}');
      if (!chk.ok) return {{ reason: chk.reason }};
      App.assignRessource('bus', '{info_b['busId']}', '{info_b['dienstId']}', '{info_b['datum']}');
      return {{ ok: true }};
    }}""")
    if manuell.get("ok"):
        key = f"b:{info_b['busId']}|{info_b['dienstId']}|{info_b['datum']}"
        check("Manuelle Zuweisung übersteuert Ausschluss (Merker gelöscht, Bus gesetzt)",
              page.evaluate(f"""() => !App.state.ausschluss['{key}'] && App.state.einsaetze.some(x => x.dienstId === '{info_b['dienstId']}' && x.datum === '{info_b['datum']}' && x.busId === '{info_b['busId']}')"""))
    else:
        check("Manuelle Zuweisung übersteuert Ausschluss", False, manuell.get("reason", "?"))

    # --- Flow 6: Fahrer und Bus EINZELN zuweisen; Stamm-Bus kommt automatisch mit ---
    page.evaluate("App.shiftPlan(28)")   # unfreigegebene Woche 21.09
    page.wait_for_timeout(200)
    von6 = page.evaluate("App.planRange().von")
    r_stamm = page.evaluate("""() => {
      App.assignRessource('fahrer', 'f2', 'd1', App.planRange().von);   // f2 hat Stamm-Bus b5
      const e = App.state.einsaetze.find(x => x.dienstId === 'd1' && x.datum === App.planRange().von);
      return { fahrerId: e.fahrerId, busId: e.busId, halboffen: !!e.halboffen };
    }""")
    check("Fahrer mit Stamm-Bus: Bus kommt automatisch mit",
          r_stamm["fahrerId"] == "f2" and r_stamm["busId"] == "b5" and not r_stamm["halboffen"], str(r_stamm))
    r_einzeln = page.evaluate("""() => {
      App.assignRessource('fahrer', 'f5', 'd2', App.planRange().von);   // f5 ohne Stamm-Bus
      const e = App.state.einsaetze.find(x => x.dienstId === 'd2' && x.datum === App.planRange().von);
      return { fahrerId: e.fahrerId, busId: e.busId, halboffen: !!e.halboffen };
    }""")
    check("Fahrer ohne Stamm-Bus: Bus bleibt offen", 
          r_einzeln["fahrerId"] == "f5" and r_einzeln["busId"] is None and r_einzeln["halboffen"], str(r_einzeln))
    page.evaluate("App.nachAenderung('x', true)")
    page.wait_for_timeout(200)
    check("Automatik füllt halboffenen Einsatz nicht", page.evaluate(
        "App.state.einsaetze.find(x => x.dienstId === 'd2' && x.datum === App.planRange().von).busId") is None)
    r_bus = page.evaluate("""() => {
      App.assignRessource('bus', 'b8', 'd2', App.planRange().von);
      const e = App.state.einsaetze.find(x => x.dienstId === 'd2' && x.datum === App.planRange().von);
      return { busId: e.busId, fahrerId: e.fahrerId, halboffen: !!e.halboffen };
    }""")
    check("Bus einzeln zugewiesen: Einsatz komplett", 
          r_bus["busId"] == "b8" and r_bus["fahrerId"] == "f5" and not r_bus["halboffen"], str(r_bus))
    page.evaluate("App.autodispo()")
    page.wait_for_timeout(400)
    check("Autodispo füllt die Woche vollständig", page.evaluate("""() => {
      const { von, bis } = App.planRange();
      return App.state.einsaetze.filter(e => e.datum >= von && e.datum <= bis && (!e.fahrerId || !e.busId)).length === 0;
    }"""))

    check("Keine Konsolen-/Seitenfehler", not errs, "; ".join(errs[:2]))
    b.close()

failed = [n for n, ok in results if not ok]
print(f"\n{len(results)-len(failed)}/{len(results)} bestanden")
exit(1 if failed else 0)
