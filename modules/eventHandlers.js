// Minimal eventHandlers.js — manual parsing removed; only UI bindings that don't trigger parsing.
(() => {
  function replaceAndBind(selector, callback) {
    const btn = document.querySelector(selector);
    if (btn && btn.parentNode) {
      const clone = btn.cloneNode(true);
      btn.parentNode.replaceChild(clone, btn);
      clone.addEventListener('click', callback);
      return clone;
    }
    return null;
  }

  async function reRenderStats(container, stats) {
    const host = container?.querySelector('.merchant-statistic-container') || container;
    if (!host) return;
    host.innerHTML = "";
    host.insertAdjacentHTML('afterbegin', window.UIComponents?.dateRangeHtml || '');
    if (window.UIComponents?.createStatisticHTML) {
      host.appendChild(window.UIComponents.createStatisticHTML(stats));
    }
    // re-bind buttons (export/date range) after re-render
    setupHandlers(container);
  }

  async function setupHandlers(container) {
    try {
      // Export to XLS (no parsing)
      replaceAndBind("#exportXLSButton", async () => {
        try {
          const { sessions } = await chrome.storage.local.get("sessions");
          if (sessions && Object.keys(sessions).length > 0) {
            window.ExportUtils?.exportSessionsToXLS?.(sessions);
          } else {
            alert("Нет данных для экспорта");
          }
        } catch (e) {
          console.error("Export error:", e);
        }
      });

      // Apply date range (no parsing)
      const applyBtn = document.getElementById('applyDates');
      if (applyBtn) {
        applyBtn.addEventListener('click', async () => {
          const startEl = document.getElementById('startDate');
          const endEl = document.getElementById('endDate');
          const start = startEl?.value || null;
          const end = endEl?.value || null;
          const { statistics } = await chrome.storage.local.get(['statistics']);
          const statsToShow = (start && end && window.DataFilter?.filterStatsByDateRange)
            ? await window.DataFilter.filterStatsByDateRange(statistics, start, end)
            : statistics;
          await chrome.storage.local.set({ dateRange: start && end ? { start, end } : null });
          await reRenderStats(container, statsToShow);
        });
      }

      // Reset date range (no parsing)
      const resetBtn = document.getElementById('resetDates');
      if (resetBtn) {
        resetBtn.addEventListener('click', async () => {
          await chrome.storage.local.remove('dateRange');
          const { statistics } = await chrome.storage.local.get(['statistics']);
          await reRenderStats(container, statistics);
        });
      }
    } catch (e) {
      console.error("setupHandlers error:", e);
    }
  }

  window.EventHandlers = { setupHandlers };
})();