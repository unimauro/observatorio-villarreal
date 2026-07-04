// Observatorio UNI — carga data/*.json y renderiza. Sin build, vanilla + Chart.js.
const CFG = window.OBS_UNI_CONFIG || {};
const GRANATE = '#1560a8', GRANATE2 = '#124a80', ORO = '#e0a92e', TEAL = '#0e7c86';
const fmtM = v => 'S/ ' + (v / 1e6).toLocaleString('es-PE', { maximumFractionDigits: 1 }) + ' M';
const fmtN = v => (v || 0).toLocaleString('es-PE');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl = u => { try { const p = new URL(u); return (p.protocol === 'http:' || p.protocol === 'https:') ? p.href : '#'; } catch { return '#'; } };

const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark';
const ink = () => isDark() ? '#9fb4c6' : '#5c6b7a';
const grid = () => isDark() ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.06)';
Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
Chart.defaults.color = ink();

// ---- tema ----
function toggleTheme() {
  const d = isDark();
  document.documentElement.setAttribute('data-theme', d ? 'light' : 'dark');
  localStorage.setItem('obsuni_theme', d ? 'light' : 'dark');
  document.getElementById('tglBtn').textContent = d ? '🌙 Tema' : '☀️ Tema';
  Chart.defaults.color = ink();
  Object.values(Chart.instances).forEach(c => c.destroy());
  render(); // redraw with new theme
}
(function initTheme() {
  const t = localStorage.getItem('obsuni_theme');
  if (t) document.documentElement.setAttribute('data-theme', t);
  if (isDark()) document.getElementById('tglBtn').textContent = '☀️ Tema';
})();

// ---- scrollspy ----
const navA = [...document.querySelectorAll('nav.links a')];
window.addEventListener('scroll', () => {
  let cur = '';
  document.querySelectorAll('section').forEach(s => { if (window.scrollY >= s.offsetTop - 120) cur = s.id; });
  navA.forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + cur));
});
navA.forEach(a => a.addEventListener('click', () => document.getElementById('nav').classList.remove('show')));

// ---- data ----
let DATA = {};
async function load(name) { try { const r = await fetch('data/' + name + '?v=' + Date.now()); return r.ok ? await r.json() : null; } catch { return null; } }

async function boot() {
  DATA.presu = await load('presupuesto-villarreal.json');
  DATA.biblio = await load('bibliometria.json');
  DATA.prov = await load('proveedores-villarreal.json');
  DATA.plan = await load('planilla-villarreal.json');
  render();
}

function opts(extra = {}) {
  return Object.assign({
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { boxWidth: 12 } } },
    scales: { x: { grid: { color: grid() } }, y: { grid: { color: grid() }, beginAtZero: true } }
  }, extra);
}

function render() {
  renderKpis(); renderPresu(); renderGasto(); renderProv(); renderInv(); renderValor(); renderPlan();
}

