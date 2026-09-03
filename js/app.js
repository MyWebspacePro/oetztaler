/* app.js — Init, Navigation, Theme, Persistenz, Toasts */
'use strict';
const App = (() => {
  const R = Rules;
  const LS_KEY = 'ovg-einsatzplanung-v1';
  let state = null;
  let scrollSave = null;

  /* ---------- Persistenz ---------- */
  function speichern(){
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch(e){ /* Speicher voll oder blockiert */ }
  }
  function laden(){
    try {
      const s = JSON.parse(localStorage.getItem(LS_KEY));
      if (s && s.v === 7 && Array.isArray(s.buses) && s.ui) return s;
    } catch(e){}
    return null;
  }
  function neuLaden(){
    state = Data.demoDaten();
    state.ui = { tab:'dashboard', gridTab:'fahrer', planStart:R.mondayOf(R.todayISO()), day:null, search:'', filter:'alle', selDay:null };
    const { von, bis } = planRange();
    Planner.freigeben(state, von, bis);          // Demo-Fenster ist initial freigegeben
    Planner.generate(state, von, bis);
    Planner.replan(state, von, bis);
    Planner.seedDemoKonflikte(state, von, bis);
    Planner.recomputeErsatz(state, von, bis);
    applyThema();
    speichern();
  }

  /* ---------- Planfenster ---------- */
  function planRange(){
    const von = state.ui.planStart;
    return { von, bis: R.addDays(von, 27) };
  }

  /* ---------- Rendering ---------- */
  function render(){
    // Kein automatisches Generieren: weitergeblätterte Wochen bleiben leer,
    // bis sie per „⚡ Autodispo" freigegeben werden. Ersatzfahrer immer aktuell.
    Planner.recomputeErsatz(state, planRange().von, planRange().bis);
    const sc = document.querySelector('.plan-scroll');
    if (sc) scrollSave = { l: sc.scrollLeft, t: sc.scrollTop };
    UI.render();
    const sc2 = document.querySelector('.plan-scroll');
    if (sc2 && scrollSave){ sc2.scrollLeft = scrollSave.l; sc2.scrollTop = scrollSave.t; }
    updateTabButtons();
  }
  function renderOnly(){ speichern(); render(); }

  function updateTabButtons(){
    document.querySelectorAll('#tabs button').forEach(b =>
      b.classList.toggle('active', b.dataset.tab === state.ui.tab));
    document.querySelectorAll('.themeswitch button').forEach(b =>
      b.classList.toggle('active', b.dataset.th === (state.thema || 'dark')));
  }

  /* ---------- Toasts ---------- */
  function toast(msg, typ = 'ok', ms = 4600){
    const root = document.getElementById('toast-root');
    const t = document.createElement('div');
    t.className = 'toast ' + typ;
    t.innerHTML = msg;
    root.appendChild(t);
    while (root.children.length > 4) root.firstChild.remove();
    setTimeout(() => {
      t.style.transition = 'opacity .35s';
      t.style.opacity = '0';
      setTimeout(() => t.remove(), 360);
    }, ms);
  }

  /* ---------- Zentrale Änderungs-Routine: alles passt sich automatisch an ---------- */
  function nachAenderung(msg, replan = true){
    const { von, bis } = planRange();
    let report = null;
    if (replan){
      // Kein generate(): neue Wochen bleiben leer, bis „⚡ Autodispo" sie freigibt.
      report = Planner.replan(state, von, bis);
    } else {
      Planner.recomputeErsatz(state, von, bis);
    }
    speichern();
    render();
    if (msg) toast(msg, 'ok');
    const n = (report ? report.changed.length + report.removed.length : 0);
    if (n > 0){
      const beispiel = report.changed.concat(report.removed).slice(0, 2).map(x => '• ' + x).join('<br>');
      toast('<b>Automatische Nachplanung: ' + n + ' Anpassung(en)</b>' + beispiel + (n > 2 ? '<br>• …' : ''), 'warn', 6500);
    }
    if (report && report.offen > 0){
      toast('<b>' + report.offen + (report.offen === 1 ? ' Einsatz' : ' Einsätze') + ' ohne Zuweisung</b>Bitte Fahrer/Bus bereitstellen oder „Optimieren" nutzen.', 'danger', 6500);
    }
  }

  /* ---------- Zuweisung per Drag & Drop (Dashboard: Fahrer/Bus → Tour) ---------- */
  function kannZuweisen(typ, id, dienstId, datum){
    const d = R.dienstById(state, dienstId);
    if (!d || !d.aktiv || !R.varianteAktiv(state, d, datum) || !d.wochentage.includes(R.dowIdx(datum)))
      return { ok:false, reason:'Dieser Umlauf gilt an diesem Tag nicht (Zeitraum/Wochentag)' };
    const e = state.einsaetze.find(x => x.dienstId === dienstId && x.datum === datum);
    if (typ === 'fahrer'){
      const f = R.fahrerById(state, id);
      if (!f) return { ok:false, reason:'Fahrer unbekannt' };
      if (e && e.fahrerId === id) return { ok:true, noop:true };
      if (!f.aktiv) return { ok:false, reason:'Fahrer ist deaktiviert' };
      return R.fahrerKannDienst(state, f, d, datum, e && e.id);
    }
    const b = R.busById(state, id);
    if (!b) return { ok:false, reason:'Bus unbekannt' };
    if (e && e.busId === id) return { ok:true, noop:true };
    if (!b.aktiv) return { ok:false, reason:'Bus ist deaktiviert' };
    if (R.busTypFuerDienst(d) !== b.typ) return { ok:false, reason:'Bus-Typ passt nicht (' + (d.typ === 'linie' ? 'Linien-Dienst' : 'Shuttle-Dienst') + ')' };
    if (!R.busVerfuegbar(state, b, datum)) return { ok:false, reason:'Bus ist an diesem Tag nicht verfügbar (Reparatur/Wartung)' };
    if (state.einsaetze.some(x => x.busId === b.id && x.datum === datum && (!e || x.id !== e.id)))
      return { ok:false, reason:'Bus ist an diesem Tag bereits im Einsatz' };
    return { ok:true };
  }

  function assignRessource(typ, id, dienstId, datum){
    const chk = kannZuweisen(typ, id, dienstId, datum);
    if (chk.noop) return;
    if (!chk.ok){
      toast('Zuweisung nicht möglich: ' + chk.reason, 'danger');
      return;
    }
    const d = R.dienstById(state, dienstId);
    let e = state.einsaetze.find(x => x.dienstId === dienstId && x.datum === datum);
    if (!e){
      // Noch nicht verplanter Umlauf (z. B. in einer neuen, leeren Woche): Einsatz manuell anlegen
      e = { id:'e' + (++state.seq), dienstId, datum, fahrerId:null, busId:null, quelle:'manuell', fixiert:false };
      state.einsaetze.push(e);
    }
    if (typ === 'fahrer'){
      const f = R.fahrerById(state, id);
      e.fahrerId = id;
      e.quelle = 'manuell';
      if (state.ausschluss) delete state.ausschluss['f:' + id + '|' + dienstId + '|' + datum];
      let msg = f.name + ' → „' + d.kurz + '“ ' + R.fmtD(datum);
      if (e.busId){
        e.halboffen = false;
      } else if (f.stammBusId){
        // Stamm-Bus kommt automatisch mit dem Fahrer (außer nicht verfügbar/belegt)
        const stamm = R.busById(state, f.stammBusId);
        if (stamm && R.busTypFuerDienst(d) === stamm.typ && R.busVerfuegbar(state, stamm, datum) &&
            !state.einsaetze.some(x => x.busId === stamm.id && x.datum === datum && x.id !== e.id)){
          e.busId = stamm.id;
          if (state.ausschluss) delete state.ausschluss['b:' + stamm.id + '|' + dienstId + '|' + datum];
          e.halboffen = false;
          msg += ' · Stamm-Bus ' + stamm.kennzeichen + ' übernommen';
        } else {
          e.halboffen = true;
          msg += ' · Bus bleibt offen (einzeln zuweisen)';
        }
      } else {
        e.halboffen = true;
        msg += ' · Bus bleibt offen (einzeln zuweisen)';
      }
      nachAenderung(msg, true);
    } else {
      e.busId = id;
      e.quelle = 'manuell';
      if (state.ausschluss) delete state.ausschluss['b:' + id + '|' + dienstId + '|' + datum];
      e.halboffen = !e.fahrerId;   // Fahrer wird einzeln zugewiesen, nicht automatisch ergänzt
      nachAenderung(R.busById(state, id).kennzeichen + ' → „' + d.kurz + '“ ' + R.fmtD(datum) +
        (e.halboffen ? ' · Fahrer bleibt offen (einzeln zuweisen)' : ''), true);
    }
  }

  /* ---------- Nachplanung über einen großen Bereich (z. B. nach Saison-Änderung) ---------- */
  function replanBereich(von, bis, msg){
    // generate() ist dispoFrei-gegate: nicht freigegebene Wochen bleiben leer,
    // freigegebene Wochen bekommen fehlende Umlauf-Einsätze (z. B. nach Zeitraum-Änderung).
    Planner.generate(state, von, bis);
    const report = Planner.replan(state, von, bis);
    speichern();
    render();
    const n = report.changed.length + report.removed.length;
    toast('<b>' + (msg || 'Nachplanung') + '</b>' +
      (n ? n + (n === 1 ? ' Anpassung' : ' Anpassungen') + ' im Bereich ' + R.fmtD(von) + ' – ' + R.fmtD(bis) + '<br>' +
        report.changed.concat(report.removed).slice(0, 2).map(x => '• ' + x).join('<br>') + (n > 2 ? '<br>• …' : '')
        : 'Keine Anpassungen nötig.'), 'ok', 6000);
  }

  /* ---------- Autodispo: sichtbares Fenster freigeben und automatisch füllen ---------- */
  function autodispo(){
    const { von, bis } = planRange();
    // Gestrichene Einsätze dieses Fensters wieder freigeben: Autodispo = vollständige Neubefüllung
    if (state.weg){
      for (const key of Object.keys(state.weg)){
        const datum = key.split('|')[1];
        if (datum >= von && datum <= bis) delete state.weg[key];
      }
    }
    // Halbe manuelle Zuweisungen (nur Fahrer oder nur Bus) werden hier vollständig gefüllt
    for (const e of state.einsaetze){
      if (e.datum >= von && e.datum <= bis) e.halboffen = false;
    }
    Planner.freigeben(state, von, bis);       // ab jetzt darf die Automatik hier arbeiten
    Planner.generate(state, von, bis);        // fehlende Einsätze der aktiven Umläufe anlegen
    const report = Planner.replan(state, von, bis);
    speichern();
    render();
    const n = report.changed.length + report.removed.length;
    const offen = report.offen || 0;
    toast('<b>⚡ Autodispo abgeschlossen (' + R.fmtD(von) + ' – ' + R.fmtD(bis) + ')</b>' +
      (n ? report.changed.concat(report.removed).slice(0, 2).map(x => '• ' + x).join('<br>') + (n > 2 ? '<br>• …' : '')
         : offen
           ? 'Automatik hat nichts füllen können – es fehlen freie Fahrer/Busse für ' + offen + ' Einsatz' + (offen === 1 ? '' : 'e') + '.'
           : 'Fenster war bereits vollständig verplant.'), 'ok', 6000);
    if (offen > 0){
      toast('<b>' + offen + (offen === 1 ? ' Einsatz' : ' Einsätze') + ' ohne Fahrer/Bus</b>Für diese Tage ist kein passender Bus bzw. Fahrer mehr frei (z. B. nach Löschen von Ressourcen oder wegen Wartungen). Fahrer/Bus manuell zuweisen oder Ressourcen ergänzen – die Automatik kann sie nicht besetzen.', 'danger', 7000);
    }
  }

  /* ---------- Drag-&-Drop-Übernahme ---------- */
  function moveEinsatz(id, ziel){
    const e = state.einsaetze.find(x => x.id === id);
    if (!e) return;
    const d = R.dienstById(state, e.dienstId);
    if (ziel.grid === 'fahrer') e.fahrerId = ziel.id;
    else e.busId = ziel.id;
    e.datum = ziel.datum;
    e.quelle = 'manuell';
    nachAenderung('„' + (d ? d.kurz : 'Einsatz') + '“ auf ' + R.fmtD(ziel.datum) + ' neu zugeteilt', true);
  }

  /* ---------- Optimierer ---------- */
  function optimizeNow(){
    const { von, bis } = planRange();
    const res = Planner.optimize(state, von, bis);
    speichern();
    render();
    const behoben = res.changed.length;
    const rest = res.konflikte.length;
    const offen = res.offen;
    if (!behoben && !rest && !offen){
      toast('<b>Alles im grünen Bereich</b>Keine Konflikte, keine offenen Einsätze.', 'ok');
      return;
    }
    const zeilen = [];
    if (behoben) zeilen.push('<b>' + behoben + ' Maßnahme(n) durchgeführt</b>');
    res.changed.slice(0, 8).forEach(c => zeilen.push('• ' + c));
    if (res.changed.length > 8) zeilen.push('• … und ' + (res.changed.length - 8) + ' weitere');
    if (offen) zeilen.push('<b style="color:var(--danger)">' + offen + (offen === 1 ? ' Einsatz' : ' Einsätze') + ' ohne Fahrer oder Bus</b><br>Bitte Ressourcen bereitstellen (Bus/Fahrer anlegen oder deaktivierte aktivieren).');
    if (rest){
      zeilen.push('<b style="color:var(--warn)">' + rest + ' Konflikt(e) verbleiben (meist manuelle Zuweisungen oder fehlende Ressourcen):</b>');
      res.konflikte.slice(0, 6).forEach(k => zeilen.push('• ' + k.msg));
    }
    Modals.report('⚡ Optimierungsergebnis', '<div class="report-list">' +
      zeilen.map(z => '<div class="item"><span class="ico">' + (z.includes('•') ? '↳' : '✅') + '</span><span>' + z + '</span></div>').join('') +
      '</div>');
  }

  /* ---------- Theme ---------- */
  function applyThema(){
    document.documentElement.dataset.theme = state.thema || 'dark';
  }
  function setThema(th){
    state.thema = th;
    applyThema();
    speichern();
    updateTabButtons();
  }

  /* ---------- Navigation ---------- */
  function setTab(tab){
    state.ui.tab = tab;
    state.ui.search = '';
    state.ui.filter = 'alle';
    state.ui.day = null;
    speichern();
    render();
  }
  function setGridTab(t){ state.ui.gridTab = t; speichern(); render(); }
  function shiftPlan(days){
    state.ui.planStart = R.addDays(state.ui.planStart, days);
    state.ui.day = null;
    state.ui.selDay = null;
    speichern();
    render();
  }
  function resetPlanStart(){
    state.ui.planStart = R.mondayOf(R.todayISO());
    state.ui.day = null;
    state.ui.selDay = null;
    speichern();
    render();
  }
  function selectDay(datum){
    state.ui.selDay = (state.ui.selDay === datum) ? null : datum;
    speichern();
    render();
  }
  function togglePin(id){
    const e = state.einsaetze.find(x => x.id === id);
    if (!e) return;
    e.fixiert = !e.fixiert;
    speichern();
    render();
    toast(e.fixiert
      ? '📌 Besetzung fixiert – Automatik und Optimierer planen drum herum'
      : 'Fixierung gelöst – Einsatz wieder frei für die Automatik', 'ok', 3200);
  }
  function openDay(datum){ state.ui.day = datum; speichern(); render(); }

  /* ---------- Init ---------- */
  function init(){
    state = laden();
    if (!state) neuLaden();
    else applyThema();

    document.getElementById('tabs').addEventListener('click', ev => {
      const btn = ev.target.closest('button[data-tab]');
      if (btn) setTab(btn.dataset.tab);
    });
    document.getElementById('btn-optimize').onclick = optimizeNow;
    document.getElementById('btn-reset').onclick = () => {
      Modals.confirm('Demo zurücksetzen', 'Alle Änderungen werden verworfen und die Demo-Daten (30 Busse, 50 Fahrer, 32 Dienste) neu generiert.', 'Zurücksetzen', () => {
        localStorage.removeItem(LS_KEY);
        neuLaden();
        render();
        toast('Demo-Daten neu generiert', 'ok');
      });
    };
    document.getElementById('themeswitch').addEventListener('click', ev => {
      const btn = ev.target.closest('button[data-th]');
      if (btn) setThema(btn.dataset.th);
    });

    DnD.init();
    render();
  }

  document.addEventListener('DOMContentLoaded', init);

  return { get state(){ return state; }, planRange, nachAenderung, moveEinsatz, optimizeNow, autodispo, replanBereich,
           kannZuweisen, assignRessource, selectDay, togglePin,
           toast, setTab, setGridTab, shiftPlan, resetPlanStart, openDay, renderOnly };
})();
