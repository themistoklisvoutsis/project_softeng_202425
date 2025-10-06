/* ======================
   reports.js (πλήρες)
   ====================== */

/* ---- Helpers / Status UI ---- */
const qs = (s) => document.querySelector(s);
const connDot = qs('#connDot'), connText = qs('#connText');

function setStatus(kind, text) {
  if (connDot) {
    connDot.classList.remove('ok','err');
    if (kind === 'ok')  connDot.classList.add('ok');
    if (kind === 'err') connDot.classList.add('err');
  }
  if (connText && text) connText.textContent = text;
}

const pad2 = (n) => String(n).padStart(2,'0');
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
};

function startOfDay(d){ const x=new Date(d); x.setHours(0,0,0,0); return x; }
function toISO_d(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function startOfWeek(d){ const x=startOfDay(d); const day=(x.getDay()||7); x.setDate(x.getDate()-(day-1)); return x; }
function startOfMonth(d){ return new Date(d.getFullYear(), d.getMonth(), 1); }
function startOfYear(d){ return new Date(d.getFullYear(), 0, 1); }
function buildRangePreset(p){
  const today=startOfDay(new Date());
  if(p==='month'){ const a=startOfMonth(today); const b=new Date(a.getFullYear(), a.getMonth()+1, 0); return [toISO_d(a),toISO_d(b)]; }
  if(p==='30'){ const b=today; const a=new Date(b); a.setDate(a.getDate()-29); return [toISO_d(a),toISO_d(b)]; }
  if(p==='ytd'){ const a=startOfYear(today); const b=today; return [toISO_d(a),toISO_d(b)]; }
  return [toISO_d(today),toISO_d(today)];
}

function aggregatorKey(dateStr, gran){
  const d=new Date(dateStr);
  if(gran==='day')   return toISO_d(d);
  if(gran==='week')  return toISO_d(startOfWeek(d));
  if(gran==='month') return `${d.getFullYear()}-${pad2(d.getMonth()+1)}`;
  if(gran==='year')  return String(d.getFullYear());
  return toISO_d(d);
}
function labelPretty(key,gran){
  if(gran==='day')   return new Date(key).toLocaleDateString('el-GR');
  if(gran==='week')  return `Εβδ. ${new Date(key).toLocaleDateString('el-GR')}`;
  if(gran==='month'){ const [y,m]=key.split('-'); return `${m}/${y}`; }
  return key;
}

/* ---- Ενιαίος API Adapter (υποστηρίζει window.api ΚΑΙ window.API) ---- */
function normalizeSupabaseShape(res){
  if (res && typeof res === 'object' && ('data' in res || 'error' in res)) {
    if (res.error) throw new Error(res.error.message || 'API error');
    return res.data ?? [];
  }
  return res;
}

async function callApi(action, opts = {}) {
  // 1) window.api (πεζό), signature api(action, {method, params, body})
  if (typeof window.api === 'function') {
    return await window.api(action, opts);
  }
  // 2) window.API (κεφαλαίο): .call ή named method
  if (window.API) {
    const payload = opts?.params ?? opts?.body ?? opts ?? {};
    if (typeof window.API.call === 'function') {
      return normalizeSupabaseShape(await window.API.call(action, payload));
    }
    if (typeof window.API[action] === 'function') {
      return normalizeSupabaseShape(await window.API[action](payload));
    }
  }
  throw new Error('Δεν βρέθηκε ούτε window.api ούτε window.API. Μήπως δεν φορτώθηκε το api.js;');
}

async function doPing() {
  if (typeof window.api === 'function') return await window.api('ping', {});
  if (window.API?.ping)                return await window.API.ping();
  if (window.API?.call)                return await window.API.call('ping', {});
  throw new Error('Ping: Δεν βρέθηκε API endpoint.');
}

/* ---- DOM refs ---- */
const repGranularity=qs('#repGranularity'),
      repFrom=qs('#repFrom'),
      repTo=qs('#repTo'),
      repRun=qs('#repRun'),
      repPresetMonth=qs('#repPresetMonth'),
      repPreset30=qs('#repPreset30'),
      repPresetYTD=qs('#repPresetYTD'),
      repTotal=qs('#repTotal'),
      repChartType=qs('#repChartType'),
      repPDF=qs('#repPDF'),
      canvas=qs('#attChart');

let chartInstance=null;

/* ---- Τελευταίο report για PDF ---- */
let __lastReport = {
  fromISO: null, toISO: null, gran: 'day',
  labels: [], values: [], rows: []
};

/* ---- Κύρια λογική report ---- */
async function runReport(){
  const [defFrom,defTo]=buildRangePreset('month');
  const fromISO=repFrom?.value || defFrom;
  const toISO=repTo?.value   || defTo;
  const gran=repGranularity?.value || 'day';

  const raw = await callApi('report_attendance', { params:{ from: fromISO, to: toISO } });
  const rows = Array.isArray(raw) ? raw : (raw?.data || []);
  console.debug('report_attendance rows:', rows);

  const agg=new Map();
  for(const r of rows){
    const srcDate = r.attended_on ?? r.attendedAt ?? r.date ?? r.created_at ?? r.createdAt;
    const dOk = new Date(srcDate);
    if (isNaN(dOk)) { console.warn('Bad date row (skip):', r); continue; }
    const k=aggregatorKey(srcDate,gran);
    agg.set(k,(agg.get(k)||0)+1);
  }

  const keys=Array.from(agg.keys()).sort();
  const values=keys.map(k=>agg.get(k));
  const labels=keys.map(k=>labelPretty(k,gran));
  if (repTotal) repTotal.textContent = (values.reduce((a,b)=>a+b,0) || 0);

  if (!canvas) { console.error('Λείπει το <canvas id="attChart">.'); return; }
  if (typeof Chart !== 'function') { console.error('Chart.js δεν φορτώθηκε.'); return; }

  const ctx=canvas.getContext('2d');
  if(chartInstance) chartInstance.destroy();
  chartInstance=new Chart(ctx,{
    type: repChartType?.value || 'bar',
    data: { labels, datasets:[{ label:'Παρουσίες', data:values }] },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      scales:{ y:{ beginAtZero:true, ticks:{ precision:0 } } },
      plugins:{ legend:{ display:false } },
      animation: matchMedia('(prefers-reduced-motion: reduce)').matches ? { duration: 0 } : {
        duration: 700,
        easing: 'easeOutCubic',
        delay: (ctx) => (ctx.type === 'data' && ctx.mode === 'default') ? ctx.dataIndex * 40 : 0
      }
    }
  });

  __lastReport = { fromISO, toISO, gran, labels, values, rows };

  if (rows.length === 0) {
    console.warn('Κενό εύρος δεδομένων. Οι άξονες θα εμφανιστούν χωρίς μπάρες/γραμμές.');
  }
}

