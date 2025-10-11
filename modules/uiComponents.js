// modules/uiComponents.js

const baseStyle = `<style>
body{background-color:#0B0E13;color:#fff}
#chartContainer{width:100%;margin:20px auto;color:#fff;background:rgba(178,219,249,.08)}
#myChart{width:100%;border:1px solid #ccc;display:block}
#heatmapCanvas{display:block;border:1px solid #ccc}
.merchant-statistic-container{padding:20px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-weight:bold;font-size:16px}
h1{color:#fff;font-size:22px;font-weight:bold;margin-bottom:16px}
.load-button{background:#238636;color:#fff;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;font-size:18px;margin-bottom:15px;transition:background-color .2s}
.load-button:hover{background:#2ea043}
.load-button:disabled{background:#238636;opacity:0.6;cursor:not-allowed}
.progress-container{display:none;margin-top:10px;background:rgba(178,219,249,.08);padding:10px;border-radius:8px;border:1px solid #30363d}
.progress-bar{width:100%;height:4px;background:#21262d;border-radius:2px;overflow:hidden}
.progress-bar-fill{height:100%;background:#238636;width:0%;transition:width .3s ease}
.progress-text{font-size:17px;color:#8b949e;margin-top:5px}
.statistic-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:20px;margin-top:20px}
.statistic-card{background:rgba(178,219,249,.08);border-radius:8px;padding:15px;border:1px solid #30363d;transition:border-color .2s,transform .2s}
.statistic-card:hover{border-color:#3d444d;transform:translateY(-2px)}
.statistic-card h3{margin:0 0 15px 0;color:#fff;font-size:18px;font-weight:600}
.statistic-data{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.statistic-item{display:flex;flex-direction:column}
.statistic-label{font-size:17px;color:#8b949e}
.statistic-value{font-size:20px;font-weight:500;color:#fff}
.statistic-value.forecast{color:#22c55e}
.total-stats{background:rgba(178,219,249,.08);border-radius:8px;padding:10px;margin:15px 0;display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:20px;border:1px solid #30363d;transition:border-color .2s}
.total-stats:hover{border-color:#3d444d}
.computer{background-color:rgba(178,219,249,.08);border-radius:8px;padding:10px;margin-bottom:8px;border:1px solid #30363d;cursor:pointer;position:relative;transition:all .2s ease}
.computer-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
.computer-header:hover{border-color:#3d444d;transform:translateY(-2px);box-shadow:0 4px 12px rgba(0,0,0,0.2)}
.computer-left{display:flex;align-items:center;gap:8px}
.computer-icon{width:32px;height:32px;background-color:#21262d;border-radius:6px;padding:6px}
.computer-name{font-weight:600;font-size:18px;color:#fff;margin-bottom:2px}
.computer-details{color:#8b949e;line-height:1.4}
.computer-details div{margin-bottom:2px}
.computer-details div:last-child{margin-bottom:0}
.computer-basic-stats{display:flex;justify-content:space-between;padding:8px 0;border-top:1px solid #30363d;color:#22c55e}
.stats-details{border-top:1px solid #30363d;padding-top:8px}
.stats-details summary{color:#8b949e;cursor:pointer;user-select:none}
.stats-details summary:hover{color:#fff}
.computer-stats{margin-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:4px 8px;font-size:14px}
.computer-stats div{display:flex;align-items:center}
.forecast{color:#22c55e;transition:color .2s}
.forecast:hover{color:#4ade80}
[title]{cursor:help}
</style>`;

const dateRangeHtml = `<div class="date-range-container">
<style>
.date-range-container{display:flex;gap:10px;align-items:center;margin-bottom:15px;padding:15px;background:rgba(178,219,249,.08);border-radius:15px;box-shadow:0 15px 35px rgba(2,21,43,.25)}
.date-input{background:#21262d;border:1px solid #30363d;color:#fff;padding:5px 10px;border-radius:4px;font-size:18px}
.date-input:focus{border-color:#58a6ff;outline:none}
.date-label{color:#8b949e;font-size:16px}
.apply-dates{background:#238636;color:#fff;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;font-size:16px;transition:background-color .2s}
.apply-dates:hover{background:#2ea043}
.reset-button{background:#1f6feb;color:#fff;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;font-size:16px;transition:background-color .2s}
.reset-button:hover{background:#2b7bf2}
</style>
<div>
<span class="date-label">С:</span>
<input type="date" id="startDate" class="date-input">
</div>
<div>
<span class="date-label">По:</span>
<input type="date" id="endDate" class="date-input">
</div>
<button class="apply-dates" id="applyDates">Применить</button>
<button class="reset-button" id="resetDates">Сброс</button>
</div>
</div>`;

