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
                    // notifications removed
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

// background.js (MV3)

let platformLoadCache = { ok: false, status: 0, data: null, raw: null, ts: 0 };
const FPMP_CACHE_MS = 90 * 1000; // 1.5 мин: небольшой кэш, чтобы не долбить API
let _platformLoadCache = { ts: 0, data: null };


async function fetchPlatformLoad() {
  try {
    // host_permissions в манифесте уже есть: https://api.fogstats.ru/*
    const r = await fetch('https://api.fogstats.ru/api/v1/load/percentage', { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();

    _platformLoadCache = { ts: Date.now(), data };
    console.log('[FPMP][bg] platform load:', data);

    // складываем в storage — контент-скрипт поймает onChanged и обновит UI
    await chrome.storage.local.set({
      platformLoad: data,
      platformLoadTs: _platformLoadCache.ts
    });

    return { ok: true, data };
  } catch (e) {
    console.warn('[FPMP][bg] platform load error:', e);
    return { ok: false, error: String(e) };
  }
}

// стартовый прогон + периодический кэш раз в 2 минуты
fetchPlatformLoad();
setInterval(fetchPlatformLoad, 120_000);

// Вызов из контента
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'fpmp:getPlatformLoad') {
    const force = !!msg.force;
    const fresh = _platformLoadCache.data && (Date.now() - _platformLoadCache.ts) < FPMP_CACHE_MS;

    if (!force && fresh) {
      console.debug('[FPMP][bg] return cached platform load');
      sendResponse({ ok: true, data: _platformLoadCache.data, cached: true });
    } else {
      fetchPlatformLoad().then(sendResponse);
    }
    return true; // async response
  }
});

// Периодически обновляем даже когда контент-скрипт молчит
chrome.runtime.onInstalled.addListener(() => {
  try { chrome.alarms.create('fpmpLoadTick', { periodInMinutes: 2 }); } catch {}
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'fpmpLoadTick') fetchPlatformLoad();
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