/* ---- KPIs & PDF ---- */
function kpisFromDaily(labels, values) {
  const parseToDate = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    return m ? new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`) : new Date(s);
  };

  let bestIdx = -1, bestVal = -Infinity;
  values.forEach((v,i) => { if (v > bestVal) { bestVal = v; bestIdx = i; }});
  const bestDate = bestIdx >= 0 ? labels[bestIdx] : '—';

  const weekdayNames = ['Κυρ','Δευ','Τρι','Τετ','Πεμ','Παρ','Σαβ'];
  const weekdaySum = [0,0,0,0,0,0,0];
  labels.forEach((lab,i) => {
    const d = parseToDate(lab);
    if (!isNaN(d)) {
      const wd = d.getDay();
      weekdaySum[wd] += (values[i] || 0);
    }
  });
  const bestWdIdx = weekdaySum.indexOf(Math.max(...weekdaySum));
  const bestWeekdayName = bestWdIdx >= 0 ? weekdayNames[bestWdIdx] : '—';

  const total = values.reduce((a,b)=>a+b,0);
  const mean  = values.length ? (total/values.length) : 0;

  const rows = labels.map((lab,i)=>({ date: lab, count: values[i]||0 }))
                     .sort((a,b)=> b.count - a.count);

  return { total, mean, bestDate, bestVal, bestWeekdayName, rowsDesc: rows };
}

async function downloadMonthlyPDF(forceDaily=true){
  if (forceDaily && repGranularity && repGranularity.value !== 'day') {
    const old = repGranularity.value;
    repGranularity.value = 'day';
    await runReport();
    repGranularity.value = old;
  }

  const { jsPDF } = window.jspdf || {};
  if (!jsPDF || !window.jspdf?.jsPDF) { console.error('jsPDF δεν φορτώθηκε.'); return; }

  const { fromISO, toISO, labels, values } = __lastReport;
  if (!labels.length) { console.warn('Δεν υπάρχουν δεδομένα για PDF.'); return; }

  const k = kpisFromDaily(labels, values);
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  const margin = 40; let y = margin;

  doc.setFont('helvetica','bold'); doc.setFontSize(18);
  doc.text('Αναφορά Παρουσιών', margin, y); y += 20;
  doc.setFont('helvetica','normal'); doc.setFontSize(11);
  doc.text(`Εύρος: ${fromISO || '—'} έως ${toISO || '—'}`, margin, y); y += 6;
  doc.text(`Συνολικές παρουσίες: ${k.total}`, margin, y); y += 6;
  doc.text(`Καλύτερη ημέρα: ${k.bestDate} (${k.bestVal})`, margin, y); y += 6;
  doc.text(`Πιο δραστήρια μέρα εβδομάδας: ${k.bestWeekdayName}`, margin, y); y += 16;

  const cnv = document.getElementById('attChart');
  if (cnv) {
    const png = cnv.toDataURL('image/png', 0.92);
    const pageWidth = doc.internal.pageSize.getWidth();
    const imgW = pageWidth - margin*2;
    const imgH = imgW * 9/16;
    doc.addImage(png, 'PNG', margin, y, imgW, imgH, undefined, 'FAST');
    y += imgH + 16;
  }

  const rows = k.rowsDesc.map(r => [String(r.date), String(r.count)]);
  if (doc.autoTable) {
    doc.autoTable({
      head: [['Ημερομηνία', 'Πλήθος']],
      body: rows,
      startY: y,
      styles: { font: 'helvetica', fontSize: 10 },
      headStyles: { fillColor: [30,30,30] },
      margin: { left: margin, right: margin }
    });
  } else {
    doc.setFont('helvetica','bold'); doc.text('Ημερομηνία    Πλήθος', margin, y); y+=14;
    doc.setFont('helvetica','normal');
    rows.slice(0, 35).forEach(r => { doc.text(`${r[0]}    ${r[1]}`, margin, y); y+=12; });
  }

  const fname = `report_${(fromISO||'from')}_${(toISO||'to')}.pdf`.replace(/[^a-zA-Z0-9_\-\.]/g,'_');
  doc.save(fname);
}

/* ---- Init ---- */
document.addEventListener('DOMContentLoaded', () => {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(!reducedMotion){
    const card = document.getElementById('reportsCard');
    if(card){
      card.classList.add('_hidden');
      const io = new IntersectionObserver((entries)=>{
        if(entries.some(e=>e.isIntersecting)){
          requestAnimationFrame(()=>{ card.classList.add('_show'); card.classList.remove('_hidden'); });
          io.disconnect();
        }
      }, {threshold:.2});
      io.observe(card);
    }
  }

  const [a,b]=buildRangePreset('month');
  if (repFrom) repFrom.value=a;
  if (repTo) repTo.value=b;
  if (repGranularity) repGranularity.value='day';

  repRun?.addEventListener('click', runReport);
  repChartType?.addEventListener('change', runReport);
  repGranularity?.addEventListener('change', runReport);
  repPresetMonth?.addEventListener('click', ()=>{ const [a,b]=buildRangePreset('month'); if(repFrom)repFrom.value=a; if(repTo)repTo.value=b; if(repGranularity)repGranularity.value='day'; runReport(); });
  repPreset30?.addEventListener('click', ()=>{ const [a,b]=buildRangePreset('30');   if(repFrom)repFrom.value=a; if(repTo)repTo.value=b; if(repGranularity)repGranularity.value='day'; runReport(); });
  repPresetYTD?.addEventListener('click', ()=>{ const [a,b]=buildRangePreset('ytd'); if(repFrom)repFrom.value=a; if(repTo)repTo.value=b; if(repGranularity)repGranularity.value='month'; runReport(); });

  repPDF?.addEventListener('click', () => downloadMonthlyPDF(true));

  (async () => {
    try {
      const res = await doPing();
      setStatus('ok','Συνδεδεμένο');
      console.debug('PING OK:', res);
      await runReport();
    } catch (e) {
      setStatus('err','Μη συνδεδεμένο');
      console.error('PING FAILED:', e);
    }
  })();
});
