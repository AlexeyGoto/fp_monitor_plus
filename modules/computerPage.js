// modules/computerPage.js
(function () {
  if (window.__fpComputerPage) return;
  window.__fpComputerPage = true;

  // ---------- CSS ----------
  (function injectCss(){
    if (document.getElementById('fp-computer-css')) return;
    const css = `
      #fp-current-inline { margin-top:6px; }

      /* наша карточка точно такой же ширины, как "Результат модерации",
         потому что мы используем тот же контейнер merchant-list-wrapper */
      #fp-metrics-wrap { margin-top:16px; }

      /* внутри карточки — компактная вёрстка: слева строки KPI, справа кнопки и даты */
      #fp-metrics-card .merchant-list-body { padding: 16px 20px; }
      #fp-metrics-card .fp-layout { display:flex; gap:24px; align-items:flex-start; }
      #fp-metrics-card .fp-stat-rows { flex:1; min-width:280px; }

      .fp-row {
        display:flex; align-items:center; justify-content:space-between;
        padding:12px 4px; border-top:1px solid rgba(255,255,255,.08);
      }
      .fp-row:first-child { border-top:0; }
      .fp-row .lbl { opacity:.75; }
      .fp-row .val { font-weight:700; }

      /* правая колонка с чипами и датами */
      #fp-metrics-card .fp-controls {
        width:260px; min-width:260px;
        display:flex; flex-direction:column; gap:10px; align-items:stretch;
      }
      .fp-chip.button {
        padding:4px 10px !important;
        height:28px !important;
        font-size:12px !important;
        line-height:18px !important;
        border-radius:10px !important;
        text-align:center;
        width:100%;
      }
      /* явно подсвечиваем выбранную кнопку */
      .fp-chip.button--active {
        background: rgba(178,219,249,.14) !important;
        box-shadow: inset 0 0 0 1px rgba(178,219,249,.45);
        filter:none;
      }
      .fp-chip:active { filter:brightness(1.08); }

      .fp-range { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
      .fp-range .form-field__label { display:flex; gap:6px; align-items:center; }
      .fp-range .form-field__label__title { font-size:12px; opacity:.7; }
      .fp-range .form-field__input {
        height:28px; font-size:12px; padding:0 8px; border-radius:8px; min-width:130px;
      }

      /* адаптив — на узких экранах правую колонку переносим ниже */
      @media (max-width: 1100px) {
        #fp-metrics-card .fp-layout { flex-direction:column; }
        #fp-metrics-card .fp-controls { width:100%; min-width:0; }
      }

      /* Таблица "Сессии" — аккуратные ширины */
      #fp-sessions .merchant-table th, #fp-sessions .merchant-table td { padding:12px 16px; vertical-align:middle; }
      #fp-sessions .merchant-table th:nth-child(1), #fp-sessions .merchant-table td:nth-child(1) { min-width:200px; width:200px; }
      #fp-sessions .merchant-table th:nth-child(2), #fp-sessions .merchant-table td:nth-child(2) { min-width:200px; width:200px; }
      #fp-sessions .merchant-table th:nth-child(3), #fp-sessions .merchant-table td:nth-child(3) { min-width:120px; width:120px; text-wrap:nowrap; }
      #fp-sessions .merchant-table th:nth-child(5), #fp-sessions .merchant-table td:nth-child(5) { min-width:110px; width:110px; text-align:right; }
      #fp-sessions .merchant-table th:nth-child(6), #fp-sessions .merchant-table td:nth-child(6) { min-width:130px; width:130px; }
    `;
    const st = document.createElement('style');
    st.id = 'fp-computer-css';
    st.textContent = css;
    document.documentElement.appendChild(st);
  })();

  // ---------- utils ----------
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const $  = (s, r=document) => r.querySelector(s);
  const fmtRub = n => new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:2}).format(n||0);
  const minutes = (ms)=> Math.round(ms/60000);
  const clamp = (v,min,max)=>Math.min(max,Math.max(min,v));
  const parseMoney = s => parseFloat(String(s||'0').replace(/[^\d.,-]/g,'').replace(',', '.')) || 0;
  const minFromStr = s => parseInt(String(s||'0').replace(/[^\d]/g,''),10) || 0;
  const startOfToday = () => { const n=new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
  const pcNameFromHeader = () => $('.merchant-computer-name')?.textContent.trim() || null;
  const isOpenSession = s => { const st=(s?.status||'').toLowerCase(); return !s?.endTime || s.endTime==='-' || (!st.includes('заверш')); };
  const overlapMinutes = (a1,a2,b1,b2)=> Math.max(0, minutes(Math.min(+a2,+b2) - Math.max(+a1,+b1)));

  // ВСЕ входящие даты из ЛК считаем в поясе Москвы (UTC+3)
  // Работает даже если window.fpTZ ещё не подгружен
  const parseMSK = (str) => {
    if (!str) return NaN;
    if (window.fpTZ?.parseMSKtoMs) return window.fpTZ.parseMSKtoMs(str);
    const s = String(str).trim().replace(' ', 'T');
    // если уже есть зона (Z или +hh:mm) — пусть парсится нативно
    if (/[zZ]|[+-]\d{2}:\d{2}$/.test(s)) return Date.parse(s);
    // иначе насильно добавляем +03:00
    return Date.parse(s + '+03:00');
  };

  function makeRange(kind, fromISO=null, toISO=null){
    const now = new Date();
    if (kind==='today') return { from: startOfToday(), to: now };
    if (kind==='7d')    return { from: new Date(+now-7*24*3600e3), to: now };
    if (kind==='30d')   return { from: new Date(+now-30*24*3600e3), to: now };
    let from = fromISO ? new Date(fromISO) : startOfToday();
    let to   = toISO   ? new Date(toISO)   : now;
    if (+from > +to) [from,to] = [to,from];
    return { from, to };
  }

  // ---------- data ----------
  async function loadSessionsForPc(pcName) {
    const { sessions = {} } = await chrome.storage.local.get(['sessions']);
    return Object.entries(sessions)
      .map(([id,data]) => ({ id, ...data }))
      .filter(s => (s.pcName||'') === pcName)
      .sort((a,b)=> new Date(b.startTime||0) - new Date(a.startTime||0));
  }
  async function loadReviewsForPc(pcName) {
    const { reviewsByPc = {} } = await chrome.storage.local.get(['reviewsByPc']);
    const b = reviewsByPc[pcName];
    return b?.items ? Object.values(b.items) : [];
  }

// ---------- Metrics (fixed 24h utilization) ----------
function calcUtilIncome(sessions, range) {
  const { from, to } = range;

  // фиксируем "сейчас" один раз
  const now = new Date();
  const last24from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const last24to   = now;

  let busyPeriodMin = 0;   // занятость в выбранном периоде
  let busy24Min     = 0;   // занятость за последние 24 часа (now-24h..now)
  let incomePeriod  = 0;
  let sessionsCount = 0;
  let income24      = 0;

  for (const s of sessions) {
    const stISO = s.startTime?.replace(' ', 'T');
    if (!stISO) continue;

    const st = new Date(stISO);
    // для открытых сессий конец = тот же now
    const en = (s.endTime && s.endTime !== '-')
      ? new Date(s.endTime.replace(' ', 'T'))
      : now;

    // занятость внутри выбранного периода
    busyPeriodMin += overlapMinutes(st, en, from, to);

    // занятость в последних 24 часах
    busy24Min     += overlapMinutes(st, en, last24from, last24to);

    // доходы считаем по датам старта
    if (st >= from && st <= to)        incomePeriod += parseMoney(s.income);
    if (st >= last24from && st <= now) income24     += parseMoney(s.income);

    sessionsCount++;
  }

  const totalMin   = Math.max(1, minutes(+to - +from));
  const utilPct    = clamp(Math.round((busyPeriodMin / totalMin) * 100), 0, 100);
  const utilPct24  = clamp(Math.round((busy24Min     / (24 * 60)) * 100), 0, 100);

  return {
    busyMin: busyPeriodMin,
    busy24Min,
    utilPct,
    utilPct24,
    incomePeriod,
    sessionsCount,
    income24
  };
}

// Средняя оценка по отзывам в выбранном диапазоне
function calcRating(reviews, range) {
  if (!Array.isArray(reviews) || reviews.length === 0) {
    return { avg: 0, count: 0 };
  }
  const { from, to } = range;

  // r.startISO — то, что мы кладём в reviewsByPc при парсинге
  const list = reviews.filter(r => {
    const has = r && r.rating != null;
    if (!has) return false;
    const ts = r.startISO ? new Date(r.startISO) : null;
    return ts ? (ts >= from && ts <= to) : false;
  });

  const count = list.length;
  if (!count) return { avg: 0, count: 0 };

  const sum = list.reduce((a, r) => a + (Number(r.rating) || 0), 0);
  return { avg: sum / count, count };
}


  // ---------- current session inline ----------
  function mountCurrentInline(headerCard, current){
    if (document.getElementById('fp-current-inline')) return;
    const host = headerCard.querySelector('.merchant-computer-name')?.parentElement || headerCard;
    const line = document.createElement('div'); line.id='fp-current-inline';
    if (!current) { line.textContent = 'Статус: Нет активной сессии'; }
    else {
      const strong=document.createElement('b'); strong.textContent=current.gameName||'—';
      const dur=document.createElement('span');
      //const ts=current.startTime?new Date(current.startTime.replace(' ','T')).getTime():null;
      let ts = null;
      if (current.startTime) {
        const iso = current.startTime.replace(' ', 'T');
        // если зона уже есть (Z или ±hh:mm) — используем как есть; иначе добавляем Москву
        ts = Date.parse(/[zZ]|[+\-]\d{2}:\d{2}$/.test(iso) ? iso : iso + '+03:00');
      }

      const tick=()=>{ const m=ts?minutes(Date.now()-ts):0; dur.textContent=` • ${Math.floor(m/60)} ч ${m%60} мин`; };
      tick(); setInterval(tick,30_000);
      line.append('Игра: ', strong, dur);
    }
    host.appendChild(line);
  }

  // ---------- find tariff card ----------
  function findTariffCard() {
    let el = document.querySelector('.merchant-list.merchant-list--tariff');
    if (el) return el;
    const txt = $$('*').find(n => n.childElementCount === 0 && /(^|\s)тариф(\s|$)/i.test(n.textContent||''));
    if (!txt) return null;
    let p = txt;
    for (let i=0; i<6 && p; i++, p=p.parentElement) {
      if (p.classList && p.classList.contains('merchant-list')) return p;
    }
    return txt.closest('.merchant-list') || txt.parentElement;
  }

  // ---------- mount metrics block (exactly like moderation width) ----------
  function mountMetricsUnderTariff(state){
    const tariffList = findTariffCard(); if (!tariffList) return null;
    const anchorWrap = tariffList.closest('.merchant-list-wrapper') || tariffList;

    if (document.getElementById('fp-metrics-wrap')) {
      // уже вставлено
    } else {
      const wrap = document.createElement('div');
      wrap.className = 'merchant-list-wrapper';
      wrap.id = 'fp-metrics-wrap';
      wrap.innerHTML = `
        <div class="merchant-list merchant-list--system" id="fp-metrics-card">
          <div class="merchant-list-header">
            <div class="merchant-list-title">Показатели (за период)</div>
          </div>
          <div class="merchant-list-body">
            <div class="fp-layout">
              <div class="fp-stat-rows">
                <div class="fp-row"><div class="lbl">Средний рейтинг</div><div class="val" data-kpi="rating">—</div></div>
                <div class="fp-row"><div class="lbl">Утилизация</div><div class="val" data-kpi="util">—</div></div>
                <div class="fp-row"><div class="lbl">Доход за период</div><div class="val" data-kpi="income">—</div></div>
                <div class="fp-row"><div class="lbl">Заработано за 24 часа</div><div class="val" data-kpi="income24">—</div></div>
              </div>
              <div class="fp-controls">
                <button type="button" class="button button-secondary fp-chip" data-period="today">Сегодня</button>
                <button type="button" class="button button-secondary fp-chip" data-period="7d">7 дней</button>
                <button type="button" class="button button-secondary fp-chip" data-period="30d">30 дней</button>
                <div class="fp-range">
                  <label class="form-field__label">
                    <span class="form-field__label__title">от</span>
                    <input class="form-field__input" type="date" id="fp-date-from">
                  </label>
                  <label class="form-field__label">
                    <span class="form-field__label__title">до</span>
                    <input class="form-field__input" type="date" id="fp-date-to">
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>`;
      anchorWrap.insertAdjacentElement('afterend', wrap);
    }

    const card = document.getElementById('fp-metrics-card');

    // активная кнопка
    const setActive = (btn)=> card.querySelectorAll('.fp-chip')
      .forEach(b=>b.classList.toggle('button--active', b===btn));

    const initialBtn = card.querySelector(`.fp-chip[data-period="${state.period.kind}"]`);
    if (initialBtn) setActive(initialBtn);

    // обработчики чипов (без сабмита формы)
    card.querySelectorAll('.fp-chip').forEach(b=>{
      b.addEventListener('click', async (e)=>{
        e.preventDefault(); e.stopPropagation();
        setActive(b);
        state.period.kind   = b.dataset.period;
        state.period.fromISO= null;
        state.period.toISO  = null;
        const fromEl = card.querySelector('#fp-date-from');
        const toEl   = card.querySelector('#fp-date-to');
        if (fromEl) fromEl.value = '';
        if (toEl)   toEl.value   = '';
        await chrome.storage.local.set({ pcPeriodChoice: state.period });
        state.onPeriodChange?.();
      });
    });

    // даты
    const fromEl = card.querySelector('#fp-date-from');
    const toEl   = card.querySelector('#fp-date-to');
    if (state.period.kind === 'custom') {
      if (state.period.fromISO) fromEl.value = state.period.fromISO;
      if (state.period.toISO)   toEl.value   = state.period.toISO;
    }
    function applyCustom(){
      const f = fromEl.value || null;
      const t = toEl.value || null;
      if (!f && !t) return;
      state.period.kind='custom'; state.period.fromISO=f; state.period.toISO=t;
      card.querySelectorAll('.fp-chip').forEach(b=>b.classList.remove('button--active'));
      chrome.storage.local.set({ pcPeriodChoice: state.period });
      state.onPeriodChange?.();
    }
    fromEl.onchange = applyCustom;
    toEl.onchange   = applyCustom;

    return {
      updateKpi({rating, util, income, income24}){
        card.querySelector('[data-kpi="rating"]').textContent   = rating;
        card.querySelector('[data-kpi="util"]').textContent     = util;
        card.querySelector('[data-kpi="income"]').textContent   = income;
        card.querySelector('[data-kpi="income24"]').textContent = income24;
      }
    };
  }

  // ---------- sessions tab ----------
  function mountSessionsTab(pcName, sessions, state){
    const tabs = $('.merchant-tabs'), contentRoot = $('.merchant-content');
    if (!tabs || !contentRoot) return { redraw(){}, bind(){} };

    if (!document.querySelector('a[data-fp-link="sessions"]')) {
      const li = document.createElement('li');
      li.className = 'merchant-tabs__item';
      li.innerHTML = `<a class="merchant-tabs__link" href="#fp-sessions" data-fp-link="sessions">СЕССИИ</a>`;
      tabs.appendChild(li);
    }
    let cont = document.getElementById('fp-sessions');
    if (!cont) {
      cont = document.createElement('div');
      cont.id = 'fp-sessions';
      cont.className = 'merchant-tabs__content';
      cont.innerHTML = `
        <div class="merchant-list-wrapper">
          <div class="merchant-list merchant-list--system">
            <div class="merchant-list-header"><div class="merchant-list-title">Сессии ПК ${pcName}</div></div>
            <div class="table--scrollable scrollbar" style="max-height:60vh;">
              <table class="merchant-table merchant-table--medium">
                <thead><tr><th>Начало</th><th>Окончание</th><th>Длительность</th><th>Игра</th><th>Доход</th><th>Статус</th></tr></thead>
                <tbody></tbody>
              </table>
            </div>
          </div>
        </div>`;
      const root = $('.merchant-content');
      root && root.appendChild(cont);
    }

    const tbody = $('tbody', cont);

    function draw(){
      const {from,to} = makeRange(state.period.kind, state.period.fromISO, state.period.toISO);
      const rows = sessions.filter(s=>{
        const stISO = s.startTime?.replace(' ','T'); if (!stISO) return false;
        const st = new Date(stISO);
        return st>=from && st<=to;
      });
      tbody.innerHTML = '';
      for (const s of rows){
        const tr = document.createElement('tr'); tr.className='merchant-table__item';
        const dtS = s.startTime ? s.startTime.replace('T',' ') : '—';
        const dtE = s.endTime && s.endTime!=='-' ? s.endTime.replace('T',' ') : '—';
        const dur = minFromStr(s.duration);
        tr.innerHTML = `<td>${dtS}</td><td>${dtE}</td><td>${Math.floor(dur/60)} ч ${dur%60} мин</td><td>${s.gameName||'—'}</td><td>${fmtRub(parseMoney(s.income))}</td><td>${s.status||'—'}</td>`;
        tbody.appendChild(tr);
      }
    }

    function bind(){
      if (tabs.dataset.fpBound) return;
      tabs.dataset.fpBound='1';
      tabs.addEventListener('click', (e)=>{
        const a = e.target.closest('.merchant-tabs__link'); if (!a) return;
        if (a.getAttribute('href') === '#fp-sessions') {
          e.preventDefault();
          $$('.merchant-tabs__content').forEach(c=>c.classList.remove('merchant-tabs__content--active'));
          cont.classList.add('merchant-tabs__content--active');
          $$('.merchant-tabs__link').forEach(x=>x.classList.remove('merchant-tabs__link--active'));
          a.classList.add('merchant-tabs__link--active');
          return;
        }
        setTimeout(()=> cont.classList.remove('merchant-tabs__content--active'), 0);
      });
    }

    return { redraw: draw, bind };
  }

  // ---------- boot ----------
  async function init() {
    if (!/^\/merchant\/computer-edit\//.test(location.pathname)) return;

    const mo = new MutationObserver(async () => {
      const tabs = $('.merchant-tabs');
      const headerCard = tabs?.previousElementSibling?.parentElement || $('.merchant-content')?.parentElement;
      const tariff = findTariffCard();
      if (headerCard && tabs && tariff) {
        mo.disconnect();
        await start(headerCard);
      }
    });
    mo.observe(document, {subtree:true, childList:true});
  }

  async function start(headerCard){
    const pcName = pcNameFromHeader(); if (!pcName) return;

    const { pcPeriodChoice = {kind:'30d', fromISO:null, toISO:null} } = await chrome.storage.local.get(['pcPeriodChoice']);
    const state = { period: {...pcPeriodChoice}, onPeriodChange:null };

    const sessions = await loadSessionsForPc(pcName);
    const reviews  = await loadReviewsForPc(pcName);

    // текущая сессия — под статусом
    const current = sessions.find(isOpenSession) || null;
    mountCurrentInline(headerCard, current);

    // карточка показателей СРАЗУ под "Тариф" (в той же ширине)
    const metricsCard = mountMetricsUnderTariff(state);

    // вкладка "СЕССИИ"
    const sessTab = mountSessionsTab(pcName, sessions, state);
    sessTab.bind();

    // пересчёт
    const repaint = () => {
      const r = makeRange(state.period.kind, state.period.fromISO, state.period.toISO);
      const { busyMin, busy24Min, utilPct, utilPct24, incomePeriod, income24 } = calcUtilIncome(sessions, r);
      const { avg, count } = calcRating(reviews, r);

      metricsCard?.updateKpi({
       rating: count ? `${avg.toFixed(2)} ★ (${count})` : '—',
        // можно оставить компактную версию
        // util:   `${Math.floor(busyMin/60)} ч ${busyMin%60} мин • ${utilPct}% от периода • ${utilPct24}% от 24ч`,
        // или показать ещё и чистые минуты за 24ч:
        util:   `${Math.floor(busyMin/60)} ч ${busyMin%60} мин • ${utilPct}% от периода • ${Math.floor(busy24Min/60)} ч ${busy24Min%60} мин за 24ч (${utilPct24}%)`,
        income: fmtRub(incomePeriod),
        income24: fmtRub(income24)
      });

      sessTab.redraw();
    };

    state.onPeriodChange = repaint;
    repaint();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, {once:true});
  } else {
    init();
  }
})();
