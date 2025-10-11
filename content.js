// content.js (refactored)

// ==== FP Loader (self-contained) ==========================================
(() => {
  if (window.FPLoader) return;

  // CSS (инжектим один раз)
  const css = `
  .fp-loader-overlay{
    position:fixed; inset:0;
    background:rgba(6,12,20,.65);
    backdrop-filter:saturate(130%) blur(2px);
    display:flex; align-items:center; justify-content:center;
    z-index:9999;
  }
  .fp-loader{ width:72px; height:72px; border-radius:16px;
    background: radial-gradient( circle at 30% 30%, #263b5c 0%, #1a2841 60%, #121b2c 100%);
    box-shadow: 0 10px 30px rgba(0,0,0,.35), inset 0 0 0 1px rgba(255,255,255,.04);
    position:relative;
  }
  .fp-loader::before,.fp-loader::after{
    content:""; position:absolute; inset:10px; border-radius:12px;
    border:3px solid transparent; border-top-color:#7b61ff; border-right-color:#22d3ee;
    animation:fp-spin 1.0s linear infinite;
  }
  .fp-loader::after{ inset:16px; border-top-color:#22d3ee; border-right-color:#7b61ff; animation-duration:1.4s; opacity:.9;}
  @keyframes fp-spin{to{transform:rotate(360deg)}}

  /* mini */
  .fp-mini{
    position:fixed; right:16px; bottom:16px; z-index:9999;
    display:flex; gap:10px; align-items:center;
    background:rgba(16,25,38,.9);
    border-radius:12px; padding:10px 12px;
    box-shadow:0 8px 30px rgba(0,0,0,.35), inset 0 0 0 1px rgba(255,255,255,.04);
  }
  .fp-mini .dot{
    width:20px; height:20px; border-radius:50%;
    border:2px solid transparent; border-top-color:#7b61ff; border-right-color:#22d3ee;
    animation:fp-spin .9s linear infinite;
  }
  .fp-mini .txt{ font-size:13px; color:#e6edf6; opacity:.9; }
  `;
  const st = document.createElement('style');
  st.id = 'fp-loader-css';
  st.textContent = css;
  document.documentElement.appendChild(st);

  let overlay = null, mini = null;

  function showOverlay() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.className = 'fp-loader-overlay';
    overlay.innerHTML = '<div class="fp-loader" role="status" aria-label="Загрузка..."></div>';
    document.body.appendChild(overlay);
  }
  function hideOverlay() {
    overlay?.remove(); overlay = null;
  }
  function showMini(text='Обновляю статистику...') {
    if (mini) { mini.querySelector('.txt').textContent = text; return; }
    mini = document.createElement('div');
    mini.className = 'fp-mini';
    mini.innerHTML = '<div class="dot"></div><div class="txt"></div>';
    mini.querySelector('.txt').textContent = text;
    document.body.appendChild(mini);
  }
  function hideMini(){ mini?.remove(); mini=null; }

  window.FPLoader = { showOverlay, hideOverlay, showMini, hideMini };
})();



async function showStatistic(e) {
  if (e) e.preventDefault();
  FPLoader.showOverlay();               // << показать оверлей

  try {
    const mainContent = document.querySelector("main");
    if (!mainContent) return;

    const {statistics, dateRange} = await chrome.storage.local.get(["statistics", "dateRange"]);
    mainContent.innerHTML = "";

    const container = document.createElement("div");
    container.className = "merchant-statistic-container";
    if (statistics) container.insertAdjacentHTML("afterbegin", window.UIComponents.dateRangeHtml);
    mainContent.appendChild(container);

    const statsToShow = statistics
      ? (dateRange
          ? await window.DataFilter.filterStatsByDateRange(statistics, dateRange.start, dateRange.end)
          : statistics)
      : null;

    container.appendChild(window.UIComponents.createStatisticHTML(statsToShow));

    if (dateRange) {
      document.getElementById("startDate").value = dateRange.start;
      document.getElementById("endDate").value = dateRange.end;
    }

    window.EventHandlers.setupHandlers(container);

    // уже есть, но дополним мини-лоадером по режимам парсинга:
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.parsingMode) {
        const mode = changes.parsingMode.newValue;
        if (mode === 'full' || mode === 'inc') FPLoader.showMini('Иду по страницам…');
        if (mode === 'idle') FPLoader.hideMini();
      }
      if (changes.parsingProgress) {
        const v = changes.parsingProgress.newValue;
        if (v != null && mini) mini.querySelector('.txt').textContent = `Прогресс: ${(v*100|0)}%`;
      }
    });

  } finally {
    FPLoader.hideOverlay();             // << скрыть оверлей
  }
}



// content.js — добавить рядом с showStatistic:
async function showPivot(e) {
  if (e) e.preventDefault();
  const mainContent = document.querySelector("main");
  if (!mainContent) return;

  mainContent.innerHTML = "";
  const container = document.createElement("div");
  container.className = "merchant-statistic-container";
  container.insertAdjacentHTML("afterbegin", window.UIComponents.baseStyle);
  mainContent.appendChild(container);

  window.PivotRenderer.renderPivotPage(container);
}




// content.js — низ файла

function checkURL() {
  const q = window.location.search || '';
  if (q.includes('openPivot')) { showPivot(); return; }
  if (q.includes('openStats')) { showStatistic(); }
}

// безопасный запуск добавления пунктов меню
function bootSideMenu() {
  try {
    if (!window.UIComponents || !window.UIComponents.addMenuItem) return false;
    window.UIComponents.addMenuItem();   // добавляет "Статистика" и "Аналитика"
    checkURL();
    return true;
  } catch (e) {
    console.warn('addMenuItem failed:', e);
    return false;
  }
}

(function initContent() {
  // 1) дождаться DOM
  const onReady = (fn) =>
    (document.readyState === 'loading')
      ? document.addEventListener('DOMContentLoaded', fn, { once: true })
      : fn();

  onReady(() => {
    // 2) пробуем сразу
    if (!bootSideMenu()) {
      // 3) если UIComponents ещё не загружен — ждём его и/или меню в DOM
      const mo = new MutationObserver(() => {
        if (bootSideMenu()) mo.disconnect();
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });
    }

    // 4) инициализация страницы ПК (если нужна)
    if (location.pathname.startsWith('/merchant/computer-edit/')) {
      try { window.ComputerPage?.init(); } catch (e) { console.warn('ComputerPage init error', e); }
    }
  });

  // 5) поддержка soft-навигации
  const _push = history.pushState, _replace = history.replaceState;
  const reBoot = () => setTimeout(() => bootSideMenu() || null, 0);
  history.pushState = function () { _push.apply(this, arguments); reBoot(); };
  history.replaceState = function () { _replace.apply(this, arguments); reBoot(); };
  window.addEventListener('popstate', reBoot);
})();
