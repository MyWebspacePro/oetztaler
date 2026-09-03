/* dnd.js — Drag & Drop
   Quellen: Einsatz-Chip (Ressourcen-Matrix) · Fahrer-Zeile · Bus-Zeile (Dashboard-Sidebar)
   Ziele:   Matrix-Zellen (Fahrer-/Bus-Wechsel) · Tour-Zellen im Dashboard (Zuweisung) */
'use strict';
const DnD = (() => {
  let drag = null; // {typ:'einsatz'|'fahrer'|'bus', id}
  const cache = new Map();

  const clearMarks = () => document.querySelectorAll('.pcell.drop-ok, .pcell.drop-no')
    .forEach(c => c.classList.remove('drop-ok', 'drop-no'));

  /* ---------- Validierung ---------- */
  function validate(ziel){
    const key = drag.typ + '|' + drag.id + '|' + ziel.key;
    if (cache.has(key)) return cache.get(key);
    let res;
    if (drag.typ === 'einsatz') res = validateChipMove(ziel, drag.id);
    else res = App.kannZuweisen(drag.typ, drag.id, ziel.dienstId, ziel.datum);
    cache.set(key, res);
    return res;
  }

  function validateChipMove(ziel, dragId){
    const st = App.state;
    const e = st.einsaetze.find(x => x.id === dragId);
    if (!e) return { ok:false, reason:'Unbekannter Einsatz' };
    const d = Rules.dienstById(st, e.dienstId);
    const samePlace = (e.datum === ziel.datum) &&
      ((ziel.grid === 'fahrer' && e.fahrerId === ziel.id) || (ziel.grid === 'bus' && e.busId === ziel.id));
    if (samePlace) return { ok:true, noop:true };
    if (ziel.grid === 'fahrer'){
      const f = Rules.fahrerById(st, ziel.id);
      if (!f || !f.aktiv) return { ok:false, reason:'Fahrer ist deaktiviert' };
      return Rules.fahrerKannDienst(st, f, d, ziel.datum, e.id);
    }
    const b = Rules.busById(st, ziel.id);
    if (!b) return { ok:false, reason:'Bus unbekannt' };
    if (!b.aktiv) return { ok:false, reason:'Bus ist deaktiviert' };
    if (Rules.busTypFuerDienst(d) !== b.typ) return { ok:false, reason:'Bus-Typ passt nicht (Linien-/Shuttle-Dienst)' };
    if (!Rules.busVerfuegbar(st, b, ziel.datum)) return { ok:false, reason:'Bus steht an diesem Tag nicht zur Verfügung (Reparatur/Wartung)' };
    if (st.einsaetze.some(x => x.busId === b.id && x.datum === ziel.datum && x.id !== e.id)) return { ok:false, reason:'Bus ist an diesem Tag bereits im Einsatz' };
    return { ok:true };
  }

  /* ---------- Init ---------- */
  function init(){
    document.addEventListener('dragstart', ev => {
      const t = ev.target;
      if (!t.closest) return;
      const chip = t.closest('.chip[data-einsatz]');
      const frow = t.closest('[data-fdrag]');
      const brow = t.closest('[data-bdrag]');
      if (chip){
        drag = { typ:'einsatz', id:chip.dataset.einsatz };
        chip.classList.add('dragging');
        ev.dataTransfer.effectAllowed = 'move';
      } else if (frow){
        drag = { typ:'fahrer', id:frow.dataset.fdrag };
        frow.classList.add('dragging');
        ev.dataTransfer.effectAllowed = 'copy';
      } else if (brow){
        drag = { typ:'bus', id:brow.dataset.bdrag };
        brow.classList.add('dragging');
        ev.dataTransfer.effectAllowed = 'copy';
      } else return;
      ev.dataTransfer.setData('text/plain', drag.id);
    });

    document.addEventListener('dragend', () => {
      document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
      clearMarks();
      drag = null;
      cache.clear();
    });

    const view = document.getElementById('view');
    view.addEventListener('dragover', ev => {
      if (!drag) return;
      const t = ev.target;
      if (!t.closest) return;
      const matrix = t.closest('.pcell[data-drop]');
      const tour = t.closest('.pcell[data-tourdrop]');
      let ziel = null, zelle = null;
      if (matrix && drag.typ === 'einsatz'){
        zelle = matrix;
        ziel = { key:'m|' + matrix.dataset.drop + '|' + matrix.dataset.dropid + '|' + matrix.dataset.dropdatum,
                 grid:matrix.dataset.drop, id:matrix.dataset.dropid, datum:matrix.dataset.dropdatum };
      } else if (tour && drag.typ !== 'einsatz'){
        zelle = tour;
        ziel = { key:'t|' + tour.dataset.dienstid + '|' + tour.dataset.tourdatum,
                 dienstId:tour.dataset.dienstid, datum:tour.dataset.tourdatum };
      }
      if (!zelle) return;
      ev.preventDefault();
      ev.dataTransfer.dropEffect = drag.typ === 'einsatz' ? 'move' : 'copy';
      clearMarks();
      const v = validate(ziel);
      zelle.classList.add(v.ok ? 'drop-ok' : 'drop-no');
    });
    view.addEventListener('dragleave', ev => {
      const zelle = ev.target.closest && ev.target.closest('.pcell');
      if (zelle) zelle.classList.remove('drop-ok', 'drop-no');
    });
    view.addEventListener('drop', ev => {
      if (!drag) return;
      const t = ev.target;
      if (!t.closest) return;
      const matrix = t.closest('.pcell[data-drop]');
      const tour = t.closest('.pcell[data-tourdrop]');
      const cur = drag;
      clearMarks();
      drag = null;
      cache.clear();
      ev.preventDefault();
      if (matrix && cur.typ === 'einsatz'){
        const ziel = { grid:matrix.dataset.drop, id:matrix.dataset.dropid, datum:matrix.dataset.dropdatum };
        const v = validateChipMove(ziel, cur.id);
        if (v.noop) return;
        if (!v.ok){ App.toast('Zuteilung nicht möglich: ' + v.reason, 'danger'); return; }
        App.moveEinsatz(cur.id, ziel);
      } else if (tour && cur.typ !== 'einsatz'){
        App.assignRessource(cur.typ, cur.id, tour.dataset.dienstid, tour.dataset.tourdatum);
      }
    });
  }

  return { init };
})();
