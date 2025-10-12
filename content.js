// ===================== content.js =====================

/* ================== DEBUG ================== */
const DEBUG = true;
function dlog(...args){ if (DEBUG) try { console.log('[fpmp][content]', ...args); } catch{} }

/* ========== Мини-лоадер для стат. экрана ========== */
(() => {
  if (window.FPLoader) return;
  const css = `
  .fp-loader-overlay{position:fixed;inset:0;background:rgba(6,12,20,.65);backdrop-filter:saturate(130%) blur(2px);
    display:flex;align-items:center;justify-content:center;z-index:9999}
  .fp-loader{width:72px;height:72px;border-radius:16px;background:radial-gradient(circle at 30% 30%,#263b5c 0,#1a2841 60%,#121b2c 100%);
    box-shadow:0 10px 30px rgba(0,0,0,.35),inset 0 0 0 1px rgba(255,255,255,.04);position:relative}
  .fp-loader::before,.fp-loader::after{content:"";position:absolute;inset:10px;border-radius:12px;border:3px solid transparent;
    border-top-color:#7b61ff;border-right-color:#22d3ee;animation:fp-spin 1s linear infinite}
  .fp-loader::after{inset:16px;border-top-color:#22d3ee;border-right-color:#7b61ff;animation-duration:1.4s;opacity:.9}
  @keyframes fp-spin{to{transform:rotate(360deg)}}

  .fp-mini{position:fixed;right:16px;bottom:16px;z-index:9999;display:flex;gap:10px;align-items:center;
    background:rgba(16,25,38,.9);border-radius:12px;padding:10px 12px;box-shadow:0 8px 30px rgba(0,0,0,.35),inset 0 0 0 1px rgba(255,255,255,.04)}
  .fp-mini .dot{width:20px;height:20px;border-radius:50%;border:2px solid transparent;border-top-color:#7b61ff;border-right-color:#22d3ee;animation:fp-spin .9s linear infinite}
  .fp-mini .txt{font-size:13px;color:#e6edf6;opacity:.9}

  /* Верхняя строка на /merchant/computers */
  .fpmp-row{display:flex;align-items:center;gap:16px;padding:10px 0;margin:2px 0 10px;border-bottom:1px solid rgba(255,255,255,.06)}
  .fpmp-info{margin-left:auto;display:flex;align-items:center;gap:10px;font-size:14px;color:#cbd5e1}
  .fpmp-info b{font-weight:700;color:#fff}
  .fpmp-sep{opacity:.35}
  .fpmp-cat{min-width:180px;display:flex;align-items:center;justify-content:flex-end;gap:6px}
  .fpmp-cat .spin{width:16px;height:16px;border:2px solid rgba(255,255,255,.25);border-top-color:#74DF8B;border-radius:50%;animation:fp-spin .9s linear infinite}
  @keyframes fpmp-dance{0%{transform:translateY(0) rotate(0)}50%{transform:translateY(-3px) rotate(6deg)}100%{transform:translateY(0) rotate(0)}}
  .fpmp-cat .cat{display:inline-block;animation:fpmp-dance .9s ease-in-out infinite}
  .fpmp-cat.off .spin,.fpmp-cat.off .cat,.fpmp-cat.off .txt{visibility:hidden}

  /* Блок занятости в меню */
  .fpmp-aside-load{margin-top:8px}
  .fpmp-aside-load .bar{height:6px;border-radius:999px;background:rgba(255,255,255,.1);overflow:hidden}
  .fpmp-aside-load .bar>i{display:block;height:100%;width:0%;background:linear-gradient(90deg,#60a5fa,#22c55e)}
  .fpmp-aside-load .label{margin-top:6px;font-size:12px;color:#cbd5e1;opacity:.9}
  `;
  const st = document.createElement('style'); st.id='fpmp-css'; st.textContent=css;
  (document.head || document.documentElement).appendChild(st);

  let overlay=null, mini=null;
  function showOverlay(){ if(!overlay){ overlay=document.createElement('div'); overlay.className='fp-loader-overlay'; overlay.innerHTML='<div class="fp-loader"></div>'; document.body?.appendChild(overlay);} }
  function hideOverlay(){ overlay?.remove(); overlay=null; }
  function showMini(text='Обновляю…'){ if(!mini){ mini=document.createElement('div'); mini.className='fp-mini'; mini.innerHTML='<div class="dot"></div><div class="txt"></div>'; document.body?.appendChild(mini);} mini.querySelector('.txt').textContent=text; }
  function hideMini(){ mini?.remove(); mini=null; }
  window.FPLoader = { showOverlay, hideOverlay, showMini, hideMini };
})();

