/* ui.js — Ansichten: Dashboard (Tour-Planung), 4-Wochen-Plan, Fahrer, Busse, Touren & Fahrplan */
'use strict';
const UI = (() => {
  const R = Rules;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function render(){
    const st = App.state;
    const el = document.getElementById('view');
    const tab = st.ui.tab;
    if (tab === 'dashboard') el.innerHTML = htmlDashboard(st);
    else if (tab === 'plan') el.innerHTML = htmlPlan(st);
    else if (tab === 'fahrer') el.innerHTML = htmlFahrer(st);
    else if (tab === 'busse') el.innerHTML = htmlBusse(st);
    else if (tab === 'touren') el.innerHTML = htmlTouren(st);
    wire(tab);
    if ((tab === 'plan' || tab === 'dashboard') && st.ui.day) renderDayDrawer(st.ui.day);
    else document.getElementById('drawer-root').innerHTML = '';
  }

  function kurzName(f){ const p = f.name.split(' '); return p[0][0] + '. ' + p[p.length - 1]; }
  // 7-Tage-Betrieb: kein Wochenend-Shading – nur Sonntags-Border als Wochentrenner
  function cellCls(t, heute){ return `${R.dowIdx(t) === 6 ? 'sunday' : ''} ${R.dowIdx(t) === 0 ? 'monday' : ''} ${t === heute ? 'today' : ''}`; }

  /* ================= DASHBOARD — Tour-Planung ================= */
  function htmlDashboard(st){
    const { von, bis } = App.planRange();
    const heute = R.todayISO();
    const tage = R.dateList(von, bis);
    const K = R.alleKonflikte(st, von, bis);
    // Bedarf = aktive Umläufe × Tage (auch wenn noch kein Einsatz-Record existiert – leere Zukunftswochen!)
    let gesamt = 0, voll = 0, offen = 0;
    for (const t of tage){
      for (const d of R.aktiveDienste(st, t)){
        gesamt++;
        const e = st.einsaetze.find(x => x.dienstId === d.id && x.datum === t);
        if (e && e.fahrerId && e.busId) voll++;
        else offen++;
      }
    }
    const pctRaw = gesamt ? 100 * voll / gesamt : 100;
    const abdeckungTxt = (Math.abs(pctRaw - Math.round(pctRaw)) < 0.05
      ? String(Math.round(pctRaw))
      : pctRaw.toLocaleString('de-DE', { maximumFractionDigits: 1 })) + ' %';
    const abdeckungCls = gesamt && voll === gesamt ? 'ok' : 'warn';

    const busStat = { verfuegbar:0, reparatur:0, wartung:0, inaktiv:0 };
    for (const b of st.buses){ const s = R.busStatusHeute(b, heute); busStat[s.key]++; }
    const fahrerHeute = st.fahrer.filter(f => R.fahrerVerfuegbar(st, f, heute)).length;
    const diensteHeute = R.aktiveDienste(st, heute).length;
    const periodenHeute = R.aktivePerioden(st, heute).map(p => p.name).join(' + ');

    return `
      <div class="section-head">
        <h2>Dashboard</h2>
        <span class="muted">Umläufe der kommenden 4 Wochen · ${esc(periodenHeute)} · Fahrer &amp; Busse rechts per Drag &amp; Drop zuweisen</span>
      </div>
      <div class="kpis">
        <div class="kpi"><div class="label">Einsätze heute</div><div class="value">${diensteHeute}</div><div class="sub">${R.fmtLong(heute)}</div></div>
        <div class="kpi"><div class="label">Fahrer verfügbar</div><div class="value ok">${fahrerHeute}</div><div class="sub">von ${st.fahrer.length} (Urlaub / Krank / Saison raus)</div></div>
        <div class="kpi"><div class="label">Busse</div><div class="value"><span class="dot ok"></span>${busStat.verfuegbar} <span class="dot danger" style="margin-left:10px"></span>${busStat.reparatur} <span class="dot warn" style="margin-left:10px"></span>${busStat.wartung}</div><div class="sub">verfügbar · Reparatur · Wartung</div></div>
        <div class="kpi"><div class="label">Planabdeckung (4 Wochen)</div><div class="value ${abdeckungCls}">${abdeckungTxt}</div><div class="sub">${voll} von ${gesamt} Einsätzen besetzt</div></div>
        <div class="kpi"><div class="label">Offene Konflikte</div><div class="value ${K.list.length ? 'danger' : 'ok'}">${K.list.length}</div><div class="sub">${offen} ${offen === 1 ? 'Einsatz' : 'Einsätze'} ohne Fahrer/Bus</div></div>
      </div>

      <div class="plan-nav">
        <button class="btn small" id="dash-prev">◀ Woche zurück</button>
        <span class="range">${R.fmtD(von)} – ${R.fmtD(bis)}</span>
        <button class="btn small" id="dash-next">Woche vor ▶</button>
        <button class="btn small ghost" id="dash-today">Heute</button>
        <button class="btn small primary" id="dash-autodispo" title="Fehlende Fahrer/Busse im sichtbaren Fenster automatisch verteilen (fixierte 📌 bleiben)">⚡ Autodispo (Fenster füllen)</button>
        <span class="spacer"></span>
        <span class="legend"><span class="muted">Fahrer/Bus aus der rechten Leiste auf eine Tour-Zelle ziehen · 🔓/🔒 an der Zelle: Besetzung fixieren (📌) · Tagkopf: Tag auswählen · Zelle anklicken: bearbeiten</span></span>
      </div>

      <div class="dash-layout">
        ${tourGridHTML(st, tage, heute, K)}
        ${sidebarHTML(st, tage, heute, K)}
      </div>`;
  }

  /* ---------- Tour-Grid (Umläufe × 28 Tage) — flache Liste, keine Fahrplan-Sektionen ---------- */
  function tourGridHTML(st, tage, heute, K){
    const rows = st.dienste.slice()
      .sort((a, b) => R.mins(a.start) - R.mins(b.start) || a.kurz.localeCompare(b.kurz))
      .map(d => tourRow(st, d, tage, heute, K)).join('');
    return `<div class="plan-scroll tour-scroll">
      <div class="prow phead"><div class="pcorner" style="padding:6px 10px;font-size:11px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px">Umläufe · ${st.dienste.length}</div>${tage.map(t => dayHead(t, heute, st, 'dashboard')).join('')}</div>
      ${rows}
    </div>`;
  }

  function tourRow(st, d, tage, heute, K){
    const selDay = st.ui.selDay;
    const end = R.hhmm(R.mins(d.start) + d.dauerMin);
    let cells = '';
    for (const t of tage){
      const aktiv = d.aktiv && R.varianteAktiv(st, d, t) && d.wochentage.includes(R.dowIdx(t));
      const daysel = st.ui.selDay === t ? ' daysel' : '';
      if (!aktiv){
        const grund = !d.aktiv ? 'Dienst ist deaktiviert'
          : !R.varianteAktiv(st, d, t) ? 'Gilt in: ' + R.dienstPeriodenNamen(st, d) + ' – an diesem Tag nicht aktiv'
          : 'Fährt an diesem Wochentag nicht';
        cells += `<div class="pcell na ${cellCls(t, heute)}${daysel}" title="${esc(d.kurz)} · ${esc(grund)}">–</div>`;
        continue;
      }
      const e = st.einsaetze.find(x => x.dienstId === d.id && x.datum === t);
      const f = e && e.fahrerId ? R.fahrerById(st, e.fahrerId) : null;
      const b = e && e.busId ? R.busById(st, e.busId) : null;
      const konf = !!(e && K.byEinsatz.has(e.id));
      const offenTeile = [];
      if (!f) offenTeile.push('Fahrer fehlt');
      if (!b) offenTeile.push('Bus fehlt');
      const titel = `${esc(d.name)} · ${R.fmtLong(t)}\n${esc(d.start)} – ${esc(end)} (${R.fmtStd(d.dauerMin)}, Lenkzeit ${R.fmtStd(d.lenkzeitMin)})\n` +
        `Fahrer: ${f ? esc(f.name) : 'OFFEN'} · Bus: ${b ? esc(b.kennzeichen) : 'OFFEN'}` +
        (e && e.fixiert ? '\n📌 Fixiert – Automatik & Optimierer planen drum herum' :
         e && e.quelle === 'manuell' ? '\nManuell zugeteilt (M) – per 🔓 fixierbar' : '\nAutomatisch geplant') +
        (konf ? '\n⚠ ' + K.byEinsatz.get(e.id).map(k => k.msg).join('\n⚠ ') : '') +
        `\nFahrer/Bus hierher ziehen, um zuzuweisen · 🔓/🔒: fixieren · Klick: bearbeiten`;
      cells += `<div class="pcell tourcell ${cellCls(t, heute)}${daysel} ${konf ? 'konfzelle' : ''}" data-tourdrop="1" data-tourcell="1" data-tourdatum="${t}" data-dienstid="${d.id}" title="${esc(titel)}">
        ${chipMini(f, b, e, konf, offenTeile)}${e ? `<button class="pinbtn ${e.fixiert ? 'fixed' : ''}" data-pin="${e.id}" title="${e.fixiert ? 'Fixierung lösen' : 'Besetzung fixieren (📌) – Automatik plant drum herum'}">${e.fixiert ? '🔒' : '🔓'}</button>` : ''}</div>`;
    }
    return `<div class="prow"><div class="prowhead tourhead">
      <div class="name"><b>${esc(d.kurz)}</b> <span class="badge ${d.typ === 'linie' ? 'accent' : ''}" style="padding:1px 5px">${d.typ === 'linie' ? 'Linie' : 'Shuttle'}</span>${d.aktiv ? '' : ' <span class="badge">inaktiv</span>'}</div>
      <div class="meta tiny" title="${esc(d.name)}">${esc(d.name)}</div>
      <div class="meta tiny muted">${esc(d.start)}–${esc(end)} · L${esc(d.linie)}</div>
    </div>${cells}</div>`;
  }

  function chipMini(f, b, e, konf, offenTeile){
    if (!e) return '';
    if (!f || !b){
      // Halbe Zuweisung (einzeln gezogen): Vorhandenes zeigen, Fehlendes markieren
      let tf = '', tb = '';
      if (f){
        tf = esc(kurzName(f)) + (e.fixiert ? ' <span class="m pin" title="fixiert">📌</span>' : e.quelle === 'manuell' ? ' <span class="m">M</span>' : '');
        tb = '⚠ ' + esc(offenTeile.join(' · '));
      } else {
        tf = '⚠ ' + esc(offenTeile.join(' · '));
        tb = b ? esc(b.kennzeichen) : '';
      }
      return `<div class="tourchip offen" title="${esc(offenTeile.join(' · '))}"><span class="tf">${tf}</span>${tb ? `<span class="tb">${tb}</span>` : ''}</div>`;
    }
    return `<div class="tourchip ${konf ? 'konflikt' : ''}"><span class="tf">${esc(kurzName(f))}${e.fixiert ? ' <span class="m pin" title="fixiert">📌</span>' : e.quelle === 'manuell' ? ` <span class="m ${konf ? 'konf' : ''}" title="M = manuell zugeteilt${konf ? ' · ⚠ Konflikt' : ''}">M</span>` : ''}</span><span class="tb">${esc(b.kennzeichen)}</span></div>`;
  }

  /* ---------- Rechte Leiste: Fahrer / Busse / Konflikte ---------- */
  function sidebarHTML(st, tage, heute, K){
    const selDay = st.ui.selDay && tage.includes(st.ui.selDay) ? st.ui.selDay : null;
    const ersatz = Planner.ersatzFuer(st, heute).map(fid => R.fahrerById(st, fid)).filter(Boolean);
    const fahrerSortiert = st.fahrer.map(f => ({ f, ok: !selDay || R.fahrerVerfuegbar(st, f, selDay) }))
      .sort((a, b) => (b.f.aktiv - a.f.aktiv) || (b.ok - a.ok) || a.f.name.localeCompare(b.f.name));
    const busSortiert = st.buses.map(b => ({ b, ok: !selDay || R.busVerfuegbar(st, b, selDay) }))
      .sort((a, b) => (b.b.aktiv - a.b.aktiv) || (b.ok - a.ok) ||
        a.b.kennzeichen.localeCompare(b.b.kennzeichen, undefined, {numeric:true}));
    const konfItems = K.list.slice(0, 25).map(k => {
      const e = k.einsatzId && st.einsaetze.find(x => x.id === k.einsatzId);
      let wer = '';
      if (e){
        const f = e.fahrerId && R.fahrerById(st, e.fahrerId);
        const d = R.dienstById(st, e.dienstId);
        wer = (f ? f.name : '') + (d ? ' · ' + d.name : '');
      }
      return `<div class="konfitem"><span class="ico">⚠</span><div><b>${esc(R.KONF_TITEL[k.typ])}</b> · ${R.fmtLong(k.datum)}${wer ? '<br><span class="muted tiny">' + esc(wer) + '</span>' : ''}<br><span class="muted tiny">${esc(k.msg)}</span></div></div>`;
    }).join('');
    return `<aside class="dash-side">
      <div class="card side-block">
        <div class="side-head"><h3>Fahrer · ${st.fahrer.length}</h3></div>
        <div class="tiny muted" style="margin:-6px 0 8px">Ersatzfahrer heute: <b>${ersatz.map(f => esc(f.name)).join(', ') || '–'}</b></div>
        <input id="side-search" placeholder="Suchen …" style="width:100%;padding:6px 10px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--text);margin-bottom:8px">
        <div class="side-list" id="side-fahrer">
          ${stripRulerHTML(tage, selDay)}
          ${fahrerSortiert.map(x => fahrerSideRow(st, x.f, tage, heute, selDay, x.ok)).join('')}
        </div>
        <div class="tiny muted side-hint">Zeile ziehen → auf Tour-Zelle fallen. <span class="badge warn">U</span> Urlaub · <span class="badge danger">K</span> Krank: nicht verfügbar, aber sichtbar. <b>U / K</b> = Zeiträume mit Von–Bis pflegen (beliebig erweiterbar).${selDay ? ' <b>Ausgewählt: ' + R.fmtLong(selDay) + '</b> – einsetzbare Fahrer oben, gesperrte unten.' : ' Tagkopf oben anklicken, um einen Tag auszuwählen.'}</div>
      </div>
      <div class="card side-block">
        <div class="side-head"><h3>Busse · ${st.buses.length}</h3></div>
        <div class="side-list buslist" id="side-busse">
          ${stripRulerHTML(tage, selDay)}
          ${busSortiert.map(x => busSideRow(st, x.b, tage, heute, selDay, x.ok)).join('')}
        </div>
        <div class="tiny muted side-hint">🔧 = Wartung &amp; Reparatur mit Von–Bis-Datum eintragen; gesperrte Tage sind im Streifen markiert und nehmen keine Zuweisung an.</div>
      </div>
      <div class="card side-block">
        <div class="side-head"><h3>Konflikte · ${K.list.length}</h3><button class="btn primary small" id="dash-optimize">⚡ Optimieren</button></div>
        <div class="side-list konflist">${konfItems || '<div class="emptybox">Keine Lenkzeit-, Ruhezeit- oder Wartungskonflikte. 🎉</div>'}</div>
      </div>
    </aside>`;
  }

  function stripRulerHTML(tage, selDay){
    return `<div class="ministrip ruler" title="Kalendertage der 4 Wochen – Spalten entsprechen den Streifen darunter (Mo–So, Linie nach Sonntag = Wochenende)">` +
      tage.map(t => `<span class="${R.dowIdx(t) === 0 ? 'mon' : ''} ${t === selDay ? 'sel' : ''}" title="${R.fmtLong(t)}">${t.slice(8,10)}</span>`).join('') +
      '</div>';
  }

  function fahrerSideRow(st, f, tage, heute, selDay, ok){
    const abwHeute = R.fahrerAbwesend(f, heute);
    const std = R.wochenStd(st, f.id, R.mondayOf(heute));
    const qual = f.qual === 'beides' ? 'Linie+Shuttle' : f.qual === 'linie' ? 'Linie' : 'Shuttle';
    const zeitraum = f.anstellung === 'saison' ? ' · ' + R.fmtD(f.verfuegbarVon) + '–' + R.fmtD(f.verfuegbarBis) : '';
    const gesperrt = selDay && !ok;
    const grund = gesperrt ? (!f.aktiv ? 'Inaktiv' : (R.fahrerAbwesend(f, selDay) || (!R.fahrerImZeitraum(f, selDay) ? 'Saison' : ''))) : null;
    const grundTxt = grund === 'Urlaub' ? 'U' : grund === 'Krank' ? 'K' : grund;
    const imEinsatz = selDay && st.einsaetze.some(e => e.fahrerId === f.id && e.datum === selDay);
    const stamm = f.stammBusId ? R.busById(st, f.stammBusId) : null;
    const stammTxt = stamm ? ' · Stamm-Bus ' + esc(stamm.kennzeichen) + (R.busVerfuegbar(st, stamm, selDay || heute) ? '' : ' (Ersatzfahrzeug)') : '';
    return `<div class="siderow ${f.aktiv ? '' : 'inactive'} ${gesperrt ? 'unavail' : ''}" ${f.aktiv && !gesperrt ? `draggable="true" data-fdrag="${f.id}"` : ''}
        data-search="${esc((f.name + ' ' + (f.saisonLabel || '')).toLowerCase())}"
        title="${gesperrt ? esc(f.name) + ' ist am ' + R.fmtD(selDay) + ' nicht verfügbar (' + grund + ')' : f.aktiv ? 'Ziehen, um ' + esc(f.name) + ' einer Tour zuzuweisen' : 'Fahrer ist deaktiviert'}">
      <div class="siderow-top">
        <span class="grip">⠿</span>
        <span class="sname">${esc(f.name)}</span>
        ${grundTxt ? `<span class="badge ${grundTxt === 'K' || grundTxt === 'Inaktiv' ? 'danger' : 'warn'}" title="${esc(grund)} am ${R.fmtD(selDay)} – keine Zuweisung möglich">${esc(grundTxt)}</span>` :
          (abwHeute ? `<span class="badge ${abwHeute === 'Urlaub' ? 'warn' : 'danger'}" title="${abwHeute} heute – an diesen Tagen keine Zuweisung">${abwHeute === 'Urlaub' ? 'U' : 'K'}</span>` : '')}
        ${f.aktiv ? '' : '<span class="badge">inaktiv</span>'}
        <span class="spacer"></span>
        <button class="iconbtn" style="width:auto;min-width:34px;padding:0 6px;font-size:10.5px;font-weight:650" data-sideact="abw" data-id="${f.id}" title="Urlaub / Krank pflegen (Von–Bis, + Button)">U / K</button>
        <button class="iconbtn" data-sideact="editf" data-id="${f.id}" title="Fahrer bearbeiten">✎</button>
      </div>
      ${stripFahrer(st, f, tage, selDay)}
      <div class="siderow-meta tiny muted">${f.anstellung === 'saison' ? 'Saison' : 'Fest'} · ${qual} · ${R.fmtStd(std)}/40 h${zeitraum}${stammTxt}${imEinsatz ? ' · <span style="color:var(--accent);font-weight:600">im Einsatz</span>' : ''}</div>
    </div>`;
  }

  function busSideRow(st, b, tage, heute, selDay, ok){
    const s = R.busStatusHeute(b, heute);
    const gesperrt = selDay && !ok;
    const grund = gesperrt ? (!b.aktiv ? 'Inaktiv' : (b.status === 'reparatur' || (R.busWartungAm(b, selDay) || {}).art === 'reparatur' ? 'Reparatur' : 'Wartung')) : null;
    const imEinsatz = selDay && st.einsaetze.some(e => e.busId === b.id && e.datum === selDay);
    const stammF = st.fahrer.find(x => x.stammBusId === b.id && x.aktiv);
    return `<div class="siderow ${b.aktiv ? '' : 'inactive'} ${gesperrt ? 'unavail' : ''}" ${b.aktiv && !gesperrt ? `draggable="true" data-bdrag="${b.id}"` : ''}
        data-search="${esc((b.kennzeichen + ' ' + (b.modell || '') + ' ' + (stammF ? stammF.name : '')).toLowerCase())}"
        title="${gesperrt ? esc(b.kennzeichen) + ' ist am ' + R.fmtD(selDay) + ' nicht verfügbar (' + grund + ')' : b.aktiv ? 'Ziehen, um ' + esc(b.kennzeichen) + ' einer Tour zuzuweisen' : 'Bus ist deaktiviert'}">
      <div class="siderow-top">
        <span class="grip">⠿</span>
        <span class="sname"><b>${esc(b.kennzeichen)}</b></span>
        ${grund ? `<span class="badge ${grund === 'Reparatur' || grund === 'Inaktiv' ? 'danger' : 'warn'}" title="${esc(grund)} am ${R.fmtD(selDay)} – keine Zuweisung möglich">${esc(grund)}</span>` :
          `<span class="badge ${s.cls}">${esc(s.text)}</span>`}
        <span class="spacer"></span>
        <button class="iconbtn" data-sideact="wart" data-id="${b.id}" title="Wartung &amp; Reparatur pflegen (Von–Bis, + Button)">🔧</button>
        <button class="iconbtn" data-sideact="editb" data-id="${b.id}" title="Bus bearbeiten">✎</button>
      </div>
      ${stripBus(st, b, tage, selDay)}
      <div class="siderow-meta tiny muted">${b.typ === 'linienbus' ? 'Linienbus' : 'Shuttle'} · ${b.sitze} Sitze · ${esc(b.modell || '')}${imEinsatz ? ' · <span style="color:var(--accent);font-weight:600">im Einsatz</span>' : ''}</div>
      ${stammF ? `<div class="siderow-meta tiny" style="color:var(--accent);font-weight:600" title="Stamm-Bus von ${esc(stammF.name)}. An den freien Tagen des Stammfahrers fährt ein anderer Fahrer mit diesem Bus.">👤 Stamm: ${esc(stammF.name)}</div>` : ''}
    </div>`;
  }

  function stripFahrer(st, f, tage, selDay){
    return `<div class="ministrip" title="Verfügbarkeit der 4 Wochen (U = Urlaub, K = Krank, grau = außerhalb Saisonzeitraum)">` +
      tage.map(t => {
        const abw = R.fahrerAbwesend(f, t);
        const imZ = R.fahrerImZeitraum(f, t) && f.aktiv;
        const sel = t === selDay ? ' sel' : '';
        if (abw) return `<i class="${abw === 'Urlaub' ? 'u' : 'k'}${sel}" title="${R.fmtD(t)}: ${abw}"></i>`;
        if (!imZ) return `<i class="sp${sel}" title="${R.fmtD(t)}: außerhalb des Verfügbarkeitszeitraums"></i>`;
        return `<i class="${sel.trim()}" title="${R.fmtD(t)}: verfügbar"></i>`;
      }).join('') + '</div>';
  }

  function stripBus(st, b, tage, selDay){
    return `<div class="ministrip" title="Verfügbarkeit der 4 Wochen (W = Wartung, R = Reparatur – keine Zuweisung möglich)">` +
      tage.map(t => {
        const s = R.busStatusHeute(b, t);
        const sel = t === selDay ? ' sel' : '';
        if (s.key === 'reparatur') return `<i class="r${sel}" title="${R.fmtD(t)}: Reparatur"></i>`;
        if (s.key === 'wartung') return `<i class="w${sel}" title="${R.fmtD(t)}: Wartung"></i>`;
        if (s.key === 'inaktiv') return `<i class="sp${sel}" title="${R.fmtD(t)}: deaktiviert"></i>`;
        return `<i class="${sel.trim()}" title="${R.fmtD(t)}: verfügbar"></i>`;
      }).join('') + '</div>';
  }

  /* ================= 4-WOCHEN-PLAN ================= */
  function htmlPlan(st){
    const { von, bis } = App.planRange();
    const heute = R.todayISO();
    const K = R.alleKonflikte(st, von, bis);
    const tage = R.dateList(von, bis);
    const gridTab = st.ui.gridTab;

    const nav = `
      <div class="plan-nav">
        <button class="btn small" id="plan-prev">◀ Woche zurück</button>
        <span class="range">${R.fmtD(von)} – ${R.fmtD(bis)} <span class="muted tiny">(${Math.round(R.diffDays(von, bis) / 7) + 1} Wochen)</span></span>
        <button class="btn small" id="plan-next">Woche vor ▶</button>
        <button class="btn small ghost" id="plan-today">Heute</button>
        <button class="btn small primary" id="plan-autodispo" title="Fehlende Fahrer/Busse im sichtbaren Fenster automatisch verteilen (fixierte 📌 bleiben)">⚡ Autodispo (Fenster füllen)</button>
        <span class="spacer"></span>
        <div class="subtabs">
          <button id="gt-fahrer" class="${gridTab === 'fahrer' ? 'active' : ''}">Fahrer</button>
          <button id="gt-busse" class="${gridTab === 'busse' ? 'active' : ''}">Busse</button>
        </div>
      </div>
      <div class="legend" style="margin-bottom:10px">
        <span><span class="sw" style="background:var(--accent-soft);border-left:3px solid var(--accent)"></span>Einsatz (ziehbar)</span>
        <span><span class="sw" style="background:var(--danger-soft);border-left:3px solid var(--danger)"></span>Konflikt</span>
        <span><span class="sw" style="background:var(--warn-soft)"></span>Urlaub</span>
        <span><span class="sw" style="background:var(--danger-soft)"></span>Krank</span>
        <span><span class="sw" style="background:repeating-linear-gradient(45deg,var(--stripe) 0 4px,transparent 4px 8px);border:1px solid var(--border)"></span>Wartung / Reparatur</span>
        <span class="muted">Zelle anklicken: Einsatz anlegen · Chip anklicken: bearbeiten · Chip ziehen: umverteilen</span>
      </div>`;

    let grid;
    if (gridTab === 'fahrer') grid = gridFahrer(st, tage, heute, K);
    else grid = gridBusse(st, tage, heute, K);

    return nav + `<div class="plan-scroll">
      <div class="prow phead"><div class="pcorner" style="padding:6px 10px;font-size:11px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px">${gridTab === 'fahrer' ? 'Fahrer · ' + st.fahrer.length : 'Busse · ' + st.buses.length}</div>
      ${tage.map(t => dayHead(t, heute, st, 'plan')).join('')}</div>
      ${grid}
    </div>`;
  }

  function dayHead(t, heute, st, mode){
    const sel = st.ui.selDay === t;
    const offs = st.einsaetze.filter(e => e.datum === t && (!e.fahrerId || !e.busId)).length;
    return `<div class="pday ${sel ? 'sel' : ''} ${t === heute ? 'today' : ''} ${R.isWeekend(t) ? 'we' : ''} ${R.dowIdx(t) === 6 ? 'sunday' : ''} ${R.dowIdx(t) === 0 ? 'monday' : ''}" data-day="${t}" title="${mode === 'dashboard' ? 'Tag auswählen – rechte Listen passen sich an (nochmals klicken: Auswahl aufheben)' : 'Tagesdetail anzeigen'}">
      <button class="dayinfo" data-dayinfo="${t}" title="Tagesdetail anzeigen">ⓘ</button>
      <div class="dn">${R.DOW[R.dowIdx(t)]}</div><div class="dd">${R.fmtD(t)}</div><div class="cnt">${offs ? offs + ' offen' : ''}</div></div>`;
  }

  function chipHTML(st, e, K){
    const d = R.dienstById(st, e.dienstId);
    if (!d) return '';
    const b = e.busId ? R.busById(st, e.busId) : null;
    const konf = K.byEinsatz.has(e.id);
    const iv = R.dienstIntervall(d, e.datum);
    const f = e.fahrerId ? R.fahrerById(st, e.fahrerId) : null;
    const titel = `${esc(d.name)} · ${R.fmtLong(e.datum)}\n${R.hhmm(iv.start)} – ${R.hhmm(iv.end)} (${R.fmtStd(d.dauerMin)}, Lenkzeit ${R.fmtStd(d.lenkzeitMin)})\nFahrer: ${f ? esc(f.name) : 'OFFEN'} · Bus: ${b ? esc(b.kennzeichen) : 'OFFEN'}` +
      (e.fixiert ? '\n📌 Fixiert – Automatik & Optimierer planen drum herum' : e.quelle === 'manuell' ? '\nManuell zugeteilt (M)' : '') +
      (konf ? '\n⚠ ' + K.byEinsatz.get(e.id).map(k => k.msg).join('\n⚠ ') : '');
    return `<div class="chip ${konf ? 'konflikt' : ''}" draggable="true" data-einsatz="${e.id}" title="${esc(titel)}">
      ${e.fixiert ? '<span class="manuell pin" title="Fixiert (📌) – Automatik &amp; Optimierer planen drum herum">📌</span>' : e.quelle === 'manuell' ? `<span class="manuell ${konf ? 'konf' : ''}" title="M = manuell zugeteilt${konf ? ' · ⚠ Konflikt: Regelverstoß vorhanden' : ' – der Optimierer darf bei Konflikten umbuchen'}">M</span>` : ''}
      <div class="t">${esc(d.kurz)}${e.fahrerId ? '' : ' · OFFEN'}</div><div class="b">${b ? esc(b.kennzeichen) : 'ohne Bus'}</div></div>`;
  }

  function gridFahrer(st, tage, heute, K){
    const rows = [...st.fahrer].sort((a,b) => (b.aktiv - a.aktiv) || a.name.localeCompare(b.name));
    const out = [];
    for (const f of rows){
      const ws = R.mondayOf(heute);
      const std = R.wochenStd(st, f.id, ws);
      const pct = Math.min(100, std / R.WOCHEN_MAX * 100);
      const konfZ = R.getFahrerKonflikte(st, f.id, tage[0], tage[tage.length - 1]).length;
      const zellen = [];
      out.push(`<div class="prow"><div class="prowhead" style="height:56px">
        <div class="name">${esc(f.name)} ${f.aktiv ? '' : '<span class="badge">inaktiv</span>'}</div>
        <div class="meta">
          <span class="badge ${f.anstellung === 'saison' ? 'accent' : ''}">${f.anstellung === 'saison' ? esc(f.saisonLabel || 'Saison') : 'Fest'}</span>
          ${konfZ ? `<span class="konf">⚠ ${konfZ}</span>` : ''}
          <span style="flex:1"></span>
          <button class="iconbtn" data-act="printplan" data-id="${f.id}" title="Dienstplan dieser 4 Wochen drucken">${ICO.druck}</button>
        </div>
        <div class="meta" style="align-items:center"><div class="hoursbar" title="${R.fmtStd(std)} von 40 h (aktuelle Woche)"><i class="${std > R.WOCHEN_MAX ? 'over' : std > R.WOCHEN_MAX * 0.9 ? 'warn' : ''}" style="width:${pct}%"></i></div><span>${R.fmtStd(std)}/40 h</span></div>
      </div>`);
      for (const t of tage){
        const abw = R.fahrerAbwesend(f, t);
        const imZeitraum = R.fahrerImZeitraum(f, t);
        if (!f.aktiv){
          zellen.push(cellEmpty(t, '', 'out'));
          continue;
        }
        if (abw){
          zellen.push(cellEmpty(t, `<div class="absence ${abw === 'Urlaub' ? 'u' : 'k'}" title="${abw}">${abw === 'Urlaub' ? 'U' : 'K'}</div>`, ''));
          continue;
        }
        if (!imZeitraum){
          zellen.push(cellEmpty(t, '', 'out', 'Nicht im Verfügbarkeitszeitraum (Saison)'));
          continue;
        }
        const eins = st.einsaetze.filter(e => e.fahrerId === f.id && e.datum === t)
          .sort((a,b) => R.mins(R.dienstById(st, a.dienstId).start) - R.mins(R.dienstById(st, b.dienstId).start));
        zellen.push(`<div class="pcell ${R.dowIdx(t) === 6 ? 'sunday' : ''} ${R.dowIdx(t) === 0 ? 'monday' : ''} ${t === heute ? 'today' : ''} ${eins.length ? '' : 'empty'}"
          data-drop="fahrer" data-dropid="${f.id}" data-dropdatum="${t}" data-create="1" data-fid="${f.id}" data-datum="${t}" title="${eins.length ? '' : 'Einsatz anlegen'}">
          ${eins.map(e => chipHTML(st, e, K)).join('')}</div>`);
      }
      out.push(zellen.join('') + '</div>');
    }
    return out.join('');
  }

  function gridBusse(st, tage, heute, K){
    const rows = [...st.buses].sort((a,b) => (b.aktiv - a.aktiv) || a.kennzeichen.localeCompare(b.kennzeichen, undefined, {numeric:true}));
    const out = [];
    for (const b of rows){
      const sHeute = R.busStatusHeute(b, heute);
      const nWart = b.wartungen.length;
      const zellen = [];
      out.push(`<div class="prow"><div class="prowhead" style="height:56px">
        <div class="name">${esc(b.kennzeichen)} ${b.aktiv ? '' : '<span class="badge">inaktiv</span>'}</div>
        <div class="meta"><span class="badge ${sHeute.cls}">${esc(sHeute.text)}</span>
        ${nWart ? `<span class="badge">${nWart} Termin${nWart > 1 ? 'e' : ''}</span>` : ''}</div>
        <div class="meta">${esc(b.typ === 'linienbus' ? 'Linienbus' : 'Shuttle')} · ${b.sitze} Sitze</div>
      </div>`);
      for (const t of tage){
        const s = R.busStatusHeute(b, t);
        if (!b.aktiv || s.key === 'reparatur' || s.key === 'wartung'){
          const w = R.busWartungAm(b, t);
          const grund = !b.aktiv ? 'Bus ist deaktiviert' : b.status === 'reparatur' ? 'Bus in Reparatur' : b.status === 'wartung' ? 'Bus in Wartung' :
            (w ? (w.art === 'reparatur' ? 'Reparatur' : 'Wartung') + (w.notiz ? ': ' + w.notiz : '') + ' (' + R.fmtD(w.von) + '–' + R.fmtD(w.bis) + ')' : '');
          zellen.push(cellEmpty(t, '', 'blocked', grund));
          continue;
        }
        const eins = st.einsaetze.filter(e => e.busId === b.id && e.datum === t)
          .sort((a,c) => R.mins(R.dienstById(st, a.dienstId).start) - R.mins(R.dienstById(st, c.dienstId).start));
        zellen.push(`<div class="pcell ${R.dowIdx(t) === 6 ? 'sunday' : ''} ${R.dowIdx(t) === 0 ? 'monday' : ''} ${t === heute ? 'today' : ''} ${eins.length ? '' : 'empty'}"
          data-drop="bus" data-dropid="${b.id}" data-dropdatum="${t}" data-create="1" data-bid="${b.id}" data-datum="${t}" title="${eins.length ? '' : 'Einsatz anlegen'}">
          ${eins.map(e => chipHTML(st, e, K)).join('')}</div>`);
      }
      out.push(zellen.join('') + '</div>');
    }
    return out.join('');
  }

  function cellEmpty(t, content, extra, titel){
    return `<div class="pcell ${extra} ${R.dowIdx(t) === 6 ? 'sunday' : ''} ${R.dowIdx(t) === 0 ? 'monday' : ''} ${t === R.todayISO() ? 'today' : ''}" title="${esc(titel || '')}">${content || ''}</div>`;
  }

  /* ---------- Tagesdetail-Drawer ---------- */
  function renderDayDrawer(datum){
    const st = App.state;
    const { von, bis } = App.planRange();
    const K = R.alleKonflikte(st, von, bis);
    const dienste = R.aktiveDienste(st, datum).slice().sort((a,b) => R.mins(a.start) - R.mins(b.start));
    const rows = dienste.map(d => {
      const e = st.einsaetze.find(x => x.dienstId === d.id && x.datum === datum);
      const f = e && e.fahrerId ? R.fahrerById(st, e.fahrerId) : null;
      const b = e && e.busId ? R.busById(st, e.busId) : null;
      const konf = e && K.byEinsatz.has(e.id) ? K.byEinsatz.get(e.id).map(k => k.msg) : [];
      return `<div class="subcard ${konf.length ? 'warnline' : ''}">
        <div class="row1"><b>${esc(d.name)}</b><span class="muted tiny">${esc(d.start)} – ${esc(R.hhmm(R.mins(d.start) + d.dauerMin))}</span></div>
        <div class="meta">Fahrer: ${f ? esc(f.name) : '<span style="color:var(--danger);font-weight:600">offen</span>'} · Bus: ${b ? esc(b.kennzeichen) : '<span style="color:var(--danger);font-weight:600">offen</span>'}</div>
        ${konf.map(k => `<div class="meta" style="color:var(--danger)">⚠ ${esc(k)}</div>`).join('')}
      </div>`;
    }).join('');

    const ersatz = Planner.ersatzFuer(st, datum).map(fid => {
      const f = R.fahrerById(st, fid);
      if (!f) return '';
      const fuhrVortag = st.einsaetze.some(e => e.fahrerId === fid && e.datum === R.addDays(datum, -1));
      return `<div class="subcard"><div class="row1"><b>${esc(f.name)}</b><span class="badge ${fuhrVortag ? 'warn' : 'ok'}">${fuhrVortag ? 'gestern im Einsatz' : 'ausgeruht'}</span></div>
        <div class="meta">${f.anstellung === 'saison' ? 'Saison · ' : ''}${f.qual === 'beides' ? 'Linie & Shuttle' : f.qual === 'linie' ? 'Linie' : 'Shuttle'} · Ruhezeit: ${fuhrVortag ? 'Restruhezeit beachten' : 'eingehalten'}</div></div>`;
    }).join('');

    document.getElementById('drawer-root').innerHTML = `
      <div class="drawer">
        <header><h3>Tagesdetail · ${R.fmtLong(datum)}</h3><button class="close" id="drawer-close" title="Schließen">✕</button></header>
        <div class="body">
          <h4>Ersatzfahrer (${Planner.ersatzFuer(st, datum).length}/2)</h4>
          ${ersatz || '<div class="emptybox">Keine Ersatzfahrer verfügbar</div>'}
          <div class="tiny muted" style="margin-bottom:6px">Ersatzfahrer springen bei Ausfall ein; beim Einrücken werden ihre Ruhe- und Lenkzeiten automatisch geprüft.</div>
          <h4>Einsätze (${dienste.length})</h4>
          ${rows || '<div class="emptybox">Keine Dienste an diesem Tag</div>'}
        </div>
      </div>`;
    document.getElementById('drawer-close').onclick = () => { App.state.ui.day = null; document.getElementById('drawer-root').innerHTML = ''; };
  }

  /* ================= FAHRER ================= */
  function htmlFahrer(st){
    const { von, bis } = App.planRange();
    const q = (st.ui.search || '').toLowerCase();
    const filter = st.ui.filter || 'alle';
    const heute = R.todayISO();
    const list = st.fahrer
      .filter(f => filter === 'alle' || (filter === 'aktiv' ? f.aktiv : !f.aktiv))
      .filter(f => !q || f.name.toLowerCase().includes(q))
      .sort((a,b) => (b.aktiv - a.aktiv) || a.name.localeCompare(b.name));

    const rows = list.map(f => {
      const std = R.wochenStd(st, f.id, R.mondayOf(heute));
      const pct = Math.min(100, std / R.WOCHEN_MAX * 100);
      const nU = f.urlaub.length, nK = f.krank.length;
      const konfZ = R.getFahrerKonflikte(st, f.id, von, bis).length;
      const abwHeute = R.fahrerAbwesend(f, heute);
      const stammB = f.stammBusId ? R.busById(st, f.stammBusId) : null;
      return `<tr class="${f.aktiv ? '' : 'inactive'}">
        <td><b>${esc(f.name)}</b>${abwHeute ? ` <span class="badge ${abwHeute === 'Urlaub' ? 'warn' : 'danger'}">${abwHeute}</span>` : ''}</td>
        <td><span class="badge ${f.anstellung === 'saison' ? 'accent' : ''}">${f.anstellung === 'saison' ? esc(f.saisonLabel || 'Saison') : 'Fest'}</span></td>
        <td class="tiny">${f.verfuegbarVon ? R.fmtDMY(f.verfuegbarVon) : '–'} – ${f.verfuegbarBis ? R.fmtDMY(f.verfuegbarBis) : '–'}</td>
        <td class="tiny">${f.qual === 'beides' ? 'Linie & Shuttle' : f.qual === 'linie' ? 'Linie' : 'Shuttle'}</td>
        <td class="tiny">${stammB ? `<b>${esc(stammB.kennzeichen)}</b>${stammB.aktiv ? '' : ' <span class="badge danger">inaktiv</span>'}` : '<span class="muted">–</span>'}</td>
        <td><div style="display:flex;align-items:center;gap:8px"><div class="hoursbar"><i class="${std > R.WOCHEN_MAX ? 'over' : std > R.WOCHEN_MAX * 0.9 ? 'warn' : ''}" style="width:${pct}%"></i></div><span class="tiny">${R.fmtStd(std)}/40 h</span></div></td>
        <td class="tiny">${nU} Urlaub · ${nK} Krank${konfZ ? ` · <span style="color:var(--danger);font-weight:600">⚠ ${konfZ} Konflikt(e)</span>` : ''}</td>
        <td><span class="badge ${f.aktiv ? 'ok' : ''}">${f.aktiv ? 'Aktiv' : 'Inaktiv'}</span></td>
        <td><div class="actions">
          <button class="iconbtn" style="width:auto;min-width:34px;padding:0 6px;font-size:10.5px;font-weight:650" data-act="abw" data-id="${f.id}" title="Urlaub / Krank pflegen (Von–Bis)">U / K</button>
          <button class="iconbtn" data-act="edit" data-id="${f.id}" title="Bearbeiten">✎</button>
          <button class="iconbtn" data-act="toggle" data-id="${f.id}" title="${f.aktiv ? 'Deaktivieren' : 'Aktivieren'}">${f.aktiv ? '⏻' : '▶'}</button>
          <button class="iconbtn danger" data-act="del" data-id="${f.id}" title="Löschen">🗑</button>
        </div></td>
      </tr>`;
    }).join('');

    return `
      <div class="section-head"><h2>Fahrer (${st.fahrer.length})</h2><span class="muted">Vertrag: 40 h/Woche · 5-Tage-Woche · Saisonfahrer im Zeitraum planbar</span></div>
      <div class="toolbar">
        <input id="f-search" placeholder="Suchen …" value="${esc(st.ui.search || '')}" style="padding:7px 10px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--text);width:220px">
        <select id="f-filter" style="padding:7px 10px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--text)">
          <option value="alle" ${filter === 'alle' ? 'selected' : ''}>Alle</option>
          <option value="aktiv" ${filter === 'aktiv' ? 'selected' : ''}>Nur aktive</option>
          <option value="inaktiv" ${filter === 'inaktiv' ? 'selected' : ''}>Nur inaktive</option>
        </select>
        <span class="spacer"></span>
        <button class="btn primary" id="f-add">+ Neuer Fahrer</button>
      </div>
      <div class="card" style="padding:0;overflow:auto">
        <table class="tbl">
          <thead><tr><th>Name</th><th>Anstellung</th><th>Verfügbarkeitszeitraum</th><th>Qualifikation</th><th>Stamm-Bus</th><th>Stunden (akt. Woche)</th><th>Abwesenheiten</th><th>Status</th><th style="text-align:right">Aktionen</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="9" style="text-align:center;color:var(--text-faint);padding:20px">Keine Treffer</td></tr>'}</tbody>
        </table>
      </div>`;
  }

  /* ================= BUSSE ================= */
  function htmlBusse(st){
    const heute = R.todayISO();
    const q = (st.ui.search || '').toLowerCase();
    const filter = st.ui.filter || 'alle';
    const list = st.buses
      .filter(b => filter === 'alle' || (filter === 'aktiv' ? b.aktiv : !b.aktiv))
      .filter(b => !q || b.kennzeichen.toLowerCase().includes(q) || (b.modell || '').toLowerCase().includes(q))
      .sort((a,b) => (b.aktiv - a.aktiv) || a.kennzeichen.localeCompare(b.kennzeichen, undefined, {numeric:true}));

    const rows = list.map(b => {
      const s = R.busStatusHeute(b, heute);
      const next = b.wartungen.filter(w => w.bis >= heute).sort((a,c) => a.von.localeCompare(c.von))[0];
      return `<tr class="${b.aktiv ? '' : 'inactive'}">
        <td><b>${esc(b.kennzeichen)}</b></td>
        <td class="tiny">${esc(b.modell || '–')}</td>
        <td><span class="badge">${b.typ === 'linienbus' ? 'Linienbus' : 'Shuttle'}</span></td>
        <td class="tiny">${b.sitze}</td>
        <td><span class="badge ${s.cls}"><span class="dot ${s.cls}"></span>${esc(s.text)}</span></td>
        <td class="tiny">${b.wartungen.length ? b.wartungen.length + ' Termin(e)' + (next ? ` · nächster ${R.fmtDMY(next.von)} (${next.art === 'reparatur' ? 'Reparatur' : 'Wartung'})` : '') : '–'}</td>
        <td><span class="badge ${b.aktiv ? 'ok' : ''}">${b.aktiv ? 'Aktiv' : 'Inaktiv'}</span></td>
        <td><div class="actions">
          <button class="iconbtn" data-act="wart" data-id="${b.id}" title="Wartung & Reparatur pflegen">🔧</button>
          <button class="iconbtn" data-act="edit" data-id="${b.id}" title="Bearbeiten">✎</button>
          <button class="iconbtn" data-act="toggle" data-id="${b.id}" title="${b.aktiv ? 'Deaktivieren' : 'Aktivieren'}">${b.aktiv ? '⏻' : '▶'}</button>
          <button class="iconbtn danger" data-act="del" data-id="${b.id}" title="Löschen">🗑</button>
        </div></td>
      </tr>`;
    }).join('');

    return `
      <div class="section-head"><h2>Busse (${st.buses.length})</h2><span class="muted">Status: verfügbar · Reparatur · geplante Wartung — wartende Busse werden nicht eingeplant</span></div>
      <div class="toolbar">
        <input id="f-search" placeholder="Suchen …" value="${esc(st.ui.search || '')}" style="padding:7px 10px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--text);width:220px">
        <select id="f-filter" style="padding:7px 10px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--text)">
          <option value="alle" ${filter === 'alle' ? 'selected' : ''}>Alle</option>
          <option value="aktiv" ${filter === 'aktiv' ? 'selected' : ''}>Nur aktive</option>
          <option value="inaktiv" ${filter === 'inaktiv' ? 'selected' : ''}>Nur inaktive</option>
        </select>
        <span class="spacer"></span>
        <button class="btn primary" id="b-add">+ Neuer Bus</button>
      </div>
      <div class="card" style="padding:0;overflow:auto">
        <table class="tbl">
          <thead><tr><th>Kennzeichen</th><th>Modell</th><th>Typ</th><th>Sitze</th><th>Status (heute)</th><th>Wartungstermine</th><th>Status</th><th style="text-align:right">Aktionen</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="8" style="text-align:center;color:var(--text-faint);padding:20px">Keine Treffer</td></tr>'}</tbody>
        </table>
      </div>`;
  }

  /* ================= TOUREN & FAHRPLAN ================= */
  function htmlTouren(st){
    const heute = R.todayISO();
    const { von, bis } = App.planRange();
    const aktive = R.aktivePerioden(st, heute);

    const banner = `<div class="fahrplan-banner">
      <span class="tag">Aktuell gültig:</span>
      ${aktive.map(p => `<span class="badge accent">${esc(p.name)}</span>`).join('') || '<span class="muted">kein Zeitraum</span>'}
      <span class="muted">${aktive.map(p => p.name + ' ' + R.periodText(p)).join(' · ')} — Umläufe sind aktiv, sobald einer ihrer Zeiträume gilt.</span>
      <span class="spacer"></span>
      <button class="btn small" id="saison-edit" title="Zeiträume anlegen, umbenennen, löschen">✎ Zeiträume bearbeiten</button>
    </div>`;

    const section = (titel, hinweis, list) => {
      const rows = list.map(d => {
        const n = st.einsaetze.filter(e => e.dienstId === d.id && e.datum >= von && e.datum <= bis).length;
        const wt = [0,1,2,3,4,5,6].map(i => `<i class="${d.wochentage.includes(i) ? 'on' : ''}">${R.DOW[i][0]}</i>`).join('');
        const periodenTxt = R.dienstPeriodenNamen(st, d);
        return `<tr class="${d.aktiv ? '' : 'inactive'}">
          <td><b>${esc(d.kurz)}</b></td>
          <td>${esc(d.name)}</td>
          <td class="tiny">${esc(d.linie || '–')}</td>
          <td><span class="badge ${d.typ === 'linie' ? 'accent' : ''}">${d.typ === 'linie' ? 'Linie' : 'Shuttle'}</span></td>
          <td class="tiny">${esc(d.start)} – ${esc(R.hhmm(R.mins(d.start) + d.dauerMin))}</td>
          <td class="tiny">${R.fmtStd(d.dauerMin)} / ${R.fmtStd(d.lenkzeitMin)} Lenk</td>
          <td><span class="wd-dots">${wt}</span></td>
          <td class="tiny">${esc(periodenTxt)}</td>
          <td class="tiny">${n} Einsätze</td>
          <td><span class="badge ${d.aktiv ? 'ok' : ''}">${d.aktiv ? 'Aktiv' : 'Inaktiv'}</span></td>
          <td><div class="actions">
            <button class="iconbtn" data-act="edit" data-id="${d.id}" title="Bearbeiten">✎</button>
            <button class="iconbtn" data-act="toggle" data-id="${d.id}" title="${d.aktiv ? 'Deaktivieren' : 'Aktivieren'}">${d.aktiv ? '⏻' : '▶'}</button>
            <button class="iconbtn danger" data-act="del" data-id="${d.id}" title="Löschen">🗑</button>
          </div></td>
        </tr>`;
      }).join('');
      return `<div class="section-head"><h3 style="font-size:14px">${esc(titel)} <span class="muted tiny">· ${hinweis} · ${list.length} Dienste</span></h3></div>
        <div class="card" style="padding:0;overflow:auto">
          <table class="tbl">
            <thead><tr><th>Kurz</th><th>Bezeichnung</th><th>Linie</th><th>Typ</th><th>Zeit</th><th>Dauer / Lenkzeit</th><th>Tage</th><th>Zeiträume</th><th>Einsätze (Fenster)</th><th>Status</th><th style="text-align:right">Aktionen</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="11" style="text-align:center;color:var(--text-faint);padding:16px">Keine Dienste</td></tr>'}</tbody>
          </table>
        </div>`;
    };

    const nachKurz = (a, b) => a.kurz.localeCompare(b.kurz);
    const periodenSektionen = st.perioden.map(p =>
      section(p.name, R.periodText(p), st.dienste.filter(d => (d.perioden || []).includes(p.id)).sort(nachKurz))).join('');
    const ohne = st.dienste.filter(d => !(d.perioden || []).length).sort(nachKurz);

    return `
      <div class="section-head">
        <h2>Touren &amp; Fahrplan</h2>
        <button class="btn primary" id="d-add">+ Neuer Dienst</button>
      </div>
      ${banner}
      ${periodenSektionen}
      ${ohne.length ? section('Kein Zeitraum zugeordnet', 'wird nicht eingeplant', ohne) : ''}`;
  }

  /* ================= Event-Verdrahtung ================= */
  function wire(tab){
    const el = document.getElementById('view');

    if (tab === 'dashboard'){
      el.querySelector('#dash-optimize').onclick = () => App.optimizeNow();
      el.querySelector('#dash-prev').onclick = () => App.shiftPlan(-7);
      el.querySelector('#dash-next').onclick = () => App.shiftPlan(7);
      el.querySelector('#dash-today').onclick = () => App.resetPlanStart();
      el.querySelector('#dash-autodispo').onclick = () => App.autodispo();
      const search = el.querySelector('#side-search');
      search.oninput = () => {
        const q = search.value.trim().toLowerCase();
        el.querySelectorAll('.siderow').forEach(r => {
          r.style.display = (!q || (r.dataset.search || '').includes(q)) ? '' : 'none';
        });
      };
      el.addEventListener('click', dashClick);
    }

    if (tab === 'plan'){
      el.querySelector('#plan-prev').onclick = () => App.shiftPlan(-7);
      el.querySelector('#plan-next').onclick = () => App.shiftPlan(7);
      el.querySelector('#plan-today').onclick = () => App.resetPlanStart();
      el.querySelector('#plan-autodispo').onclick = () => App.autodispo();
      el.querySelector('#gt-fahrer').onclick = () => App.setGridTab('fahrer');
      el.querySelector('#gt-busse').onclick = () => App.setGridTab('busse');
      el.addEventListener('click', planClick);
    }

    if (tab === 'fahrer'){
      el.querySelector('#f-add').onclick = () => Modals.fahrer(App.state, null);
      el.querySelector('#f-search').oninput = ev => { App.state.ui.search = ev.target.value; App.renderOnly(); el.querySelector('#f-search').focus(); };
      el.querySelector('#f-filter').onchange = ev => { App.state.ui.filter = ev.target.value; App.renderOnly(); };
      el.addEventListener('click', fahrerClick);
    }

    if (tab === 'busse'){
      el.querySelector('#b-add').onclick = () => Modals.bus(App.state, null);
      el.querySelector('#f-search').oninput = ev => { App.state.ui.search = ev.target.value; App.renderOnly(); el.querySelector('#f-search').focus(); };
      el.querySelector('#f-filter').onchange = ev => { App.state.ui.filter = ev.target.value; App.renderOnly(); };
      el.addEventListener('click', busClick);
    }

    if (tab === 'touren'){
      el.querySelector('#d-add').onclick = () => Modals.dienst(App.state, null);
      el.querySelector('#saison-edit').onclick = () => Modals.perioden(App.state);
      el.addEventListener('click', dienstClick);
    }
  }

  function dashClick(ev){
    const pinBtn = ev.target.closest('[data-pin]');
    if (pinBtn){ ev.stopPropagation(); App.togglePin(pinBtn.dataset.pin); return; }
    const infoBtn = ev.target.closest('[data-dayinfo]');
    if (infoBtn){ ev.stopPropagation(); App.openDay(infoBtn.dataset.dayinfo); return; }
    const dayHead = ev.target.closest('.pday[data-day]');
    if (dayHead){ App.selectDay(dayHead.dataset.day); return; }
    const btn = ev.target.closest('[data-sideact]');
    if (btn){
      ev.stopPropagation();
      const st = App.state;
      if (btn.dataset.sideact === 'abw') Modals.abwesenheiten(st, btn.dataset.id, btn.dataset.art);
      else if (btn.dataset.sideact === 'wart') Modals.wartungen(st, btn.dataset.id);
      else if (btn.dataset.sideact === 'editf') Modals.fahrer(st, R.fahrerById(st, btn.dataset.id));
      else if (btn.dataset.sideact === 'editb') Modals.bus(st, R.busById(st, btn.dataset.id));
      return;
    }
    const cell = ev.target.closest('.pcell[data-tourcell]');
    if (cell){
      const st = App.state;
      const e = st.einsaetze.find(x => x.dienstId === cell.dataset.dienstid && x.datum === cell.dataset.tourdatum);
      Modals.einsatz(st, e || null, e ? null : { dienstId: cell.dataset.dienstid, datum: cell.dataset.tourdatum });
    }
  }

  /* ---------- Dienstplan eines Fahrers drucken (sichtbare 4 Wochen, A4 quer) ---------- */
  function druckDienstplan(st, fid){
    const f = R.fahrerById(st, fid);
    if (!f) return;
    const von = App.planRange().von;
    const bis = R.addDays(von, 27);
    const K = R.alleKonflikte(st, von, bis);

    const zelle = t => {
      const abw = R.fahrerAbwesend(f, t);
      if (abw) return `<td class="abw ${abw === 'Urlaub' ? 'u' : 'k'}">${abw}</td>`;
      if (!f.aktiv || !R.fahrerImZeitraum(f, t)) return '<td class="frei">–</td>';
      const eins = st.einsaetze.filter(e => e.fahrerId === fid && e.datum === t)
        .sort((a,b) => R.mins((R.dienstById(st, a.dienstId) || {start:'00:00'}).start) - R.mins((R.dienstById(st, b.dienstId) || {start:'00:00'}).start));
      if (!eins.length) return '<td class="frei">frei</td>';
      return `<td>${eins.map(e => {
        const d = R.dienstById(st, e.dienstId);
        const b = e.busId ? R.busById(st, e.busId) : null;
        const konf = K.byEinsatz.get(e.id);
        const zeit = d ? esc(d.start) + '–' + esc(R.hhmm(R.mins(d.start) + d.dauerMin)) : '?';
        return `<div class="dienst${konf ? ' konf' : ''}"><b>${esc(d ? d.kurz : '?')}</b> ${zeit} → ${b ? esc(b.kennzeichen) : 'Bus offen'}${e.fixiert ? ' ' + ICO.pin : ''}${konf ? '<br><span class="warnm">' + ICO.warn + ' ' + esc(konf[0].msg) + '</span>' : ''}</div>`;
      }).join('')}</td>`;
    };

    const wochenHTML = [0,1,2,3].map(w => {
      const ws = R.addDays(von, w * 7);
      const we = R.addDays(ws, 6);
      const std = R.wochenStd(st, fid, ws);
      return `<div class="woche">
        <h2>Woche ${w + 1} &nbsp;·&nbsp; ${R.fmtD(ws)} – ${R.fmtD(we)} &nbsp;·&nbsp; <b>${R.fmtStd(std)}</b> von ${R.fmtStd(R.WOCHEN_MAX)}</h2>
        <table><thead><tr>${R.DOW.map((d, i) => `<th>${d} <span class="dat">${R.fmtD(R.addDays(ws, i))}</span></th>`).join('')}</tr></thead>
        <tbody><tr>${R.dateList(ws, we).map(zelle).join('')}</tr></tbody></table>
      </div>`;
    }).join('');

    const gesamt = [0,1,2,3].reduce((s, w) => s + R.wochenStd(st, fid, R.addDays(von, w * 7)), 0);
    const stamm = f.stammBusId ? R.busById(st, f.stammBusId) : null;
    const html = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Dienstplan ${esc(f.name)}</title>
<style>
  @page { size: A4 landscape; margin: 11mm; }
  * { box-sizing: border-box; }
  body { font: 10.5pt/1.4 -apple-system, 'Segoe UI', Arial, sans-serif; color: #14181d; margin: 0; padding-top: 46px; }
  .noprint { position: fixed; top: 10px; right: 10px; }
  .noprint button { font: 11pt/1 sans-serif; padding: 8px 14px; border-radius: 8px; border: 1px solid #999; background: #fff; cursor: pointer; }
  .noprint button svg { vertical-align: -2px; margin-right: 4px; }
  .kopf { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2.5px solid #26313d; padding-bottom: 4mm; margin-bottom: 4mm; }
  .firma { font-size: 9pt; letter-spacing: .5px; text-transform: uppercase; color: #5b6570; }
  h1 { font-size: 17pt; margin: 1mm 0 1mm; }
  .wer { font-size: 12pt; font-weight: 650; }
  .rechts { text-align: right; font-size: 9.5pt; color: #3c454f; }
  .rechts b { font-size: 11pt; }
  h2 { font-size: 10.5pt; margin: 4mm 0 1.5mm; color: #26313d; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th, td { border: 1px solid #b8bec5; padding: 1.8mm; vertical-align: top; text-align: left; }
  th { background: #eceff2; font-size: 8.5pt; }
  th .dat { font-weight: 400; color: #5b6570; }
  td { height: 15mm; font-size: 9pt; }
  td.frei { background: #f4f5f6; color: #98a0a8; font-style: italic; }
  td.abw { font-weight: 700; font-size: 8.5pt; }
  td.abw.u { background: #fbf0d3; color: #7a5c00; }
  td.abw.k { background: #fadfdb; color: #8c1d28; }
  .dienst { padding-left: 1.8mm; border-left: 2.5px solid #26313d; }
  .dienst.konf { border-left-color: #c0262e; }
  .dienst b { font-size: 9.5pt; }
  .warnm { color: #c0262e; font-size: 7.5pt; }
  .fuss { margin-top: 4mm; font-size: 8pt; color: #5b6570; display: flex; justify-content: space-between; }
  @media print { .noprint { display: none; } body { padding-top: 0; } }
</style></head><body>
  <div class="noprint"><button onclick="window.print()">${ICO.druck} Drucken</button></div>
  <div class="kopf">
    <div>
      <div class="firma">Ötztaler Verkehrsgesellschaft mbH</div>
      <h1>Dienstplan</h1>
      <div class="wer">${esc(f.name)}${f.anstellung === 'saison' ? ' · ' + esc(f.saisonLabel || 'Saisonfahrer') : ' · Festangestellt'}</div>
    </div>
    <div class="rechts">
      <b>${R.fmtDMY(von)} – ${R.fmtDMY(bis)}</b><br>
      ${stamm ? 'Stamm-Bus: ' + esc(stamm.kennzeichen) + '<br>' : ''}
      Summe 4 Wochen: <b>${R.fmtStd(gesamt)}</b> · Stand: ${R.fmtDMY(R.todayISO())}
    </div>
  </div>
  ${wochenHTML}
  <div class="fuss">
    <span>${ICO.pin} = fixiert &nbsp;·&nbsp; ${ICO.warn} = Regelverstoß (Lenk-/Ruhezeit) &nbsp;·&nbsp; U = Urlaub, K = Krank &nbsp;·&nbsp; „frei" = kein Umlauf zugeteilt</span>
    <span>Einsatzplanungs-Dashboard · Demo-Daten</span>
  </div>
  <script>window.addEventListener('load', function(){ setTimeout(function(){ try { window.print(); } catch(e){} }, 250); });</script>
</body></html>`;
    const win = window.open('', '_blank');
    if (!win){ App.toast('Popup blockiert – bitte Pop-ups für diese Seite erlauben.', 'danger'); return; }
    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  function planClick(ev){
    const pp = ev.target.closest('[data-act="printplan"]');
    if (pp){ ev.stopPropagation(); druckDienstplan(App.state, pp.dataset.id); return; }
    const chip = ev.target.closest('.chip[data-einsatz]');
    if (chip){
      ev.stopPropagation();
      const e = App.state.einsaetze.find(x => x.id === chip.dataset.einsatz);
      if (e) Modals.einsatz(App.state, e);
      return;
    }
    const dayInfo = ev.target.closest('[data-dayinfo]');
    if (dayInfo){ ev.stopPropagation(); App.openDay(dayInfo.dataset.dayinfo); return; }
    const dayHead = ev.target.closest('.pday[data-day]');
    if (dayHead){ App.openDay(dayHead.dataset.day); return; }
    const cell = ev.target.closest('.pcell[data-create]');
    if (cell && ev.target === cell){
      const st = App.state;
      const preset = { datum: cell.dataset.dropdatum };
      if (cell.dataset.drop === 'fahrer') preset.fahrerId = cell.dataset.dropid; else preset.busId = cell.dataset.dropid;
      Modals.einsatz(st, null, preset);
    }
  }

  function fahrerClick(ev){
    const btn = ev.target.closest('[data-act]');
    if (!btn) return;
    const st = App.state;
    const f = R.fahrerById(st, btn.dataset.id);
    if (!f) return;
    if (btn.dataset.act === 'edit') Modals.fahrer(st, f);
    else if (btn.dataset.act === 'abw') Modals.abwesenheiten(st, f.id, btn.dataset.art);
    else if (btn.dataset.act === 'toggle'){
      f.aktiv = !f.aktiv;
      App.nachAenderung(f.name + (f.aktiv ? ' aktiviert' : ' deaktiviert'), true);
    }
    else if (btn.dataset.act === 'del'){
      Modals.confirm('Fahrer löschen', `${esc(f.name)} und alle zugehörigen Abwesenheiten werden entfernt. Bestehende Einsätze werden automatisch neu vergeben.`, 'Löschen', () => {
        st.fahrer = st.fahrer.filter(x => x.id !== f.id);
        st.einsaetze.forEach(e => { if (e.fahrerId === f.id) e.fahrerId = null; });
        App.nachAenderung('Fahrer „' + f.name + '“ gelöscht', true);
      });
    }
  }

  function busClick(ev){
    const btn = ev.target.closest('[data-act]');
    if (!btn) return;
    const st = App.state;
    const b = R.busById(st, btn.dataset.id);
    if (!b) return;
    if (btn.dataset.act === 'edit') Modals.bus(st, b);
    else if (btn.dataset.act === 'wart') Modals.wartungen(st, b.id);
    else if (btn.dataset.act === 'toggle'){
      b.aktiv = !b.aktiv;
      App.nachAenderung(b.kennzeichen + (b.aktiv ? ' aktiviert' : ' deaktiviert'), true);
    }
    else if (btn.dataset.act === 'del'){
      Modals.confirm('Bus löschen', `${esc(b.kennzeichen)} wird entfernt. Bestehende Einsätze werden automatisch auf andere Busse umgebucht.`, 'Löschen', () => {
        st.buses = st.buses.filter(x => x.id !== b.id);
        st.einsaetze.forEach(e => { if (e.busId === b.id) e.busId = null; });
        App.nachAenderung('Bus „' + b.kennzeichen + '“ gelöscht', true);
      });
    }
  }

  function dienstClick(ev){
    const btn = ev.target.closest('[data-act]');
    if (!btn) return;
    const st = App.state;
    const d = R.dienstById(st, btn.dataset.id);
    if (!d) return;
    if (btn.dataset.act === 'edit') Modals.dienst(st, d);
    else if (btn.dataset.act === 'toggle'){
      d.aktiv = !d.aktiv;
      App.nachAenderung('Dienst „' + d.kurz + '“ ' + (d.aktiv ? 'aktiviert' : 'deaktiviert'), true);
    }
    else if (btn.dataset.act === 'del'){
      Modals.confirm('Dienst löschen', `„${esc(d.name)}“ wird entfernt. Alle zugehörigen Einsätze im Planfenster werden gelöscht.`, 'Löschen', () => {
        st.dienste = st.dienste.filter(x => x.id !== d.id);
        App.nachAenderung('Dienst „' + d.kurz + '“ gelöscht', true);
      });
    }
  }

  return { render };
})();
