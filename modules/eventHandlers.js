// Исправленный modules/eventHandlers.js

function updateProgress(progress) {
    const pc = (id) => document.getElementById(id);
    let progressContainer = pc("progressContainer");
    const loadButton = pc("loadStatsButton");
    const clearCacheButton = pc("clearCacheButton");

    if ( !progressContainer ) {
        progressContainer = document.createElement('div');
        progressContainer.id = 'progressContainer';
        progressContainer.className = 'progress-container';
        progressContainer.innerHTML = `
            <div class="progress-bar">
                <div id="progressBarFill" class="progress-bar-fill"></div>
            </div>
            <div id="progressText" class="progress-text">Загрузка статистики...</div>
        `;
        if ( loadButton ) {
            loadButton.parentNode.insertBefore(progressContainer, loadButton.nextSibling);
        }
    }

    const progressBarFill = pc("progressBarFill");
    const progressText = pc("progressText");

    if ( !progressContainer || !progressBarFill || !progressText ) return;

    // Показываем прогрессбар ТОЛЬКО при полном обновлении
    if (newProgress && typeof newProgress === 'object' && newProgress.mode === 'full') {
        progressContainer.style.display = "block";
    } else {
        progressContainer.style.display = "none";
    }
    progressBarFill.style.width = `${(newProgress && newProgress.value != null ? newProgress.value : progress) * 100}%`;
    progressText.textContent = `Загрузка статистики... ${Math.round((newProgress && newProgress.value != null ? newProgress.value : progress) * 100)}%`;

    if ( loadButton ) loadButton.disabled = progress < 1;
    if ( clearCacheButton ) clearCacheButton.disabled = progress < 1;

    // Скрываем прогресс-бар когда загрузка завершена
    if ( progress >= 1 ) {
        setTimeout(() => {
            progressContainer.style.display = "none";
        }, 1000);
    }
}

function replaceAndBind(selector, callback) {
    const btn = document.querySelector(selector);
    if ( btn ) {
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        newBtn.addEventListener("click", callback);
        return newBtn;
    }
    return null;
}

let stopRequested = false;

