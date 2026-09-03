/* modals.js — Dialoge und CRUD-Formulare */
'use strict';
const Modals = (() => {
  const R = Rules;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  /* ---------- Grundgerüst ---------- */
  function open({ title, bodyHTML, onSave, saveLabel = 'Speichern', danger = false, extraFooter = '', wide = false }){
    const root = document.getElementById('modal-root');
    root.innerHTML = '';
    const bd = document.createElement('div');
    bd.className = 'modal-backdrop';
    bd.innerHTML = `
      <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
        <header><h3>${esc(title)}</h3><button class="close" title="Schließen">✕</button></header>
        <div class="mbody">${bodyHTML}</div>
        <footer>
          ${extraFooter}
          <button class="btn ghost cancel">Abbrechen</button>
          <button class="btn ${danger ? 'danger' : 'primary'} save">${esc(saveLabel)}</button>
        </footer>
      </div>`;
    root.appendChild(bd);
    const modal = bd.querySelector('.modal');
    const errEl = modal.querySelector('.formerror') || (() => {
      const el = document.createElement('div');
      el.className = 'formerror';
      modal.querySelector('.mbody').appendChild(el);
      return el;
    })();
    function close(){ closePicker(); root.innerHTML = ''; }
    bd.addEventListener('mousedown', ev => { if (ev.target === bd) close(); });
    modal.querySelector('.close').onclick = close;
    modal.querySelector('.cancel').onclick = close;
    wireDateFields(modal.querySelector('.mbody'));
    modal.querySelector('.save').onclick = () => {
      const res = onSave(modal.querySelector('.mbody'), errEl, modal);
      if (typeof res === 'string' && res){
        errEl.textContent = res;
        errEl.classList.add('show');
      } else if (res !== false){
        close();
      }
    };
    document.addEventListener('keydown', function escKey(ev){
      if (ev.key === 'Escape'){ close(); document.removeEventListener('keydown', escKey); }
    });
    const first = modal.querySelector('.mbody input, .mbody select');
    if (first) first.focus();
    return { close, modal };
  }

  function confirm(title, text, okLabel, onOk){
    open({
      title, bodyHTML: `<p style="margin:0;font-size:13.5px">${text}</p>`,
      saveLabel: okLabel || 'Löschen', danger:true,
      onSave: () => { onOk(); }
    });
  }

  function report(title, html){
    open({ title, bodyHTML: html, saveLabel:'Schließen',
      onSave: () => true, wide:true });
  }

  const sel = (id, opts, val) => `<select id="${id}">${opts.map(([v, t]) =>
    `<option value="${esc(v)}" ${v === val ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;

  /* ---------- Deutsche Datumseingabe (TT.MM.JJJJ) mit Mini-Kalender ---------- */
  const MONATE = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
  function isoToDe(iso){ return iso ? iso.slice(8,10) + '.' + iso.slice(5,7) + '.' + iso.slice(0,4) : ''; }
  function deToIso(de){
    const m = String(de || '').trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (!m) return null;
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    if (d.getFullYear() !== Number(m[3]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[1])) return null;
    return m[3] + '-' + m[2].padStart(2,'0') + '-' + m[1].padStart(2,'0');
  }
  function dateFieldHTML(idOrClass, iso){
    const attr = idOrClass.startsWith('#') ? 'id="' + idOrClass.slice(1) + '"' : 'class="dateinput ' + idOrClass + '"';
    const m = idOrClass.match(/^(?:#)?(.+)-(von|bis)$/);
    const pairAttr = m ? ` data-pair="${esc(m[1])}" data-role="${m[2]}"` : '';
    return `<div class="datefield"${m ? ` data-pair="${esc(m[1])}"` : ''}><input type="text" inputmode="numeric" autocomplete="off" placeholder="TT.MM.JJJJ" ${attr}${pairAttr} value="${isoToDe(iso)}"><button type="button" class="calbtn" tabindex="-1" title="Kalender öffnen">📅</button></div>`;
  }
  let dpEl = null, dpOutside = null;
  function closePicker(){
    if (dpEl){ dpEl.remove(); dpEl = null; }
    if (dpOutside){ document.removeEventListener('mousedown', dpOutside); dpOutside = null; }
  }
  function openPicker(anchor, input){
    closePicker();
    dpEl = document.createElement('div');
    dpEl.className = 'datepicker';
    document.body.appendChild(dpEl);
    const cur = deToIso(input.value) || R.todayISO();
    const d = R.parseISO(cur);
    drawPicker(d.getFullYear(), d.getMonth(), input);
    const r = anchor.getBoundingClientRect();
    dpEl.style.visibility = 'hidden';
    requestAnimationFrame(() => {
      const w = dpEl.offsetWidth, h = dpEl.offsetHeight;
      dpEl.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
      dpEl.style.top = (r.bottom + h > window.innerHeight ? Math.max(8, r.top - h - 6) : r.bottom + 6) + 'px';
      dpEl.style.visibility = 'visible';
    });
    dpEl.addEventListener('mousedown', ev => ev.stopPropagation());
    dpOutside = () => closePicker();
    setTimeout(() => document.addEventListener('mousedown', dpOutside), 0);
  }
  function drawPicker(year, month, input){
    dpEl.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'dp-head';
    head.innerHTML = `<button type="button" class="dp-nav" data-d="-1">‹</button><b>${MONATE[month]} ${year}</b><button type="button" class="dp-nav" data-d="1">›</button>`;
    dpEl.appendChild(head);
    head.querySelectorAll('.dp-nav').forEach(b => b.onclick = () => {
      let m2 = month + Number(b.dataset.d), y2 = year;
      if (m2 < 0){ m2 = 11; y2--; }
      if (m2 > 11){ m2 = 0; y2++; }
      drawPicker(y2, m2, input);
    });
    const grid = document.createElement('div');
    grid.className = 'dp-grid';
    grid.innerHTML = R.DOW.map(w => `<span class="dp-w">${w}</span>`).join('');
    const blanks = (new Date(year, month, 1).getDay() + 6) % 7;
    const days = new Date(year, month + 1, 0).getDate();
    const heute = R.todayISO();
    const cur = deToIso(input.value);
    for (let i = 0; i < blanks; i++) grid.appendChild(Object.assign(document.createElement('span'), { className: 'dp-blank' }));
    for (let day = 1; day <= days; day++){
      const iso = year + '-' + String(month + 1).padStart(2,'0') + '-' + String(day).padStart(2,'0');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'dp-day' + (iso === heute ? ' heute' : '') + (iso === cur ? ' sel' : '') + (R.isWeekend(iso) ? ' we' : '');
      b.textContent = day;
      b.onclick = () => { input.value = isoToDe(iso); input.classList.remove('invalid'); closePicker(); input.dispatchEvent(new Event('input')); };
      grid.appendChild(b);
    }
    dpEl.appendChild(grid);
  }
  // Von/Bis-Kopplung: liegt der Beginn nach dem Ende, wird das Ende mind. auf den Beginn gesetzt
  function syncVonBis(input){
    if (input.dataset.role !== 'von') return;
    const wrap = input.closest('.datefield');
    if (!wrap || !wrap.dataset.pair) return;
    const scope = input.closest('.entryrow, .frm, .modal-body') || document;
    const bis = scope.querySelector('.datefield[data-pair="' + wrap.dataset.pair + '"] input[data-role="bis"]');
    if (!bis || bis === input) return;
    const von = deToIso(input.value);
    const alt = deToIso(bis.value);
    if (von && alt && alt < von){
      bis.value = isoToDe(von);
      bis.classList.remove('invalid');
    }
  }
  function wireDateFields(scope){
    scope.querySelectorAll('.datefield').forEach(wrap => {
      const input = wrap.querySelector('input');
      const btn = wrap.querySelector('.calbtn');
      if (input.dataset.wired) return;
      input.dataset.wired = '1';
      input.addEventListener('input', () => {
        const v = input.value.replace(/[^\d]/g, '').slice(0, 8);
        let out = v.slice(0, 2);
        if (v.length > 2) out += '.' + v.slice(2, 4);
        if (v.length > 4) out += '.' + v.slice(4);
        input.value = out;
        input.classList.toggle('invalid', v.length === 8 && !deToIso(out));
        syncVonBis(input);
      });
      input.addEventListener('blur', () => {
        const iso = deToIso(input.value);
        if (iso) input.value = isoToDe(iso);
        else if (input.value.trim()) input.classList.add('invalid');
      });
      btn.addEventListener('click', () => openPicker(btn, input));
    });
  }

  /* ---------- Fahrer ---------- */
  function fahrer(st, f){
    const neu = !f;
    f = f || { name:'', anstellung:'fest', verfuegbarVon:'2025-01-01', verfuegbarBis:(new Date().getFullYear()+1)+'-12-31', qual:'beides', aktiv:true };
    open({
      title: neu ? 'Fahrer anlegen' : 'Fahrer bearbeiten – ' + f.name,
      bodyHTML: `
        <div class="frm">
          <div class="field full"><label>Name *</label><input id="f-name" value="${esc(f.name)}" placeholder="Vor- und Nachname"></div>
          <div class="field"><label>Anstellung</label>${sel('f-anst', [['fest','Festangestellt'],['saison','Saisonfahrer']], f.anstellung)}</div>
          <div class="field"><label>Qualifikation</label>${sel('f-qual', [['beides','Linie & Shuttle'],['linie','Nur Linienbus'],['shuttle','Nur Shuttle']], f.qual)}</div>
          <div class="field"><label>Stamm-Bus (optional)</label><select id="f-stamm"><option value="">— keiner —</option>${st.buses.filter(b => b.aktiv).sort((a,b) => a.kennzeichen.localeCompare(b.kennzeichen, undefined, {numeric:true})).map(b => `<option value="${b.id}" ${f.stammBusId === b.id ? 'selected' : ''}>${esc(b.kennzeichen)} · ${b.typ === 'linienbus' ? 'Linienbus' : 'Shuttle'}</option>`).join('')}</select><div class="hint">Fahrer erhält bevorzugt diesen Bus; bei Wartung/Reparatur automatisch Ersatz.</div></div>
          <div class="field"><label>Verfügbar von</label>${dateFieldHTML('#f-von', f.verfuegbarVon)}</div>
          <div class="field"><label>Verfügbar bis</label>${dateFieldHTML('#f-bis', f.verfuegbarBis)}</div>
          <div class="field full"><div class="hint">Saisonfahrer sind nur im Verfügbarkeitszeitraum planbar. Vertrag: 40 h/Woche, 5-Tage-Woche, gesetzl. Lenk- & Ruhezeiten werden automatisch geprüft.</div>
          <label class="checkline" style="margin-top:10px"><input id="f-aktiv" type="checkbox" ${f.aktiv ? 'checked' : ''}> Fahrer aktiv (planbar)</label></div>
        </div>`,
      onSave(body){
        const name = body.querySelector('#f-name').value.trim();
        if (!name) return 'Bitte einen Namen angeben.';
        const vonRaw = body.querySelector('#f-von').value.trim();
        const bisRaw = body.querySelector('#f-bis').value.trim();
        const von = deToIso(vonRaw), bis = deToIso(bisRaw);
        if ((vonRaw && !von) || (bisRaw && !bis)) return 'Bitte Datum im Format TT.MM.JJJJ eingeben.';
        if (von && bis && von > bis) return '„Verfügbar von" muss vor „Verfügbar bis" liegen.';
        let stammBusId = body.querySelector('#f-stamm').value || null;
        if (stammBusId){
          const sb = R.busById(st, stammBusId);
          const q = body.querySelector('#f-qual').value;
          const braucht = sb.typ === 'linienbus' ? 'linie' : 'shuttle';
          if (q !== 'beides' && q !== braucht) stammBusId = null; // Qualifikation passt nicht zum Fahrzeugtyp
        }
        const daten = {
          name, anstellung: body.querySelector('#f-anst').value,
          qual: body.querySelector('#f-qual').value,
          verfuegbarVon: von, verfuegbarBis: bis,
          stammBusId,
          aktiv: body.querySelector('#f-aktiv').checked
        };
        if (neu){ st.fahrer.push({ id:'f' + (++st.seq), urlaub:[], krank:[], stammBusId:null, ...daten }); }
        else Object.assign(f, daten);
        App.nachAenderung(neu ? 'Fahrer „' + name + '“ angelegt' : 'Fahrer „' + name + '“ gespeichert', true);
      }
    });
  }

  /* ---------- Urlaub / Krank ---------- */
  function abwesenheiten(st, fid, art){
    const f = R.fahrerById(st, fid);
    if (!f) return;
    let neuArt = art === 'krank' ? 'krank' : 'urlaub';   // Vorbefüllung für neu hinzugefügte Zeilen
    const artIco = a => `<span class="e-ico">${a === 'urlaub' ? ICO.urlaub : ICO.krank}</span>`;
    const eintraege = [
      ...f.urlaub.map(a => ({ ...a, art:'urlaub' })),
      ...f.krank.map(a => ({ ...a, art:'krank' }))
    ];
    const zeile = a => `
      <div class="entryrow" style="grid-template-columns:20px 110px 1fr 1fr 30px" data-aid="${a.id || ''}">
        ${artIco(a.art)}
        <select class="e-art">
          <option value="urlaub" ${a.art==='urlaub'?'selected':''}>Urlaub</option>
          <option value="krank" ${a.art==='krank'?'selected':''}>Krankheit</option>
        </select>
        ${dateFieldHTML('e-von', a.von)}
        ${dateFieldHTML('e-bis', a.bis)}
        <button class="del" title="Zeitraum entfernen">✕</button>
      </div>`;
    let counter = 0;
    open({
      title: 'Abwesenheiten – ' + f.name,
      bodyHTML: `
        <p class="tiny muted" style="margin-top:0">In diesen Zeiträumen ist der Fahrer nicht planbar. Bestehende Einsätze werden automatisch neu vergeben. ${ICO.urlaub} Urlaub &nbsp; ${ICO.krank} Krankheit</p>
        <div class="entrylist" id="ab-list">${eintraege.map(zeile).join('') || '<div class="emptybox">Keine Abwesenheiten eingetragen</div>'}</div>
        <button class="btn small" id="ab-add">+ Zeitraum hinzufügen</button>`,
      onSave(body){
        const rows = [...body.querySelectorAll('.entryrow')];
        const dates = rows.map(r => ({
          von: deToIso(r.querySelector('.e-von').value),
          bis: deToIso(r.querySelector('.e-bis').value)
        }));
        for (let i = 0; i < rows.length; i++){
          const rawV = rows[i].querySelector('.e-von').value.trim();
          const rawB = rows[i].querySelector('.e-bis').value.trim();
          if (!rawV || !rawB) return 'Bitte Von- und Bis-Datum ausfüllen (TT.MM.JJJJ).';
          if (!dates[i].von || !dates[i].bis) return 'Ungültiges Datum – bitte als TT.MM.JJJJ eingeben.';
          if (dates[i].von > dates[i].bis) return 'Ein Zeitraum hat „Von" nach „Bis".';
        }
        f.urlaub = []; f.krank = [];
        rows.forEach((r, i) => {
          const art = r.querySelector('.e-art').value;
          const eintrag = { id:'a' + Date.now() + '_' + i, von: dates[i].von, bis: dates[i].bis };
          (art === 'urlaub' ? f.urlaub : f.krank).push(eintrag);
        });
        App.nachAenderung('Abwesenheiten von ' + f.name + ' gespeichert', true);
      }
    });
    const list = document.getElementById('ab-list');
    const addRow = () => {
      const eb = list.querySelector('.emptybox');
      if (eb) eb.remove();
      const t = document.createElement('div');
      t.innerHTML = zeile({ art: neuArt, von: R.todayISO(), bis: R.todayISO() });
      const row = t.firstElementChild;
      row.dataset.aid = 'tmp' + (++counter);
      list.appendChild(row);
      wireDateFields(row);
      wire(row);
    };
    document.getElementById('ab-add').onclick = addRow;
    if (!list.querySelector('.entryrow')) addRow();   // leerer Fahrer: direkt eine Zeile vorbereiten
    function wire(row){
      const sel = row.querySelector('.e-art');
      sel.onchange = () => { row.querySelector('.e-ico').outerHTML = artIco(sel.value); };
      row.querySelector('.del').onclick = () => {
        if (list.querySelectorAll('.entryrow').length === 1)
          list.innerHTML = '<div class="emptybox">Keine Abwesenheiten eingetragen</div>';
        else row.remove();
      };
    }
    list.querySelectorAll('.entryrow').forEach(wire);
  }

  /* ---------- Bus ---------- */
  function bus(st, b){
    const neu = !b;
    b = b || { kennzeichen:'', typ:'linienbus', modell:'', sitze:50, status:'verfuegbar', aktiv:true };
    open({
      title: neu ? 'Bus anlegen' : 'Bus bearbeiten – ' + b.kennzeichen,
      bodyHTML: `
        <div class="frm">
          <div class="field"><label>Kennzeichen *</label><input id="b-kennz" value="${esc(b.kennzeichen)}" placeholder="OVG-101"></div>
          <div class="field"><label>Typ</label>${sel('b-typ', [['linienbus','Linienbus'],['shuttle','Shuttle']], b.typ)}</div>
          <div class="field"><label>Modell</label><input id="b-modell" value="${esc(b.modell || '')}"></div>
          <div class="field"><label>Sitze</label><input id="b-sitze" type="number" min="4" max="120" value="${b.sitze}"></div>
          <div class="field"><label>Status</label>${sel('b-status', [['verfuegbar','Verfügbar'],['reparatur','Reparatur'],['wartung','Geplante Wartung']], b.status)}</div>
          <div class="field"><label class="checkline" style="margin-top:22px"><input id="b-aktiv" type="checkbox" ${b.aktiv ? 'checked' : ''}> Bus aktiv (planbar)</label></div>
        </div>
        <div class="hint" style="margin-top:10px;font-size:11px;color:var(--text-faint)">In Reparatur oder Wartung stehende Busse werden bei der automatischen Planung nicht berücksichtigt.</div>`,
      onSave(body){
        const kennz = body.querySelector('#b-kennz').value.trim();
        if (!kennz) return 'Bitte ein Kennzeichen angeben.';
        const daten = {
          kennzeichen: kennz,
          typ: body.querySelector('#b-typ').value,
          modell: body.querySelector('#b-modell').value.trim(),
          sitze: Math.max(4, Number(body.querySelector('#b-sitze').value) || 4),
          status: body.querySelector('#b-status').value,
          aktiv: body.querySelector('#b-aktiv').checked
        };
        if (neu) st.buses.push({ id:'b' + (++st.seq), wartungen:[], ...daten });
        else Object.assign(b, daten);
        App.nachAenderung(neu ? 'Bus „' + kennz + '“ angelegt' : 'Bus „' + kennz + '“ gespeichert', true);
      }
    });
  }

  /* ---------- Wartungen ---------- */
  function wartungen(st, bid){
    const b = R.busById(st, bid);
    if (!b) return;
    const zeile = w => `
      <div class="entryrow" style="grid-template-columns:110px 1fr 1fr 30px" data-wid="${w.id || ''}">
        <select class="w-art"><option value="wartung" ${w.art==='wartung'?'selected':''}>Wartung</option><option value="reparatur" ${w.art==='reparatur'?'selected':''}>Reparatur</option></select>
        ${dateFieldHTML('w-von', w.von)}
        ${dateFieldHTML('w-bis', w.bis)}
        <button class="del" title="Termin entfernen">✕</button>
        <input class="w-notiz" placeholder="Notiz (z. B. TÜV, Bremsen)" value="${esc(w.notiz || '')}"
          style="grid-column:1/-1;padding:4px 8px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);width:100%;box-sizing:border-box">
      </div>`;
    open({
      title: 'Wartung & Reparatur – ' + b.kennzeichen,
      bodyHTML: `
        <p class="tiny muted" style="margin-top:0">Geplante Termine sperren den Bus für die automatische Planung. Einsätze in diesen Zeiträumen werden automatisch auf andere Busse umgebucht.</p>
        <div class="entrylist" id="wa-list">${b.wartungen.map(zeile).join('') || '<div class="emptybox">Keine Termine eingetragen</div>'}</div>
        <button class="btn small" id="wa-add">+ Termin hinzufügen</button>`,
      onSave(body){
        const rows = [...body.querySelectorAll('.entryrow')];
        const dates = rows.map(r => ({
          von: deToIso(r.querySelector('.w-von').value),
          bis: deToIso(r.querySelector('.w-bis').value)
        }));
        for (let i = 0; i < rows.length; i++){
          const rawV = rows[i].querySelector('.w-von').value.trim();
          const rawB = rows[i].querySelector('.w-bis').value.trim();
          if (!rawV || !rawB) return 'Bitte Von- und Bis-Datum ausfüllen (TT.MM.JJJJ).';
          if (!dates[i].von || !dates[i].bis) return 'Ungültiges Datum – bitte als TT.MM.JJJJ eingeben.';
          if (dates[i].von > dates[i].bis) return 'Ein Zeitraum hat „Von" nach „Bis".';
        }
        b.wartungen = rows.map((r, i) => ({
          id: r.dataset.wid || 'w' + Date.now() + '_' + i,
          art: r.querySelector('.w-art').value,
          von: dates[i].von,
          bis: dates[i].bis,
          notiz: r.querySelector('.w-notiz').value.trim()
        }));
        App.nachAenderung('Wartungstermine für ' + b.kennzeichen + ' gespeichert', true);
      }
    });
    const list = document.getElementById('wa-list');
    document.getElementById('wa-add').onclick = () => {
      const eb = list.querySelector('.emptybox');
      if (eb) eb.remove();
      const t = document.createElement('div');
      t.innerHTML = zeile({ art:'wartung', von: R.todayISO(), bis: R.addDays(R.todayISO(), 3) });
      const row = t.querySelector('.entryrow');
      [...t.children].forEach(c => list.appendChild(c));
      wire(row);
    };
    function wire(row){
      wireDateFields(row);
      row.querySelector('.del').onclick = () => {
        row.remove();
        if (!list.querySelector('.entryrow'))
          list.innerHTML = '<div class="emptybox">Keine Termine eingetragen</div>';
      };
    }
    list.querySelectorAll('.entryrow').forEach(wire);
  }

  /* ---------- Dienst (Tour) ---------- */
  function dienst(st, d){
    const neu = !d;
    if (neu){
      const aktive = R.aktivePerioden(st, R.todayISO());
      d = { name:'', kurz:'', linie:'', typ:'linie', start:'08:00', dauerMin:480, lenkzeitMin:375,
            perioden: aktive.length ? [aktive[0].id] : [], wochentage:[0,1,2,3,4], aktiv:true };
    }
    const per = (d.perioden || []);
    const periodenChecks = st.perioden.map(p =>
      `<label><input type="checkbox" data-per="${p.id}" ${per.includes(p.id) ? 'checked' : ''}> ${esc(p.name)} (${R.periodText(p)})</label>`).join('');
    const wt = [0,1,2,3,4,5,6].map(i =>
      `<label><input type="checkbox" data-wd="${i}" ${d.wochentage.includes(i) ? 'checked' : ''}> ${R.DOW[i]}</label>`).join('');
    open({
      title: neu ? 'Neuen Dienst anlegen' : 'Dienst bearbeiten – ' + d.name,
      bodyHTML: `
        <div class="frm">
          <div class="field full"><label>Bezeichnung *</label><input id="d-name" value="${esc(d.name)}" placeholder="z. B. L1 Frühdienst 05:15"></div>
          <div class="field"><label>Kurzkürzel (Plan) *</label><input id="d-kurz" value="${esc(d.kurz)}" maxlength="6" placeholder="L1 F05"></div>
          <div class="field"><label>Linie</label><input id="d-linie" value="${esc(d.linie)}" placeholder="1, 2, SB …"></div>
          <div class="field"><label>Typ</label>${sel('d-typ', [['linie','Linienbus-Dienst'],['shuttle','Shuttle-Dienst']], d.typ)}</div>
          <div class="field"><label>Startzeit</label><input id="d-start" type="time" value="${d.start}"></div>
          <div class="field"><label>Dienstlänge (Minuten)</label><input id="d-dauer" type="number" min="60" step="15" value="${d.dauerMin}"></div>
          <div class="field"><label>Lenkzeit-Anteil (Minuten)</label><input id="d-lenk" type="number" min="0" step="15" value="${d.lenkzeitMin}"><div class="hint">Max. 540 min (9 h) pro Tag – wird täglich geprüft.</div></div>
          <div class="field full"><label>Fahrplan-Zeiträume (mind. einer – Umlauf ist aktiv, sobald ein Zeitraum gilt)</label><div class="wdcheck">${periodenChecks}</div></div>
          <div class="field full"><label>Gültige Wochentage</label><div class="wdcheck">${wt}</div></div>
          <div class="field full"><label class="checkline"><input id="d-aktiv" type="checkbox" ${d.aktiv ? 'checked' : ''}> Dienst aktiv (wird eingeplant)</label></div>
        </div>`,
      onSave(body){
        const name = body.querySelector('#d-name').value.trim();
        const kurz = body.querySelector('#d-kurz').value.trim().toUpperCase();
        if (!name) return 'Bitte eine Bezeichnung angeben.';
        if (!kurz) return 'Bitte einen Kurzkürzel angeben.';
        const dauer = Number(body.querySelector('#d-dauer').value);
        const lenk = Number(body.querySelector('#d-lenk').value);
        if (!dauer || dauer < 60) return 'Dienstlänge muss mindestens 60 Minuten betragen.';
        if (lenk < 0 || lenk > R.LENK_MAX) return 'Lenkzeit-Anteil muss zwischen 0 und 540 Minuten liegen.';
        const wochentage = [...body.querySelectorAll('[data-wd]')].filter(c => c.checked).map(c => Number(c.dataset.wd));
        if (!wochentage.length) return 'Bitte mindestens einen Wochentag wählen.';
        const perioden = [...body.querySelectorAll('[data-per]')].filter(c => c.checked).map(c => c.dataset.per);
        if (!perioden.length) return 'Bitte mindestens einen Fahrplan-Zeitraum wählen (oder unter „Zeiträume bearbeiten" einen anlegen).';
        const daten = {
          name, kurz, linie: body.querySelector('#d-linie').value.trim(),
          typ: body.querySelector('#d-typ').value,
          start: body.querySelector('#d-start').value || '08:00',
          dauerMin: dauer, lenkzeitMin: lenk,
          perioden, wochentage, aktiv: body.querySelector('#d-aktiv').checked
        };
        if (neu) st.dienste.push({ id:'d' + (++st.seq), ...daten });
        else Object.assign(d, daten);
        // Sweep über 12 Wochen: neue/geänderte Umläufe erhalten Einsätze in freigegebenen Wochen
        const wvon = App.planRange().von;
        App.replanBereich(wvon, R.addDays(wvon, 84),
          neu ? 'Dienst „' + kurz + '“ angelegt' : 'Dienst „' + kurz + '“ gespeichert');
      }
    });
  }

  /* ---------- Einsatz ---------- */
  function einsatz(st, e, preset){
    const neu = !e;
    e = e || { dienstId: preset && preset.dienstId || '', datum: preset && preset.datum || R.todayISO(), fahrerId: preset && preset.fahrerId || '', busId: preset && preset.busId || '', quelle:'manuell' };
    const diensteOpts = st.dienste.filter(x => x.aktiv).sort((a,b) => a.kurz.localeCompare(b.kurz))
      .map(x => [x.id, x.kurz + ' · ' + R.dienstPeriodenNamen(st, x)]);
    const fahrerSort = (a,b) => a.name.localeCompare(b.name);
    const busSort = (a,b) => a.kennzeichen.localeCompare(b.kennzeichen);

    // Nur Ressourcen, die für den gewählten Dienst und Tag wirklich in Frage kommen
    function listen(dienstId, datum){
      const d = R.dienstById(st, dienstId);
      if (!d || !datum){
        return {
          fahrer: st.fahrer.filter(f => f.aktiv).sort(fahrerSort),
          busse: st.buses.filter(b => b.aktiv).sort(busSort)
        };
      }
      return {
        fahrer: st.fahrer.filter(f => f.aktiv && R.fahrerKannDienst(st, f, d, datum, e.id).ok).sort(fahrerSort),
        busse: st.buses.filter(b => b.aktiv && R.busTypFuerDienst(d) === b.typ && R.busVerfuegbar(st, b, datum) &&
          !st.einsaetze.some(x => x.busId === b.id && x.datum === datum && x.id !== e.id)).sort(busSort)
      };
    }
    function fahrerOptHTML(liste, aktueller){
      const opts = [['', '— ohne Fahrer (offen) —'], ...liste.map(f => [f.id, f.name + (f.anstellung === 'saison' ? ' (Saison)' : '')])];
      if (aktueller && !liste.some(f => f.id === aktueller)){
        const cur = R.fahrerById(st, aktueller);
        if (cur) opts.push([cur.id, '⚠ ' + cur.name + ' (aktuell zugewiesen – nicht einsetzbar)']);
      }
      return opts.map(([v, t]) => `<option value="${v}" ${v === aktueller ? 'selected' : ''}>${esc(t)}</option>`).join('');
    }
    function busOptHTML(liste, aktueller){
      const opts = [['', '— ohne Bus (offen) —'], ...liste.map(b => [b.id, b.kennzeichen + ' · ' + (b.typ === 'linienbus' ? 'Linienbus' : 'Shuttle')])];
      if (aktueller && !liste.some(b => b.id === aktueller)){
        const cur = R.busById(st, aktueller);
        if (cur) opts.push([cur.id, '⚠ ' + cur.kennzeichen + ' (aktuell zugewiesen – nicht einsetzbar)']);
      }
      return opts.map(([v, t]) => `<option value="${v}" ${v === aktueller ? 'selected' : ''}>${esc(t)}</option>`).join('');
    }

    const init = listen(e.dienstId, e.datum);
    let attempt = { conflict:false };
    open({
      title: neu ? 'Einsatz anlegen' : 'Einsatz bearbeiten',
      bodyHTML: `
        <div class="frm">
          <div class="field"><label>Datum</label>${dateFieldHTML('#e-datum', e.datum || R.todayISO())}</div>
          <div class="field"><label>Dienst *</label><select id="e-dienst">${diensteOpts.map(([v,t]) => `<option value="${v}" ${v === e.dienstId ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select><div class="hint">Fahrer-/Bus-Liste passt sich automatisch an – nur Einsetzbares.</div></div>
          <div class="field"><label>Fahrer (einsetzbar)</label><select id="e-fahrer">${fahrerOptHTML(init.fahrer, e.fahrerId)}</select></div>
          <div class="field"><label>Bus (passend &amp; verfügbar)</label><select id="e-bus">${busOptHTML(init.busse, e.busId)}</select></div>
          <div class="field full"><label class="checkline"><input id="e-fix" type="checkbox" ${e.fixiert ? 'checked' : ''}> Fixieren 📌 – Automatik und Optimierer planen drum herum</label></div>
        </div>
        <div class="hint" id="e-hint" style="margin-top:12px;font-size:11.5px;color:var(--text-faint)">Fixierte Einsätze (📌) bleiben stehen, z. B. für Arzttermine oder private Verpflichtungen – der Rest wird automatisch drum herum organisiert.</div>`,
      extraFooter: neu ? '' : '<button class="btn danger" id="e-del">Einsatz löschen</button>',
      onSave(body, errEl, modal){
        const datum = deToIso(body.querySelector('#e-datum').value);
        if (!datum) return 'Bitte Datum im Format TT.MM.JJJJ eingeben.';
        const dienstId = body.querySelector('#e-dienst').value;
        const fahrerId = body.querySelector('#e-fahrer').value || null;
        const busId = body.querySelector('#e-bus').value || null;
        if (!dienstId) return 'Bitte einen Dienst wählen.';
        const d = R.dienstById(st, dienstId);
        if (!d) return 'Dienst unbekannt.';

        let warnung = '';
        if (fahrerId){
          const f = R.fahrerById(st, fahrerId);
          const chk = R.fahrerKannDienst(st, f, d, datum, e.id);
          if (!chk.ok) warnung = chk.reason;
        }
        if (busId){
          const b = R.busById(st, busId);
          if (!R.busVerfuegbar(st, b, datum)) warnung = warnung || 'Bus steht an diesem Tag nicht zur Verfügung.';
          if (st.einsaetze.some(x => x.busId === busId && x.datum === datum && x.id !== e.id)) warnung = warnung || 'Bus ist an diesem Tag bereits im Einsatz.';
        }
        if (warnung && !attempt.conflict){
          attempt.conflict = true;
          const hint = body.querySelector('#e-hint');
          hint.innerHTML = '<span style="color:var(--danger);font-weight:600">⚠ ' + esc(warnung) + '</span><br>Erneut auf „Speichern" klicken, um trotz Konflikt zu zuweisen – der Verstoß wird im Plan rot markiert.';
          return false;
        }
        if (neu) st.einsaetze.push({ id:'e' + (++st.seq), dienstId, datum, fahrerId, busId, quelle:'manuell', fixiert: body.querySelector('#e-fix').checked });
        else Object.assign(e, { dienstId, datum, fahrerId, busId, quelle:'manuell', fixiert: body.querySelector('#e-fix').checked });
        App.nachAenderung(neu ? 'Einsatz angelegt' : 'Einsatz gespeichert', true);
      }
    });
    // Listen nachführen, wenn Dienst oder Datum im Dialog geändert wird
    const modalEl = document.querySelector('#modal-root .modal');
    const selD = modalEl && modalEl.querySelector('#e-dienst');
    const selF = modalEl && modalEl.querySelector('#e-fahrer');
    const selB = modalEl && modalEl.querySelector('#e-bus');
    const inpD = modalEl && modalEl.querySelector('#e-datum');
    if (selD && selF && selB && inpD){
      const refresh = () => {
        const datum = deToIso(inpD.value);
        const l = listen(selD.value, datum);
        const curF = selF.value, curB = selB.value;
        selF.innerHTML = fahrerOptHTML(l.fahrer, curF);
        selB.innerHTML = busOptHTML(l.busse, curB);
      };
      selD.addEventListener('change', refresh);
      inpD.addEventListener('change', refresh);
      inpD.addEventListener('input', () => { if (deToIso(inpD.value)) refresh(); });
    }
    const modal = document.querySelector('#modal-root .modal');
    const del = modal && modal.querySelector('#e-del');
    if (del) del.onclick = () => {
      confirm('Einsatz löschen', 'Soll der Einsatz wirklich entfernt werden? Der Umlauf bleibt an diesem Tag gestrichen. Die Automatik setzt den bisherigen Fahrer/Bus für diesen Umlauf und Tag nicht wieder ein; „⚡ Autodispo“ erzeugt den Einsatz neu und besetzt ihn mit Ersatz.', 'Löschen', () => {
        st.weg = st.weg || {};
        st.weg[e.dienstId + '|' + e.datum] = true;
        st.ausschluss = st.ausschluss || {};
        const f = e.fahrerId ? R.fahrerById(st, e.fahrerId) : null;
        const b = e.busId ? R.busById(st, e.busId) : null;
        if (f) st.ausschluss['f:' + f.id + '|' + e.dienstId + '|' + e.datum] = true;
        if (b) st.ausschluss['b:' + b.id + '|' + e.dienstId + '|' + e.datum] = true;
        const hinweis = (f || b)
          ? ' · ' + (f ? f.name : '') + (f && b ? ' / ' : '') + (b ? b.kennzeichen : '') + ' wird für diesen Umlauf an dem Tag nicht wieder automatisch eingeteilt'
          : '';
        st.einsaetze = st.einsaetze.filter(x => x.id !== e.id);
        App.nachAenderung('Einsatz gelöscht' + hinweis, true);
      });
    };
  }

  /* ---------- Fahrplan-Zeiträume (frei benennbar) ---------- */
  function mdDe(md){ if (!md) return ''; const [m, d] = md.split('-'); return d.padStart(2,'0') + '.' + m.padStart(2,'0') + '.'; }
  function deToMd(de){
    const m = String(de || '').trim().match(/^(\d{1,2})\.(\d{1,2})\.?$/);
    if (!m) return null;
    const t = Number(m[1]), mo = Number(m[2]);
    if (t < 1 || t > 31 || mo < 1 || mo > 12) return null;
    return String(mo).padStart(2,'0') + '-' + String(t).padStart(2,'0');
  }
  function autoDotMd(inp){
    inp.addEventListener('input', () => {
      const v = inp.value.replace(/[^\d]/g, '').slice(0, 4);
      let out = v.slice(0, 2);
      if (v.length > 2) out += '.' + v.slice(2);
      if (v.length === 4) out += '.';
      inp.value = out;
    });
  }
  function perioden(st){
    const zeile = p => `
      <div class="entryrow" style="grid-template-columns:1fr 92px 92px 30px" data-pid="${p.id || ''}">
        <input class="p-name" placeholder="Name, z. B. Winter Vorsaison" value="${esc(p.name || '')}"
          style="width:100%;padding:6px 8px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text)">
        <input type="text" inputmode="numeric" autocomplete="off" placeholder="TT.MM." class="mdinput p-von" value="${mdDe(p.von)}">
        <input type="text" inputmode="numeric" autocomplete="off" placeholder="TT.MM." class="mdinput p-bis" value="${mdDe(p.bis)}">
        <button class="del" title="Zeitraum entfernen">✕</button>
      </div>`;
    const heute = R.todayISO();
    const start = R.addDays(heute, 14);
    open({
      title: 'Fahrplan-Zeiträume verwalten',
      bodyHTML: `
        <p class="tiny muted" style="margin-top:0">Jährlich wiederkehrende Zeiträume als Tag.Monat – frei benennbar (z. B. „Winter Vorsaison"). Jeder Umlauf ist an einem Tag aktiv, sobald einer seiner zugeordneten Zeiträume den Tag abdeckt. Einsätze außerhalb werden automatisch entfernt bzw. neu verteilt.</p>
        <div class="entrylist" id="pe-list">${(st.perioden || []).map(zeile).join('') || '<div class="emptybox">Noch keine Zeiträume definiert</div>'}</div>
        <button class="btn small" id="pe-add">+ Zeitraum hinzufügen</button>
        <div class="hint" style="margin-top:10px;font-size:11px;color:var(--text-faint)">Ein Zeitraum darf über Silvester hinausgehen (z. B. 1.12. – 19.4.). Wird ein Zeitraum gelöscht, verlieren die zugeordneten Umläufe diese Zuordnung.</div>`,
      onSave(body){
        const rows = [...body.querySelectorAll('.entryrow')];
        const gelesen = rows.map(r => ({
          id: r.dataset.pid || '',
          name: r.querySelector('.p-name').value.trim(),
          von: deToMd(r.querySelector('.p-von').value),
          bis: deToMd(r.querySelector('.p-bis').value)
        }));
        for (let i = 0; i < gelesen.length; i++){
          const p = gelesen[i];
          if (!p.name) return 'Bitte jeden Zeitraum benennen.';
          if (!p.von || !p.bis) return 'Bitte Von- und Bis-Datum jedes Zeitraums im Format TT.MM. eingeben.';
          const dup = gelesen.some((q, j) => j !== i && q.name.toLowerCase() === p.name.toLowerCase());
          if (dup) return 'Zwei Zeiträume haben den Namen „' + p.name + '“ – bitte eindeutig benennen.';
        }
        st.perioden = gelesen.map((p, i) => ({
          id: p.id || 'p' + Date.now() + '_' + i,
          name: p.name, von: p.von, bis: p.bis
        }));
        const ids = new Set(st.perioden.map(p => p.id));
        for (const d of st.dienste) d.perioden = (d.perioden || []).filter(id => ids.has(id));
        st.weg = {}; // Zeiträume bewusst umorganisiert: gelöschte Einsätze dürfen neu entstehen
        // Großer Aufräum-Sweep: Zeitraum-Änderungen wirken auf alle geplanten Wochen voraus
        const von = App.planRange().von;
        App.replanBereich(von, Rules.addDays(von, 84),
          'Zeiträume gespeichert: ' + st.perioden.map(p => p.name + ' (' + R.periodText(p) + ')').join(' · '));
      }
    });
    const list = document.getElementById('pe-list');
    document.getElementById('pe-add').onclick = () => {
      const eb = list.querySelector('.emptybox');
      if (eb) eb.remove();
      const t = document.createElement('div');
      t.innerHTML = zeile({ name:'', von: heute.slice(5), bis: start.slice(5) });
      const row = t.firstElementChild;
      [...t.children].forEach(c => list.appendChild(c));
      autoDots();
      row.querySelector('.del').onclick = () => row.remove();
    };
    function autoDots(){
      document.querySelectorAll('#modal-root .mdinput').forEach(inp => {
        if (inp.dataset.wired) return;
        inp.dataset.wired = '1';
        autoDotMd(inp);
      });
    }
    list.querySelectorAll('.entryrow').forEach(row => {
      row.querySelector('.del').onclick = () => row.remove();
    });
    autoDots();
  }

  return { open, confirm, report, fahrer, abwesenheiten, bus, wartungen, dienst, einsatz, perioden };
})();