// ---- Gasto ↔ valor público ----
function renderValor() {
  const serie = DATA.presu?.serie, by = DATA.biblio?.uni?.by_year;
  if (!serie?.length || !by?.length) return;
  const devByY = {}, worksByY = {};
  serie.forEach(s => devByY[s.year] = s.dev);
  by.forEach(b => worksByY[b.year] = b.works);
  // años con ambos datos, hasta 2025 (2026 parcial)
  const years = Object.keys(devByY).map(Number).filter(y => y <= 2025 && worksByY[y] > 0 && devByY[y] > 0).sort();
  if (!years.length) return;
  const dev = years.map(y => devByY[y] / 1e6), works = years.map(y => worksByY[y]);
  const prodByY = years.map(y => worksByY[y] / (devByY[y] / 1e7)); // pubs por S/10M
  new Chart(cValor, {
    data: {
      labels: years,
      datasets: [
        { type: 'bar', label: 'Devengado (S/ M)', data: dev, backgroundColor: GRANATE, yAxisID: 'y' },
        { type: 'line', label: 'Publicaciones', data: works, borderColor: ORO, backgroundColor: 'transparent', tension: .3, yAxisID: 'y1' },
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, scales: { x: { grid: { color: grid() } }, y: { position: 'left', grid: { color: grid() }, beginAtZero: true, title: { display: true, text: 'S/ M' } }, y1: { position: 'right', grid: { drawOnChartArea: false }, beginAtZero: true, title: { display: true, text: 'pubs' } } } }
  });
  new Chart(cCosto, {
    type: 'line', data: { labels: years, datasets: [{ label: 'Pubs por S/10M', data: prodByY, borderColor: TEAL, backgroundColor: 'rgba(14,124,134,.12)', fill: true, tension: .3 }] },
    options: opts({ plugins: { legend: { display: false } } })
  });
  // KPIs — base I+D (justa) y base presupuesto total (contexto)
  const ly = years[years.length - 1];
  const _prog = DATA.presu?.detalle_ultimo_anio?.por_programa || [];
  const _idiM = _prog.filter(p => /investigaci|innovaci|ciencia.*tecnolog|\bi\+d\b|\bcti\b/i.test(p.nombre || '')).reduce((a, p) => a + (p.dev || p.pim || 0), 0);
  const idi = _idiM > 0 ? _idiM / 1e6 : (DATA.biblio?.presupuesto?.idi); // S/ millones de I+D (partida real)
  const wLy = worksByY[ly], devLy = devByY[ly];
  const k = [];
  if (idi) k.push(['Costo por publicación (I+D)', 'S/ ' + fmtN(Math.round(idi * 1e6 / wLy)), 'base partida I+D ' + (DATA.presu?.detalle_ultimo_anio?.anio || ly)]);
  k.push(['Publicaciones por S/10M', (wLy / (devLy / 1e7)).toFixed(1), 'ejecutado ' + ly]);
  k.push(['Costo por pub (ppto total)', 'S/ ' + fmtN(Math.round(devLy / wLy)), 'incluye planilla/pensiones']);
  if (DATA.adm?._meta) k.push(['Presupuesto por ingresante', 'S/ ' + fmtN(Math.round(devLy / DATA.adm._meta.total_ingresantes)), 'referencial (' + ly + ')']);
  document.getElementById('valorKpis').innerHTML = k.map(x => `<div class="kpi"><div class="v">${x[1]}</div><div class="l">${x[0]}</div><div class="s">${x[2] || ''}</div></div>`).join('');
  document.getElementById('valorNote').innerHTML =
    `La métrica <strong>justa</strong> de eficiencia investigadora es el <strong>costo por publicación con la partida de I+D</strong> (${idi ? 'S/ ' + idi + 'M en ' + (DATA.presu?.detalle_ultimo_anio?.anio || ly) : 's/d'}), no el presupuesto total —que paga docencia, planilla, pensiones y servicios, no solo investigar—. El "costo por pub (ppto total)" se muestra solo como contexto y NO debe leerse como gasto en investigación. Fuentes: MEF/SIAF + OpenAlex.`;
}

// ---- KPIs ----
function renderKpis() {
  const el = document.getElementById('kpis'); if (!el) return;
  const k = [];
  const s = DATA.presu?.serie;
  if (s && s.length) {
    const last = [...s].reverse().find(x => !x.parcial) || s[s.length - 1];
    k.push(['PIM ' + last.year, fmtM(last.pim), 'Presupuesto modificado']);
    k.push(['Devengado ' + last.year, fmtM(last.dev), last.ejec_pct + '% de ejecución']);
  }
  const b = DATA.biblio?.uni;
  if (b) { k.push(['Publicaciones', fmtN(b.works), 'histórico (OpenAlex)']); k.push(['Citas · h-index', fmtN(b.cited) + ' · ' + b.h_index, 'impacto científico']); }
  if (DATA.prov?.totales) k.push(['Adjudicado a proveedores', fmtM(DATA.prov.totales.monto_total), fmtN(DATA.prov.totales.n_proveedores) + ' proveedores (' + (DATA.prov._meta?.periodo || '') + ')']);
  if (DATA.adm?._meta) k.push(['Ingresantes', fmtN(DATA.adm._meta.total_ingresantes), 'de ' + fmtN(DATA.adm._meta.total_postulantes) + ' postulantes']);
  const docAir = DATA.plan?.resumen?.por_regimen_airhsp?.find(x => /docente/i.test(x.nombre));
  if (docAir) k.push(['Docentes', fmtN(docAir.n), 'prom S/ ' + fmtN(docAir.sueldo_promedio) + ' (AIRHSP)']);
  else if (DATA.biblio?.docentes) { const d = DATA.biblio.docentes; k.push(['Docentes', fmtN(d.total), d.posgrado_pct + '% con posgrado (' + d.anio + ')']); }
  el.innerHTML = k.map(x => `<div class="kpi"><div class="v">${x[1]}</div><div class="l">${x[0]}</div><div class="s">${x[2] || ''}</div></div>`).join('');
}

// ---- Presupuesto ----
function renderPresu() {
  const s = DATA.presu?.serie;
  if (!s || !s.length) { document.getElementById('presupNote').textContent = 'Cargando serie histórica del MEF…'; return; }
  new Chart(cSerie, {
    type: 'bar',
    data: {
      labels: s.map(x => x.year),
      datasets: [
        { label: 'PIM', data: s.map(x => x.pim / 1e6), backgroundColor: ORO },
        { label: 'Devengado', data: s.map(x => x.dev / 1e6), backgroundColor: GRANATE },
      ]
    }, options: opts({ plugins: { legend: { labels: { boxWidth: 12 } }, tooltip: { callbacks: { label: c => c.dataset.label + ': S/ ' + c.raw.toFixed(1) + ' M' } } } })
  });
  const closed = s.filter(x => !x.parcial); // excluir año en curso (ejecución parcial)
  new Chart(cEjec, {
    type: 'line',
    data: { labels: closed.map(x => x.year), datasets: [{ label: '% ejecución (años cerrados)', data: closed.map(x => x.ejec_pct), borderColor: GRANATE, backgroundColor: 'rgba(158,16,32,.12)', fill: true, tension: .3, spanGaps: true }] },
    options: opts({ scales: { x: { grid: { color: grid() } }, y: { grid: { color: grid() }, min: 50, max: 100 } } })
  });
  document.getElementById('presupNote').textContent =
    `${DATA.presu._meta.nota || ''} Fuente: ${DATA.presu._meta.fuente}. ${DATA.presu._meta.pliego}.`;
}

// ---- En qué se gasta ----
function donut(ctx, rows, valueKey = 'dev', top = 8) {
  const r = [...rows].sort((a, b) => b[valueKey] - a[valueKey]);
  const head = r.slice(0, top), rest = r.slice(top).reduce((s, x) => s + x[valueKey], 0);
  const labels = head.map(x => (x.nombre || '—').replace(/^\d+[:.\-]?\s*/, '').slice(0, 32));
  const vals = head.map(x => x[valueKey] / 1e6);
  if (rest > 0) { labels.push('Otros'); vals.push(rest / 1e6); }
  const cols = ['#9e1020', '#c9962e', '#7a0019', '#0e7c86', '#5c0013', '#d98c3a', '#a8324a', '#3a7d6f', '#8a6d1f', '#b5495f'];
  new Chart(ctx, {
    type: 'doughnut', data: { labels, datasets: [{ data: vals, backgroundColor: cols }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } }, tooltip: { callbacks: { label: c => c.label + ': S/ ' + c.raw.toFixed(1) + ' M' } } } }
  });
}
function renderGasto() {
  const d = DATA.presu?.detalle_ultimo_anio;
  const has = d && (d.por_generica?.length || d.por_unidad?.length || d.por_funcion?.length);
  if (!has) {
    const w = document.getElementById('gastoWrap');
    if (w) w.innerHTML = `<div class="soon"><h3>🔎 Cargando desglose</h3><p style="margin:0;color:var(--muted)">Procesando el detalle de gasto del ejercicio desde el MEF/SIAF. Aparecerá aquí en breve.</p></div>`;
    return;
  }
  const gen = d.por_generica?.length ? d.por_generica : d.por_categoria;
  if (gen?.length) donut(cGen, gen);
  if (d.por_unidad?.length) donut(cUni, d.por_unidad);
  if (d.por_programa?.length && typeof cProg !== 'undefined') {
    const p = d.por_programa.slice(0, 12);
    new Chart(cProg, { type: 'bar', data: { labels: p.map(x => x.nombre.length > 42 ? x.nombre.slice(0, 40) + '…' : x.nombre), datasets: [{ label: 'PIM S/ M', data: p.map(x => x.pim / 1e6), backgroundColor: p.map(x => /docencia|investigac/i.test(x.nombre) ? GRANATE : ORO) }] }, options: opts({ indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => 'S/ ' + c.raw.toFixed(1) + ' M' } } } }) });
    const pn = document.getElementById('progNote');
    if (pn) pn.innerHTML = `La Villarreal estructura su presupuesto por <strong>programa/actividad</strong>. Lo lidera «Ejercicio de la docencia universitaria» (${fmtM(p[0].pim)}) e «Investigación científica y tecnológica».`;
  }
  const tb = document.querySelector('#tFun tbody');
  if (tb && d.por_funcion?.length) {
    tb.innerHTML = d.por_funcion.map(x => `<tr><td>${esc((x.nombre || '—').replace(/^\d+[:.\-]?\s*/, ''))}</td><td class="n">${fmtN(Math.round(x.pim))}</td><td class="n">${fmtN(Math.round(x.dev))}</td><td class="n">${x.pim ? Math.round(100 * x.dev / x.pim) + '%' : '—'}</td></tr>`).join('');
  }
  const per = (gen || []).find(x => /PERSONAL/i.test(x.nombre));
  const bys = (gen || []).find(x => /BIENES/i.test(x.nombre));
  const note = document.getElementById('gastoNote');
  if (note) note.innerHTML = `Ejercicio ${d.anio} (cerrado). ` +
    (per ? `Planilla (personal): <strong>${fmtM(per.dev)}</strong>. ` : '') +
    (bys ? `Bienes y servicios: <strong>${fmtM(bys.dev)}</strong>. ` : '') +
    `Fuente: MEF/SIAF, pliego 524 (UNFV).`;
}

