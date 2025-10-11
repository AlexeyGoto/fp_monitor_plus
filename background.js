function getTextFromHTML(html) {
    return html.replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function parseComputersFromHTML(html) {
    const computers = [];

    const activeTabMatch = html.match(/<div class="merchant-tabs__content merchant-tabs__content--active" id="active">([\s\S]*?)<\/div>\s*<div class="merchant-tabs__content"/);

    if ( activeTabMatch ) {
        const activeTabContent = activeTabMatch[1];

        const computerBlocks = activeTabContent.match(/<div class="merchant-computer">[\s\S]*?<\/div>\s*<a class="stretched-link"[\s\S]*?<\/a>/g);

        if ( computerBlocks ) {
            computerBlocks.forEach(block => {
                // Извлекаем имя для идентификации компьютера
                const nameMatch = block.match(/<div class="merchant-computer-name".*?>(.*?)<\/div>/);
                if ( nameMatch ) {
                    const name = nameMatch[1].trim();
                    computers.push({
                        name,
                        id: (block.match(/compId=(\d+)/) || [])[1],
                        html: block,
                        text: getTextFromHTML(block)
                    });
                }
            });
        }
    }

    return computers;
}

async function checkAuth() {
    try {
        const response = await fetch('https://fogplay.mts.ru/merchant/computers/', {
            credentials: 'include'
        });
        const text = await response.text();

        if ( !text.includes('Личный кабинет МТС Fog Play') || text.includes('Облачный гейминг МТС Fog Play (Платформа туманного гейминга от МТС)') ) {
            return false;
        }
        return true;
    } catch (error) {
        console.error('Auth check error:', error);
        return false;
    }
}

async function updateBadge(computers, color = '#22c55e', text = null) {
    const usedCount = computers.filter(comp =>
        getTextFromHTML(comp.html).includes('Используется клиентом')
    ).length;

    await chrome.action.setBadgeText({text: text || usedCount.toString()});
    await chrome.action.setBadgeBackgroundColor({color});
}

async function fetchComputers() {
    try {
        const isAuthed = await checkAuth();
        if ( !isAuthed ) {
            await updateBadge([], '#810303', "!");
            return {error: 'Требуется авторизация в личном кабинете FogPlay'};
        }

        const response = await fetch('https://fogplay.mts.ru/merchant/computers/', {
            credentials: 'include'
        });
        const text = await response.text();
        const computers = parseComputersFromHTML(text);

        await updateBadge(computers);

        const prevState = await chrome.storage.local.get('computers');
        const prevComputers = prevState.computers || [];
        const {notificationsActive} = await chrome.storage.local.get('notificationsActive');
        if ( notificationsActive ) {
            computers.forEach(computer => {
                const prevComputer = prevComputers.find(pc => pc.name === computer.name);
                if ( prevComputer && prevComputer.text !== computer.text ) {
                    chrome.notifications.create({
                        type: 'basic',
                        iconUrl: 'icons/icon128.png',
                        title: `Изменение состояния ${computer.name}`,
                        message: computer.text
                    });
                }
            });
        }

        await chrome.storage.local.set({computers});

        return {computers};
    } catch (error) {
        console.error('Fetch error:', error);
        await updateBadge([], '#810303', "!");
        return {error: 'Ошибка получения данных'};
    }
}

// Обработчик сообщений
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if ( request.action === 'getComputers' ) {
        fetchComputers().then(sendResponse);
        return true;
    }
    if (request.action === 'resyncAllSessions') {
        resyncAllSessions().then(sendResponse);
        return true;
    }
});

// Создаем периодическое обновление
chrome.alarms.create('updateComputers', {periodInMinutes: 1});

// Обработчик alarm
chrome.alarms.onAlarm.addListener((alarm) => {
    if ( alarm.name === 'updateComputers' ) {
        fetchComputers();
    }
});

fetchComputers()
