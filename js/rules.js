/* rules.js — Datums-/Zeit-Utils + gesetzliche Lenk-/Ruhezeit-Prüfung (vereinf. EU 561/2006) */
'use strict';
const Rules = (() => {

  /* ---------- Konstanten (Demo-Vereinfachung) ---------- */
  const LENK_MAX = 540;        // 9 h Tageslenkzeit
  const RUHE_MIN = 660;        // 11 h tägliche Ruhezeit
  const RUHE_REDUIZIERT = 540; // 9 h reduzierte Ruhezeit (hier nicht angewandt, Dokumentation)
  const WOCHEN_MAX = 2400;     // 40 h Wochenarbeitszeit
  const TAGE_MAX = 5;          // 5-Tage-Woche (vertraglich, je Kalenderwoche Mo–So)
  const FOLGETAGE_MAX = 6;     // max. 6 Arbeitstage am Stück (gesetzlich, EU 561/2006)
  const WOCHENRUHE = 2700;     // 45 h wöchentliche Ruhezeit
  const EPOCH = new Date(2000, 0, 1);

  /* ---------- Fahrplan-Zeiträume (frei benennbar, jährlich wiederkehrend als TT.MM.) ---------- */
  function imMmdd(md, von, bis){ return von <= bis ? (md >= von && md <= bis) : (md >= von || md <= bis); }
  function periodeAktiv(p, datum){ return imMmdd(datum.slice(5), p.von, p.bis); }
  function periodeById(st, id){ return (st.perioden || []).find(p => p.id === id) || null; }
  function mdDe(md){ if (!md) return '–'; const [m, d] = md.split('-'); return Number(d) + '.' + Number(m) + '.'; }
  function periodText(p){ return mdDe(p.von) + ' – ' + mdDe(p.bis); }

  /* ---------- Datum ---------- */
  function parseISO(s){ const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); }
  function toISO(d){
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }
  function addDays(s, n){ const d = parseISO(s); d.setDate(d.getDate()+n); return toISO(d); }
  function dowIdx(s){ return (parseISO(s).getDay() + 6) % 7; } // 0=Mo … 6=So
  const DOW = ['Mo','Di','Mi','Do','Fr','Sa','So'];
  function mondayOf(s){ return addDays(s, -dowIdx(s)); }
  function fmtD(s){ return s.slice(8,10) + '.' + s.slice(5,7) + '.'; }
  function fmtDMY(s){ return s.slice(8,10) + '.' + s.slice(5,7) + '.' + s.slice(0,4); }
  function fmtLong(s){
    const d = parseISO(s);
    return DOW[dowIdx(s)] + ', ' + d.getDate() + '.' + (d.getMonth()+1) + '.' + d.getFullYear();
  }
  function isWeekend(s){ const i = dowIdx(s); return i >= 5; }
  function diffDays(a, b){ return Math.round((parseISO(b) - parseISO(a)) / 86400000); }
  function inRange(date, von, bis){ return (!von || date >= von) && (!bis || date <= bis); }
  function todayISO(){ return toISO(new Date()); }
  function dateList(von, bis){ const out = []; for (let s = von; s <= bis; s = addDays(s,1)) out.push(s); return out; }

  /* ---------- Zeit ---------- */
  function mins(t){ const [h,m] = t.split(':').map(Number); return h*60 + m; }
  function hhmm(min){
    min = ((min % 1440) + 1440) % 1440;
    return String(Math.floor(min/60)).padStart(2,'0') + ':' + String(min%60).padStart(2,'0');
  }
  function fmtStd(min){ return (min/60).toLocaleString('de-DE', {maximumFractionDigits:1}) + ' h'; }
  function epochMin(datum, minute){ return diffDays('2000-01-01', datum) * 1440 + minute; }

  /* ---------- Lookups ---------- */
  const busById    = (st, id) => st.buses.find(b => b.id === id) || null;
  const fahrerById = (st, id) => st.fahrer.find(f => f.id === id) || null;
  const dienstById = (st, id) => st.dienste.find(d => d.id === id) || null;

  /* ---------- Fahrplan-Zeiträume: Aktivität ---------- */
  // Ein Dienst gilt an einem Tag, wenn mindestens einer seiner Zeiträume den Tag abdeckt
  function varianteAktiv(st, dienst, datum){
    return (dienst.perioden || []).some(id => {
      const p = periodeById(st, id);
      return p && periodeAktiv(p, datum);
    });
  }
  function aktivePerioden(st, datum){
    return (st.perioden || []).filter(p => periodeAktiv(p, datum));
  }
  function aktiveDienste(st, datum){
    return st.dienste.filter(d =>
      d.aktiv && d.wochentage.includes(dowIdx(datum)) && varianteAktiv(st, d, datum));
  }
  function dienstPeriodenNamen(st, d){
    return (d.perioden || []).map(id => {
      const p = periodeById(st, id);
      return p ? p.name : null;
    }).filter(Boolean).join(', ') || 'kein Zeitraum';
  }

  /* ---------- Verfügbarkeit ---------- */
  function fahrerImZeitraum(f, datum){ return inRange(datum, f.verfuegbarVon, f.verfuegbarBis); }
  function fahrerAbwesend(f, datum){
    return f.urlaub.some(a => inRange(datum, a.von, a.bis)) ? 'Urlaub'
         : f.krank.some(a => inRange(datum, a.von, a.bis)) ? 'Krank' : null;
  }
  function fahrerVerfuegbar(st, f, datum){
    return !!(f && f.aktiv && fahrerImZeitraum(f, datum) && !fahrerAbwesend(f, datum));
  }
  function busWartungAm(b, datum){
    return b.wartungen.find(w => inRange(datum, w.von, w.bis)) || null;
  }
  function busVerfuegbar(st, b, datum){
    return !!(b && b.aktiv && b.status === 'verfuegbar' && !busWartungAm(b, datum));
  }
  function busStatusHeute(b, datum){
    if (!b.aktiv) return { key:'inaktiv', text:'Inaktiv', cls:'' };
    if (b.status === 'reparatur') return { key:'reparatur', text:'Reparatur', cls:'danger' };
    const w = busWartungAm(b, datum);
    if (w) return { key:'wartung', text: w.art === 'reparatur' ? 'In Reparatur (geplant)' : 'In Wartung (geplant)', cls:'warn' };
    if (b.status === 'wartung') return { key:'wartung', text:'Wartung', cls:'warn' };
    return { key:'verfuegbar', text:'Verfügbar', cls:'ok' };
  }
  function qualPasst(f, dienst){
    return f.qual === 'beides' || f.qual === dienst.typ;
  }
  function busTypFuerDienst(d){ return d.typ === 'linie' ? 'linienbus' : 'shuttle'; }

  /* ---------- Intervalle (absolute Minuten) ---------- */
  function dienstIntervall(dienst, datum){
    const s = epochMin(datum, mins(dienst.start));
    return { start: s, end: s + dienst.dauerMin };
  }
  function fahrerIntervalle(st, fid, von, bis){
    const out = [];
    for (const e of st.einsaetze){
      if (e.fahrerId !== fid || e.datum < von || e.datum > bis) continue;
      const d = dienstById(st, e.dienstId);
      if (!d) continue;
      const iv = dienstIntervall(d, e.datum);
      out.push({ ...iv, e, d, datum: e.datum });
    }
    out.sort((a,b) => a.start - b.start);
    return out;
  }

  /* ---------- Wochenruhezeit (45 h) ----------
     Eine Woche (Mo–So) ist erfüllt, wenn eine freie Zeit von ≥ 45 h beginnt,
     die innerhalb der Woche liegt (Montag 00:00 bis Sonntag 24:00). */
  function hatWochenruhe(intervalle, wsISO){
    const ws = epochMin(wsISO, 0);
    const we = ws + 7 * 1440;
    const gaps = [];
    for (let i = 0; i <= intervalle.length; i++){
      const prevEnd = i === 0 ? ws - 4*1440 : intervalle[i-1].end;
      const nextStart = i === intervalle.length ? we + 4*1440 : intervalle[i].start;
      gaps.push([prevEnd, nextStart]);
    }
    return gaps.some(([a, b]) => {
      const s = Math.max(a, ws), e = Math.min(b, we);
      return b - a >= WOCHENRUHE && e - s >= WOCHENRUHE - 1;
    });
  }

  function wochenStd(st, fid, wsISO){
    let sum = 0;
    for (const e of st.einsaetze){
      if (e.fahrerId !== fid || e.datum < wsISO || e.datum > addDays(wsISO, 6)) continue;
      const d = dienstById(st, e.dienstId);
      if (d) sum += d.dauerMin;
    }
    return sum;
  }

  /* ---------- Vollständige Eignungsprüfung (Planer + Drag & Drop) ---------- */
  function fahrerKannDienst(st, f, dienst, datum, ignoreEinsatzId){
    if (!f.aktiv) return { ok:false, reason:'Fahrer ist deaktiviert' };
    if (!fahrerImZeitraum(f, datum)) return { ok:false, reason:'Außerhalb des Verfügbarkeitszeitraums' };
    const abw = fahrerAbwesend(f, datum);
    if (abw) return { ok:false, reason:'Fahrer hat ' + abw.toLowerCase() };
    if (!qualPasst(f, dienst)) return { ok:false, reason:'Fehlende Qualifikation (' + (dienst.typ==='linie'?'Linie':'Shuttle') + ')' };

    const ws = mondayOf(datum), we = addDays(ws, 6);
    const iv = dienstIntervall(dienst, datum);
    let ival = fahrerIntervalle(st, f.id, addDays(ws, -7), addDays(we, 7))
      .filter(x => x.e.id !== ignoreEinsatzId);

    // Tageslenkzeit + Überschneidung am selben Tag
    let lenk = dienst.lenkzeitMin;
    for (const x of ival){
      if (x.datum === datum){
        if (iv.start < x.end && x.start < iv.end)
          return { ok:false, reason:'Zeitliche Überschneidung mit „' + x.d.kurz + '“' };
        lenk += x.d.lenkzeitMin;
      }
    }
    if (lenk > LENK_MAX) return { ok:false, reason:'Tageslenkzeit ' + fmtStd(lenk) + ' > 9 h' };

    // Wochenarbeitszeit + Arbeitstage
    let std = dienst.dauerMin, tage = new Set([datum]);
    for (const x of ival){
      if (x.datum >= ws && x.datum <= we){ std += x.d.dauerMin; tage.add(x.datum); }
    }
    if (std > WOCHEN_MAX) return { ok:false, reason:'Wochenarbeitszeit ' + fmtStd(std) + ' > 40 h' };
    if (tage.size > TAGE_MAX) return { ok:false, reason:'Mehr als 5 Arbeitstage in der Woche' };

    // Tägliche Ruhezeit ≥ 11 h zwischen aufeinanderfolgenden Einsätzen
    const alle = [...ival, { start: iv.start, end: iv.end, e: null, d: dienst, datum }].sort((a,b) => a.start - b.start);
    for (let i = 1; i < alle.length; i++){
      const gap = alle[i].start - alle[i-1].end;
      if (gap < RUHE_MIN)
        return { ok:false, reason:'Ruhezeit nur ' + fmtStd(gap) + ' < 11 h vor „' + alle[i].d.kurz + '“' };
    }

    // Max. 6 Arbeitstage in Folge
    const hasWork = new Set(alle.map(x => x.datum));
    for (let i = -7; i <= 13; i++){
      const dt = addDays(ws, i);
      if (!hasWork.has(dt)) continue;
      let run = 0;
      for (let j = i; hasWork.has(addDays(ws, j)); j--) run++;
      if (run > FOLGETAGE_MAX) return { ok:false, reason:'Mehr als ' + FOLGETAGE_MAX + ' Arbeitstage in Folge (gesetzl. Höchstmaß)' };
    }

    // Wöchentliche Ruhezeit ≥ 45 h
    if (!hatWochenruhe(alle, ws)) return { ok:false, reason:'Keine 45 h Wochenruhezeit in dieser Woche' };

    return { ok:true };
  }

  /* ---------- Konflikte pro Fahrer ---------- */
  function getFahrerKonflikte(st, fid, von, bis){
    const out = [];
    const iv = fahrerIntervalle(st, fid, addDays(von, -7), addDays(bis, 7));

    // Tägliche Lenkzeit
    const proTag = {};
    for (const x of iv) (proTag[x.datum] = proTag[x.datum] || []).push(x);
    for (const [datum, list] of Object.entries(proTag)){
      if (datum < von || datum > bis) continue;
      const lenk = list.reduce((s,x) => s + x.d.lenkzeitMin, 0);
      if (lenk > LENK_MAX){
        const worst = list.reduce((a,b) => a.d.lenkzeitMin > b.d.lenkzeitMin ? a : b);
        out.push({ typ:'lenkzeit', datum, einsatzId: worst.e.id,
          partnerIds: list.filter(x => x.e.id !== worst.e.id).map(x => x.e.id), lvl:'danger',
          msg:'Tageslenkzeit ' + fmtStd(lenk) + ' (max. 9 h)' });
      }
    }
    // Tägliche Ruhezeit
    for (let i = 1; i < iv.length; i++){
      const gap = iv[i].start - iv[i-1].end;
      if (gap < RUHE_MIN && iv[i].datum >= von && iv[i].datum <= bis){
        out.push({ typ:'ruhezeit', datum: iv[i].datum, einsatzId: iv[i].e.id, partnerId: iv[i-1].e.id, lvl:'danger',
          msg:'Ruhezeit nur ' + fmtStd(gap) + ' zwischen „' + iv[i-1].d.kurz + '“ und „' + iv[i].d.kurz + '“ (min. 11 h)' });
      }
    }

    // Wochenregeln je Kalenderwoche im Fenster
    for (let ws = mondayOf(von); ws <= bis; ws = addDays(ws, 7)){
      const we = addDays(ws, 6);
      const wList = iv.filter(x => x.datum >= ws && x.datum <= we);
      if (!wList.length) continue;
      const std = wList.reduce((s,x) => s + x.d.dauerMin, 0);
      if (std > WOCHEN_MAX){
        const worst = wList.reduce((a,b) => a.d.dauerMin > b.d.dauerMin ? a : b);
        out.push({ typ:'wochenstunden', datum: ws, woche: ws, einsatzId: worst.e.id,
          partnerIds: wList.filter(x => x.e.id !== worst.e.id).map(x => x.e.id), lvl:'danger',
          msg:'Wochenarbeitszeit ' + fmtStd(std) + ' > 40 h (KW ab ' + fmtD(ws) + ')' });
      }
      const tage = new Set(wList.map(x => x.datum));
      if (tage.size > TAGE_MAX){
        const worst = wList.reduce((a,b) => a.d.dauerMin > b.d.dauerMin ? a : b);
        out.push({ typ:'arbeitstage', datum: ws, woche: ws, einsatzId: worst.e.id,
          partnerIds: wList.filter(x => x.e.id !== worst.e.id).map(x => x.e.id), lvl:'danger',
          msg: tage.size + ' Arbeitstage in der Woche ab ' + fmtD(ws) + ' (Vertrag: 5-Tage-Woche)' });
      }
      if (!hatWochenruhe(wList, ws)){
        const worst = wList.reduce((a,b) => a.d.dauerMin > b.d.dauerMin ? a : b);
        out.push({ typ:'wochenruhe', datum: ws, woche: ws, einsatzId: worst.e.id,
          partnerIds: wList.filter(x => x.e.id !== worst.e.id).map(x => x.e.id), lvl:'danger',
          msg:'Keine 45 h Wochenruhezeit in der Woche ab ' + fmtD(ws) });
      }
    }

    // Arbeitstage in Folge
    const hasWork = new Set(iv.map(x => x.datum));
    for (const dt of hasWork){
      if (dt < von || dt > bis) continue;
      let run = 0;
      for (let j = 0; hasWork.has(addDays(dt, -j)); j++) run++;
      if (run > FOLGETAGE_MAX){
        const ivDt = iv.find(x => x.datum === dt);
        out.push({ typ:'folgetage', datum: dt, einsatzId: ivDt ? ivDt.e.id : null, lvl:'danger',
          msg: run + ' Arbeitstage in Folge bis ' + fmtD(dt) + ' (max. 6 gem. EU 561/2006)' });
      }
    }
    return out;
  }

  /* ---------- Konflikte pro Bus ---------- */
  function getBusKonflikte(st, bid, von, bis){
    const out = [];
    const b = busById(st, bid);
    if (!b) return out;
    for (const e of st.einsaetze){
      if (e.busId !== bid || e.datum < von || e.datum > bis) continue;
      const w = busWartungAm(b, e.datum);
      if (b.status === 'reparatur'){
        out.push({ typ:'busstatus', datum: e.datum, einsatzId: e.id, lvl:'danger', msg:'Bus ist in Reparatur' });
      } else if (b.status === 'wartung'){
        out.push({ typ:'busstatus', datum: e.datum, einsatzId: e.id, lvl:'danger', msg:'Bus ist in Wartung' });
      } else if (w){
        out.push({ typ:'buswartung', datum: e.datum, einsatzId: e.id, lvl:'danger',
          msg:'Bus steht wegen ' + (w.art==='reparatur'?'Reparatur':'Wartung') + ' nicht zur Verfügung (' + fmtD(w.von) + '–' + fmtD(w.bis) + ')' });
      }
    }
    // Doppelbelegung
    const proTag = {};
    for (const e of st.einsaetze){
      if (e.busId === bid && e.datum >= von && e.datum <= bis) (proTag[e.datum] = proTag[e.datum] || []).push(e);
    }
    for (const [datum, list] of Object.entries(proTag)){
      if (list.length > 1){
        for (const e of list.slice(1))
          out.push({ typ:'doppelt', datum, einsatzId: e.id, lvl:'danger', msg:'Bus doppelt belegt an diesem Tag' });
      }
    }
    return out;
  }

  /* ---------- Alle Konflikte ---------- */
  function alleKonflikte(st, von, bis){
    const list = [];
    for (const f of st.fahrer) list.push(...getFahrerKonflikte(st, f.id, von, bis));
    for (const b of st.buses) list.push(...getBusKonflikte(st, b.id, von, bis));
    const byEinsatz = new Map();
    for (const k of list) if (k.einsatzId){
      if (!byEinsatz.has(k.einsatzId)) byEinsatz.set(k.einsatzId, []);
      byEinsatz.get(k.einsatzId).push(k);
    }
    return { list, byEinsatz };
  }
  const KONF_TITEL = {
    lenkzeit:'Lenkzeit', ruhezeit:'Ruhezeit', wochenstunden:'Wochenarbeitszeit',
    arbeitstage:'Arbeitstage', folgetage:'Folgetage', wochenruhe:'Wochenruhezeit',
    buswartung:'Buswartung', busstatus:'Busstatus', doppelt:'Doppelbelegung'
  };

  return {
    LENK_MAX, RUHE_MIN, WOCHEN_MAX, TAGE_MAX, FOLGETAGE_MAX, WOCHENRUHE,
    parseISO, toISO, addDays, dowIdx, DOW, mondayOf, fmtD, fmtDMY, fmtLong, isWeekend,
    diffDays, inRange, todayISO, dateList,
    mins, hhmm, fmtStd, epochMin,
    busById, fahrerById, dienstById,
    periodText, mdDe, imMmdd, periodeAktiv, periodeById,
    varianteAktiv, aktivePerioden, aktiveDienste, dienstPeriodenNamen,
    fahrerImZeitraum, fahrerAbwesend, fahrerVerfuegbar, busWartungAm, busVerfuegbar, busStatusHeute,
    qualPasst, busTypFuerDienst, dienstIntervall, fahrerIntervalle, hatWochenruhe, wochenStd,
    fahrerKannDienst, getFahrerKonflikte, getBusKonflikte, alleKonflikte, KONF_TITEL
  };
})();