// ---- Proveedores ----
function renderProv() {
  const w = document.getElementById('provWrap');
  const V = DATA.prov;
  if (!V?.proveedores?.length) {
    w.innerHTML = `<div class="soon"><h3>🔎 En construcción</h3><p style="margin:0;color:var(--muted)">Descargando y cruzando las contrataciones de la Villarreal (OECE/CONOSCE) para listar cada proveedor, su RUC, el monto y sus dueños/representantes.</p></div>`;
    return;
  }
  const t = V.totales || {};
  // KPIs
  const kp = document.getElementById('provKpis');
  if (kp) kp.innerHTML = [
    ['Total adjudicado', fmtM(t.monto_total), (V._meta?.periodo || '') + ' · buena pro'],
    ['Proveedores', fmtN(t.n_proveedores), fmtN(t.n_procesos) + ' procesos'],
    ['Empresas', fmtN(t.n_empresas), fmtM(t.monto_empresas)],
    ['Personas/terceros', fmtN(t.n_personas_naturales), fmtM(t.monto_personas_naturales)],
  ].map(x => `<div class="kpi"><div class="v">${x[1]}</div><div class="l">${x[0]}</div><div class="s">${x[2] || ''}</div></div>`).join('');
  // chart top por monto
  const top = V.proveedores.slice(0, 12);
  new Chart(cProv, { type: 'bar', data: { labels: top.map(x => x.nombre.slice(0, 30)), datasets: [{ label: 'S/ adjudicado', data: top.map(x => x.monto / 1e6), backgroundColor: GRANATE }] }, options: opts({ indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => 'S/ ' + c.raw.toFixed(2) + ' M' } } } }) });
  // chart empresas vs personas
  new Chart(cProvTipo, { type: 'doughnut', data: { labels: ['Empresas', 'Personas naturales'], datasets: [{ data: [t.monto_empresas / 1e6, t.monto_personas_naturales / 1e6], backgroundColor: [GRANATE, ORO] }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: c => c.label + ': S/ ' + c.raw.toFixed(1) + ' M' } } } } });
  // tabla buscable + orden por monto/nº
  w.innerHTML = `<div class="card">
    <h3>Proveedores de la Villarreal · ${fmtN(V.proveedores.length)}</h3>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0 12px">
      <input id="provSearch" placeholder="🔎 Buscar proveedor, RUC o dueño…" style="flex:1;min-width:200px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--tinta);font-size:14px">
      <button class="tgl" style="background:var(--granate2)" id="provSortM">Por monto</button>
      <button class="tgl" style="background:var(--muted)" id="provSortN">Por nº licitaciones</button>
    </div>
    <div class="scroll"><table><thead><tr><th>Proveedor</th><th>RUC</th><th>Tipo</th><th class="n">Monto (S/)</th><th class="n">Proc.</th><th>Dueño / representante</th></tr></thead><tbody id="provBody"></tbody></table></div>
    <p class="note" id="provCount"></p>
    <p class="note">Fuente: ${V._meta?.fuente || 'OECE/CONOSCE'} · <a href="${esc(safeUrl(V._meta?.fuente_url || '#'))}" target="_blank" rel="noopener">reporte de adjudicaciones</a>. Alcance: adjudicaciones (buena pro); no incluye órdenes de compra menores a 8 UIT. Los dueños/representantes provienen de fuentes públicas y se marcan con su fuente.</p>
  </div>`;
  const body = document.getElementById('provBody'), cnt = document.getElementById('provCount'), inp = document.getElementById('provSearch');
  let sortBy = 'monto';
  const draw = () => {
    const q = (inp.value || '').trim().toLowerCase();
    let rows = V.proveedores.filter(x => !q || (`${esc(x.nombre)} ${x.ruc || ''} ${x.dueno || ''}`).toLowerCase().includes(q));
    rows = [...rows].sort((a, b) => sortBy === 'n' ? (b.n - a.n || b.monto - a.monto) : (b.monto - a.monto));
    body.innerHTML = rows.slice(0, 200).map(x => `<tr><td>${esc(x.nombre)}</td><td>${esc(x.ruc) || '—'}</td><td>${x.tipo_persona === 'natural' ? '👤 persona' : '🏢 empresa'}</td><td class="n">${fmtN(Math.round(x.monto))}</td><td class="n">${x.n || '—'}</td><td>${x.dueno ? esc(x.dueno) + (x.fuente_dueno ? ` <a href="${esc(safeUrl(x.fuente_dueno))}" target="_blank" rel="noopener">🔗</a>` : '') : '<span class="pill">por cruzar</span>'}</td></tr>`).join('');
    cnt.textContent = `${rows.length} proveedor(es)` + (rows.length > 200 ? ' (mostrando 200)' : '') + ` · orden: ${sortBy === 'n' ? 'nº licitaciones' : 'monto'}`;
  };
  inp.addEventListener('input', draw);
  document.getElementById('provSortM').addEventListener('click', () => { sortBy = 'monto'; draw(); });
  document.getElementById('provSortN').addEventListener('click', () => { sortBy = 'n'; draw(); });
  draw();
  // top personas naturales / terceros
  const pw = document.getElementById('provPersonas');
  if (pw && V.top_personas?.length) {
    pw.innerHTML = `<div class="card"><h3>👤 Personas naturales / terceros que más ganaron</h3><div class="scroll"><table><thead><tr><th>Nombre</th><th>RUC</th><th class="n">Monto (S/)</th><th class="n">Proc.</th></tr></thead><tbody>${V.top_personas.map(x => `<tr><td>${esc(x.nombre)}</td><td>${esc(x.ruc) || '—'}</td><td class="n">${fmtN(Math.round(x.monto))}</td><td class="n">${x.n || '—'}</td></tr>`).join('')}</tbody></table></div><p class="note">Locadores de servicios y personas naturales con contrato con la Villarreal (data pública de contrataciones). ${V._meta?.periodo || ''}.</p></div>`;
  }
}

