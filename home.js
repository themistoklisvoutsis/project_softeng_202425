const $=s=>document.querySelector(s);
const $$=s=>Array.from(document.querySelectorAll(s));

function toast(msg,kind='ok',timeout=3500){
  const wrap=$('#toasts'); if(!wrap) return;
  const el=document.createElement('div'); el.className=`toast ${kind}`; el.textContent=msg;
  wrap.appendChild(el); setTimeout(()=>el.remove(),timeout);
}

// Ping status
const connDot=$('#connDot'), connText=$('#connText');
function setStatus(kind,text){ connDot.classList.remove('ok','err'); if(kind==='ok')connDot.classList.add('ok'); if(kind==='err')connDot.classList.add('err'); if(text)connText.textContent=text; }
async function pingLoop(){ let delay=0, step=4000, max=20000; while(true){ await new Promise(r=>setTimeout(r,delay||0)); try{ const u=new URL('api.php',location.href); u.searchParams.set('action','ping'); const r=await fetch(u,{cache:'no-store'}); if(!r.ok) throw new Error(); if(delay>0) toast('Επανασυνδέθηκε','ok',2200); setStatus('ok','Συνδεδεμένο'); delay=step; }catch{ setStatus('err','Μη συνδεδεμένο'); toast('Απώλεια σύνδεσης','err',2200); delay=Math.min((delay||step)*1.5,max);} } }
pingLoop();

// Keyboard navigation
const tiles=$$('.tile'); tiles.forEach((t,i)=>t.tabIndex=0); tiles.current=0;
function focusTile(i){ if(!tiles.length)return; const idx=(i+tiles.length)%tiles.length; tiles[idx].focus(); tiles[idx].scrollIntoView({block:'nearest',behavior:'smooth'}); tiles.current=idx; }
document.addEventListener('keydown',e=>{
  if(e.key>='1'&&e.key<='4'){ const t=tiles[Number(e.key)-1]; if(t){t.click(); e.preventDefault();} }
  const cols=matchMedia('(min-width:720px)').matches?2:1;
  if(['ArrowRight','ArrowDown','ArrowLeft','ArrowUp'].includes(e.key)){ let n=tiles.current??0; if(e.key==='ArrowRight')n+=1; if(e.key==='ArrowLeft')n-=1; if(e.key==='ArrowDown')n+=cols; if(e.key==='ArrowUp')n-=cols; focusTile(n); e.preventDefault(); }
  if(e.key==='Enter'||e.key===' '){ const t=tiles[tiles.current??0]; if(t){t.click(); e.preventDefault();} }
});

// Tilt hover
if(!matchMedia('(prefers-reduced-motion: reduce)').matches){ tiles.forEach(tile=>{ tile.addEventListener('pointermove',e=>{ if(tile.dataset.tilt!=='1')return; const r=tile.getBoundingClientRect(); const x=(e.clientX-r.left)/r.width-.5; const y=(e.clientY-r.top)/r.height-.5; tile.style.transform=`translateY(-2px) perspective(800px) rotateX(${y*-2}deg) rotateY(${x*2}deg)`; }); tile.addEventListener('pointerleave',()=>{ tile.style.transform=''; }); }); }

// Fade-in stagger
(function(){ const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches; if(reduced)return; const grid=$('.tiles'); if(!grid)return; tiles.forEach(t=>t.classList.add('_hidden')); const io=new IntersectionObserver(es=>{ if(es.some(e=>e.isIntersecting)){ tiles.forEach((t,i)=>setTimeout(()=>{ t.classList.add('_show'); t.classList.remove('_hidden'); },i*120)); io.disconnect(); } },{threshold:.15}); io.observe(grid); })();
