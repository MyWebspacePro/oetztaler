/* planner.js — automatische Einsatzplanung, Nachplanung, Optimierer, Ersatzfahrer */
'use strict';
const Planner = (() => {
  const R = Rules;

  const nextId = st => 'e' + (++st.seq);
  function einsatzByDienstDatum(st, dienstId, datum){
    return st.einsaetze.find(e => e.dienstId === dienstId && e.datum === datum) || null;
  }

  /* ---------- Auswahlpools ---------- */
  function busKandidaten(st, dienst, datum, von, bis){
    const wanted = R.busTypFuerDienst(dienst);
    return st.buses
      .filter(b => b.typ === wanted && R.busVerfuegbar(st, b, datum) && !busAusgeschlossen(st, b.id, dienst.id, datum))
      .filter(b => !st.einsaetze.some(e => e.busId === b.id && e.datum === datum && e.id !== undefined))
      .sort((a, b) => nutzung(st, a.id, von, bis) - nutzung(st, b.id, von, bis) || a.id.localeCompare(b.id, undefined, {numeric:true}));
  }
  function nutzung(st, busId, von, bis){
    return st.einsaetze.filter(e => e.busId === busId && e.datum >= von && e.datum <= bis).length;
  }

  // Ausschluss-Merker: Nutzer hat die Ressource für diesen Umlauf/Tag gestrichen –
  // die Automatik wählt sie nicht wieder, eine MANUELLE Zuweisung übersteuert sie (assignRessource).
  function fahrerAusgeschlossen(st, fid, dienstId, datum){
    return !!(st.ausschluss && st.ausschluss['f:' + fid + '|' + dienstId + '|' + datum]);
  }
  function busAusgeschlossen(st, bid, dienstId, datum){
    return !!(st.ausschluss && st.ausschluss['b:' + bid + '|' + dienstId + '|' + datum]);
  }

  function fahrerKandidaten(st, dienst, datum){
    const ws = R.mondayOf(datum);
    const gestern = R.addDays(datum, -1);
    const fuhrGestern = f => st.einsaetze.some(e => e.fahrerId === f.id && e.datum === gestern);
    // Fahrer sollen kompakte Blöcke fahren (5-Tage-Woche, nicht 1 Tag an / 1 Tag aus):
    // 1) volle Woche zuerst (Stunden absteigend), 2) Blockfortsetzung (fuhr gestern), 3) fair nach ID
    return st.fahrer
      .filter(f => R.fahrerKannDienst(st, f, dienst, datum).ok && !fahrerAusgeschlossen(st, f.id, dienst.id, datum))
      .sort((a, b) =>
        R.wochenStd(st, b.id, ws) - R.wochenStd(st, a.id, ws) ||
        (fuhrGestern(b) ? 1 : 0) - (fuhrGestern(a) ? 1 : 0) ||
        fensterTage(st, b.id, datum) - fensterTage(st, a.id, datum) ||
        a.id.localeCompare(b.id, undefined, {numeric:true}));
  }
  function fensterTage(st, fid, ref){
    const ws = R.mondayOf(ref), we = R.addDays(ws, 6);
    return st.einsaetze.filter(e => e.fahrerId === fid && e.datum >= ws && e.datum <= we).length;
  }

  function beschrEinsatz(st, e){ // Kurztext für Reports
    const d = R.dienstById(st, e.dienstId);
    const f = e.fahrerId ? R.fahrerById(st, e.fahrerId) : null;
    const b = e.busId ? R.busById(st, e.busId) : null;
    return '„' + (d ? d.kurz : '?') + '“ ' + R.fmtD(e.datum) +
      (f ? ' · ' + f.name : ' · ohne Fahrer') + (b ? ' · ' + b.kennzeichen : '');
  }

  function pickBusFuer(st, dienst, datum, von, bis, fahrerId){
    const kand = busKandidaten(st, dienst, datum, von, bis);
    if (fahrerId){
      const f = R.fahrerById(st, fahrerId);
      const stamm = f && f.stammBusId && kand.find(b => b.id === f.stammBusId);
      if (stamm) return stamm; // Stamm-Bus, solange verfügbar (bei Wartung/Reparatur automatisch Ersatz)
    }
    return kand[0] || null;
  }

  /* ---------- Erstplanung (idempotent) ---------- */
  // Nur für freigegebene Tage (dispoFrei); neue Wochen bleiben leer bis „⚡ Autodispo".
  // Bewusst gelöschte Einsätze (weg-Merker) werden nicht wiederbelebt.
  function generate(st, von, bis){
    for (const datum of R.dateList(von, bis)){
      if (st.dispoFrei && !st.dispoFrei[datum]) continue;
      const dienste = R.aktiveDienste(st, datum).slice().sort((a,b) => R.mins(a.start) - R.mins(b.start));
      for (const d of dienste){
        if (einsatzByDienstDatum(st, d.id, datum)) continue;
        if (st.weg && st.weg[d.id + '|' + datum]) continue;
        const fahrer = fahrerKandidaten(st, d, datum)[0] || null;
        const bus = pickBusFuer(st, d, datum, von, bis, fahrer && fahrer.id);
        st.einsaetze.push({ id: nextId(st), dienstId: d.id, datum, fahrerId: fahrer && fahrer.id, busId: bus && bus.id, quelle:'auto' });
      }
    }
  }

  /* ---------- Nachplanung nach jeder Änderung ---------- */
  function replan(st, von, bis){
    const changed = [], removed = [];

    // 1) Einsätze entfernen, deren Dienst nicht (mehr) gilt
    st.einsaetze = st.einsaetze.filter(e => {
      if (e.datum < von || e.datum > bis) return true;
      const d = R.dienstById(st, e.dienstId);
      const gilt = d && d.aktiv && R.varianteAktiv(st, d, e.datum) && d.wochentage.includes(R.dowIdx(e.datum));
      if (!gilt){
        removed.push(beschrEinsatz(st, e) + ' entfernt (Dienst gilt nicht mehr)');
        return false;
      }
      return true;
    });

    // 2) Zuteilungen aufheben, deren Ressource nicht mehr zur Verfügung steht
    for (const e of st.einsaetze){
      if (e.datum < von || e.datum > bis) continue;
      if (e.fahrerId){
        const f = R.fahrerById(st, e.fahrerId);
        if (!f || !R.fahrerVerfuegbar(st, f, e.datum)){
          e.fahrerId = null;
          e.halboffen = false; // halbe manuelle Zuweisung ist dahin – Selbstheilung wieder aktiv
          changed.push(beschrEinsatz(st, e) + ': Fahrerzuweisung aufgehoben');
        }
      }
      if (e.busId){
        const b = R.busById(st, e.busId);
        if (!b || !R.busVerfuegbar(st, b, e.datum)){
          e.busId = null;
          e.halboffen = false; // inkl. automatischer Ersatz-Beschaffung (wie bisher)
          changed.push(beschrEinsatz(st, e) + ': Buszuweisung aufgehoben');
        }
      }
    }

    // 3) Offene Zuweisungen automatisch füllen
    const alle = st.einsaetze
      .filter(e => e.datum >= von && e.datum <= bis)
      .sort((a,b) => a.datum.localeCompare(b.datum) ||
        R.mins((R.dienstById(st, a.dienstId) || {start:'00:00'}).start) -
        R.mins((R.dienstById(st, b.dienstId) || {start:'00:00'}).start));
    for (const e of alle){
      if (!st.dispoFrei || !st.dispoFrei[e.datum]) continue; // nicht freigegebene Wochen bleiben manuell
      if (e.halboffen) continue; // Nutzer zieht Fahrer/Bus einzeln – nichts auto-ergänzen
      const d = R.dienstById(st, e.dienstId);
      if (!d) continue;
      if (!e.fahrerId){
        const kand = fahrerKandidaten(st, d, e.datum);
        if (kand.length){
          e.fahrerId = kand[0].id;
          changed.push('„' + d.kurz + '“ ' + R.fmtD(e.datum) + ': ' + kand[0].name + ' übernimmt');
        }
      }
      if (!e.busId){
        const bkand = pickBusFuer(st, d, e.datum, von, bis, e.fahrerId);
        if (bkand){
          e.busId = bkand.id;
          changed.push('„' + d.kurz + '“ ' + R.fmtD(e.datum) + ': Bus ' + bkand.kennzeichen + ' zugeteilt');
        }
      }
    }

    // 4) Automatisch vergebene Einsätze mit Regelverstoß umbuchen
    fixKonflikte(st, von, bis, false, changed);

    // 5) Ersatzfahrer neu bestimmen
    recomputeErsatz(st, von, bis);

    const offen = st.einsaetze.filter(e => e.datum >= von && e.datum <= bis && (!e.fahrerId || !e.busId) && !e.halboffen).length;
    return { changed, removed, offen };
  }

  /* ---------- Optimierer ---------- */
  function optimize(st, von, bis){
    const changed = [];

    // 1) Offene Einsätze füllen
    replanSchrittFuellen(st, von, bis, changed);

    // 2) Alle Regelverstöße beheben (auch manuelle Zuweisungen)
    fixKonflikte(st, von, bis, true, changed);

    // 3) Wochenstunden ausbalancieren: von überladen zu unterversorgt
    balance(st, von, bis, changed);

    recomputeErsatz(st, von, bis);
    const rest = R.alleKonflikte(st, von, bis);
    const offen = st.einsaetze.filter(e => e.datum >= von && e.datum <= bis && (!e.fahrerId || !e.busId)).length;
    return { changed, konflikte: rest.list, offen };
  }

  function replanSchrittFuellen(st, von, bis, changed){
    const alle = st.einsaetze
      .filter(e => e.datum >= von && e.datum <= bis && (!e.fahrerId || !e.busId))
      .filter(e => st.dispoFrei && st.dispoFrei[e.datum]) // nur freigegebene Tage auto-füllen
      .sort((a,b) => a.datum.localeCompare(b.datum));
    for (const e of alle){
      const d = R.dienstById(st, e.dienstId);
      if (!d) continue;
      if (!e.fahrerId){
        const kand = fahrerKandidaten(st, d, e.datum);
        if (kand.length){ e.fahrerId = kand[0].id; changed.push('„' + d.kurz + '“ ' + R.fmtD(e.datum) + ': ' + kand[0].name + ' übernimmt'); }
      }
      if (!e.busId){
        const bkand = pickBusFuer(st, d, e.datum, von, bis, e.fahrerId);
        if (bkand){ e.busId = bkand.id; changed.push('„' + d.kurz + '“ ' + R.fmtD(e.datum) + ': Bus ' + bkand.kennzeichen + ' zugeteilt'); }
      }
      e.halboffen = false; // Optimierer/Autodispo füllen vollständig
    }
  }

  const beweglich = e => !e.fixiert && (!e.quelle || e.quelle === 'auto' || e.quelle === 'manuell');
  // beweglichFuer: Optimierer (auchManuell) darf manuelle umbuchen – fixierte (📌) nie.
  // Bei fixierten Konflikt-Einsätzen wird stattdessen der beteiligte Partner umorganisiert.
  function fixKonflikte(st, von, bis, auchManuell, changed){
    const konf = R.alleKonflikte(st, von, bis);
    for (const [id, kliste] of konf.byEinsatz){
      const prim = st.einsaetze.find(x => x.id === id);
      if (!prim || prim.datum < von || prim.datum > bis) continue;
      if (!st.dispoFrei || !st.dispoFrei[prim.datum]) continue; // nicht freigegebene Wochen: keine automatische Umorganisation
      const arten = kliste.map(k => k.typ);
      const fahrerProblem = arten.some(a => ['lenkzeit','ruhezeit','wochenstunden','arbeitstage','folgetage','wochenruhe'].includes(a));
      const busProblem = arten.some(a => ['buswartung','busstatus','doppelt'].includes(a));

      // Was darf bewegt werden, um diesen Konflikt zu lösen?
      const bewegliche = [];
      if (auchManuell ? beweglich(prim) : prim.quelle !== 'manuell') bewegliche.push(prim);
      for (const k of kliste){
        for (const pid of [...(k.partnerIds || []), ...(k.partnerId ? [k.partnerId] : [])]){
          if (pid === id) continue;
          const pe = st.einsaetze.find(x => x.id === pid);
          if (!pe || pe.datum < von || pe.datum > bis || bewegliche.includes(pe)) continue;
          if (auchManuell ? beweglich(pe) : pe.quelle !== 'manuell') bewegliche.push(pe);
        }
      }
      if (!bewegliche.length) continue;

      for (const ziel of bewegliche){
        const d = R.dienstById(st, ziel.dienstId);
        if (!d) continue;
        if (fahrerProblem){
          const kand = fahrerKandidaten(st, d, ziel.datum).filter(f => f.id !== ziel.fahrerId);
          const alter = ziel.fahrerId;
          ziel.fahrerId = null;
          for (const f of kand){
            if (R.fahrerKannDienst(st, f, d, ziel.datum, ziel.id).ok){
              ziel.fahrerId = f.id;
              changed.push('„' + d.kurz + '“ ' + R.fmtD(ziel.datum) + ': ' + f.name + ' übernimmt (Konflikt behoben)');
              break;
            }
          }
          if (!ziel.fahrerId) ziel.fahrerId = alter;
        }
        if (busProblem){
          const alterB = ziel.busId;
          ziel.busId = null;
          const b = pickBusFuer(st, d, ziel.datum, von, bis, ziel.fahrerId);
          if (b && !st.einsaetze.some(x => x.busId === b.id && x.datum === ziel.datum && x.id !== ziel.id)){
            ziel.busId = b.id;
            changed.push('„' + d.kurz + '“ ' + R.fmtD(ziel.datum) + ': Bus ' + b.kennzeichen + ' übernimmt (Konflikt behoben)');
          }
          if (!ziel.busId) ziel.busId = alterB;
        }
      }
    }
  }

  function balance(st, von, bis, changed){
    const fahrer = st.fahrer.filter(f => f.aktiv);
    for (let ws = R.mondayOf(von); ws <= bis; ws = R.addDays(ws, 7)){
      const we = R.addDays(ws, 6);
      const last = st.einsaetze.filter(e => e.datum >= ws && e.datum <= we && st.dispoFrei && st.dispoFrei[e.datum]);
      const std = id => R.wochenStd(st, id, ws);
      const heavy = fahrer.filter(f => std(f.id) > 2400)
        .sort((a,b) => std(b.id) - std(a.id));
      for (const h of heavy){
        const eins = last.filter(e => e.fahrerId === h.id).sort((a,b) => {
          const da = R.dienstById(st, a.dienstId), db = R.dienstById(st, b.dienstId);
          return (da ? da.dauerMin : 0) - (db ? db.dauerMin : 0);
        });
        for (const e of eins){
          const d = R.dienstById(st, e.dienstId);
          if (!d) continue;
          const kand = fahrerKandidaten(st, d, e.datum).filter(f => f.id !== h.id && R.wochenStd(st, f.id, ws) < std(h.id) - 120);
          if (!kand.length) continue;
          const ziel = kand[kand.length - 1];
          e.fahrerId = ziel.id;
          changed.push('„' + d.kurz + '“ ' + R.fmtD(e.datum) + ': ' + h.name + ' → ' + ziel.name + ' (Ausgleich)');
          break;
        }
      }
    }
  }

  /* ---------- Ersatzfahrer (2 pro Tag) ---------- */
  function recomputeErsatz(st, von, bis){
    st.ersatz = {};
    for (const datum of R.dateList(von, bis)){
      const kand = st.fahrer
        .filter(f => R.fahrerVerfuegbar(st, f, datum))
        .filter(f => !st.einsaetze.some(e => e.fahrerId === f.id && e.datum === datum))
        .sort((a, b) => {
          const restedA = st.einsaetze.some(e => e.fahrerId === a.id && e.datum === R.addDays(datum, -1)) ? 1 : 0;
          const restedB = st.einsaetze.some(e => e.fahrerId === b.id && e.datum === R.addDays(datum, -1)) ? 1 : 0;
          return restedA - restedB ||
                 (a.anstellung === 'fest' ? 0 : 1) - (b.anstellung === 'fest' ? 0 : 1) ||
                 (a.qual === 'beides' ? 0 : 1) - (b.qual === 'beides' ? 0 : 1) ||
                 R.wochenStd(st, a.id, R.mondayOf(datum)) - R.wochenStd(st, b.id, R.mondayOf(datum)) ||
                 a.id.localeCompare(b.id, undefined, {numeric:true});
        })
        .slice(0, 2);
      st.ersatz[datum] = kand.map(f => f.id);
    }
  }
  function ersatzFuer(st, datum){ return st.ersatz[datum] || []; }

  /* ---------- Demo-Konflikte für den Erststart ---------- */
  // Hilfsfunktion: längster zusammenhängender Arbeitsblock um ein Datum
  // (bis zu 6 Tage am Stück sind gem. EU 561/2006 zulässig)
  function laeuftLaengerAlsErlaubt(st, fid, umDatum){
    const tage = new Set(st.einsaetze.filter(e => e.fahrerId === fid &&
      e.datum >= R.addDays(umDatum, -9) && e.datum <= R.addDays(umDatum, 9)).map(e => e.datum));
    let max = 0;
    for (const d of tage){
      let run = 0;
      for (let j = 0; tage.has(R.addDays(d, -j)); j++) run++;
      max = Math.max(max, run);
    }
    return max > R.FOLGETAGE_MAX;
  }

  function seedDemoKonflikte(st, von, bis){
    const imFenster = st.einsaetze.filter(e => e.datum >= von && e.datum <= bis);
    const dienstVon = e => { const d = R.dienstById(st, e.dienstId); return d ? R.mins(d.start) : 0; };

    // 1) Ruhezeit-Konflikt: Spätdienst-Fahrer bekommt am Folgetag zusätzlich einen Frühdienst
    outer1:
    for (const e2 of imFenster){
      const d2 = R.dienstById(st, e2.dienstId);
      if (!d2 || R.mins(d2.start) > 390) continue;               // Frühdienst
      for (const e1 of imFenster){
        if (e1.datum !== R.addDays(e2.datum, -1)) continue;
        if (!e1.fahrerId || e1.fahrerId === e2.fahrerId) continue;
        const d1 = R.dienstById(st, e1.dienstId);
        if (!d1 || R.mins(d1.start) < 825) continue;             // ab 13:45 (Spätdienst)
        if (d1.typ !== d2.typ) continue;                          // Qualifikation muss passen
        if (st.einsaetze.some(z => z.fahrerId === e2.fahrerId && z.datum === e1.datum)) continue;
        const alt = e1.fahrerId;
        e1.fahrerId = e2.fahrerId;
        if (laeuftLaengerAlsErlaubt(st, e2.fahrerId, e1.datum)){
          e1.fahrerId = alt;                                      // gesetzl. Limit (6 Tage) nicht überschreiten
          continue;
        }
        e1.quelle = 'manuell';
        break outer1;
      }
    }

    // 2) Lenkzeit-Konflikt: zwei nicht überlappende Dienste an einem Tag auf einen Fahrer
    outer2:
    for (const datum of R.dateList(von, bis)){
      const list = imFenster.filter(e => e.datum === datum && e.fahrerId)
        .sort((a,b) => dienstVon(a) - dienstVon(b));
      for (let i = 0; i < list.length; i++){
        for (let j = list.length - 1; j > i; j--){
          const d1 = R.dienstById(st, list[i].dienstId), d2 = R.dienstById(st, list[j].dienstId);
          if (!d1 || !d2 || list[i].fahrerId === list[j].fahrerId) continue;
          const iv1 = R.dienstIntervall(d1, datum), iv2 = R.dienstIntervall(d2, datum);
          const lenk = d1.lenkzeitMin + d2.lenkzeitMin;
          if (iv1.end <= iv2.start && lenk > R.LENK_MAX &&
              R.fahrerKannDienst(st, R.fahrerById(st, list[i].fahrerId), d2, datum, list[j].id).reason.includes('Tageslenkzeit')){
            list[j].fahrerId = list[i].fahrerId;
            list[j].quelle = 'manuell';
            break outer2;
          }
        }
      }
    }

    // 3) Zwei offene Einsätze (ohne Fahrer) als Optimierungs-Aufgabe
    const kandidaten = imFenster
      .filter(e => e.fahrerId && e.quelle === 'auto')
      .sort((a,b) => dienstVon(b) - dienstVon(a))
      .slice(0, 2);
    for (const e of kandidaten) e.fahrerId = null;
  }

  /* ---------- Fenster für Autodispo freigeben ---------- */
  function freigeben(st, von, bis){
    st.dispoFrei = st.dispoFrei || {};
    for (const d of R.dateList(von, bis)) st.dispoFrei[d] = true;
  }

  return { generate, replan, optimize, recomputeErsatz, ersatzFuer, seedDemoKonflikte, freigeben,
           fahrerKandidaten, busKandidaten, einsatzByDienstDatum, beschrEinsatz };
})();