// ---- Investigación ----
function renderInv() {
  const b = DATA.biblio?.uni; if (!b?.by_year) return;
  const y = b.by_year.filter(x => x.year <= 2025);
  new Chart(cInv, {
    data: {
      labels: y.map(x => x.year),
      datasets: [
        { type: 'bar', label: 'Publicaciones', data: y.map(x => x.works), backgroundColor: GRANATE, yAxisID: 'y' },
        { type: 'line', label: 'Citas', data: y.map(x => x.cited), borderColor: ORO, backgroundColor: 'transparent', tension: .3, yAxisID: 'y1' },
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, scales: { x: { grid: { color: grid() } }, y: { position: 'left', grid: { color: grid() }, beginAtZero: true }, y1: { position: 'right', grid: { drawOnChartArea: false }, beginAtZero: true } } }
  });
  const peers = [['uni', 'Villarreal'], ['sanmarcos', 'San Marcos'], ['pucp', 'PUCP'], ['cayetano', 'Cayetano'], ['unalm', 'La Molina'], ['uni_ing', 'UNI']]
    .map(([k, n]) => DATA.biblio[k] ? { n, v: DATA.biblio[k].works } : null).filter(Boolean).sort((a, b) => b.v - a.v);
  new Chart(cPares, {
    type: 'bar', data: { labels: peers.map(x => x.n), datasets: [{ label: 'Publicaciones', data: peers.map(x => x.v), backgroundColor: peers.map(x => x.n === 'Villarreal' ? GRANATE : ORO) }] },
    options: opts({ indexAxis: 'y', plugins: { legend: { display: false } } })
  });
  document.getElementById('invNote').textContent = `Villarreal: ${fmtN(b.works)} publicaciones, ${fmtN(b.cited)} citas, h-index ${b.h_index} (OpenAlex, ${DATA.biblio._meta?.extraido || '2026'}). Alto volumen de publicaciones con menor impacto por artículo que sus pares.`;
}

// ---- Admisión (SOLO agregados — nunca nombres) ----
function renderAdm() {
  const a = DATA.adm; if (!a) return;
  const esp = a.ingresantes_por_especialidad || a.por_especialidad;
  const mod = a.ingresantes_por_modalidad || a.por_modalidad;
  if (esp?.length) {
    const e = esp.slice(0, 15);
    new Chart(cEsp, { type: 'bar', data: { labels: e.map(x => x.nombre.replace('INGENIERÍA ', 'Ing. ')), datasets: [{ label: 'Ingresantes', data: e.map(x => x.n), backgroundColor: GRANATE }] }, options: opts({ indexAxis: 'y', plugins: { legend: { display: false } } }) });
  }
  if (mod?.length) {
    const m = mod.slice(0, 10);
    new Chart(cMod, { type: 'bar', data: { labels: m.map(x => x.nombre.slice(0, 26)), datasets: [{ label: 'Ingresantes', data: m.map(x => x.n), backgroundColor: ORO }] }, options: opts({ indexAxis: 'y', plugins: { legend: { display: false } } }) });
  }
  const pp = a.puntaje_postulantes, pi = a.puntaje_ingresantes;
  document.getElementById('admNote').textContent =
    `${fmtN(a._meta.total_ingresantes)} ingresantes de ${fmtN(a._meta.total_postulantes)} postulantes` +
    (pi?.prom ? `. Puntaje final promedio: ingresantes ${pi.prom} vs. postulantes ${pp?.prom}` : '') +
    `. Solo datos agregados: este portal no publica nombres de estudiantes.`;
}

// ---- Planilla ----
function renderPlan() {
  const w = document.getElementById('planWrap');
  const P = DATA.plan;
  if (!P?.personas?.length) {
    w.innerHTML = `<div class="soon"><h3>🔎 En construcción</h3><p style="margin:0;color:var(--muted)">Cruzando la planilla de la Villarreal (docentes, funcionarios y personal, con sus remuneraciones) desde datos públicos del Estado (AIRHSP / portal de transparencia). Este portal <strong>solo muestra personal — nunca nombres de estudiantes</strong>.</p></div>`;
    return;
  }
  const reg = P.resumen?.por_regimen_airhsp || [];
  // KPIs planilla
  const total = P._meta?.total_planilla_airhsp || reg.reduce((s, x) => s + x.n, 0);
  const doc = reg.find(x => /docente/i.test(x.nombre));
  const kp = document.getElementById('planKpis');
  if (kp) kp.innerHTML = [
    ['Plazas totales', fmtN(total), 'planilla AIRHSP'],
    ['Docentes', doc ? fmtN(doc.n) : '—', doc ? 'prom S/ ' + fmtN(doc.sueldo_promedio) : ''],
    ['Nominal con nombre', fmtN(P.personas.length), 'Portal de Transparencia'],
    ['Remun. máx (CAS)', 'S/ ' + fmtN(Math.round(P.resumen?.remun?.max || 0)), esc(P.personas[0]?.cargo || '')],
  ].map(x => `<div class="kpi"><div class="v">${x[1]}</div><div class="l">${x[0]}</div><div class="s">${x[2] || ''}</div></div>`).join('');
  // charts régimen
  if (reg.length) {
    const short = s => s.replace(/\s*\(.*?\)/, '').replace('D. Leg. Nº', 'DL').replace('D. Leg.', 'DL').replace('Ley Nº', 'Ley');
    new Chart(cReg, { type: 'bar', data: { labels: reg.map(x => short(x.nombre)), datasets: [{ label: 'Plazas', data: reg.map(x => x.n), backgroundColor: GRANATE }] }, options: opts({ indexAxis: 'y', plugins: { legend: { display: false } } }) });
    new Chart(cRegS, { type: 'bar', data: { labels: reg.map(x => short(x.nombre)), datasets: [{ label: 'S/ promedio', data: reg.map(x => x.sueldo_promedio), backgroundColor: ORO }] }, options: opts({ indexAxis: 'y', plugins: { legend: { display: false } } }) });
  }
  // periodo
  const MES = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];
  const periodo = P._meta?.mes ? `${MES[P._meta.mes]} ${P._meta.anio}` : (P._meta?.anio || '');
  // tabla nominal con buscador (todas las personas, filtrable)
  w.innerHTML = `<div class="card">
    <h3>Personal nominal (Portal de Transparencia) · ${fmtN(P.personas.length)} personas${periodo ? ' · ' + periodo : ''}</h3>
    <input id="planSearch" placeholder="🔎 Buscar por nombre, cargo o dependencia…" style="width:100%;padding:10px 12px;margin:8px 0 12px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--tinta);font-size:14px">
    <div class="scroll"><table><thead><tr><th>Nombre</th><th>Cargo</th><th>Dependencia</th><th class="n">Remun. (S/)</th></tr></thead><tbody id="planBody"></tbody></table></div>
    <p class="note" id="planCount"></p>
    <p class="note">Fuente: ${P._meta?.fuente || 'PTE / AIRHSP'}${periodo ? ' · periodo <strong>' + periodo + '</strong>' : ''}. La lista nominal (nombre+sueldo) del Portal de Transparencia corresponde al régimen CAS; los docentes y el personal DL-276 figuran en el agregado AIRHSP (arriba), sin sueldo individual público. Solo personal — nunca estudiantes.</p>
  </div>`;
  const body = document.getElementById('planBody'), cnt = document.getElementById('planCount'), inp = document.getElementById('planSearch');
  const draw = (q = '') => {
    q = q.trim().toLowerCase();
    const rows = P.personas.filter(x => !q || (`${esc(x.nombre)} ${x.cargo || ''} ${x.dependencia || ''}`).toLowerCase().includes(q));
    body.innerHTML = rows.slice(0, 400).map(x => `<tr><td>${esc(x.nombre)}</td><td>${esc(x.cargo) || '—'}</td><td>${esc(x.dependencia) || '—'}</td><td class="n">${x.remun ? fmtN(Math.round(x.remun)) : '—'}</td></tr>`).join('');
    cnt.textContent = q ? `${rows.length} resultado(s)` + (rows.length > 400 ? ' (mostrando 400)' : '') : `Mostrando ${Math.min(400, rows.length)} de ${rows.length}, ordenados por remuneración`;
  };
  inp.addEventListener('input', e => draw(e.target.value));
  draw();
}

