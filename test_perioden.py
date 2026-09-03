"""Funktionstest: freie Fahrplan-Zeiträume statt Winter/Sommer-Schema."""
import sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8123/index.html"
OK, FAIL = "\033[92m OK \033[0m", "\033[91mFAIL\033[0m"
results = []
def check(name, cond, info=""):
    results.append((name, bool(cond)))
    print(f"{OK if cond else FAIL} {name}" + (f"  -- {info}" if info else ""))

SB_A = "d13"   # Skibus Hochötz Früh (Winter)
WB_G = "d22"   # Wanderbus Gries (Sommer, läuft Sa/So/Mi/Fr/Do? -> [0,2,4,5,6])

def count_in_window(page, dienst_id, md_von, md_bis, wochen=20):
    return page.evaluate("""([did, mv, mb, w]) => {
      const von = App.planRange().von;
      let c = 0;
      for (let i = 0; i < w * 7; i++){
        const dt = Rules.addDays(von, i);
        const md = dt.slice(5);
        if (md >= mv && md <= mb)
          c += App.state.einsaetze.filter(e => e.datum === dt && e.dienstId === did).length;
      }
      return c;
    }""", [dienst_id, md_von, md_bis, wochen])

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(BASE)
    page.evaluate("localStorage.clear()")
    page.reload()
    page.wait_for_selector(".kpis")

    # 1) Frischer v6-State: 32 Dienste, 4 Perioden, Abschnitte im Dashboard-Grid
    st = page.evaluate("App.state")
    check("State v7 mit 4 Perioden", st["v"] == 7 and len(st["perioden"]) == 4, str([x["name"] for x in st["perioden"]]))
    check("32 Dienste, alle mit perioden", len(st["dienste"]) == 32 and all(d.get("perioden") for d in st["dienste"]))
    check("Kein fahrplan-Feld mehr", all("fahrplan" not in d for d in st["dienste"]))
    sections = page.eval_on_selector_all(".tour-scroll .psection", "els => els.length")
    check("Dashboard-Grid: keine Fahrplan-Sektionen (flach)", sections == 0, f"{sections} Sektionen")
    nrows = page.eval_on_selector_all(".tour-scroll .prowhead", "els => els.length")
    check("Dashboard-Grid: alle 32 Umläufe flach gelistet", nrows == 32, f"{nrows} Zeilen")
    header = page.text_content(".section-head .muted")
    check("Dashboard-Kopf zeigt aktive Perioden", "Jahresfahrplan" in header, header[:80])

    # 2) Aktive Dienste heute: Formel-Konsistenz (Perioden ∩ Wochentage)
    expect = page.evaluate("""() => {
      const heute = Rules.todayISO();
      const ids = new Set(Rules.aktivePerioden(App.state, heute).map(x => x.id));
      return App.state.dienste.filter(d => d.aktiv && d.wochentage.includes(Rules.dowIdx(heute)) &&
        d.perioden.some(id => ids.has(id))).length;
    }""")
    aktive = page.evaluate("Rules.aktiveDienste(App.state, Rules.todayISO()).length")
    check("aktiveDienste = Perioden-Formel", aktive == expect, f"{aktive} vs {expect}")

    # 3) Touren-Tab: Sektionen + Banner
    page.click("button[data-tab='touren']")
    page.wait_for_selector(".fahrplan-banner")
    h3s = page.eval_on_selector_all("h3", "els => els.map(e => e.textContent)")
    check("Touren-Tab: 4 Perioden-Sektionen", sum(1 for h in h3s if "Jahresfahrplan" in h or "Winter" in h or "Sommer" in h or "Zwischensaison" in h) == 4, str([h.split('·')[0].strip() for h in h3s]))
    banner_badges = page.eval_on_selector_all(".fahrplan-banner .badge", "els => els.map(e => e.textContent.trim())")
    check("Banner zeigt heute gültige Perioden", set(banner_badges) >= {"Jahresfahrplan", "Sommer"}, str(banner_badges))

    # 4) Ferne Woche (September): Autodispo respektiert Perioden
    page.evaluate("App.shiftPlan(28); App.autodispo();")
    page.wait_for_timeout(400)
    check("September: Skibus SB A NICHT eingeplant (kein Winter)", count_in_window(page, SB_A, "09-01", "09-30", 2) == 0)
    check("September: Wanderbus WB G eingeplant (Sommer)", count_in_window(page, WB_G, "09-01", "09-30", 2) > 0)

    # 4b) Einsatz löschen: bleibt gestrichen; Autodispo erzeugt ihn neu und besetzt ihn
    weg_datum = page.evaluate("""() => {
      const st = App.state;
      const e = st.einsaetze.find(x => x.dienstId === 'd1' && x.datum >= App.planRange().von);
      st.weg[e.dienstId + '|' + e.datum] = true;
      st.einsaetze = st.einsaetze.filter(x => x.id !== e.id);
      App.nachAenderung('Einsatz gelöscht', true);
      return e.datum;
    }""")
    page.wait_for_timeout(300)
    da = page.evaluate("(dt) => App.state.einsaetze.some(x => x.dienstId === 'd1' && x.datum === dt)", weg_datum)
    check("Gelöschter Einsatz bleibt gestrichen (Nachplanung belebt nicht wieder)", not da, weg_datum)
    page.evaluate("App.autodispo()")
    page.wait_for_timeout(400)
    neu = page.evaluate("""(dt) => {
      const e = App.state.einsaetze.find(x => x.dienstId === 'd1' && x.datum === dt);
      return e ? { fahrer: !!e.fahrerId, bus: !!e.busId } : null;
    }""", weg_datum)
    check("Autodispo erzeugt gestrichenen Einsatz neu und besetzt ihn", neu is not None and neu["fahrer"] and neu["bus"], str(neu))
    page.evaluate("App.resetPlanStart()")
    page.wait_for_timeout(150)

    # 5) Perioden-Modal: 'Winter Vorsaison' (20.10.–30.11.) anlegen
    page.click("button[data-tab='touren']")
    page.wait_for_selector(".fahrplan-banner")
    page.click("#saison-edit")
    page.wait_for_selector("#pe-list")
    page.click("#pe-add")
    last = page.query_selector_all("#pe-list .entryrow")[-1]
    last.query_selector(".p-name").fill("Winter Vorsaison")
    last.query_selector(".p-von").fill("2010")
    last.query_selector(".p-bis").fill("3011")
    page.click(".modal .save")
    page.wait_for_timeout(400)
    st = page.evaluate("App.state")
    p5 = next((x for x in st["perioden"] if x["name"] == "Winter Vorsaison"), None)
    check("Zeitraum 'Winter Vorsaison' gespeichert (Auto-Punkte)", p5 is not None and p5["von"] == "10-20" and p5["bis"] == "11-30")

    # 6) SB A zusätzlich zuordnen -> ferne Oktober-Wochen bleiben leer (nicht freigegeben)
    page.evaluate("""() => {
      const d = App.state.dienste.find(x => x.id === 'd13');
      d.perioden.push(App.state.perioden.find(x => x.name === 'Winter Vorsaison').id);
      const von = App.planRange().von;
      App.replanBereich(von, Rules.addDays(von, 84), 'Zuordnung SB A');
    }""")
    page.wait_for_timeout(300)
    check("Oktober (unfreigegeben) bleibt leer", count_in_window(page, SB_A, "10-19", "11-15", 9) == 0)

    # 7) Neuen Dienst 'TST' in Vorsaison anlegen (wie Dienst-Modal: Sweep)
    page.evaluate("""() => {
      const st = App.state;
      st.dienste.push({ id:'d' + (++st.seq), name:'Test Umlauf', kurz:'TST', linie:'T',
        typ:'shuttle', start:'10:00', dauerMin:300, lenkzeitMin:234,
        perioden:[st.perioden.find(x => x.name === 'Winter Vorsaison').id],
        wochentage:[0,1,2,3,4,5,6], aktiv:true });
      const von = App.planRange().von;
      App.replanBereich(von, Rules.addDays(von, 84), 'TST angelegt');
      return App.state.dienste.find(x => x.kurz === 'TST').id;
    }""")
    page.wait_for_timeout(300)
    tst_id = page.evaluate("App.state.dienste.find(x => x.kurz === 'TST').id")
    check("TST: Oktober weiterhin leer", count_in_window(page, tst_id, "10-19", "11-15", 9) == 0)

    # 8) Oktober-Fenster freigeben (Autodispo) -> SB A + TST erscheinen
    page.evaluate("App.shiftPlan(56); App.autodispo();")
    page.wait_for_timeout(400)
    n_sba = count_in_window(page, SB_A, "10-19", "11-15", 4)
    n_tst = count_in_window(page, tst_id, "10-19", "11-15", 4)
    check("Nach Autodispo: SB A im Vorsaison-Fenster", n_sba > 0, f"{n_sba} Einsätze")
    check("Nach Autodispo: TST im Vorsaison-Fenster", n_tst > 0, f"{n_tst} Einsätze")

    # 9) Periode umbenennen -> Sektion folgt
    page.evaluate("""() => {
      const p = App.state.perioden.find(x => x.name === 'Sommer');
      p.name = 'Sommersaison';
      const von = App.planRange().von;
      App.replanBereich(von, Rules.addDays(von, 84), 'Umbenennung');
    }""")
    page.wait_for_timeout(300)
    page.click("button[data-tab='touren']")
    page.wait_for_selector(".fahrplan-banner")
    h3s = page.eval_on_selector_all("h3", "els => els.map(e => e.textContent)")
    check("Umbenannte Periode erscheint als Sektion", any("Sommersaison" in h for h in h3s))

    # 10) Vorsaison löschen -> Zuordnung weg, Sweep entfernt Einsätze
    page.evaluate("""() => {
      const st = App.state;
      st.perioden = st.perioden.filter(x => x.name !== 'Winter Vorsaison');
      const ids = new Set(st.perioden.map(x => x.id));
      for (const d of st.dienste) d.perioden = (d.perioden||[]).filter(id => ids.has(id));
      st.weg = {};
      const von = App.planRange().von;
      App.replanBereich(von, Rules.addDays(von, 84), 'Zeitraum gelöscht');
    }""")
    page.wait_for_timeout(300)
    check("Nach Perioden-Löschung: SB A entfernt", count_in_window(page, SB_A, "10-19", "11-15", 4) == 0)
    check("Nach Perioden-Löschung: TST entfernt", count_in_window(page, tst_id, "10-19", "11-15", 4) == 0)
    check("Dienste ohne hängende Zuordnung", page.evaluate("App.state.dienste.every(d => (d.perioden||[]).every(id => App.state.perioden.some(p => p.id === id)))"))

    # 11) Persistenz + Reload
    page.reload()
    page.wait_for_selector("#view .section-head")
    check("Reload: State bleibt v7 mit Perioden", page.evaluate("App.state.v === 7 && Array.isArray(App.state.perioden) && !App.state.saison"))
    check("Keine Konsolen-/Seitenfehler", not errors, "; ".join(errors[:3]))

    # Screenshots für Judge (frischer Zustand)
    page.evaluate("localStorage.clear()")
    page.reload()
    page.wait_for_selector(".kpis")
    page.screenshot(path="/tmp/perioden_dash.png", full_page=True)
    page.click("button[data-tab='touren']")
    page.wait_for_selector(".fahrplan-banner")
    page.screenshot(path="/tmp/perioden_touren.png", full_page=True)
    # Zeiträume-Modal
    page.click("#saison-edit")
    page.wait_for_selector("#pe-list")
    page.screenshot(path="/tmp/perioden_modal.png")
    page.keyboard.press("Escape")
    page.click("#modal-root .modal-close") if page.query_selector("#modal-root .modal-close") else None
    page.wait_for_timeout(200)
    # hell
    page.click("#themeswitch button[data-th='light']")
    page.wait_for_timeout(150)
    page.screenshot(path="/tmp/perioden_touren_light.png", full_page=True)
    page.click("button[data-tab='dashboard']")
    page.wait_for_selector(".kpis")
    page.screenshot(path="/tmp/perioden_dash_light.png", full_page=True)
    browser.close()

failed = [n for n, ok in results if not ok]
print(f"\n{len(results)-len(failed)}/{len(results)} bestanden")
sys.exit(1 if failed else 0)