function createStatisticHTML(stats = null) {
    const container = document.createElement("div");
    container.className = "merchant-statistic-container";

    if ( !stats ) {
        container.innerHTML = `${baseStyle}<h1>Статистика работы компьютеров</h1>
<div style="display:flex;gap:8px;margin-bottom:15px;">
<button id="loadStatsButton" class="load-button">Загрузить статистику</button>
<button id="clearCacheButton" class="load-button" style="background:#dc2626;">Обновить без кэша</button>
<button id="stopParsingButton" class="load-button" style="background:#6b7280;display:none;">Остановить</button>
</div>
<div id="progressContainer" class="progress-container">
<div class="progress-bar"><div id="progressBarFill" class="progress-bar-fill"></div></div>
<div id="progressText" class="progress-text">Загрузка статистики...</div>
</div>`;
        return container;
    }

    const totalStats = window.DataFilter.calculateTotalStats(stats);
    const totalStatsHtml = `<div class="total-stats">
<div class="statistic-item">
<span class="statistic-label">Общий доход</span>
<span class="statistic-value">${totalStats.income.toFixed(2)}₽</span>
</div>
<div class="statistic-item" style="display:none">
<span class="statistic-label">Прогноз на месяц</span>
<span class="statistic-value forecast">${window.DataFilter.calculateTotalForecast(stats)}₽</span>
</div>
<div class="statistic-item">
<span class="statistic-label">Период статистики</span>
<span class="statistic-value">${totalStats.days} дн.</span>
</div>
<div class="statistic-item">
<span class="statistic-label">Всего сессий</span>
<span class="statistic-value">${totalStats.sessions}</span>
<span class="statistic-label">${(totalStats.sessions / totalStats.days).toFixed(1)} сессий в день</span>
</div>
<div class="statistic-item">
<span class="statistic-label">Средняя длина сессии</span>
<span class="statistic-value">${window.DataFilter.formatTime(Math.round(totalStats.minutes / totalStats.sessions))}</span>
</div>
<div class="statistic-item">
<span class="statistic-label">Всего компьютеров</span>        
<span class="statistic-value">${Object.keys(stats).length}</span>
</div>
</div>`;

    const url = chrome.runtime.getURL("icons/computer.png");
    container.innerHTML = `${baseStyle}<h1>Статистика работы компьютеров</h1>
<div style="display:flex;gap:8px;margin-bottom:15px;">
<button id="loadStatsButton" class="load-button">Обновить статистику</button>
<button id="clearCacheButton" class="load-button" style="background:#dc2626;">Обновить без кэша</button>
<button id="exportXLSButton"  class="load-button">Экспорт всех сессий в XLS</button>
<button id="stopParsingButton" class="load-button" style="background:#6b7280;display:none;">Остановить</button>
</div>
${totalStatsHtml}
<div class="statistic-grid">
${Object.entries(stats)
        .map(
            ([name, data]) => `
<div class="computer">
  <div class="computer-header">
    <div class="computer-left">
      <img src="${url}" class="computer-icon" alt="Computer">
      <div><div class="computer-name">${name}</div></div>
    </div>
  </div>
  <div class="computer-basic-stats">
    <div>Доход: ${data.totalIncome.toFixed(2)}₽</div>
    <div>Сессий: ${data.sessionCount}</div>
  </div>
  <div class="computer-stats">
    <div>Дней: ${data.daysWorked}</div>
    <div>Ср/день: ${(data.totalIncome / data.daysWorked).toFixed(2)}₽</div>
    <div>Время: ${window.DataFilter.formatTime(data.totalMinutes)}</div>
    <div>₽/час: ${((data.totalIncome / data.totalMinutes) * 60).toFixed(2)}</div>
    <div style="display:none" title="Прогноз на текущий месяц" class="forecast">
      Прогноз: ${window.DataFilter.calculateMonthlyForecast(data.totalIncome, data.daysWorked).toFixed(2)}₽
    </div>
    <div title="Средний доход в час при работе" class="forecast">
      ₽/раб.час: ${((data.totalIncome / data.totalMinutes) * 60).toFixed(2)}
    </div>
  </div>
</div>`
        )
        .join("")}
</div>
<div id="chartContainer">
  <h1>Доход в день</h1>
  <canvas id="myChart" width="800" height="400"></canvas>
  <h1>Карта простоя</h1>
  <div id="summary" style="margin-top:10px;"></div>
  <span style="font-weight: lighter">Зелёный — компьютер был активен весь час.<br>
Оранжевый  — компьютер был активен частично.<br>
Красный  — компьютер был неактивен.<br></span>
  <canvas id="heatmapCanvas"></canvas>
</div>`;
    window.ChartRenderer.fillCharts();
    return container;
}

function addMenuItem() {
  const lastItem = document.querySelector(".merchant-aside-menu__item");
  if (!lastItem) return;
  const url = chrome.runtime.getURL("icons/icon48.png");
  const urlcat = chrome.runtime.getURL("icons/image_cat.png");
  // Уже существующий пункт "Статистика Plugin"
  const s1 = document.createElement("li");
  s1.classList.add("merchant-aside-menu__item");
  s1.style.cssText = "border-top:2px solid;padding-top:12px;";
  s1.innerHTML = `<a class="merchant-aside-menu__link" href="/merchant/computers/?openStats">
    <img src="${url}" alt="Статистика plugin"><span>Статистика Plugin</span></a>`;

  // НОВЫЙ пункт "Аналитика (Pivot)"
  const s2 = document.createElement("li");
  s2.classList.add("merchant-aside-menu__item");
  s2.innerHTML = `<a class="merchant-aside-menu__link" href="/merchant/computers/?openPivot">
    <img src="${urlcat}" alt="Аналитика Pivot"><span>Аналитика GoTo</span></a>`;

  const ul = lastItem.parentNode;
  ul.appendChild(s1);
  ul.appendChild(s2);
}


window.UIComponents = {
    baseStyle,
    dateRangeHtml,
    createStatisticHTML,
    addMenuItem
};