// ---- Asistente IA ----
async function sendChat() {
  const inp = document.getElementById('chatIn'), box = document.getElementById('msgs');
  const q = inp.value.trim(); if (!q) return;
  inp.value = '';
  box.insertAdjacentHTML('beforeend', `<div class="m u">${esc(q)}</div>`);
  const wait = document.createElement('div'); wait.className = 'm a'; wait.textContent = '…'; box.appendChild(wait); box.scrollTop = box.scrollHeight;
  const ctx = buildCtx();
  try {
    const r = await fetch(CFG.AI_ENDPOINT, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Client-Token': CFG.AI_TOKEN },
      body: JSON.stringify({ project: CFG.AI_PROJECT, messages: [{ role: 'system', content: ctx }, { role: 'user', content: q }] })
    });
    const j = await r.json();
    wait.textContent = j.reply || j.message || 'No pude responder ahora, intenta de nuevo.';
  } catch { wait.textContent = 'Servicio no disponible por ahora.'; }
  box.scrollTop = box.scrollHeight;
}
function buildCtx() {
  const s = DATA.presu?.serie, b = DATA.biblio?.uni;
  let c = 'Eres el asistente del Observatorio Villarreal, portal ciudadano de transparencia de la Universidad Nacional Federico Villarreal (UNFV, pliego 524), con datos públicos (MEF, OECE, OpenAlex). Responde corto, en español, solo sobre la Villarreal y sus datos. No inventes cifras.';
  if (s?.length) { const l = s[s.length - 1]; c += ` Presupuesto ${l.year}: PIM S/${(l.pim / 1e6).toFixed(1)}M, devengado S/${(l.dev / 1e6).toFixed(1)}M (${l.ejec_pct}%).`; }
  if (b) c += ` Investigación: ${b.works} publicaciones, ${b.cited} citas, h-index ${b.h_index}.`;
  if (DATA.adm?._meta) c += ` Ingresantes: ${DATA.adm._meta.total_ingresantes}.`;
  return c;
}

boot();
