/* data.js — Demo-Daten: 30 Busse, 50 Fahrer, 30 Dienste, Fahrplan-Kalender */
'use strict';
const Data = (() => {

  // Deterministischer Zufall, damit die Demo reproduzierbar ist
  function mulberry32(seed){
    return function(){
      let t = (seed += 0x6D2B79F5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rnd = mulberry32(20260828);
  const pick = arr => arr[Math.floor(rnd() * arr.length)];

  // Chauffeure der Ötztaler Verkehrsgesellschaft (Quelle: oetztaler.at → Über uns → Unser Team → Chauffeure,
  // die ersten 50 alphabetisch, Stand 2026-08-29)
  const FAHRER_NAMEN = [
    'Joseph Alzokaimi','Ahed Alzokaimi','Michael Erich Angel','Philipp Auer','Laszlo Bako',
    'Lúcian Barnea','Stanislav Basic','Aymen Boubguira','Istvan Brettschneider','Sandor Brandisz',
    'Emmanouil Chatzistamatis','Florin Ciureanu','Ciprian Ionut Danis','Reza Dehghanian','Andriy Dryzheruk',
    'Dubravac Drasko','Mustafa Elgün','János Fülöp','Gavlik Gabor','Robert Thomas Heinzl',
    'Dejan Hruskar','Gabor Hufnagel','Csaba Keller','Günter Kerschenbauer','Emre Kocak',
    'Özkan Köfün','Mario Kreuzer','Slavisa Kovacevic','Anton Karl Kühnel','Robert Kun',
    'Milan Majercak','Frank Mettke','Sandor Miholecz','Istvan Nemsics','Jozsef Nauratyill',
    'Marius Nicolae','Reinhard Obweger','Sabit Öncü','Bill Oprica','Martin Opriessnig',
    'Janko Pavlovic','Sladjana Pavlovic','Velimir Pavlovic','Stanko Petrovic','Johann Pfeifenberger',
    'Alexandru Pitulice','Radu Pitulice','Pravics Valentin','Andras Peter','Philip Robenek'
  ];

  const BUS_MODELLE_LINIE = ['MAN Lion\u2019s City','Solaris Urbino 12','Mercedes-Benz Citaro','Volvo 7900','MAN Lion\u2019s City G'];
  const BUS_MODELLE_SHUTTLE = ['Mercedes-Benz Sprinter','VW Crafter 50','MAN TGE 4x4','Fiat Ducato Maxi'];

  /* ---------- 32 Dienste ---------- */
  // perioden: Zuordnung zu Fahrplan-Zeiträumen (state.perioden, jährlich wiederkehrend)
  // wochentage: 0=Mo … 6=So
  const ALLE_TAGE = [0,1,2,3,4,5,6], WERKTAGS = [0,1,2,3,4];
  const DIENSTE = [
    // Jahresfahrplan — Hauptlinie L1 + L2/L3 (12)
    { name:'L1 Frühdienst 05:15',  kurz:'L1 F05', linie:'1', typ:'linie',   start:'04:45', dauerMin:480, perioden:['p1'], wochentage:ALLE_TAGE },
    { name:'L1 Frühdienst 06:15',  kurz:'L1 F06', linie:'1', typ:'linie',   start:'05:45', dauerMin:480, perioden:['p1'], wochentage:ALLE_TAGE },
    { name:'L1 Frühdienst 07:15',  kurz:'L1 F07', linie:'1', typ:'linie',   start:'06:45', dauerMin:480, perioden:['p1'], wochentage:ALLE_TAGE },
    { name:'L1 Mitteldienst 08:15',kurz:'L1 M08', linie:'1', typ:'linie',   start:'07:45', dauerMin:480, perioden:['p1'], wochentage:ALLE_TAGE },
    { name:'L1 Mitteldienst 09:15',kurz:'L1 M09', linie:'1', typ:'linie',   start:'08:45', dauerMin:480, perioden:['p1'], wochentage:ALLE_TAGE },
    { name:'L1 Nachtdienst 12:15', kurz:'L1 N12', linie:'1', typ:'linie',   start:'11:45', dauerMin:480, perioden:['p1'], wochentage:ALLE_TAGE },
    { name:'L1 Spätdienst 14:15',  kurz:'L1 S14', linie:'1', typ:'linie',   start:'13:45', dauerMin:480, perioden:['p1'], wochentage:ALLE_TAGE },
    { name:'L1 Spätdienst 16:15',  kurz:'L1 S16', linie:'1', typ:'linie',   start:'15:45', dauerMin:420, perioden:['p1'], wochentage:ALLE_TAGE },
    { name:'L1 Spätdienst 18:15',  kurz:'L1 S18', linie:'1', typ:'linie',   start:'17:45', dauerMin:390, perioden:['p1'], wochentage:ALLE_TAGE },
    { name:'L2 Vent Frühdienst',   kurz:'L2 F',   linie:'2', typ:'linie',   start:'07:30', dauerMin:420, perioden:['p1'], wochentage:WERKTAGS },
    { name:'L2 Vent Nachtdienst',  kurz:'L2 N',   linie:'2', typ:'linie',   start:'13:00', dauerMin:420, perioden:['p1'], wochentage:WERKTAGS },
    { name:'L3 Haiming–Ötz Pendel',kurz:'L3 P',   linie:'3', typ:'linie',   start:'06:00', dauerMin:480, perioden:['p1'], wochentage:[0,1,2,3,4,5] },
    // Winter — Skibusse & Shuttles (9)
    { name:'Skibus Hochötz Früh',  kurz:'SB A',   linie:'SB', typ:'shuttle', start:'07:45', dauerMin:480, perioden:['p2'], wochentage:ALLE_TAGE },
    { name:'Skibus Hochötz Spät',  kurz:'SB B',   linie:'SB', typ:'shuttle', start:'12:45', dauerMin:480, perioden:['p2'], wochentage:ALLE_TAGE },
    { name:'Skibus Giggijoch Früh',kurz:'SK A',   linie:'SK', typ:'shuttle', start:'08:00', dauerMin:480, perioden:['p2'], wochentage:ALLE_TAGE },
    { name:'Skibus Giggijoch Spät',kurz:'SK B',   linie:'SK', typ:'shuttle', start:'13:00', dauerMin:480, perioden:['p2'], wochentage:ALLE_TAGE },
    { name:'Nachtskibus Sölden',   kurz:'NSB',    linie:'NS', typ:'shuttle', start:'18:30', dauerMin:420, perioden:['p2'], wochentage:[3,4,5] },
    { name:'Shuttle Bahnhof Früh', kurz:'SHA',    linie:'SH', typ:'shuttle', start:'08:30', dauerMin:480, perioden:['p2'], wochentage:ALLE_TAGE },
    { name:'Shuttle Bahnhof Spät', kurz:'SHB',    linie:'SH', typ:'shuttle', start:'14:00', dauerMin:480, perioden:['p2'], wochentage:ALLE_TAGE },
    { name:'Shuttle Gaislachkogel Früh', kurz:'SGA', linie:'SG', typ:'shuttle', start:'08:15', dauerMin:420, perioden:['p2'], wochentage:ALLE_TAGE },
    { name:'Shuttle Gaislachkogel Spät', kurz:'SGB', linie:'SG', typ:'shuttle', start:'13:30', dauerMin:420, perioden:['p2'], wochentage:ALLE_TAGE },
    // Sommer — Wander-/Bike-/Thermen-Shuttles (9)
    { name:'Wanderbus Gries',      kurz:'WB G',   linie:'W',  typ:'shuttle', start:'08:15', dauerMin:420, perioden:['p3'], wochentage:[0,2,4,5,6] },
    { name:'Wanderbus Leiter Tal', kurz:'WB L',   linie:'W',  typ:'shuttle', start:'08:45', dauerMin:390, perioden:['p3'], wochentage:[1,3,6] },
    { name:'Shuttle AQUA DOME',    kurz:'THM',    linie:'SH', typ:'shuttle', start:'09:30', dauerMin:450, perioden:['p3'], wochentage:ALLE_TAGE },
    { name:'Bike-Bus Sölden',      kurz:'BIK',    linie:'B',  typ:'shuttle', start:'08:30', dauerMin:450, perioden:['p3'], wochentage:[5,6] },
    { name:'Gipfelbus Ötz',        kurz:'GUB',    linie:'G',  typ:'shuttle', start:'07:45', dauerMin:420, perioden:['p3'], wochentage:WERKTAGS },
    { name:'Stadtbus Ötz Früh',    kurz:'STF',    linie:'ST', typ:'linie',   start:'06:30', dauerMin:420, perioden:['p3'], wochentage:[0,1,2,3,4,5] },
    { name:'Stadtbus Ötz Spät',    kurz:'STS',    linie:'ST', typ:'linie',   start:'13:00', dauerMin:420, perioden:['p3'], wochentage:[0,1,2,3,4,5] },
    { name:'Flughafenshuttle Innsbruck', kurz:'FLI', linie:'F', typ:'shuttle', start:'05:30', dauerMin:420, perioden:['p3'], wochentage:[0,2,4] },
    { name:'Event-Shuttle Area 47',kurz:'EVT',    linie:'E',  typ:'shuttle', start:'10:00', dauerMin:480, perioden:['p3'], wochentage:[4,5] },
    // Zwischensaison Frühjahr — Übergangs-Umläufe (2)
    { name:'L1 Verstärker Übergang', kurz:'L1 Ü',  linie:'1', typ:'linie',   start:'09:45', dauerMin:420, perioden:['p4'], wochentage:WERKTAGS },
    { name:'Shuttle Ötztaler Gletscher', kurz:'GLZ', linie:'GZ', typ:'shuttle', start:'08:00', dauerMin:450, perioden:['p4'], wochentage:ALLE_TAGE }
  ];

  /* ---------- Generierung ---------- */
  function demoDaten(){
    const today = Rules.todayISO();
    const y = Number(today.slice(0, 4));

    /* Busse: 18 Linien- + 12 Shuttle-Busse */
    const buses = [];
    for (let i = 1; i <= 30; i++){
      const shuttle = i > 18;
      buses.push({
        id:'b' + i,
        kennzeichen:'OVG-' + String(100 + i),
        typ: shuttle ? 'shuttle' : 'linienbus',
        modell: shuttle ? pick(BUS_MODELLE_SHUTTLE) : pick(BUS_MODELLE_LINIE),
        sitze: shuttle ? 8 + Math.floor(rnd() * 14) : 42 + Math.floor(rnd() * 20),
        status:'verfuegbar',
        wartungen:[], aktiv:true
      });
    }
    // Reparaturen (offen) + geplante Wartungen im 4-Wochen-Fenster
    buses[25].status = 'reparatur';
    buses[25].wartungen.push({ id:'w1', art:'reparatur', von:Rules.addDays(today, -4), bis:Rules.addDays(today, 12), notiz:'Getriebeschaden' });
    buses[26].status = 'reparatur';
    buses[26].wartungen.push({ id:'w2', art:'reparatur', von:Rules.addDays(today, -1), bis:Rules.addDays(today, 7), notiz:'Unfallschaden Heck' });
    buses[27].status = 'wartung';
    buses[27].wartungen.push({ id:'w3', art:'wartung', von:Rules.addDays(today, -2), bis:Rules.addDays(today, 9), notiz:'Halbjahres-Service' });
    buses[4].wartungen.push({ id:'w4', art:'wartung', von:Rules.addDays(today, 3), bis:Rules.addDays(today, 9), notiz:'TÜV-Überprüfung' });
    buses[11].wartungen.push({ id:'w5', art:'wartung', von:Rules.addDays(today, 11), bis:Rules.addDays(today, 16), notiz:'Bremsen + Achsvermessung' });
    buses[18].wartungen.push({ id:'w6', art:'wartung', von:Rules.addDays(today, 17), bis:Rules.addDays(today, 22), notiz:'Klimaanlage' });
    buses[21].wartungen.push({ id:'w7', art:'reparatur', von:Rules.addDays(today, 6), bis:Rules.addDays(today, 10), notiz:'Türsteuerung defekt' });

    /* Fahrer: 34 fest + 16 saisonal */
    const fahrer = [];
    for (let i = 0; i < 50; i++){
      const saison = i >= 34;
      const qual = i % 10 < 6 ? 'beides' : (i % 10 < 8 ? 'linie' : 'shuttle');
      const f = {
        id:'f' + (i + 1),
        name: FAHRER_NAMEN[i],
        anstellung: saison ? 'saison' : 'fest',
        verfuegbarVon: saison ? null : '2025-01-01',
        verfuegbarBis: saison ? null : (y + 1) + '-12-31',
        qual,
        urlaub:[], krank:[], aktiv:true
      };
      if (saison){
        if (i < 42){ // Sommer-Saisonkräfte
          f.verfuegbarVon = y + '-05-15'; f.verfuegbarBis = y + '-11-02';
          f.saisonLabel = 'Saison Sommer ' + y;
        } else {     // Winter-Saisonkräfte (nächster Winter)
          f.verfuegbarVon = y + '-12-01'; f.verfuegbarBis = (y + 1) + '-04-19';
          f.saisonLabel = 'Saison Winter ' + y + '/' + String(y + 1).slice(2);
        }
      }
      fahrer.push(f);
    }
    // Urlaub (5) und Krankmeldungen (3) im sichtbaren Fenster
    const U = [
      [1, 8], [-3, 2], [10, 17], [5, 12], [14, 21]
    ];
    U.forEach(([a, b], i) => fahrer[i].urlaub.push({ id:'u' + (i+1), von:Rules.addDays(today, a), bis:Rules.addDays(today, b) }));
    const K = [[-1, 3], [2, 5], [7, 11]];
    K.forEach(([a, b], i) => fahrer[10 + i].krank.push({ id:'k' + (i+1), von:Rules.addDays(today, a), bis:Rules.addDays(today, b) }));

    // Stamm-Busse: feste Fahrzeugbindung für einen Teil der Mannschaft
    // (OVG-105 für f2 und OVG-112 für f6 stehen zeitweise in Wartung -> Demo für Ersatzfahrzeug)
    const STAMM = { f1:'b4', f2:'b5', f3:'b7', f4:'b9', f6:'b11', f8:'b13', f10:'b22',
                    f12:'b17', f14:'b19', f16:'b21', f18:'b2', f20:'b24', f22:'b6', f24:'b10' };
    for (const [fid, bid] of Object.entries(STAMM)){
      const f = fahrer.find(x => x.id === fid);
      if (f && buses.some(b => b.id === bid)) f.stammBusId = bid;
    }

    /* Dienste */
    const dienste = DIENSTE.map((d, i) => ({
      id:'d' + (i + 1),
      name:d.name, kurz:d.kurz, linie:d.linie, typ:d.typ, start:d.start,
      dauerMin:d.dauerMin,
      lenkzeitMin:Math.round(d.dauerMin * 0.78),
      perioden:[...d.perioden], wochentage:[...d.wochentage], aktiv:true
    }));

    return {
      v: 7,
      perioden: [
        { id:'p1', name:'Jahresfahrplan',          von:'01-01', bis:'12-31' },
        { id:'p2', name:'Winter',                  von:'12-01', bis:'04-19' },
        { id:'p3', name:'Sommer',                  von:'06-20', bis:'11-02' },
        { id:'p4', name:'Zwischensaison Frühjahr', von:'04-20', bis:'06-19' }
      ],
      dispoFrei: {},
      weg: {},
      ausschluss: {},
      buses, fahrer, dienste,
      einsaetze: [],
      ersatz: {},
      thema:'dark',
      seq: 1000
    };
  }

  return { demoDaten };
})();
