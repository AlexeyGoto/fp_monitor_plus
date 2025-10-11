// src/popup.js

document.addEventListener('DOMContentLoaded', async function () {
    const computersContainer = document.getElementById('computers');
    const errorContainer = document.getElementById('error');
    const lastUpdateContainer = document.getElementById('lastUpdate');

    const notificationsToggle = document.getElementById('notificationsToggle');

    const {notificationsActive = false} = await chrome.storage.local.get('notificationsActive');
    notificationsToggle.checked = notificationsActive;

    notificationsToggle.addEventListener('change', () =>
        chrome.storage.local.set({notificationsActive: notificationsToggle.checked})
    );

    // Функция для определения типа последнего обновления
    function getUpdateTypeText(lastParseTimestamp, isIncremental) {
        if ( !lastParseTimestamp ) return '';

        const timeDiff = Date.now() - lastParseTimestamp;
        const hoursAgo = Math.floor(timeDiff / (1000 * 60 * 60));
        const minutesAgo = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));

        let timeText = '';
        if ( hoursAgo > 0 ) {
            timeText = `${hoursAgo}ч ${minutesAgo}м назад`;
        } else {
            timeText = `${minutesAgo}м назад`;
        }

        const updateType = isIncremental ? 'инкр.' : 'полное';
        return ` (${updateType}, ${timeText})`;
    }

    function updateTotalStats(stats) {
        if ( !stats ) return;

        const totalIncomeEl = document.getElementById('totalIncome');
        const totalForecastEl = document.getElementById('totalForecast');

        // Find earliest date across all PCs
        const earliestDate = Object.values(stats)
            .map(pc => new Date(pc.firstDate))
            .reduce((earliest, date) => date < earliest ? date : earliest);

        let totalIncome = 0;
        let totalForecast = 0;

        Object.values(stats).forEach(pcStats => {
            totalIncome += pcStats.totalIncome;

            const now = new Date();
            const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
            const averagePerDay = pcStats.totalIncome / pcStats.daysWorked;
            const daysLeft = lastDayOfMonth - now.getDate();
            const pcForecast = averagePerDay * daysLeft + pcStats.totalIncome;

            totalForecast += pcForecast;
        });

        totalIncomeEl.textContent = `${totalIncome.toFixed(2)}₽ с ${earliestDate.toLocaleDateString()}`;
        totalForecastEl.textContent = `${totalForecast.toFixed(2)}₽`;
    }

    function renderComputers(computers, stats = null) {
        // Обновляем общую статистику
        updateTotalStats(stats);

        computersContainer.innerHTML = '';
        computers.forEach(computer => {
            // Создаем временный div для парсинга HTML
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = computer.html;

            // Извлекаем тарифы и статус
            const tariffs = Array.from(tempDiv.querySelectorAll('.merchant-computer-tariff'))
                .map(el => el.textContent.trim())
                .filter(text => text);

            const statusElement = tempDiv.querySelector('.merchant-computer-status');
            const status = statusElement?.classList.contains('merchant-computer-status--green') ? 'green' : 'orange';

            // Функция форматирования времени
            const formatTime = (minutes) => {
                const hours = Math.floor(minutes / 60);
                const mins = minutes % 60;
                return `${hours}ч ${mins}м`;
            };

            // Функция расчета месячного прогноза
            const calculateMonthlyForecast = (totalIncome, daysWorked) => {
                const now = new Date();
                const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
                const averagePerDay = totalIncome / daysWorked;
                const daysLeft = lastDayOfMonth - now.getDate();
                const forecast = averagePerDay * daysLeft + totalIncome;
                return forecast;
            };

            // Создаем HTML для статистики
            const statsHtml = stats && stats[computer.name] ? `
    <div class="computer-basic-stats">
        <div>Доход: ${stats[computer.name].totalIncome.toFixed(2)}₽</div>
        <div>Сессий: ${stats[computer.name].sessionCount}</div>
    </div>
    <details class="stats-details">
        <summary>Подробная статистика</summary>
        <div class="computer-stats">
            <div>Дней: ${stats[computer.name].daysWorked}</div>
            <div>Ср/день: ${(stats[computer.name].totalIncome / stats[computer.name].daysWorked).toFixed(2)}₽</div>
            <div>Время: ${formatTime(stats[computer.name].totalMinutes)}</div>
            <div>₽/час: ${((stats[computer.name].totalIncome / stats[computer.name].totalMinutes) * 60).toFixed(2)}</div>
            <div title="Прогноз на текущий месяц" class="forecast">Прогноз: ${calculateMonthlyForecast(
                stats[computer.name].totalIncome,
                stats[computer.name].daysWorked
            ).toFixed(2)}₽</div>
            <div title="Средний доход в час при работе" class="forecast">₽/раб.час: ${((stats[computer.name].totalIncome / stats[computer.name].totalMinutes) * 60).toFixed(2)}</div>
        </div>
    </details>
` : '';

            // Создаем элемент компьютера
            const computerElement = document.createElement('div');

            computerElement.className = 'computer';
            computerElement.innerHTML = `
                <div class="computer-header">
                    <div class="computer-left">
                        <img src="icons/computer.png" class="computer-icon" alt="Computer">
                        <div>
                            <div class="computer-name">${computer.name}</div>
                            <div class="computer-details">${tariffs[0] || ''}</div>
                        </div>
                    </div>
                    <div class="status-indicator status-${status}"></div>
                </div>
                <div class="computer-details">
                    ${tariffs.slice(1).map(info => `<div>${info}</div>`).join('')}
                </div>
                ${statsHtml}
            `;

            const computerHeader = computerElement.querySelector('.computer-header');
            computerHeader.addEventListener('click', () => {
                chrome.tabs.create({
                    url: `https://fogplay.mts.ru/merchant/computer-edit/?compId=${computer.id}`
                });
            });
            computerElement.className = 'computer';
            computerElement.style.cursor = 'pointer';
            computerElement.dataset.compId = computer.id;
            computersContainer.appendChild(computerElement);
        });
    }

    function showError(message) {
        errorContainer.textContent = message;
        errorContainer.style.display = 'block';
        computersContainer.style.display = 'none';
        // Скрываем общую статистику при ошибке авторизации
        if ( message.includes('авторизация') ) {
            document.getElementById('totalStats').style.display = 'none';
        }
    }

    function hideError() {
        errorContainer.style.display = 'none';
        computersContainer.style.display = 'block';
        document.getElementById('totalStats').style.display = 'flex';
    }

    function updateLastUpdate() {
        const now = new Date();
        lastUpdateContainer.textContent = `Последнее обновление: ${now.toLocaleString()}`;
    }

    async function fetchData() {
        const refreshButton = document.getElementById('refreshButton');
        refreshButton.disabled = true;
        try {
            const response = await chrome.runtime.sendMessage({action: 'getComputers'});
            if ( response.error ) {
                showError(response.error);
            } else {
                hideError();
                // Проверяем наличие сохраненной статистики
                const storage = await chrome.storage.local.get(['statistics', 'lastUpdate', 'lastParseTimestamp']);
                if ( storage.statistics ) {
                    renderComputers(response.computers, storage.statistics);
                    if ( storage.lastUpdate ) {
                        const statsButton = document.getElementById('statsButton');
                        const openStatsButton = document.getElementById('openStatsButton');

                        // Скрываем кнопку "открыть" и показываем кнопку обновления
                        if ( openStatsButton ) openStatsButton.style.display = 'none';
                        if ( statsButton ) {
                            statsButton.style.display = 'block';
                            statsButton.textContent = 'Обновить статистику';
                        }

                        // Показываем информацию о последнем обновлении с типом
                        const updateType = getUpdateTypeText(storage.lastParseTimestamp, false);
                        lastUpdateContainer.textContent = `Статистика от: ${new Date(storage.lastUpdate).toLocaleString()}${updateType}`;
                    }
                } else {
                    renderComputers(response.computers);
                }
                updateLastUpdate();
            }
        } catch (err) {
            showError('Ошибка получения данных');
        } finally {
            refreshButton.disabled = false;
        }
    }

    // Обработчик для кнопки статистики (умное обновление через контент-скрипт)
    document.getElementById('statsButton').addEventListener('click', async () => {
        const statsButton = document.getElementById('statsButton');
        const currentText = statsButton.textContent;
        statsButton.disabled = true;

        // Определяем тип обновления
        const storage = await chrome.storage.local.get(['lastParseTimestamp']);
        const isIncrementalUpdate = storage.lastParseTimestamp && (Date.now() - storage.lastParseTimestamp < 2 * 60 * 60 * 1000);

        statsButton.textContent = isIncrementalUpdate ? 'Инкрементальное обновление...' : 'Полное обновление...';

        try {
            // Решаем тип обновления, кэш не чистим автоматически
            const forceFullUpdate = currentText === 'Собрать статистику' || !isIncrementalUpdate;

            // Запрашиваем парсинг только через контент-скрипт. Если активной вкладки нет — откроем FogPlay и повторим.
            const response = await new Promise((resolve) => {
                chrome.tabs.query({active: true, currentWindow: true}, async (tabs) => {
                    const sendParse = (tabId) => {
                        chrome.tabs.sendMessage(tabId, {action: 'parseSessions', forceUpdate: forceFullUpdate}, (resp) => {
                            if ( chrome.runtime.lastError ) {
                                resolve({success: false, error: chrome.runtime.lastError.message});
                            } else {
                                resolve(resp || {success: false, error: 'No response from content script'});
                            }
                        });
                    };

                    if ( tabs[0] && tabs[0].url.includes('fogplay.mts.ru') ) {
                        sendParse(tabs[0].id);
                    } else {
                        chrome.tabs.create({url: 'https://fogplay.mts.ru/merchant/'}, (newTab) => {
                            const listener = (tabId, changeInfo) => {
                                if ( tabId === newTab.id && changeInfo.status === 'complete' ) {
                                    chrome.tabs.onUpdated.removeListener(listener);
                                    sendParse(newTab.id);
                                }
                            };
                            chrome.tabs.onUpdated.addListener(listener);
                        });
                    }
                });
            });

            const computersData = await chrome.runtime.sendMessage({action: 'getComputers'});

            if ( !computersData.error && response.success ) {
                renderComputers(computersData.computers, response.statistics || await chrome.storage.local.get('statistics').then(s => s.statistics));

                // Обновляем информацию о последнем обновлении
                const newStorage = await chrome.storage.local.get(['lastUpdate', 'lastParseTimestamp']);
                const updateType = getUpdateTypeText(newStorage.lastParseTimestamp, response.isIncremental);
                lastUpdateContainer.textContent = `Статистика от: ${new Date(newStorage.lastUpdate).toLocaleString()}${updateType}`;

                statsButton.textContent = 'Обновить статистику';

                // Показываем результат
                if ( response.pagesProcessed ) {
                    const resultText = response.isIncremental ?
                        `Инкрементальное обновление завершено (${response.pagesProcessed} стр.)` :
                        `Полное обновление завершено (${response.pagesProcessed} стр.)`;

                    // Временно показываем результат
                    const originalText = statsButton.textContent;
                    statsButton.textContent = resultText;
                    setTimeout(() => {
                        statsButton.textContent = originalText;
                    }, 3000);
                }
            } else {
                throw new Error(response.error || 'Ошибка получения статистики');
            }
        } catch (err) {
            showError('Ошибка получения статистики: ' + err.message);
            statsButton.textContent = isIncrementalUpdate ? 'Обновить статистику' : 'Собрать статистику';
        } finally {
            statsButton.disabled = false;
        }
    });

    // Обработчик для кнопки обновления
    document.getElementById('refreshButton').addEventListener('click', fetchData);

    document.getElementById('openStatsButton').addEventListener('click', () => {
        chrome.tabs.create({url: 'https://fogplay.mts.ru/merchant/computers/?openStats'});
    });

    // Обработчик для кнопки открытия личного кабинета
    document.getElementById('openCabinetButton').addEventListener('click', () => {
        chrome.tabs.create({url: 'https://fogplay.mts.ru/merchant/'});
    });

    // Первоначальная загрузка данных
    fetchData();
});
