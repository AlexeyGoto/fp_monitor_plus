// modules/pivotRenderer.js
// Pivot: автофильтры, перенос длинных названий, широкий "Топ игр",
// экспорт CSV (UTF-8 BOM) и работающая кнопка "Обновить данные".

(() => {
  // ===== УТИЛИТЫ =====
  const NF = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const debounce = (fn, ms = 150) => { let t; return (...a)=>{ clearTimeout(t); t = setTimeout(()=>fn(...a), ms); }; };
  const hhmm = mins => { mins = +mins||0; const h = Math.floor(mins/60), m = mins%60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`; };
  const parseMoney = v => {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    const s = String(v).replace(/[^\d,.\-]/g,'').replace(/\s+/g,'');
    if (/,/.test(s) && /\./.test(s)) return parseFloat(s.replace(/\./g,'').replace(',','.')) || 0;
    if (/,/.test(s)) return parseFloat(s.replace(',','.')) || 0;
    return parseFloat(s) || 0;
  };
  const minutesFromDuration = s => {
    if (!s) return 0; s = s.trim();
    let m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (m) return (+m[1])*60 + (+m[2]) + Math.floor((+m[3]||0)/60);
    m = s.match(/(?:(\d+)\s*ч)?\s*(?:(\d+)\s*м(?:ин)?)?/i);
    if (m) return (+m[1]||0)*60 + (+m[2]||0);
    m = s.match(/(\d+)\s*мин?/i);
    return m ? +m[1] : 0;
  };
  const canonGameName = n => String(n||'').replace(/[\u0000-\u001F\u007F-\u009F]/g,'').replace(/[–—]/g,'-').replace(/\s+/g,' ').trim().toLowerCase();
  const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // ===== АГРЕГАЦИЯ =====
  function aggregate(sessions, { dateFrom=null, dateTo=null, group='pc', selGames=null, selPCs=null } = {}) {
    const df = dateFrom ? dateFrom.replace(/-/g,'') : null;
    const dt = dateTo   ? dateTo.replace(/-/g,'')   : null;
    const arr = Array.isArray(sessions) ? sessions : Object.values(sessions||{});

    const byGame = new Map(), byPC = new Map();

    for (const s of arr) {
      if (!s) continue;
      const day = (s.startTime||'').split(' ')[0]; // YYYY-MM-DD
      if (df && day && day.replace(/-/g,'') < df) continue;
      if (dt && day && day.replace(/-/g,'') > dt) continue;

      const gameDisplay = (s.gameName||'').replace(/\s+/g,' ').trim() || '(Без названия)';
      const gameKey = canonGameName(gameDisplay);
      const pc = (s.pcName||'').trim() || '(Неизв.)';

      if (selGames && selGames.size && !selGames.has(gameKey)) continue;
      if (selPCs && selPCs.size && !selPCs.has(pc)) continue;

      const income = parseMoney(s.income);
      const mins = minutesFromDuration(s.duration);

      // игры
      let g = byGame.get(gameKey);
      if (!g) g = { game: gameDisplay, k: gameKey, sessions: 0, income: 0, minutes: 0, pcs: new Set() };
      g.sessions++; g.income += income; g.minutes += mins; g.pcs.add(pc);
      byGame.set(gameKey, g);

      // ПК
      let p = byPC.get(pc);
      if (!p) p = { pc, sessions: 0, income: 0, minutes: 0, games: new Map() };
      p.sessions++; p.income += income; p.minutes += mins;
      let pg = p.games.get(gameKey);
      if (!pg) pg = { game: gameDisplay, sessions: 0, income: 0, minutes: 0 };
      pg.sessions++; pg.income += income; pg.minutes += mins;
      p.games.set(gameKey, pg);
      byPC.set(pc, p);
    }

    const games = Array.from(byGame.values()).map(g => ({
      game: g.game, sessions: g.sessions, minutes: g.minutes, income: g.income,
      incomePerHour: g.minutes ? g.income / (g.minutes/60) : 0,
      avgSessionMin: g.sessions ? g.minutes / g.sessions : 0,
      pcs: g.pcs.size
    }));

    const pcs = Array.from(byPC.values()).map(p => ({
      pc: p.pc, sessions: p.sessions, minutes: p.minutes, income: p.income,
      incomePerHour: p.minutes ? p.income / (p.minutes/60) : 0,
      avgSessionMin: p.sessions ? p.minutes / p.sessions : 0,
      topGames: Array.from(p.games.values()).sort((a,b)=>b.income-a.income).slice(0,5)
    }));

    const totals = (list, keys) => keys.reduce((acc,k)=>(acc[k]=list.reduce((s,x)=>s+(x[k]||0),0),acc),{});
    return { games, pcs, totalsGames: totals(games,['sessions','minutes','income']), totalsPCs: totals(pcs,['sessions','minutes','income']) };
  }

  // ===== СТИЛИ =====
  const STYLE = `
  <style id="fogpivot-style">
    .fogpivot *{box-sizing:border-box}
    .fogpivot{--panel:#141c26;--line:#233044;--line2:#2c3b52;--text:#e6edf3;--muted:#8b949e;--accent:#2ea043;color:var(--text);font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial}
    .fogpivot h1{font-size:20px;margin:0 0 12px}
    .fogpivot .panel{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px}

    .fogpivot .toolbar{display:flex;flex-direction:column;gap:10px}
    .fogpivot .row1{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;align-items:center}
    .fogpivot .row1 .btns{display:flex;gap:8px;flex-wrap:wrap}
    .fogpivot input[type="date"], .fogpivot select{width:100%;height:38px;background:#0d131b;border:1px solid var(--line2);color:var(--text);border-radius:10px;padding:8px 10px}
    .fogpivot .btn{height:38px;background:var(--accent);color:#fff;border:none;border-radius:10px;padding:0 14px;cursor:pointer}
    .fogpivot .btn.secondary{background:#263240}
    .fogpivot .btn.ghost{background:transparent;border:1px solid var(--line2)}
    .fogpivot .btn[disabled]{opacity:.6;cursor:default}

    .fogpivot .row2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    @media (max-width: 1100px){ .fogpivot .row2{grid-template-columns:1fr} }

    /* мультиселекты */
    .ms{position:relative;width:100%}
    .ms .ms-control{display:flex;align-items:center;gap:8px;min-height:38px;max-height:88px;background:#0d131b;border:1px solid var(--line2);color:var(--text);border-radius:10px;padding:6px 10px;cursor:pointer}
    .ms .chips{display:flex;gap:6px;flex-wrap:wrap;max-height:72px;overflow:auto}
    .ms .chip{background:#0b1118;border:1px solid var(--line2);border-radius:8px;padding:2px 6px;display:flex;gap:6px;align-items:center}
    .ms .chip .x{opacity:.7;cursor:pointer}
    .ms .placeholder{color:#6b7280}
    .ms .caret{margin-left:auto;opacity:.6}
    .ms .panel{position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:99;background:#0d131b;border:1px solid var(--line2);border-radius:10px;padding:8px;display:none;max-height:320px;overflow:auto}
    .ms.open .panel{display:block}
    .ms .search{width:100%;height:34px;background:#0b1118;border:1px solid var(--line2);color:var(--text);border-radius:8px;padding:6px 8px;margin-bottom:6px}
    .ms .opt{display:flex;align-items:center;gap:8px;padding:6px;border-radius:8px}
    .ms .opt:hover{background:#141c26}
    .ms .row-actions{display:flex;gap:6px;margin-top:6px}

    /* Таблица */
    .fogpivot .tablewrap{margin-top:12px;overflow:auto}
    .fogpivot table{width:100%;border-collapse:separate;border-spacing:0;table-layout:fixed;min-width:900px}
    .fogpivot th,.fogpivot td{border-bottom:1px solid var(--line2);padding:10px 12px;overflow:hidden;text-overflow:ellipsis;vertical-align:top}
    .fogpivot th{position:sticky;top:0;z-index:5;background:var(--panel);font-weight:600;text-align:left}
    .fogpivot tbody tr:nth-child(odd) td{background:rgba(255,255,255,0.02)}
    .fogpivot tr:hover td{background:rgba(88,166,255,0.06)}
    .fogpivot td.num,.fogpivot th.num{text-align:right;font-variant-numeric:tabular-nums;font-feature-settings:"tnum"}
    .fogpivot .totals{background:#0b1118;font-weight:600}
    .fogpivot .sort{cursor:pointer}
    .fogpivot .sort .arrow{opacity:.35;margin-left:6px}
    .fogpivot .sort.active .arrow{opacity:1}
    .fogpivot .hint{color:var(--muted);margin:8px 2px 0}

    /* обертки и ширины */
    .fogpivot td.wrap,.fogpivot th.wrap{white-space:normal;line-height:1.3;word-break:break-word}
    .fogpivot th.col-game,.fogpivot td.col-game{width:34%;}
    .fogpivot th.col-top,.fogpivot td.col-top{width:42%;}
    .fogpivot .tg-list .item{margin:0 0 4px 0}
    .fogpivot .muted{color:var(--muted)}
    .fogpivot iframe.fpm-hidden{display:none;width:0;height:0;border:0}
  </style>`;

  const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html!=null) n.innerHTML = html; return n; };

  // ===== МУЛЬТИСЕЛЕКТ =====
  function createMultiSelect({ id, placeholder, options, onChange }) {
    const root = el('div','ms'); root.id = id;
    const ctrl = el('div','ms-control');
    const chips = el('div','chips');
    const ph = el('span','placeholder', placeholder || 'Выбрать...');
    const caret = el('span','caret','▾');
    ctrl.appendChild(chips); ctrl.appendChild(ph); ctrl.appendChild(caret);

    const panel = el('div','panel');
    const search = el('input','search'); search.type='text'; search.placeholder='Поиск...';
    const list = el('div','list');
    const actions = el('div','row-actions');
    const btnAll = el('button','btn ghost','Все');
    const btnNone = el('button','btn ghost','Сброс');
    actions.appendChild(btnAll); actions.appendChild(btnNone);
    panel.appendChild(search); panel.appendChild(list); panel.appendChild(actions);

    root.appendChild(ctrl); root.appendChild(panel);

    const selected = new Set();

    function renderList(filter='') {
      const q = filter.trim().toLowerCase();
      list.innerHTML = '';
      for (const {key,label} of options) {
        if (q && !label.toLowerCase().includes(q)) continue;
        const row = el('label','opt');
        const cb = document.createElement('input'); cb.type='checkbox'; cb.checked = selected.has(key);
        const txt = el('span','', escapeHtml(label));
        row.appendChild(cb); row.appendChild(txt);
        row.addEventListener('click', (e)=>{
          if (e.target.tagName !== 'INPUT') cb.checked = !cb.checked;
          if (cb.checked) selected.add(key); else selected.delete(key);
          renderChips(); onChange && onChange(); e.stopPropagation();
        });
        list.appendChild(row);
      }
    }
    function renderChips() {
      chips.innerHTML = '';
      if (!selected.size) { ph.style.display=''; return; }
      ph.style.display='none';
      for (const {key,label} of options) {
        if (!selected.has(key)) continue;
        const c = el('span','chip', `${escapeHtml(label)} <span class="x">×</span>`);
        c.querySelector('.x').addEventListener('click', (e)=>{ e.stopPropagation(); selected.delete(key); renderList(search.value); renderChips(); onChange && onChange(); });
        chips.appendChild(c);
      }
    }

    ctrl.addEventListener('click', ()=>{ root.classList.toggle('open'); search.focus(); });
    document.addEventListener('click', e=>{ if (!root.contains(e.target)) root.classList.remove('open'); });
    search.addEventListener('input', ()=>renderList(search.value));
    btnAll.addEventListener('click', e=>{ e.preventDefault(); options.forEach(o=>selected.add(o.key)); renderList(search.value); renderChips(); onChange && onChange(); });
    btnNone.addEventListener('click', e=>{ e.preventDefault(); selected.clear(); renderList(search.value); renderChips(); onChange && onChange(); });

    renderList(); renderChips();

    return { root, getSelectedKeys: ()=>new Set(selected), setSelectedKeys: keys => { selected.clear(); keys.forEach(k=>selected.add(k)); renderList(search.value); renderChips(); } };
  }

  // ===== ТАБЛИЦА =====
  const sortBy = (arr, key, dir) => arr.sort((a,b)=>{
    const va=a[key], vb=b[key];
    if (typeof va==='string' && typeof vb==='string') return (dir==='desc'?-1:1)*va.localeCompare(vb);
    return (dir==='desc'?-1:1)*(va - vb);
  });

  function buildTable(container, rows, group, sortState, onHeaderSort, totals) {
    const wrap = el('div','panel tablewrap');
    const table = el('table');

    const colsGame = [
      { key:'game', title:'Игра', cls:'wrap col-game' },
      { key:'sessions', title:'Сессий', num:true },
      { key:'minutes', title:'Минут', num:true, format:v=>hhmm(v) },
      { key:'income', title:'Доход ₽', num:true, format:v=>NF.format(v) },
      { key:'incomePerHour', title:'₽/час', num:true, format:v=>NF.format(v) },
      { key:'avgSessionMin', title:'Средн. сессия', num:true, format:v=>hhmm(Math.round(v)) },
      { key:'pcs', title:'ПК, шт', num:true }
    ];
    const colsPC = [
      { key:'pc', title:'ПК' },
      { key:'sessions', title:'Сессий', num:true },
      { key:'minutes', title:'Минут', num:true, format:v=>hhmm(v) },
      { key:'income', title:'Доход ₽', num:true, format:v=>NF.format(v) },
      { key:'incomePerHour', title:'₽/час', num:true, format:v=>NF.format(v) },
      { key:'avgSessionMin', title:'Средн. сессия', num:true, format:v=>hhmm(Math.round(v)) },
      { key:'topGames', title:'Топ игр (до 5)', cls:'wrap col-top', render:v=>{
          const lines = v.map(g=>`<div class="item"><span>${escapeHtml(g.game)}</span> <span class="muted">— ${NF.format(g.income)}₽</span></div>`).join('');
          return `<div class="tg-list">${lines}</div>`;
        }
      }
    ];
    const cols = group==='game' ? colsGame : colsPC;

    const thead = el('thead'); const trh = el('tr');
    for (const c of cols) {
      const th = el('th', `${c.num?'num ':''}${c.cls||''} sort`); th.dataset.key = c.key;
      const arrow = (sortState.key===c.key) ? (sortState.dir==='desc' ? '▼' : '▲') : '▲';
      th.innerHTML = `<span>${c.title}</span><span class="arrow">${arrow}</span>`;
      if (sortState.key===c.key) th.classList.add('active');
      th.addEventListener('click', ()=>onHeaderSort(c.key));
      trh.appendChild(th);
    }
    thead.appendChild(trh);

    const tbody = el('tbody');
    for (const r of rows) {
      const tr = el('tr');
      for (const c of cols) {
        const td = el('td', `${c.num?'num ':''}${c.cls||''}`);
        let val = r[c.key];
        if (c.render) td.innerHTML = c.render(val, r);
        else { if (c.format) val = c.format(val); td.textContent = val==null ? '' : val; }
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }

    if (totals) {
      const tr = el('tr','totals');
      for (const c of cols) {
        const td = el('td', `${c.num?'num ':''}${c.cls||''}`);
        if (c.key === cols[0].key) td.textContent = 'ИТОГО';
        else if (c.key === 'sessions') td.textContent = totals.sessions || 0;
        else if (c.key === 'minutes') td.textContent = hhmm(totals.minutes || 0);
        else if (c.key === 'income') td.textContent = NF.format(totals.income || 0);
        else td.textContent = '';
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }

    table.appendChild(thead); table.appendChild(tbody);
    wrap.appendChild(table); container.appendChild(wrap);
    container.appendChild(el('div','hint','Подсказка: клик по заголовку меняет сортировку.'));
  }

  // ===== CSV =====
  function toCSV(rows, group){
    const header = group==='game'
      ? ['Игра','Сессий','Минут','Доход ₽','₽/час','Средн. сессия','ПК, шт'].join(';')
      : ['ПК','Сессий','Минут','Доход ₽','₽/час','Средн. сессия'].join(';');
    const body = rows.map(r=>{
      if (group==='game') return [
        `"${(r.game||'').replace(/"/g,'""')}"`,
        r.sessions, hhmm(r.minutes),
        NF.format(r.income), NF.format(r.incomePerHour),
        hhmm(Math.round(r.avgSessionMin)), r.pcs
      ].join(';');
      return [
        `"${(r.pc||'').replace(/"/g,'""')}"`,
        r.sessions, hhmm(r.minutes),
        NF.format(r.income), NF.format(r.incomePerHour),
        hhmm(Math.round(r.avgSessionMin))
      ].join(';');
    }).join('\r\n');
    return 'sep=;\r\n' + header + '\r\n' + body + '\r\n';
  }
  function downloadCSV(name, text){
    const BOM = '\uFEFF';
    const blob = new Blob([BOM, text], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  // ===== СТРАНИЦА =====
  function renderPivotPage(container) {
    if (!document.getElementById('fogpivot-style')) container.insertAdjacentHTML('afterbegin', STYLE);

    const root = el('div','fogpivot');
    root.appendChild(el('h1',null,'Аналитика по сессиям'));

    const toolbar = el('div','panel toolbar');
    const row1 = el('div','row1');
    row1.innerHTML = `
      <input id="pvStart" type="date" placeholder="Дата от">
      <input id="pvEnd" type="date" placeholder="Дата до">
      <select id="pvGroup">
        <option value="pc">Группировка: по ПК</option>
        <option value="game">Группировка: по играм</option>
      </select>
      <div class="btns">
        <button id="pv7" class="btn secondary" title="7 дней">7д</button>
        <button id="pv30" class="btn secondary" title="30 дней">30д</button>
        <button id="pvAll" class="btn secondary">Все</button>
        
        <button id="pvReset" class="btn ghost">Сброс</button>
        <button id="pvExport" class="btn ghost">Экспорт CSV</button>
      </div>
    `;
    const row2 = el('div','row2'); row2.innerHTML = `<div id="slotPC"></div><div id="slotGame"></div>`;
    toolbar.appendChild(row1); toolbar.appendChild(row2);

    const tableHost = el('div');
    root.appendChild(toolbar); root.appendChild(tableHost);
    container.appendChild(root);

    // слушаем изменения стораджа -> перерисовать
    const storageListener = (changes, area) => {
      if (area !== 'local') return;
      if (changes.sessions || changes.fpmCollectTick) render();
    };
    chrome.storage.onChanged.addListener(storageListener);
    window.addEventListener('beforeunload', ()=> chrome.storage.onChanged.removeListener(storageListener));

    chrome.storage.local.get(['sessions'], st=>{
      const initial = st.sessions || {};

      // списки значений для мультиселектов на старте
      const pcsSet = new Set(); const gamesMap = new Map();
      Object.values(initial).forEach(s=>{
        if (s?.pcName) pcsSet.add(s.pcName.trim());
        const g = (s?.gameName||'').replace(/\s+/g,' ').trim() || '(Без названия)';
        gamesMap.set(canonGameName(g), g);
      });
      const pcOptions = Array.from(pcsSet).sort().map(x=>({ key:x, label:x }));
      const gameOptions = Array.from(gamesMap.entries()).sort((a,b)=>a[1].localeCompare(b[1])).map(([k,v])=>({ key:k, label:v }));

      const state = { dateFrom:null, dateTo:null, group:'pc', sortKey:'incomePerHour', sortDir:'desc',
                      selPCs:new Set(), selGames:new Set() };

      const apply = debounce(() => {
        state.dateFrom = toolbar.querySelector('#pvStart').value || null;
        state.dateTo   = toolbar.querySelector('#pvEnd').value   || null;
        state.group    = toolbar.querySelector('#pvGroup').value;
        state.selPCs   = msPC.getSelectedKeys();
        state.selGames = msGame.getSelectedKeys();
        render();
      }, 120);

      const msPC = createMultiSelect({ id:'msPC', placeholder:'ПК (множественный выбор)', options: pcOptions, onChange: apply });
      const msGame = createMultiSelect({ id:'msGame', placeholder:'Игры (множественный выбор)', options: gameOptions, onChange: apply });
      toolbar.querySelector('#slotPC').appendChild(msPC.root);
      toolbar.querySelector('#slotGame').appendChild(msGame.root);

      // автоапплаи на даты/группировку
      toolbar.querySelector('#pvStart').addEventListener('change', apply);
      toolbar.querySelector('#pvEnd').addEventListener('change', apply);
      toolbar.querySelector('#pvGroup').addEventListener('change', apply);

      // быстрые периоды — тоже авто
      const setPeriod = days => {
        const to = new Date(); const from = new Date(); from.setDate(to.getDate() - (days-1));
        toolbar.querySelector('#pvStart').value = from.toISOString().slice(0,10);
        toolbar.querySelector('#pvEnd').value   = to.toISOString().slice(0,10);
        apply();
      };
      toolbar.querySelector('#pv7').addEventListener('click', ()=>setPeriod(7));
      toolbar.querySelector('#pv30').addEventListener('click', ()=>setPeriod(30));
      toolbar.querySelector('#pvAll').addEventListener('click', ()=>{ toolbar.querySelector('#pvStart').value=''; toolbar.querySelector('#pvEnd').value=''; apply(); });

      // экспорт
      toolbar.querySelector('#pvExport').addEventListener('click', ()=>{
        chrome.storage.local.get(['sessions'], st2=>{
          const sess = st2.sessions || {};
          const agg = aggregate(sess, { dateFrom:state.dateFrom, dateTo:state.dateTo, group:state.group, selGames:state.selGames, selPCs:state.selPCs });
          const rows = state.group==='game' ? agg.games : agg.pcs;
          sortBy(rows, state.sortKey, state.sortDir);
          downloadCSV(`pivot_${state.group}_${new Date().toISOString().slice(0,10)}.csv`, toCSV(rows, state.group));
        });
      });

      // ОБНОВИТЬ ДАННЫЕ: отправляем сигнал и подстраховываемся iframe-ом
      //toolbar.querySelector('#pvRefresh').addEventListener('click', ()=>{
      //  const btn = toolbar.querySelector('#pvRefresh');
      //  btn.disabled = true; const old = btn.textContent; btn.textContent = 'Обновляю…';

        // 1) попытаемся через sendMessage в content.js (см. патч ниже)
      //  chrome.runtime.sendMessage({ type:'FPM_RUN_COLLECTION' }, ()=>{ /* ignore */ });

      //  // 2) фолбэк: грузим страницу Статистики в скрытом iframe и шлём ей postMessage
      //  let iframe = document.querySelector('iframe.fpm-hidden');
      //  if (!iframe) { iframe = document.createElement('iframe'); iframe.className='fpm-hidden'; document.body.appendChild(iframe); }
      //  iframe.onload = () => {
      //    try {
      //      iframe.contentWindow.postMessage({ type:'FPM_RUN_COLLECTION' }, '*');
      //      // в крайнем случае найдём кнопку по тексту и кликнем
      //      const tryClick = () => {
      //        const d = iframe.contentDocument;
      //        if (!d) return;
      //        const btns = Array.from(d.querySelectorAll('button,a')).filter(x =>
      //          /обнов/i.test(x.textContent) || x.dataset?.action === 'refreshStats');
      //        btns[0]?.click?.();
      //      };
      //      setTimeout(tryClick, 700);
      //    } catch (e) {/* cross-origin — просто игнор, сработает автоCollect ниже */}
      //  };
      //  iframe.src = 'https://fogplay.mts.ru/merchant/computers/?&autoCollect=1&from=pivot';

        // через 60 сек точно разблокируем кнопку
      //  setTimeout(()=>{ btn.disabled=false; btn.textContent = old; }, 60000);
      //});

      render();

      function render(){
        chrome.storage.local.get(['sessions'], st2=>{
          const sess = st2.sessions || initial;
          const agg = aggregate(sess, { dateFrom:state.dateFrom, dateTo:state.dateTo, group:state.group, selGames:state.selGames, selPCs:state.selPCs });
          const rows = state.group==='game' ? agg.games : agg.pcs;
          const totals = state.group==='game' ? agg.totalsGames : agg.totalsPCs;
          sortBy(rows, state.sortKey, state.sortDir);

          tableHost.innerHTML = '';
          buildTable(
            tableHost,
            rows,
            state.group,
            { key: state.sortKey, dir: state.sortDir },
            key => { state.sortDir = (state.sortKey===key && state.sortDir==='desc') ? 'asc' : 'desc'; state.sortKey = key; render(); },
            totals
          );
        });
      }
    });
  }

  window.PivotRenderer = { renderPivotPage };
})();
