"""Diagnose: Welche Einsätze bleiben nach Ressourcen-Löschung offen und warum?"""
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8123/index.html"

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

    # 8 Fahrer + 4 Busse löschen (wie User)
    page.click("button[data-tab='fahrer']")
    page.wait_for_selector("table.tbl")
    for _ in range(8):
        btn = page.query_selector("table.tbl button[data-act='del']")
        if not btn: break
        btn.click(); page.wait_for_selector("#modal-root .modal")
        page.click("#modal-root .modal .save")
        page.wait_for_timeout(150)
    page.click("button[data-tab='busse']")
    page.wait_for_selector("table.tbl")
    for _ in range(4):
        btn = page.query_selector("table.tbl button[data-act='del']")
        if not btn: break
        btn.click(); page.wait_for_selector("#modal-root .modal")
        page.click("#modal-root .modal .save")
        page.wait_for_timeout(150)

    # Diagnose der offenen Einsätze
    diag = page.evaluate("""() => {
      const { von, bis } = App.planRange();
      const offene = App.state.einsaetze.filter(e => e.datum >= von && e.datum <= bis && (!e.fahrerId || !e.busId));
      const out = [];
      for (const e of offene){
        const d = Rules.dienstById(App.state, e.dienstId);
        const want = Rules.busTypFuerDienst(d);
        const freieBusse = App.state.buses.filter(b => b.typ === want && b.aktiv && Rules.busVerfuegbar(App.state, b, e.datum) &&
          !App.state.einsaetze.some(x => x.busId === b.id && x.datum === e.datum)).map(b => b.kennzeichen);
        const freieFahrer = App.state.fahrer.filter(f => f.aktiv && Rules.fahrerKannDienst(App.state, f, d, e.datum, e.id).ok &&
          !App.state.einsaetze.some(x => x.fahrerId === f.id && x.datum === e.datum)).length;
        out.push({ datum: e.datum, dienst: d.kurz, typ: want, hatFahrer: !!e.fahrerId, hatBus: !!e.busId,
                   freieBusse: freieBusse.length, freieBusseNamen: freieBusse.slice(0,3), freieFahrer });
      }
      return out;
    }""")
    print(f"OFFENE EINSAETZE: {len(diag)}")
    for x in diag:
        print("  ", x["datum"], x["dienst"], "typ=" + x["typ"],
              "Fahrer" if x["hatFahrer"] else "KEIN-FAHRER", "Bus" if x["hatBus"] else "KEIN-BUS",
              f"| freie Busse d. Typs: {x['freieBusse']} {x['freieBusseNamen']}", f"| freie Fahrer: {x['freieFahrer']}")

    # Ressourcenbestand
    print(page.evaluate("""() => {
      const buses = App.state.buses;
      return { busse: buses.length,
               linien: buses.filter(b=>b.typ==='linienbus'&&b.aktiv).length,
               shuttle: buses.filter(b=>b.typ==='shuttle'&&b.aktiv).length,
               fahrer: App.state.fahrer.filter(f=>f.aktiv).length };
    }"""))

    # Autodispo-Toast prüfen (Toasts vorher leeren!)
    page.click("button[data-tab='dashboard']")
    page.wait_for_selector(".kpis")
    page.click("#dash-autodispo")
    page.wait_for_timeout(500)
    print("\nTOASTS nach Autodispo:")
    for t in toasts_clear(page): print("   •", t)

    # Szenario B SAUBER: wirklich frische, noch nie freigegebene Woche (Start +8 Wochen)
    page.evaluate("App.shiftPlan(28); App.shiftPlan(28);")  # wirklich frische, nie freigegebene Woche
    page.wait_for_timeout(200)
    print("\nSzenario B: Woche", page.evaluate("App.planRange().von"), "freigegeben?",
          page.evaluate("!!App.state.dispoFrei[App.planRange().von]"))
    # manuell einen Einsatz anlegen MIT Fahrer, ohne Bus
    page.evaluate("""() => {
      const st = App.state;
      const { von } = App.planRange();
      const d = st.dienste.find(x => x.kurz === 'L1 F05');
      const f = st.fahrer.find(x => x.aktiv && Rules.fahrerKannDienst(st, x, d, von).ok);
      st.einsaetze.push({ id:'e' + (++st.seq), dienstId:d.id, datum: von, fahrerId:f.id, busId:null, quelle:'manuell', fixiert:false });
      App.nachAenderung('manuell gesetzt', true);
    }""")
    page.wait_for_timeout(300)
    print("Toasts nach manuell:", toasts_clear(page))
    # Fahrer dieses Einsatzes löschen
    page.evaluate("""() => {
      const st = App.state;
      const { von } = App.planRange();
      const e = st.einsaetze.find(x => x.datum === von && x.dienstId === st.dienste.find(d=>d.kurz==='L1 F05').id);
      st.fahrer = st.fahrer.filter(x => x.id !== e.fahrerId);
      st.einsaetze.forEach(x => { if (x.fahrerId === e.fahrerId) x.fahrerId = null; });
      App.nachAenderung('Fahrer gelöscht', true);
    }""")
    page.wait_for_timeout(300)
    print("Toasts nach Fahrer-Löschung:", toasts_clear(page))
    print("offen in dieser Woche:", page.evaluate("""() => {
      const { von, bis } = App.planRange();
      return App.state.einsaetze.filter(e => e.datum >= von && e.datum <= bis && (!e.fahrerId || !e.busId)).length;
    }"""))
    page.click("#dash-autodispo")
    page.wait_for_timeout(500)
    print("TOASTS nach Autodispo (Szenario B):")
    for t in toasts_clear(page): print("   •", t)
    print("offen danach:", page.evaluate("""() => {
      const { von, bis } = App.planRange();
      return App.state.einsaetze.filter(e => e.datum >= von && e.datum <= bis && (!e.fahrerId || !e.busId)).length;
    }"""))
    print("pageerrors:", errs or "keine")
    b.close()