/* ================== Утилиты ================== */
function fmtRu(dtISO){
  if (!dtISO) return '—';
  const d = new Date(String(dtISO).replace(' ','T'));
  if (!isFinite(d)) return '—';
  const pad=n=>String(n).padStart(2,'0');
  return `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function hasWork(anchor){
  const next = Number(anchor?.nextPage||0);
  const last = Number(anchor?.lastPageSnapshot||0);
  return !!anchor && last>0 && next<=last;
}
function onReady(fn){ (document.readyState==='loading') ? document.addEventListener('DOMContentLoaded', fn, {once:true}) : fn(); }

/* Promise-обёртка над sendMessage с логами/lastError */
function sendMessage(msg){
  return new Promise((resolve) => {
    try{
      chrome.runtime.sendMessage(msg, (resp) => {
        const err = chrome.runtime.lastError;
        if (err){
          dlog('sendMessage error:', err.message, msg);
          resolve({ ok:false, error:err.message });
        } else {
          dlog('sendMessage ok:', msg, resp);
          resolve(resp ?? { ok:true });
        }
      });
    }catch(e){
      dlog('sendMessage exception:', e, msg);
      resolve({ ok:false, error:String(e) });
    }
  });
}

/* ================== Статистика/Пивот как было ================== */
async function showStatistic(e){
  if (e) e.preventDefault();
  FPLoader.showOverlay();
  try{
    const main=document.querySelector('main'); if(!main) return;
    const {statistics, dateRange}=await chrome.storage.local.get(['statistics','dateRange']);
    main.innerHTML='';
    const c=document.createElement('div'); c.className='merchant-statistic-container';
    if (statistics) c.insertAdjacentHTML('afterbegin', window.UIComponents?.dateRangeHtml||'');
    main.appendChild(c);
    const statsToShow = statistics ? (dateRange ? await window.DataFilter.filterStatsByDateRange(statistics,dateRange.start,dateRange.end) : statistics) : null;
    if (window.UIComponents?.createStatisticHTML) c.appendChild(window.UIComponents.createStatisticHTML(statsToShow));
    if (dateRange){ const s=document.getElementById('startDate'), e1=document.getElementById('endDate'); if(s) s.value=dateRange.start; if(e1) e1.value=dateRange.end; }
    window.EventHandlers?.setupHandlers?.(c);
    chrome.storage.onChanged.addListener((changes)=>{
      if (changes.parsingMode){ const m=changes.parsingMode.newValue; if (m==='full'||m==='inc') FPLoader.showMini('Иду по страницам…'); if(m==='idle') FPLoader.hideMini(); }
      if (changes.parsingProgress){ const v=changes.parsingProgress.newValue; if (v!=null) FPLoader.showMini(`Прогресс: ${(v*100|0)}%`); }
    });
  } finally { FPLoader.hideOverlay(); }
}
async function showPivot(e){
  if (e) e.preventDefault();
  const main=document.querySelector('main'); if(!main) return;
  main.innerHTML=''; const c=document.createElement('div'); c.className='merchant-statistic-container';
  c.insertAdjacentHTML('afterbegin', window.UIComponents?.baseStyle||''); main.appendChild(c);
  window.PivotRenderer?.renderPivotPage?.(c);
}

/* ================== Занятость платформы (верх меню) ================== */
let _fpmpLoadTimer=null;
async function injectAsidePlatformLoadInMenu(){
  const menu=document.querySelector('.merchant-aside-menu');
  if (!menu || menu.querySelector('#fpmp-aside-load-menu')) return;

  const box=document.createElement('div');
  box.id='fpmp-aside-load-menu'; box.className='fpmp-aside-load'; box.style.margin='8px 12px 12px';
  box.innerHTML=`
    <div class="label" style="margin:0 0 6px 0">Занятость платформы</div>
    <div class="bar"><i style="width:0%"></i></div>
    <div class="label"><span id="fpmp-aside-load-label">недоступно</span></div>`;
  menu.insertBefore(box, menu.firstChild);

  const bar=box.querySelector('.bar>i');
  const lbl=box.querySelector('#fpmp-aside-load-label');






  async function refresh() {
    dlog('platformLoad: start');
    const res = await sendMessage({ type: 'fpmp:getPlatformLoad' });
    if (!res || res.ok === false) {
      dlog('platformLoad: FAIL', res);
      bar.style.width = '0%';
      lbl.textContent = 'недоступно';
      return;
    }
  
    // --- НОРМАЛИЗАЦИЯ ЛЮБОЙ ФОРМЫ ОТВЕТА ---
    let payload = res?.data;              // может быть числом, строкой или объектом { percentage }
    let raw =
        (payload && typeof payload === 'object' && 'percentage' in payload) ? payload.percentage :
        (typeof payload === 'number') ? payload :
        (typeof payload === 'string') ? parseFloat(payload) :
        (typeof res?.percentage === 'number') ? res.percentage :
        (typeof res?.value === 'number') ? res.value :
        (typeof res?.raw === 'number') ? res.raw :
        (typeof res?.raw === 'string') ? parseFloat(res.raw) :
        0;
  
    if (!Number.isFinite(raw)) raw = 0;
  
    // принимаем 0..1 как долю, иначе как %
    const val = raw <= 1 ? Math.round(raw * 100) : Math.round(raw);
  
    dlog('platformLoad: OK', { raw, parsed: val, res });
  
    bar.style.width = `${val}%`;
    lbl.textContent = `${val}%`;
  }


  // экспорт для ручного вызова в консоли
  window.fpmpForceRefresh = refresh;

  await refresh();
  clearInterval(_fpmpLoadTimer);
  _fpmpLoadTimer = setInterval(refresh, 120000);
}

/* ================== Верхняя строка «Компьютеры» ================== */
async function injectComputersHeader(){
  if (!/^\/merchant\/computers\/?$/.test(location.pathname)) return;

  const host =
    document.querySelector('.merchant-content .merchant-content__header') ||
    document.querySelector('.merchant-content') ||
    document.querySelector('.merchant-main');
  if (!host || document.getElementById('fpmp-hist-panel')) return;

  const row=document.createElement('div');
  row.id='fpmp-hist-panel'; row.className='fpmp-row';
  row.innerHTML=`
    <div class="form-field form-field__switch">
      <label class="form-field__switch-label" style="gap:12px;">
        <input class="form-field__checkbox" type="checkbox" id="fpmp-hist-toggle"/>
        <div class="form-field__switch__switcher"><div class="form-field__switch__switcher-trigger"></div></div>
        <div class="form-field__switch-label-title">Историческая подкачка</div>
      </label>
    </div>
    <div class="fpmp-info">
      <span>Страница: <b id="fpmp-hist-page">—</b></span>
      <span class="fpmp-sep">•</span>
      <span>Дата: <b id="fpmp-hist-date">—</b></span>
      <span class="fpmp-sep">•</span>
      <span>Снимок хвоста: <b id="fpmp-hist-last">—</b></span>
      <span class="fpmp-cat off" id="fpmp-hist-anim">
        <span class="spin"></span><span class="cat">🐱</span><span class="txt" style="opacity:.8">идёт подкачка…</span>
      </span>
    </div>`;
  if (host.firstElementChild) host.insertBefore(row, host.firstElementChild); else host.appendChild(row);

  const toggleEl=row.querySelector('#fpmp-hist-toggle');
  const pageEl=row.querySelector('#fpmp-hist-page');
  const dateEl=row.querySelector('#fpmp-hist-date');
  const lastEl=row.querySelector('#fpmp-hist-last');
  const animEl=row.querySelector('#fpmp-hist-anim');
  const setCat=(en,a)=> animEl.classList.toggle('off', !(en && hasWork(a)));

  // init
  {
    const { historyBackfillEnabled=false, historyAnchor=null } =
      await chrome.storage.local.get(['historyBackfillEnabled','historyAnchor']);
    toggleEl.checked=!!historyBackfillEnabled;
    pageEl.textContent = historyAnchor?.currentPage ?? (historyAnchor?.nextPage ? historyAnchor.nextPage-1 : '—');
    dateEl.textContent = fmtRu(historyAnchor?.pageDateISO);
    lastEl.textContent = historyAnchor?.lastPageSnapshot ?? '—';
    setCat(historyBackfillEnabled, historyAnchor);
  }

  // toggle
  toggleEl.addEventListener('change', async (ev)=>{
    const enabled=!!ev.target.checked;
    await chrome.storage.local.set({ historyBackfillEnabled: enabled });
    if (!enabled) return setCat(false, null);
    try{
      const a=await window.DataParser.ensureHistoryAnchor();
      pageEl.textContent = a?.currentPage ?? (a?.nextPage ? a.nextPage-1 : '—');
      dateEl.textContent = fmtRu(a?.pageDateISO);
      lastEl.textContent = a?.lastPageSnapshot ?? '—';
      setCat(true, a);
    }catch(e){ dlog('ensureHistoryAnchor error', e); }
  });

  // live updates
  chrome.storage.onChanged.addListener(async (changes, area)=>{
    if (area!=='local') return;
    if (changes.historyAnchor){
      const a=changes.historyAnchor.newValue||{};
      pageEl.textContent = a?.currentPage ?? (a?.nextPage ? a.nextPage-1 : '—');
      dateEl.textContent = fmtRu(a?.pageDateISO);
      lastEl.textContent = a?.lastPageSnapshot ?? '—';
      const { historyBackfillEnabled=false } = await chrome.storage.local.get(['historyBackfillEnabled']);
      setCat(historyBackfillEnabled, a);
    }
    if (changes.historyBackfillEnabled){
      const en=!!changes.historyBackfillEnabled.newValue;
      const { historyAnchor=null } = await chrome.storage.local.get(['historyAnchor']);
      setCat(en, historyAnchor);
    }
  });
}

/* ================== Меню (Статистика/Аналитика) ================== */
function bootSideMenu(){
  try{
    if (!window.UIComponents || !window.UIComponents.addMenuItem) return false;
    window.UIComponents.addMenuItem();
    const q=location.search||'';
    if (q.includes('openPivot')) { showPivot(); return true; }
    if (q.includes('openStats')) { showStatistic(); return true; }
    return true;
  }catch(e){ dlog('addMenuItem failed', e); return false; }
}

/* ================== Инициализация ================== */
function init(){
  // меню
  if (!bootSideMenu()){
    const moMenu=new MutationObserver(()=>{ if(bootSideMenu()) moMenu.disconnect(); });
    moMenu.observe(document.documentElement,{childList:true,subtree:true});
  }

  // занятость сверху меню
  const ensureMenu=()=>{ if(document.querySelector('.merchant-aside-menu')){ injectAsidePlatformLoadInMenu(); return true; } return false; };
  if (!ensureMenu()){
    const mo=new MutationObserver(()=>{ if(ensureMenu()) mo.disconnect(); });
    mo.observe(document.documentElement,{childList:true,subtree:true});
  }

  // верхняя строка на /merchant/computers
  const bootComputers=()=>{ try{ injectComputersHeader(); }catch(e){ dlog('hdr err',e);} };
  if (document.querySelector('.merchant-content')) bootComputers();
  else {
    const mo=new MutationObserver(()=>{ if(document.querySelector('.merchant-content')){ mo.disconnect(); bootComputers(); }});
    mo.observe(document.documentElement,{childList:true,subtree:true});
  }
}

onReady(init);

// поддержка soft-навигации
(() => {
  const _push=history.pushState, _replace=history.replaceState;
  const reb=()=>setTimeout(()=>{ bootSideMenu(); try{injectAsidePlatformLoadInMenu();}catch{} try{injectComputersHeader();}catch{} },0);
  history.pushState=function(){ _push.apply(this,arguments); reb(); };
  history.replaceState=function(){ _replace.apply(this,arguments); reb(); };
  window.addEventListener('popstate', reb);
})();