const setupHandlers = async (container) => {
    const {statistics} = await chrome.storage.local.get(["statistics"]);

    // Экспорт в XLS
    replaceAndBind("#exportXLSButton", async () => {
        console.log('Export XLS clicked');
        try {
            const {sessions} = await chrome.storage.local.get("sessions");
            if ( sessions && Object.keys(sessions).length > 0 ) {
                window.ExportUtils.exportSessionsToXLS(sessions);
            } else {
                alert("Нет данных для экспорта. Сначала загрузите статистику.");
            }
        } catch (error) {
            console.error('Export error:', error);
            alert("Ошибка при экспорте: " + error.message);
        }
    });

    // Полная очистка кэша и повторная загрузка
    replaceAndBind("#clearCacheButton", async (e) => {
        e.preventDefault();

        const button = e.target;
        const originalText = button.textContent;
        const progressContainer = document.getElementById('progressContainer');

        if ( !confirm("Очистить весь кэш и загрузить данные заново? Это может занять несколько минут.") ) {
            return;
        }

        try {
            button.disabled = true;
            button.textContent = "Очистка...";

            // Полная очистка кэша
            await chrome.storage.local.remove([
                "sessions",
                "statistics",
                "lastParsedPage",
                "dateRange",
                "filteredSessions",
                "lastUpdate",
                "lastParseTimestamp"
            ]);

            console.log('Cache cleared, starting full parsing...');

            // Показываем интерфейс загрузки
            container.innerHTML = "";
            container.insertAdjacentHTML("afterbegin", window.UIComponents.dateRangeHtml);
            container.appendChild(window.UIComponents.createStatisticHTML(null));
            // Включаем прогрессбар для полного обновления
            const pc = (id) => document.getElementById(id);
            const pcContainer = pc('progressContainer');
            if (pcContainer) pcContainer.style.display = 'block';

            // Запускаем полную загрузку
            button.textContent = "Загрузка...";
            const result = await window.DataParser.parseSessions(true); // forceFullUpdate = true

            if ( result.success ) {
                console.log('Full parsing completed:', result);

                // Обновляем интерфейс с новыми данными
                container.innerHTML = "";
                container.insertAdjacentHTML("afterbegin", window.UIComponents.dateRangeHtml);
                container.appendChild(window.UIComponents.createStatisticHTML(result.statistics));

                // Переустанавливаем обработчики
                setupHandlers(container);

                alert(`Данные успешно обновлены!\nНайдено сессий: ${result.totalSessions}\nОбработано страниц: ${result.pagesProcessed}`);
            } else {
                throw new Error(result.error || "Ошибка загрузки статистики");
            }

        } catch (error) {
            console.error('Clear cache error:', error);
            alert("Произошла ошибка при обновлении данных: " + error.message);

            // Восстанавливаем интерфейс
            container.innerHTML = "";
            container.insertAdjacentHTML("afterbegin", window.UIComponents.dateRangeHtml);
            container.appendChild(window.UIComponents.createStatisticHTML(statistics));
            setupHandlers(container);
        } finally {
            button.disabled = false;
            button.textContent = originalText;
        }
    });

    // Применение фильтра по датам
    replaceAndBind("#applyDates", async (e) => {
        e.preventDefault();

        try {
            const startDateStr = document.getElementById("startDate").value;
            const endDateStr = document.getElementById("endDate").value;

            if ( !startDateStr || !endDateStr ) {
                alert("Пожалуйста, выберите начальную и конечную даты");
                return;
            }

            if ( startDateStr > endDateStr ) {
                alert("Начальная дата не может быть позже конечной");
                return;
            }

            await chrome.storage.local.set({dateRange: {start: startDateStr, end: endDateStr}});
            const filteredStats = await window.DataFilter.filterStatsByDateRange(statistics, startDateStr, endDateStr);

            // Обновляем интерфейс
            container.innerHTML = "";
            container.insertAdjacentHTML("afterbegin", window.UIComponents.dateRangeHtml);
            container.appendChild(window.UIComponents.createStatisticHTML(filteredStats));

            // Восстанавливаем значения дат
            document.getElementById("startDate").value = startDateStr;
            document.getElementById("endDate").value = endDateStr;

            setupHandlers(container);

        } catch (error) {
            console.error("Error applying date range:", error);
            alert("Произошла ошибка при применении диапазона дат: " + error.message);
        }
    });

    // Сброс фильтра дат
    replaceAndBind("#resetDates", async (e) => {
        e.preventDefault();

        try {
            await chrome.storage.local.remove(["dateRange", "filteredSessions"]);

            document.getElementById("startDate").value = "";
            document.getElementById("endDate").value = "";

            container.innerHTML = "";
            container.insertAdjacentHTML("afterbegin", window.UIComponents.dateRangeHtml);
            container.appendChild(window.UIComponents.createStatisticHTML(statistics));

            setupHandlers(container);

        } catch (error) {
            console.error("Error resetting dates:", error);
            alert("Произошла ошибка при сбросе фильтра: " + error.message);
        }
    });

    // Кнопка остановки длительного парсинга
    replaceAndBind("#stopParsingButton", async () => {
        stopRequested = true;
        const btn = document.getElementById('stopParsingButton');
        if (btn) btn.textContent = 'Останавливаю...';
    });

    // Инкрементальное обновление статистики (авто-батчи до стабилизации)
    replaceAndBind("#loadStatsButton", async (e) => {
        e.preventDefault();

        const button = e.target;
        const originalText = button.textContent;
        const stopBtn = document.getElementById('stopParsingButton');

        try {
            button.disabled = true;
            button.textContent = "Обновление...";
            stopRequested = false;
            if (stopBtn) {
                stopBtn.style.display = 'inline-block';
                stopBtn.textContent = 'Остановить';
            }
            // Прогрессбар скрываем для инкрементального обновления
            const progressContainer = document.getElementById('progressContainer');
            if (progressContainer) progressContainer.style.display = 'none';

            // Определяем тип обновления (окно 2 часа)
            const {lastParseTimestamp} = await chrome.storage.local.get('lastParseTimestamp');
            const isIncremental = lastParseTimestamp && (Date.now() - lastParseTimestamp < 2 * 60 * 60 * 1000);

            console.log('Starting update, incremental (auto-batches):', isIncremental);

            let totalPagesProcessed = 0;
            let totalNewSessions = 0;
            let lastNewCount = -1;
            while (!stopRequested) {
                const {backfillNextPage: prevBackfill} = await chrome.storage.local.get('backfillNextPage');

                const result = await window.DataParser.parseSessions(false);
                if (!result.success) throw new Error(result.error || 'Parser failed');

                totalPagesProcessed += result.pagesProcessed || 0;
                totalNewSessions += result.newSessions || 0;

                // Обновляем UI по мере прогресса
                container.innerHTML = "";
                container.insertAdjacentHTML("afterbegin", window.UIComponents.dateRangeHtml);
                container.appendChild(window.UIComponents.createStatisticHTML(result.statistics));
                setupHandlers(container);
                const newStopBtn = document.getElementById('stopParsingButton');
                if (newStopBtn) {
                    newStopBtn.style.display = 'inline-block';
                    newStopBtn.textContent = 'Остановить';
                }

                // Условия авто-остановки: нет новых данных два цикла подряд
                // и чекпоинт бэкофила не продвинулся
                const {backfillNextPage: newBackfill} = await chrome.storage.local.get('backfillNextPage');
                const backfillStalled = (prevBackfill || 0) === (newBackfill || 0);
                if (result.newSessions === 0 && lastNewCount === 0 && backfillStalled) break;
                lastNewCount = result.newSessions;
            }

            console.log('Auto-batch update completed:', {totalPagesProcessed, totalNewSessions});

            // Финальный UI уже обновлён в цикле
            button.textContent = totalNewSessions > 0 ? `Добавлено: ${totalNewSessions}` : "Нет новых данных";
            setTimeout(() => { button.textContent = originalText; }, 3000);

        } catch (error) {
            console.error('Load stats error:', error);
            alert("Ошибка при обновлении статистики: " + error.message);
        } finally {
            button.disabled = false;
            if (stopBtn) {
                const current = document.getElementById('stopParsingButton');
                if (current) current.style.display = 'none';
            }
            if ( button.textContent === "Обновление..." ) {
                button.textContent = originalText;
            }
        }
    });
};

window.EventHandlers = {
    updateProgress,
    replaceAndBind,
    setupHandlers
};
