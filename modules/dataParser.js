// Улучшенный dataParser.js с умной системой задержек

function waiting(ms) {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve();
        }, ms);
    });
}

// Кулдауны keep-alive (жёсткие)
const KEEPALIVE = {
  sessionsMs: 5 * 60_000,   // быстрый прогон сессий — не чаще 1 раза в 5 минут
  reviewsMs:  15 * 60_000,  // фронт-скан отзывов — не чаще 1 раза в 15 минут
};

// Конфиг отзывов
const REVIEWS_CONFIG = {
  retentionDays: 180,   // насколько глубоко по времени нам реально нужны отзывы
  frontPages: 2,        // быстрый фронт-скан при открытии ПК
  stopAfterOldPages: 2  // если подряд N страниц целиком старше cutoff — останавливаем полный проход
};

// Историческая подкачка (настройки и ключи storage)
const HISTORY_CONFIG = {
  enabledKey: 'historyBackfillEnabled',   // флаг "вкл/выкл"
  anchorKey:  'historyAnchor',            // где хранится якорь
  busyKey:    'historyBusy',
  pagesPerTick: 4,                        // сколько страниц добираем за один тик
};

// Историческая подкачка ОТЗЫВОВ
const REVIEWS_HISTORY_CONFIG = {
  anchorKey: 'historyReviewsAnchor', // ключ якоря в chrome.storage
  pagesPerTick: 1                    // по одной странице за тик
};

// Конфигурация парсинга для снижения нагрузки и избежания 504
const PARSE_CONFIG = {
    retentionDays: 90,                // Сколько дней сессий хранить и добирать
    incrementalMaxPages: 50,          // Базовый максимум страниц за один прогон (будет динамически меняться)
    noNewPagesStopAfter: 25,          // Останавливаемся если нет новых данных N страниц подряд (и ушли за порог давности)
    saveEveryPages: 5,                // Как часто сохранять сессии в storage (в страницах)
    delayJitterMin: 0.85,             // Минимальный множитель джиттера
    delayJitterMax: 1.20,             // Максимальный множитель джиттера
    breakerWindow: 8,                 // Окно страниц для оценки средней задержки
    breakerThresholdMs: 4500,         // Порог средней задержки (мс) для срабатывания breaker
    breakerCoolDownMs: 30_000,        // Пауза при срабатывании breaker
    tailChaseMaxPages: 70             // максимум дополнительных страниц «вдогонку», когда не нашли все открытые
}; 
const FRONT_SCAN_PAGES = 3;            // Было в старой стратегии, сейчас не используется
const INCREMENTAL_EXISTING_PAGES_LIMIT_DEFAULT = 5; // По умолчанию 5 страниц подряд без новых → стоп

// === Историческая подкачка — помощники
const isAnchorDone = (a) => !!a && Number(a.nextPage) > Number(a.lastPageSnapshot);
const hasWorkLeft  = (a) => !!a && Number(a.nextPage) <= Number(a.lastPageSnapshot);


// Класс для управления умными задержками
class SmartDelayManager {
    constructor() {
        this.baseDelay = 1000; // Базовая задержка 1 сек
        this.minDelay = 500;   // Минимальная задержка 0.5 сек
        this.maxDelay = 10000; // Максимальная задержка 10 сек
        this.currentDelay = this.baseDelay;

        // История времени ответов (последние 5 запросов)
        this.responseHistory = [];
        this.maxHistorySize = 5;

        // Целевое время ответа (в мс)
        this.targetResponseTime = 2000; // 2 секунды
        this.fastResponseThreshold = 1000; // Быстрый ответ < 1 сек
        this.slowResponseThreshold = 5000; // Медленный ответ > 5 сек

        // Факторы коррекции
        this.speedupFactor = 0.9;  // Уменьшаем задержку на 10%
        this.slowdownFactor = 1.3; // Увеличиваем задержку на 30%
        this.criticalSlowdownFactor = 2.0; // При критично медленном ответе
    }

    // Добавляем время ответа в историю
    addResponseTime(responseTime) {
        this.responseHistory.push(responseTime);

        // Оставляем только последние N записей
        if ( this.responseHistory.length > this.maxHistorySize ) {
            this.responseHistory.shift();
        }

        this.adjustDelay(responseTime);
    }

    // Корректируем задержку на основе времени ответа
    adjustDelay(responseTime) {
        console.log(`Response time: ${responseTime}ms, current delay: ${this.currentDelay}ms`);

        if ( responseTime < this.fastResponseThreshold ) {
            // Быстрый ответ - можем ускориться
            this.currentDelay = Math.max(
                this.minDelay,
                Math.round(this.currentDelay * this.speedupFactor)
            );
            console.log(`Fast response detected, reducing delay to ${this.currentDelay}ms`);

        } else if ( responseTime > this.slowResponseThreshold ) {
            // Очень медленный ответ - значительно замедляемся
            this.currentDelay = Math.min(
                this.maxDelay,
                Math.round(this.currentDelay * this.criticalSlowdownFactor)
            );
            console.log(`Very slow response detected, increasing delay to ${this.currentDelay}ms`);

        } else if ( responseTime > this.targetResponseTime ) {
            // Медленнее целевого - немного замедляемся
            this.currentDelay = Math.min(
                this.maxDelay,
                Math.round(this.currentDelay * this.slowdownFactor)
            );
            console.log(`Slow response detected, increasing delay to ${this.currentDelay}ms`);
        }
        // Если время в пределах нормы - оставляем как есть
    }

    // Получаем среднее время ответа за последние запросы
    getAverageResponseTime() {
        if ( this.responseHistory.length === 0 ) return 0;

        const sum = this.responseHistory.reduce((a, b) => a + b, 0);
        return Math.round(sum / this.responseHistory.length);
    }

    // Получаем текущую задержку
    getCurrentDelay() {
        return this.currentDelay;
    }

    // Сброс к базовым настройкам (при новой сессии парсинга)
    reset() {
        this.currentDelay = this.baseDelay;
        this.responseHistory = [];
        console.log('Delay manager reset to base delay:', this.baseDelay);
    }

    // Экстренное увеличение задержки (при ошибках типа 429)
    emergencySlowdown() {
        this.currentDelay = Math.min(this.maxDelay, this.currentDelay * 3);
        console.log(`Emergency slowdown activated, delay: ${this.currentDelay}ms`);
    }

    // Получение статистики для отладки
    getStats() {
        return {
            currentDelay: this.currentDelay,
            averageResponseTime: this.getAverageResponseTime(),
            responseHistory: [...this.responseHistory],
            historySize: this.responseHistory.length
        };
    }
}

// Создаем глобальный экземпляр менеджера задержек
const delayManager = new SmartDelayManager();


// Функция для выполнения запроса с измерением времени
async function fetchWithTiming(url, options = {}) {
    const startTime = Date.now();

    try {
        const response = await fetch(url, {
            credentials: 'include',
            ...options
        });

        const responseTime = Date.now() - startTime;
        delayManager.addResponseTime(responseTime);

        // Специальная обработка rate limiting
        if ( response.status === 429 ) {
            console.log('Rate limited (429), applying emergency slowdown');
            delayManager.emergencySlowdown();
            throw new Error('Rate limited');
        }

        // Обработка ошибок сервера (например, 500/502/503/504)
        if ( response.status >= 500 ) {
            console.log(`Server error (${response.status}), applying emergency slowdown`);
            delayManager.emergencySlowdown();
            throw new Error(`Server error ${response.status}`);
        }

        return response;

    } catch (error) {
        const responseTime = Date.now() - startTime;

        // Если запрос завершился ошибкой, но занял много времени
        // то это тоже признак перегрузки сервера
        if ( responseTime > delayManager.slowResponseThreshold ) {
            delayManager.addResponseTime(responseTime);
        } else {
            // При быстрой ошибке (сетевая проблема) применяем умеренное замедление
            delayManager.currentDelay = Math.min(
                delayManager.maxDelay,
                delayManager.currentDelay * 1.5
            );
        }

        throw error;
    }
}

// Универсальный fetch с ретраями и бэкоффом, возвращает HTML-строку
async function fetchHtmlWithRetry(url, {
  retries = 3,
  backoffBaseMs = 2000,
  label = 'page'
} = {}) {
  let attempt = 0;
  // небольшой джиттер к базовым задержкам
  const jitter = () => (PARSE_CONFIG.delayJitterMin + Math.random() * (PARSE_CONFIG.delayJitterMax - PARSE_CONFIG.delayJitterMin));

  while (true) {
    try {
      const resp = await fetchWithTiming(url);
      if (resp.ok) {
        return await resp.text();
      }

      // ретраим только «временные» статусы
      if (resp.status === 429 || resp.status >= 500) {
        delayManager.emergencySlowdown();
        const wait = Math.round(delayManager.getCurrentDelay() * 2 * jitter());
        console.warn(`[retry] ${label}: HTTP ${resp.status}, wait ${wait}ms`);
        await waiting(wait);
      } else {
        // 4xx ≠ 429 — считаем фатальной
        throw new Error(`HTTP ${resp.status}`);
      }
    } catch (err) {
      attempt++;
      if (attempt > retries) {
        console.error(`[retry] ${label}: failed after ${retries} attempts →`, err?.message || err);
        throw err;
      }
      const wait = Math.round(backoffBaseMs * Math.pow(2, attempt - 1) * jitter());
      console.warn(`[retry] ${label}: attempt ${attempt}/${retries}, wait ${wait}ms`);
      await waiting(wait);
    }
  }
}

function parseDateTime(str) {
    let [datePart, timePart = "00:00:00"] = str.split(" ");
    const [y, m, d] = datePart.split("-").map(Number);
    const [h, mi, s = 0] = timePart.split(":").map(Number);
    return new Date(y, m - 1, d, h, mi, s);
}

function parseIncome(str) {
    return parseFloat(str.replace(/[^\d.,]/g, "").replace(",", ".")) || 0;
}

// Получение примерного числа страниц без запроса в "хвост"
async function getTotalPages() {
    try {
        const response = await fetchWithTiming("https://fogplay.mts.ru/merchant/?page=1");
        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, "text/html");
        const pageLinks = Array.from(doc.querySelectorAll('.pagination a'))
            .map(a => parseInt(a.textContent.trim()))
            .filter(n => !isNaN(n));
        if ( pageLinks.length === 0 ) return 1;
        return Math.max(...pageLinks);
    } catch (error) {
        console.error('Error getting total pages (safe method):', error);
        return 1;
    }
}

// Быстрый поиск последней страницы (двойной шаг + бинарный поиск)
async function findLastPageByDoubling() {
    let low = 1;
    let high = 2;
    const hasNext = async (page) => {
        const resp = await fetchWithTiming(`https://fogplay.mts.ru/merchant/?page=${page}&_=${Date.now()}`);
        if (!resp.ok) throw new Error(`HTTP error ${resp.status}`);
        const html = await resp.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const next = doc.querySelector('.pagination li.next a');
        return {hasNext: !!next, doc};
    };

    try {
        // Увеличиваем high пока есть next
        while (true) {
            try {
                const {hasNext: nxt} = await hasNext(high);
                if (nxt) {
                    low = high;
                    high = high * 2;
                    continue;
                } else {
                    break;
                }
            } catch (e) {
                // Слишком высоко или 5xx — считаем это верхней границей
                break;
            }
        }

        // Бинарный поиск границы
        let left = low;
        let right = high;
        let lastPage = left;
        while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            try {
                const {hasNext: nxt} = await hasNext(mid);
                if (nxt) {
                    lastPage = Math.max(lastPage, mid + 1);
                    left = mid + 1;
                } else {
                    lastPage = Math.max(lastPage, mid);
                    right = mid - 1;
                }
            } catch (e) {
                right = mid - 1;
            }
        }
        return Math.max(1, lastPage);
    } catch (err) {
        console.error('findLastPageByDoubling failed:', err);
        return 1;
    }
}

async function authPing() {
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
    const r = await fetch('https://fogplay.mts.ru/merchant/?page=1', {
      credentials: 'include',
      cache: 'no-store',
      mode: 'same-origin'
    });
    return !!(r && r.ok);
  } catch {
    return false; // сюда падает TypeError: Failed to fetch
  }
}

function isNetworkHiccup(err) {
  const msg = String(err && err.message || err || '');
  return msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('net::');
}


// ── dataParser.js ─────────────────────────────────────────────────────────────
function ruDateToISO(s) {
  // "DD.MM.YYYY HH:MM" -> "YYYY-MM-DD HH:MM:00"
  const m = (s || '').match(/(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  if (!m) return s || '';
  const [, dd, mm, yyyy, hh='00', mi='00'] = m;
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:00`;
}

function cleanGameName(t) {
  // убираем управляющие символы и двойные пробелы
  return (t || '').replace(/[\u0000-\u001F\u007F-\u009F]/g, '').replace(/\s+/g, ' ').trim();
}

function parsePage(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const rows = doc.querySelectorAll("tr[data-key]");
  if (!rows.length) return [];

  const out = [];
  rows.forEach(row => {
    const cells = row.querySelectorAll("td");
    if (cells.length < 10) return;

    // Новая раскладка столбцов (см. снимок страницы)
    const pcName   = cells[0].textContent.trim();
    const gameName = cleanGameName(cells[1].textContent);
    const startRaw = cells[2].textContent.trim();
    const endRaw   = cells[3].textContent.trim();
    const duration = cells[4].textContent.trim();

    // В ячейке статуса есть tooltip; забираем только текст статуса
    const statusCell  = cells[5];
    const statusText  = (statusCell.childNodes[0]?.textContent || statusCell.textContent || '').trim();

    const income        = cells[6].textContent.trim();
    const paymentStatus = cells[7].textContent.trim();
    const paymentDate   = cells[8].textContent.trim();
    const paymentId     = cells[9].textContent.trim();

    // Нормализуем формат даты к ISO-подобному, чтобы new Date(...) работал стабильно
    const startTimeISO = ruDateToISO(startRaw);
    const endTimeISO   = endRaw === '-' ? '-' : ruDateToISO(endRaw);

    // Если хочешь учитывать только завершённые — оставь условие ниже. 
    // Если нужны все сессии — убери if.
    // if (!statusText.startsWith('Завершена')) return;

    out.push({
      id: row.dataset.key,
      data: {
        pcName,
        gameName,            // <— новое поле!
        startTime: startTimeISO,
        endTime: endTimeISO,
        duration,
        status: statusText,
        income,
        paymentStatus,
        paymentDate,
        paymentId
      }
    });
  });

  return out;
}


function calculateStatsFromSessions(sessions) {
    const stats = {};

    const sessionArray = Array.isArray(sessions) ? sessions : Object.values(sessions);

    for (const session of sessionArray) {
        const pcName = session.pcName;
        if ( !stats[pcName] ) {
            stats[pcName] = {
                totalIncome: 0,
                firstDate: null,
                lastDate: null,
                sessionCount: 0,
                totalMinutes: 0,
                daysWorked: new Set()
            };
        }

        const income = parseFloat(session.income.replace(/[^\d.,]/g, "").replace(",", ".")) || 0;
        const duration = parseInt(session.duration) || 0;
        const sessionDate = new Date(session.startTime);

        stats[pcName].totalIncome += income;
        stats[pcName].totalMinutes += duration;
        stats[pcName].sessionCount++;

        if ( !stats[pcName].firstDate || sessionDate < new Date(stats[pcName].firstDate) ) {
            stats[pcName].firstDate = sessionDate.toISOString();
        }
        if ( !stats[pcName].lastDate || sessionDate > new Date(stats[pcName].lastDate) ) {
            stats[pcName].lastDate = sessionDate.toISOString();
        }

        stats[pcName].daysWorked.add(sessionDate.toISOString().split("T")[0]);
    }

    for (const pc in stats) {
        stats[pc].daysWorked = stats[pc].daysWorked.size;
    }

    return stats;
}

// ---- helpers: open sessions + safe merge ----
function isOpenSession(s) {
  const st = (s?.status || '').toLowerCase();
  return s?.endTime === '-' || /в работе|актив/i.test(st) || (!s?.endTime && !/заверш/i.test(st));
}

function indexOpenSessions(sessionsObj) {
  const set = new Set();
  for (const [id, s] of Object.entries(sessionsObj || {})) {
    if (isOpenSession(s)) set.add(String(id));
  }
  return set;
}

function mergeSessions(existing, pageSessions) {
  let newCount = 0, updatedCount = 0;
  for (const { id, data } of pageSessions) {
    const prev = existing[id];
    if (!prev) {
      existing[id] = data;
      newCount++;
    } else if (
      prev.endTime !== data.endTime ||
      prev.status  !== data.status  ||
      prev.income  !== data.income  ||
      prev.paymentStatus !== data.paymentStatus ||
      prev.paymentDate   !== data.paymentDate
    ) {
      existing[id] = data;
      updatedCount++;
    }
  }
  return { newCount, updatedCount };
}

// ——— Выбрать цель для фронт-прогона: самая старая открытая, иначе просто самая старая ———
function pickTargetSession(existing) {
  let oldestOpen = null;   // {id, startISO, ts}
  let oldestAny  = null;   // {id, startISO, ts}

  for (const [id, s] of Object.entries(existing || {})) {
    const iso = s?.startTime || null;
    if (!iso) continue;
    const ts = new Date(iso.replace(' ', 'T')).getTime();
    if (!isFinite(ts)) continue;

    // любая самая старая
    if (!oldestAny || ts < oldestAny.ts) oldestAny = { id, startISO: iso, ts };

    // самая старая ОТКРЫТАЯ
    if (isOpenSession(s)) {
      if (!oldestOpen || ts < oldestOpen.ts) oldestOpen = { id, startISO: iso, ts };
    }
  }

  return oldestOpen || oldestAny || null; // {id, startISO, ts} | null
}

// —— Историческая подкачка: якорь и тикер ——

// Создать/обновить якорь, если его нет
// Создать/обновить якорь для СЕССИЙ (без «перезапуска с 1 страницы»)
async function ensureHistoryAnchor() {
  const key = HISTORY_CONFIG.anchorKey;
  const { [key]: anchor = null } = await chrome.storage.local.get([key]);
  if (anchor && typeof anchor.nextPage === 'number' && typeof anchor.lastPageSnapshot === 'number') {
    return anchor;
  }
  const lastPage = await findLastPageByDoubling().catch(() => 1);
  const fresh = {
    nextPage: 1,
    lastPageSnapshot: lastPage,
    currentPage: 0,
    pageDateISO: null,
    cyclesDone: 0,
    done: false,
    lastRunTs: Date.now()
  };
  await chrome.storage.local.set({ [key]: fresh });
  return fresh;
}


// Сбросить якорь вручную (полезно в отладке или по кнопке)
async function resetHistoryAnchor() {
  await chrome.storage.local.remove([HISTORY_CONFIG.anchorKey]);
}

// Один тик исторической подкачки: проходим pagesPerTick страниц по якорю
// Оркестратор: делает тик по сессиям и/или отзывам, умеет авто-стопить
async function historicalBackfillTick(pagesPerTick = HISTORY_CONFIG.pagesPerTick) {
  const { [HISTORY_CONFIG.enabledKey]: enabled = false } =
    await chrome.storage.local.get([HISTORY_CONFIG.enabledKey]);
  if (!enabled) return { success: true, skipped: true };

  await chrome.storage.local.set({ [HISTORY_CONFIG.busyKey]: true });
  try {
    // читаем якоря, решаем по чём есть работа
    const [{ [HISTORY_CONFIG.anchorKey]: sessA }, { [REVIEWS_HISTORY_CONFIG.anchorKey]: revA }] =
      await Promise.all([
        chrome.storage.local.get([HISTORY_CONFIG.anchorKey]),
        chrome.storage.local.get([REVIEWS_HISTORY_CONFIG.anchorKey])
      ]);

    const doSessions = hasWorkLeft(sessA || (await ensureHistoryAnchor()));
    const doReviews  = hasWorkLeft(revA  || (await ensureReviewsHistoryAnchor()));

    let resS = { done: !doSessions }, resR = { done: !doReviews };

    if (doSessions) resS = await _tickSessionsNoBusy(pagesPerTick);
    if (doReviews)  resR = await _tickReviewsNoBusy(REVIEWS_HISTORY_CONFIG.pagesPerTick || 1);

    const allDone = !!resS.done && !!resR.done;

    if (allDone) {
      // полностью закончили: выключаем переключатель
      await chrome.storage.local.set({ [HISTORY_CONFIG.enabledKey]: false });
    }

    console.log('[HistoryTick] done:', {
      sessions: { processed: resS.processed|0, done: resS.done },
      reviews : { processed: resR.processed|0, done: resR.done },
      allDone
    });

    return {
      success: true,
      sessions: resS,
      reviews:  resR,
      allDone
    };
  } finally {
    await chrome.storage.local.set({ [HISTORY_CONFIG.busyKey]: false });
  }
}


// ====== REVIEWS: парсер одной страницы ======
function parseReviewsPage(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // пробуем несколько вариантов, чтобы не промазать по классам
  let rows = doc.querySelectorAll('table.merchant-table__reviews tbody tr');
  if (!rows.length) rows = doc.querySelectorAll('table.merchant-table tbody tr');
  if (!rows.length) rows = doc.querySelectorAll('table tbody tr');

  const out = [];
  rows.forEach(tr => {
    const tds = tr.querySelectorAll('td');
    if (tds.length < 5) return;

    // дата/начало: ищем DD.MM.YYYY HH:MM в любой ячейке
    const rawCells = Array.from(tds).map(td => td.textContent.trim());
    const dateCell = rawCells.find(x => /\d{2}\.\d{2}\.\d{4}/.test(x)) || '';
    const startISO = ruDateToISO(dateCell)?.replace(' ', 'T') || null;

    // рейтинг: число или по иконкам
    let rating = parseInt((rawCells.find(x => /^\d+$/.test(x)) || ''), 10);
    if (!rating) rating = tr.querySelectorAll('svg use[href*="star"], i.icon-star, .icon-star.fill').length || null;

    // игра — берём самую длинную «словесную» ячейку
    const game = rawCells.reduce((a, b) => (b.length > a.length ? b : a), '');

    // ПК — ссылка или текст
    const link = tr.querySelector('a[href*="computer-edit"]');
    const pcName = link ? link.textContent.trim() : (rawCells[rawCells.length - 2] || '').trim();

    const comment = rawCells[rawCells.length - 1] || '';

    if (!pcName || !rating) return;

    const idSeed = `${pcName}|${startISO}|${rating}|${comment}`;
    const id = 'r_' + btoa(unescape(encodeURIComponent(idSeed))).replace(/=+$/, '');

    out.push({ id, pcName, startISO, rating, game, comment });
  });
  return out;
}


// ====== REVIEWS: мердж в сторедж-структуру ======
function mergeReviews(reviewsByPc, list) {
  let added = 0, updated = 0;
  for (const r of list) {
    const bucket = (reviewsByPc[r.pcName] ||= { items: {}, lastUpdate: null });
    const prev = bucket.items[r.id];
    if (!prev) {
      bucket.items[r.id] = r;
      added++;
    } else if (
      prev.rating !== r.rating ||
      prev.comment !== r.comment ||
      prev.startISO !== r.startISO ||
      prev.endISO !== r.endISO
    ) {
      bucket.items[r.id] = r;
      updated++;
    }
  }
  return { added, updated };
}

// ====== REVIEWS: бинарный поиск последней страницы (как для сессий) ======
async function findLastReviewsPageByDoubling() {
  let low = 1, high = 2;
  const hasNext = async (page) => {
    const resp = await fetchWithTiming(`https://fogplay.mts.ru/merchant/report/review/index/?page=${page}&_=${Date.now()}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const html = await resp.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const next = doc.querySelector('.pagination li.next a');
    return { hasNext: !!next };
  };

  try {
    // разгон
    while (true) {
      try {
        const { hasNext: nxt } = await hasNext(high);
        if (nxt) { low = high; high *= 2; } else break;
      } catch { break; }
    }
    // бинарка
    let left = low, right = high, last = left;
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      try {
        const { hasNext: nxt } = await hasNext(mid);
        if (nxt) { last = Math.max(last, mid + 1); left = mid + 1; }
        else     { last = Math.max(last, mid);     right = mid - 1; }
      } catch { right = mid - 1; }
    }
    return Math.max(1, last);
  } catch {
    return 1;
  }
}

// Создать/обновить якорь для ОТЗЫВОВ
async function ensureReviewsHistoryAnchor() {
  const key = REVIEWS_HISTORY_CONFIG.anchorKey;
  const { [key]: anchor = null } = await chrome.storage.local.get([key]);
  if (anchor && typeof anchor.nextPage === 'number' && typeof anchor.lastPageSnapshot === 'number') {
    return anchor;
  }
  const lastPage = await findLastReviewsPageByDoubling().catch(() => 1);
  const fresh = {
    nextPage: 1,
    lastPageSnapshot: lastPage,
    currentPage: 0,
    pageDateISO: null,
    cyclesDone: 0,
    done: false,
    lastRunTs: Date.now()
  };
  await chrome.storage.local.set({ [key]: fresh });
  return fresh;
}

// Один тик исторической подкачки ОТЗЫВОВ (проходим N страниц)
async function historicalBackfillReviewsTick(pagesPerTick = REVIEWS_HISTORY_CONFIG.pagesPerTick) {
  // Подкачка отзывов включается тем же флагом, что и подкачка сессий —
  // если нужно отдельно — вынеси в свой ключ enabledKey.
  const { [HISTORY_CONFIG.enabledKey]: enabled = false } =
    await chrome.storage.local.get([HISTORY_CONFIG.enabledKey]);
  if (!enabled) return { success: true, skipped: true };

  let anchor = await ensureReviewsHistoryAnchor();

  const { reviewsByPc: cache = {} } = await chrome.storage.local.get(['reviewsByPc']);
  const reviewsByPc = { ...(cache || {}) };

  let processed = 0, added = 0, updated = 0;

  while (processed < pagesPerTick) {
    try {
      if (anchor.nextPage > anchor.lastPageSnapshot) {
        const lp = await findLastReviewsPageByDoubling().catch(() => anchor.lastPageSnapshot || 1);
        anchor.lastPageSnapshot = lp || 1;
        anchor.nextPage = 1;
        anchor.cyclesDone = (anchor.cyclesDone || 0) + 1;
      }

      const page = anchor.nextPage;
      const resp = await fetchWithTiming(`https://fogplay.mts.ru/merchant/report/review/index/?page=${page}&_=${Date.now()}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const html = await resp.text();

      const list = parseReviewsPage(html);
      const r = mergeReviews(reviewsByPc, list);
      added += r.added; updated += r.updated;
      processed++;

      // Берём «нижнюю» дату страницы (обычно самая старая)
      const pageDateISO = list.length
        ? (list[list.length - 1]?.startISO || list[0]?.startISO || null)
        : null;

      anchor.nextPage = page + 1;
      anchor.currentPage = page;
      anchor.pageDateISO = pageDateISO || null;

      // периодически сохраняем
      if (processed % (PARSE_CONFIG.saveEveryPages || 5) === 0) {
        await chrome.storage.local.set({
          reviewsByPc,
          reviewsLastUpdate: new Date().toISOString(),
          [REVIEWS_HISTORY_CONFIG.anchorKey]: { ...anchor, lastRunTs: Date.now() }
        });
      }

      // страховка: если страница пустая — уточняем хвост
      if (list.length === 0) {
        const lp = await findLastReviewsPageByDoubling().catch(() => 1);
        anchor.lastPageSnapshot = lp || 1;
        anchor.nextPage = Math.min(anchor.nextPage, anchor.lastPageSnapshot);
      }
    } catch (e) {
      // если что-то пошло не так — просто выходим из цикла текущего тика
      console.warn('[HistoryTick:reviews] page error:', e?.message || e);
      break;
    }
  }

  await chrome.storage.local.set({
    reviewsByPc,
    reviewsLastUpdate: new Date().toISOString(),
    [REVIEWS_HISTORY_CONFIG.anchorKey]: { ...anchor, lastRunTs: Date.now() }
  });

  console.log('[HistoryTick:reviews] done:', { processed, added, updated, anchor });
  return { success: true, processed, added, updated, anchor };
}


// ====== REVIEWS: быстрый фронт-скан 1..N страниц ======
async function quickReviewFrontSweep(depthPages = REVIEWS_CONFIG.frontPages || 2) {
  const { reviewsByPc: cache = {} } = await chrome.storage.local.get(['reviewsByPc']);
  const reviewsByPc = { ...(cache || {}) };

  let pages = 0, added = 0, updated = 0;
  for (let page = 1; page <= depthPages; page++) {
    const baseDelay = delayManager.getCurrentDelay();
    const jitter = PARSE_CONFIG.delayJitterMin + Math.random() * (PARSE_CONFIG.delayJitterMax - PARSE_CONFIG.delayJitterMin);
    await waiting(Math.round(baseDelay * jitter));

    const resp = await fetchWithTiming(`https://fogplay.mts.ru/merchant/report/review/index/?page=${page}&_=${Date.now()}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const html = await resp.text();
    const list = parseReviewsPage(html);
    const r = mergeReviews(reviewsByPc, list);
    added += r.added; updated += r.updated;
    pages++;
  }

  if (added || updated) {
    await chrome.storage.local.set({
      reviewsByPc,
      reviewsLastUpdate: new Date().toISOString()
    });
  }
  console.log('[Reviews] quickReviewFrontSweep:', { pages, added, updated });
  return { success: true, pages, added, updated };
}

// ====== REVIEWS: инкрементальный проход 1..N до первой «известной» страницы ======
async function fetchReviewsIncrementalUntilKnown(maxPages = 50, stopAfter = 1) {
  const { reviewsByPc: cache = {} } = await chrome.storage.local.get(['reviewsByPc']);
  const reviewsByPc = { ...(cache || {}) };

  let pages = 0, added = 0, updated = 0, knownStreak = 0;

  for (let page = 1; page <= maxPages; page++) {
    const baseDelay = delayManager.getCurrentDelay();
    const jitter = PARSE_CONFIG.delayJitterMin + Math.random() * (PARSE_CONFIG.delayJitterMax - PARSE_CONFIG.delayJitterMin);
    await waiting(Math.round(baseDelay * jitter));

    const resp = await fetchWithTiming(`https://fogplay.mts.ru/merchant/report/review/index/?page=${page}&_=${Date.now()}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const html = await resp.text();
    const list = parseReviewsPage(html);

    const r = mergeReviews(reviewsByPc, list);
    added += r.added; updated += r.updated;
    pages++;

    // «страница известна» = нет ни добавленных, ни обновлённых
    if (r.added === 0 && r.updated === 0) {
      knownStreak++;
      if (knownStreak >= stopAfter) break;
    } else {
      knownStreak = 0;
    }

    if (list.length === 0) break; // страховка
    if (pages % (PARSE_CONFIG.saveEveryPages || 5) === 0) {
      await chrome.storage.local.set({ reviewsByPc, reviewsLastUpdate: new Date().toISOString() });
    }
  }

  await chrome.storage.local.set({ reviewsByPc, reviewsLastUpdate: new Date().toISOString() });
  console.log('[Reviews] fetchReviewsIncrementalUntilKnown:', { pages, added, updated });
  return { success: true, pages, added, updated };
}

// ====== REVIEWS: полный проход (с отсечкой по давности) ======
async function fetchAllReviewsFull() {
  const cutoff = new Date(Date.now() - (REVIEWS_CONFIG.retentionDays || 180) * 24 * 3600 * 1000);
  const { reviewsByPc: cache = {} } = await chrome.storage.local.get(['reviewsByPc']);
  const reviewsByPc = { ...(cache || {}) };

  const lastPage = await findLastReviewsPageByDoubling();
  let pages = 0, added = 0, updated = 0, oldStreak = 0;

  for (let page = 1; page <= lastPage; page++) {
    const baseDelay = delayManager.getCurrentDelay();
    const jitter = PARSE_CONFIG.delayJitterMin + Math.random() * (PARSE_CONFIG.delayJitterMax - PARSE_CONFIG.delayJitterMin);
    await waiting(Math.round(baseDelay * jitter));

    const resp = await fetchWithTiming(`https://fogplay.mts.ru/merchant/report/review/index/?page=${page}&_=${Date.now()}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const html = await resp.text();
    const list = parseReviewsPage(html);

    // проверяем давность всей страницы
    const allOld = list.length > 0 && list.every(r => r.startISO && (new Date(r.startISO) < cutoff));
    if (allOld) {
      oldStreak++;
      if (oldStreak >= (REVIEWS_CONFIG.stopAfterOldPages || 2)) break;
    } else {
      oldStreak = 0;
    }

    const r = mergeReviews(reviewsByPc, list);
    added += r.added; updated += r.updated;
    pages++;

    if (pages % (PARSE_CONFIG.saveEveryPages || 5) === 0) {
      await chrome.storage.local.set({ reviewsByPc, reviewsLastUpdate: new Date().toISOString() });
    }
  }

  await chrome.storage.local.set({ reviewsByPc, reviewsLastUpdate: new Date().toISOString() });
  console.log('[Reviews] fetchAllReviewsFull:', { pages, added, updated, lastPage });
  return { success: true, pages, added, updated, lastPage };
}


async function parseSessions(forceFullUpdate = false) {
  console.log('Starting parseSessions, forceFullUpdate:', forceFullUpdate);

  // Сбрасываем менеджер задержек для новой сессии
  delayManager.reset();

  try {
    if (forceFullUpdate) {
      await chrome.storage.local.set({
        parsingMode: 'full',
        parsingProgress: 0,
        lastParseTimestamp: Date.now()
      });
    } else {
      await chrome.storage.local.set({
        parsingMode: 'inc',
        lastParseTimestamp: Date.now()
      });
    }

    const storage = await chrome.storage.local.get(['sessions', 'lastParseTimestamp', 'incrementalPagesLimit']);
    let existingSessions = {};
    const incrementalLimit = storage.incrementalPagesLimit || INCREMENTAL_EXISTING_PAGES_LIMIT_DEFAULT;
    const tailChaseMaxPages = (PARSE_CONFIG && typeof PARSE_CONFIG.tailChaseMaxPages === 'number')
      ? PARSE_CONFIG.tailChaseMaxPages : 50;

    if (!forceFullUpdate && storage.sessions) {
      existingSessions = { ...storage.sessions };
    }

    console.log('Existing sessions count:', Object.keys(existingSessions).length);

    let pagesProcessed = 0;
    let newSessionsFound = 0;

    if (!forceFullUpdate) {
      // ── Инкрементальный проход с «дожимом» открытых ──────────────────────────
      let currentPage = 1;
      let consecutiveExisting = 0;

      // Индекс «старых открытых» и счётчик увиденных в этом прогоне
      const openSet = indexOpenSessions(existingSessions);
      const foundOpenThisRun = new Set();
      let extraChased = 0; // сколько страниц прошли сверх лимита, «вдогонку»

      while (true) {
        try {
          const baseDelay = delayManager.getCurrentDelay();
          const jitter = PARSE_CONFIG.delayJitterMin + Math.random() * (PARSE_CONFIG.delayJitterMax - PARSE_CONFIG.delayJitterMin);
          await waiting(Math.round(baseDelay * jitter));

          //const resp = await fetchWithTiming(`https://fogplay.mts.ru/merchant/?page=${currentPage}&_=${Date.now()}`);
          //if (!resp.ok) throw new Error(`HTTP error! status: ${resp.status}`);
          //const html = await resp.text();
          // при ошибке вызываем повтор на месте
          const url = `https://fogplay.mts.ru/merchant/?page=${currentPage}&_=${Date.now()}`;
          const html = await fetchHtmlWithRetry(url, { retries: 3, label: `sessions p=${currentPage}` });

          
          const pageSessions = parsePage(html);
          if (pageSessions.length === 0) break; // кончились страницы

          // Мерджим: считаем новые и обновлённые
          const r = mergeSessions(existingSessions, pageSessions);
          newSessionsFound += r.newCount;

          // Отмечаем «старые открытые», которые увидели заново
          for (const s of pageSessions) {
            const id = String(s.id);
            if (openSet.has(id)) foundOpenThisRun.add(id);
          }

          pagesProcessed++;

          // Пустая страница = без новых и без обновлений
          if ((r.newCount + r.updatedCount) === 0) {
            consecutiveExisting++;
          } else {
            consecutiveExisting = 0;
            if (pagesProcessed % PARSE_CONFIG.saveEveryPages === 0) {
              await chrome.storage.local.set({ sessions: existingSessions });
            }
          }

          const allOpenSeen = foundOpenThisRun.size >= openSet.size;

          // Базовое условие останова: подряд N «пустых»
          if (consecutiveExisting >= incrementalLimit) {
            if (allOpenSeen) {
              // Всё ок: все открытые «подтверждены» — выходим
              break;
            }

            // Иначе — один раз «дожимаем» хвост (идём глубже до cap)
            if (extraChased === 0) {
              const lastPage = await findLastPageByDoubling().catch(() => null);
              const cap = Math.min(
                lastPage || (currentPage + tailChaseMaxPages),
                currentPage + tailChaseMaxPages
              );

              while (currentPage < cap && foundOpenThisRun.size < openSet.size) {
                currentPage++;
                extraChased++;

                const baseDelay2 = delayManager.getCurrentDelay();
                const jitter2 = PARSE_CONFIG.delayJitterMin + Math.random() * (PARSE_CONFIG.delayJitterMax - PARSE_CONFIG.delayJitterMin);
                await waiting(Math.round(baseDelay2 * jitter2));

                const r2 = await fetchWithTiming(`https://fogplay.mts.ru/merchant/?page=${currentPage}&_=${Date.now()}`);
                if (!r2.ok) break;

                const html2 = await r2.text();
                const ps2 = parsePage(html2);

                const m2 = mergeSessions(existingSessions, ps2);
                newSessionsFound += m2.newCount;

                for (const s of ps2) {
                  const id2 = String(s.id);
                  if (openSet.has(id2)) foundOpenThisRun.add(id2);
                }

                pagesProcessed++;
              }

              // Сохраним «дожатое» и выходим из инкремента
              await chrome.storage.local.set({ sessions: existingSessions });
              break;
            }

            // Уже пытались «дожать» — выходим
            break;
          }

          currentPage++;
        } catch (e) {
          const msg = e?.message || '';
          const isRateLimited = msg.includes('Rate limited');
          const isServerError = msg.includes('Server error');
          if (isRateLimited || isServerError) {
            const avgMs = delayManager.getAverageResponseTime();
            const coolDown = avgMs > PARSE_CONFIG.breakerThresholdMs ? PARSE_CONFIG.breakerCoolDownMs : 15000;
            await waiting(coolDown);
            continue;
          } else {
            await waiting(5000);
            currentPage++;
          }
        }
      }

    } else {
      // ── Полный проход: находим хвост и идём назад ────────────────────────────
      const lastPage = await findLastPageByDoubling();
      console.log('Full update: last page detected =', lastPage);

      let currentPage = Math.max(1, lastPage);
      let done = 0;

      while (currentPage >= 1) {
        try {
          const baseDelay = delayManager.getCurrentDelay();
          const jitterFactor = PARSE_CONFIG.delayJitterMin + Math.random() * (PARSE_CONFIG.delayJitterMax - PARSE_CONFIG.delayJitterMin);
          const smartDelay = Math.round(baseDelay * jitterFactor);
          await waiting(smartDelay);

          //const response = await fetchWithTiming(`https://fogplay.mts.ru/merchant/?page=${currentPage}&_=${Date.now()}`);
          //if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
          //const html = await response.text();
          
          const url = `https://fogplay.mts.ru/merchant/?page=${currentPage}&_=${Date.now()}`;
          const html = await fetchHtmlWithRetry(url, { retries: 3, label: `sessions p=${currentPage}` });
          
          const pageSessions = parsePage(html);

          const r = mergeSessions(existingSessions, pageSessions);
          newSessionsFound += r.newCount;

          pagesProcessed++;
          done = (Math.max(0, lastPage - currentPage + 1));
          const progress = Math.min(done / Math.max(1, lastPage), 0.99);

          if (pagesProcessed % PARSE_CONFIG.saveEveryPages === 0) {
            await chrome.storage.local.set({
              sessions: existingSessions,
              parsingProgress: progress
            });
          }

          currentPage--;
        } catch (e) {
          const isRateLimited = (e.message || '').includes('Rate limited');
          const isServerError = (e.message || '').includes('Server error');
          if (isRateLimited || isServerError) {
            const avgMs = delayManager.getAverageResponseTime();
            const coolDown = avgMs > PARSE_CONFIG.breakerThresholdMs ? PARSE_CONFIG.breakerCoolDownMs : 15000;
            await waiting(coolDown);
            continue;
          } else {
            await waiting(5000);
            currentPage--;
          }
        }
      }
    }

    // ── Финиш: сохраняем статы ─────────────────────────────────────────────────
    console.log(`Parsing completed. New sessions found: ${newSessionsFound}`);
    console.log(`Total sessions: ${Object.keys(existingSessions).length}`);
    console.log(`Pages processed: ${pagesProcessed}`);
    console.log(`Final delay manager stats:`, delayManager.getStats());

    const stats = calculateStatsFromSessions(existingSessions || {});
    const baseSave = {
      statistics: stats,
      sessions: existingSessions,
      lastUpdate: new Date().toISOString(),
      lastParseTimestamp: Date.now(),
      parsingMode: 'idle'
    };

    if (forceFullUpdate) baseSave.parsingProgress = 1;

    await chrome.storage.local.set(baseSave);

    try {
      if (forceFullUpdate) {
        await fetchAllReviewsFull();
      } else {
        // идём до первой «полностью известной» страницы
        await fetchReviewsIncrementalUntilKnown(50, 1);
      }
    } catch (e) {
      console.warn('[Reviews] update after sessions error:', e?.message || e);
    }

    return {
      success: true,
      statistics: stats,
      pagesProcessed,
      newSessions: newSessionsFound,
      totalSessions: Object.keys(existingSessions).length,
      isIncremental: !forceFullUpdate,
      averageResponseTime: delayManager.getAverageResponseTime(),
      finalDelay: delayManager.getCurrentDelay()
    };

  } catch (error) {
    console.error("Parser error:", error);
    await chrome.storage.local.set({
      parsingProgress: 1,
      parsingError: error.message
    });
    // Отзывы: на полном обновлении — полный проход; на инкременте — лёгкая подкачка
    try {
      if (forceFullUpdate) {
        await fetchAllReviewsFull();
      } else {
        await quickReviewFrontSweep();
      }
    } catch (e) {
      console.warn('[Reviews] error:', e?.message || e);
    }
    return { success: false, error: error.message };
  }
}

// Полный пересъём всех страниц сессий без очистки кэша.
// Проходим 1..lastPage, мерджим, сохраняем каждые saveEveryPages.
async function resyncAllSessions() {
  console.log('[Resync] start');
  delayManager.reset();

  const { sessions: cached = {} } = await chrome.storage.local.get(['sessions']);
  const existing = { ...(cached || {}) };

  const lastPage = await findLastPageByDoubling();
  let pagesProcessed = 0, newFound = 0, updated = 0;

  for (let page = 1; page <= lastPage; page++) {
    try {
      const baseDelay = delayManager.getCurrentDelay();
      const smart = Math.round(baseDelay * (PARSE_CONFIG.delayJitterMin + Math.random()*(PARSE_CONFIG.delayJitterMax - PARSE_CONFIG.delayJitterMin)));
      await waiting(smart);

      const url = `https://fogplay.mts.ru/merchant/?page=${page}&_=${Date.now()}`;
      const html = await fetchHtmlWithRetry(url, { retries: 3, label: `resync p=${page}` });
      const ps = parsePage(html);

      const r = mergeSessions(existing, ps);
      newFound += r.newCount; updated += r.updatedCount;
      pagesProcessed++;

      if (pagesProcessed % (PARSE_CONFIG.saveEveryPages || 5) === 0) {
        const stats = calculateStatsFromSessions(existing);
        await chrome.storage.local.set({
          sessions: existing,
          statistics: stats,
          lastUpdate: new Date().toISOString()
        });
      }
    } catch (e) {
      // страницу не смогли взять даже после ретраев — логируем и идём дальше
      console.warn('[Resync] skip page', page, e?.message || e);
      continue;
    }
  }

  const stats = calculateStatsFromSessions(existing);
  await chrome.storage.local.set({
    sessions: existing,
    statistics: stats,
    lastUpdate: new Date().toISOString()
  });

  console.log('[Resync] done', { lastPage, pagesProcessed, newFound, updated });
  return { success: true, lastPage, pagesProcessed, newFound, updated };
}


// --- СЕССИИ: один тик без busy ---
async function _tickSessionsNoBusy(pagesPerTick = HISTORY_CONFIG.pagesPerTick) {
  let anchor = await ensureHistoryAnchor();
  if (isAnchorDone(anchor)) {
    anchor.done = true;
    await chrome.storage.local.set({ [HISTORY_CONFIG.anchorKey]: { ...anchor, lastRunTs: Date.now() } });
    return { processed: 0, newFound: 0, updated: 0, done: true, anchor };
  }

  const { sessions: cached = {} } = await chrome.storage.local.get(['sessions']);
  const existing = { ...(cached || {}) };

  const pagesLeft = Math.max(0, (anchor.lastPageSnapshot || 1) - ((anchor.nextPage - 1) || 0));
  const toProcess = Math.min(pagesPerTick || 1, pagesLeft || 0);

  let processed = 0, newFound = 0, updated = 0;

  for (let i = 0; i < toProcess; i++) {
    const page = anchor.nextPage;
    const html = await fetchHtmlWithRetry(
      `https://fogplay.mts.ru/merchant/?page=${page}&_=${Date.now()}`,
      { retries: 3, label: `history:sessions p=${page}` }
    );

    const ps = parsePage(html);
    const r  = mergeSessions(existing, ps);
    newFound += r.newCount; updated += r.updatedCount; processed++;

    const pageDateISO = (ps[ps.length - 1]?.data?.startTime) || (ps[0]?.data?.startTime) || null;
    anchor.currentPage = page;
    anchor.pageDateISO = pageDateISO || null;
    anchor.nextPage = page + 1;

    if (processed % (PARSE_CONFIG.saveEveryPages || 5) === 0) {
      const stats = calculateStatsFromSessions(existing);
      await chrome.storage.local.set({
        sessions: existing,
        statistics: stats,
        lastUpdate: new Date().toISOString(),
        [HISTORY_CONFIG.anchorKey]: { ...anchor, lastRunTs: Date.now(), done: isAnchorDone(anchor) }
      });
    }
  }

  const stats = calculateStatsFromSessions(existing);
  anchor.done = isAnchorDone(anchor);
  await chrome.storage.local.set({
    sessions: existing,
    statistics: stats,
    lastUpdate: new Date().toISOString(),
    [HISTORY_CONFIG.anchorKey]: { ...anchor, lastRunTs: Date.now(), done: anchor.done }
  });

  console.log('[HistoryTick:sessions] done:', { processed, newFound, updated, anchor });
  return { processed, newFound, updated, done: anchor.done, anchor };
}

// --- ОТЗЫВЫ: один тик без busy ---
async function _tickReviewsNoBusy(pagesPerTick = REVIEWS_HISTORY_CONFIG.pagesPerTick) {
  let anchor = await ensureReviewsHistoryAnchor();
  if (isAnchorDone(anchor)) {
    anchor.done = true;
    await chrome.storage.local.set({ [REVIEWS_HISTORY_CONFIG.anchorKey]: { ...anchor, lastRunTs: Date.now() } });
    return { processed: 0, added: 0, updated: 0, done: true, anchor };
  }

  const { reviewsByPc: cache = {} } = await chrome.storage.local.get(['reviewsByPc']);
  const reviewsByPc = { ...(cache || {}) };

  const pagesLeft = Math.max(0, (anchor.lastPageSnapshot || 1) - ((anchor.nextPage - 1) || 0));
  const toProcess = Math.min(pagesPerTick || 1, pagesLeft || 0);

  let processed = 0, added = 0, updated = 0;

  for (let i = 0; i < toProcess; i++) {
    const page = anchor.nextPage;
    const resp = await fetchWithTiming(`https://fogplay.mts.ru/merchant/report/review/index/?page=${page}&_=${Date.now()}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const html = await resp.text();

    const list = parseReviewsPage(html);
    const r = mergeReviews(reviewsByPc, list);
    added += r.added; updated += r.updated; processed++;

    const pageDateISO = list.length
      ? (list[list.length - 1]?.startISO || list[0]?.startISO || null)
      : null;

    anchor.currentPage = page;
    anchor.pageDateISO = pageDateISO || null;
    anchor.nextPage = page + 1;

    if (processed % (PARSE_CONFIG.saveEveryPages || 5) === 0) {
      await chrome.storage.local.set({
        reviewsByPc,
        reviewsLastUpdate: new Date().toISOString(),
        [REVIEWS_HISTORY_CONFIG.anchorKey]: { ...anchor, lastRunTs: Date.now(), done: isAnchorDone(anchor) }
      });
    }
  }

  anchor.done = isAnchorDone(anchor);
  await chrome.storage.local.set({
    reviewsByPc,
    reviewsLastUpdate: new Date().toISOString(),
    [REVIEWS_HISTORY_CONFIG.anchorKey]: { ...anchor, lastRunTs: Date.now(), done: anchor.done }
  });

  console.log('[HistoryTick:reviews] done:', { processed, added, updated, anchor });
  return { processed, added, updated, done: anchor.done, anchor };
}


// === quick front sweep: первые N страниц ===
async function quickFrontSweep(depthPages = 5) {
  const { sessions: cached = {} } = await chrome.storage.local.get(['sessions']);
  const existing = { ...(cached || {}) };

  let pagesProcessed = 0, newFound = 0, updated = 0;

  for (let page = 1; page <= depthPages; page++) {
    const baseDelay = delayManager.getCurrentDelay();
    const jitter = PARSE_CONFIG.delayJitterMin + Math.random() * (PARSE_CONFIG.delayJitterMax - PARSE_CONFIG.delayJitterMin);
    await waiting(Math.round(baseDelay * jitter));

    const resp = await fetchWithTiming(`https://fogplay.mts.ru/merchant/?page=${page}&_=${Date.now()}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status} on page ${page}`);
    const html = await resp.text();
    const ps = parsePage(html);

    const r = mergeSessions(existing, ps);
    newFound += r.newCount;
    updated  += r.updatedCount;
    pagesProcessed++;
  }

  if (newFound || updated) {
    const stats = calculateStatsFromSessions(existing);
    await chrome.storage.local.set({
      sessions: existing,
      statistics: stats,
      lastUpdate: new Date().toISOString()
    });
  }

  console.log('[KeepAlive] quickFrontSweep:', { pagesProcessed, newFound, updated });
  return { success: true, pagesProcessed, newFound, updated };
}

// ——— Фронт-прогон до «цели» (самая старая открытая, иначе самая старая) + 1 страница ———
async function frontSweepToTargetPlusOne() {
  const { sessions: cached = {} } = await chrome.storage.local.get(['sessions']);
  const existing = { ...(cached || {}) };

  const target = pickTargetSession(existing);
  if (!target) {
    // кеш пуст — просто пройдём первые 1-2 страницы, чтобы зацепиться
    let newFound = 0, updated = 0, pagesProcessed = 0;
    for (let page = 1; page <= 2; page++) {
      const baseDelay = delayManager.getCurrentDelay();
      const jitter = PARSE_CONFIG.delayJitterMin + Math.random() * (PARSE_CONFIG.delayJitterMax - PARSE_CONFIG.delayJitterMin);
      await waiting(Math.round(baseDelay * jitter));

      const html = await fetchHtmlWithRetry(
        `https://fogplay.mts.ru/merchant/?page=${page}&_=${Date.now()}`,
        { retries: 3, label: `front-empty p=${page}` }
      );
      const ps = parsePage(html);
      const r = mergeSessions(existing, ps);
      newFound += r.newCount; updated += r.updatedCount; pagesProcessed++;

      if (!ps.length) break;
    }
    if (newFound || updated) {
      const stats = calculateStatsFromSessions(existing);
      await chrome.storage.local.set({ sessions: existing, statistics: stats, lastUpdate: new Date().toISOString() });
    }
    console.log('[FrontToTarget] no target, primed first pages:', { pagesProcessed: 2 });
    return { success: true, primed: true };
  }

  let page = 1;
  let foundOn = null;
  let pagesProcessed = 0, newFound = 0, updated = 0;

  while (true) {
    const baseDelay = delayManager.getCurrentDelay();
    const jitter = PARSE_CONFIG.delayJitterMin + Math.random() * (PARSE_CONFIG.delayJitterMax - PARSE_CONFIG.delayJitterMin);
    await waiting(Math.round(baseDelay * jitter));

    const html = await fetchHtmlWithRetry(
      `https://fogplay.mts.ru/merchant/?page=${page}&_=${Date.now()}`,
      { retries: 3, label: `front->target p=${page}` }
    );
    const ps = parsePage(html);
    if (!ps.length) break; // хвост

    const r = mergeSessions(existing, ps);
    newFound += r.newCount; updated += r.updatedCount;
    pagesProcessed++;

    // нашли нужную сессию?
    if (ps.some(x => String(x.id) === String(target.id))) {
      foundOn = page;
      break;
    }

    if (pagesProcessed % (PARSE_CONFIG.saveEveryPages || 5) === 0) {
      const stats = calculateStatsFromSessions(existing);
      await chrome.storage.local.set({ sessions: existing, statistics: stats, lastUpdate: new Date().toISOString() });
    }

    page++;
  }

  // плюс одна страница после найденной
  if (foundOn != null) {
    const nextPage = foundOn + 1;
    const baseDelay = delayManager.getCurrentDelay();
    const jitter = PARSE_CONFIG.delayJitterMin + Math.random() * (PARSE_CONFIG.delayJitterMax - PARSE_CONFIG.delayJitterMin);
    await waiting(Math.round(baseDelay * jitter));

    const html2 = await fetchHtmlWithRetry(
      `https://fogplay.mts.ru/merchant/?page=${nextPage}&_=${Date.now()}`,
      { retries: 3, label: `front->target p=${nextPage}` }
    );
    const ps2 = parsePage(html2);
    const r2 = mergeSessions(existing, ps2);
    newFound += r2.newCount; updated += r2.updatedCount; pagesProcessed++;
  }

  if (newFound || updated) {
    const stats = calculateStatsFromSessions(existing);
    await chrome.storage.local.set({ sessions: existing, statistics: stats, lastUpdate: new Date().toISOString() });
  }

  console.log('[FrontToTarget] done:', { targetId: target.id, foundOn, pagesProcessed, newFound, updated });
  return { success: true, targetId: target.id, foundOn, pagesProcessed, newFound, updated };
}

// таймер keep-alive: регулярно гоняем quickFrontSweep(5) и иногда отзывы
let __lastReviewsTick = 0;

let recentWatcherTimer = null;
function startRecentPagesWatcher(pages = 5, minMinutes = 1, maxMinutes = 3) {
  if (recentWatcherTimer) return;

  const schedule = async () => {
    const minMs = Math.max(1, minMinutes) * 60_000;
    const maxMs = Math.max(minMs, maxMinutes * 60_000);
    const delay = Math.floor(minMs + Math.random() * (maxMs - minMs));

    try {
      // 0) не дёргаем, если оффлайн/неавторизованы
      const ok = await authPing();
      if (!ok) {
        console.debug('[KeepAlive] skip: offline or not authorized');
        return;
      }

      // прочитаем таймстемпы последних прогонов
      const { keepAliveSessionsTs = 0, keepAliveReviewsTs = 0 } =
        await chrome.storage.local.get(['keepAliveSessionsTs', 'keepAliveReviewsTs']);
      const now = Date.now();

      // 1) быстрый прогон с первой страницы до «цели» +1 — не чаще KEEPALIVE.sessionsMs
      if (now - keepAliveSessionsTs >= KEEPALIVE.sessionsMs) {
        await frontSweepToTargetPlusOne();
        await chrome.storage.local.set({ keepAliveSessionsTs: Date.now() });

        // затем отзывы (как было ниже) …
      } else {
        console.debug('[KeepAlive] sessions throttle: skip');
      }

      // 2) отзывы — не чаще, чем раз в KEEPALIVE.reviewsMs
      if (now - keepAliveReviewsTs >= KEEPALIVE.reviewsMs) {
        try {
          await quickReviewFrontSweep(REVIEWS_CONFIG.frontPages || 2);
          await chrome.storage.local.set({ keepAliveReviewsTs: Date.now() });
        } catch (e2) {
          if (!isNetworkHiccup(e2)) console.warn('[KeepAlive] reviews warn:', e2?.message || e2);
        }
      } else {
        console.debug('[KeepAlive] reviews throttle: skip');
      }
      // 3) историческая подкачка — если включена пользователем
      try {
        const { [HISTORY_CONFIG.enabledKey]: enabled = false } = await chrome.storage.local.get([HISTORY_CONFIG.enabledKey]);
        if (enabled) {
          await historicalBackfillTick(HISTORY_CONFIG.pagesPerTick);
        } else {
          // noop
        }
      } catch (e3) {
        if (!isNetworkHiccup(e3)) console.warn('[KeepAlive] history warn:', e3?.message || e3);
      }

    } catch (e) {
      if (isNetworkHiccup(e)) {
        console.debug('[KeepAlive] network hiccup; retry later');
      } else {
        console.warn('[KeepAlive] error:', e?.message || e);
      }
    } finally {
      recentWatcherTimer = setTimeout(schedule, delay);
    }
  };

  console.log('[KeepAlive] watcher started', { pages, minMinutes, maxMinutes, cooldowns: KEEPALIVE });
  schedule();
}


function stopRecentPagesWatcher() {
  if (recentWatcherTimer) {
    clearTimeout(recentWatcherTimer);
    recentWatcherTimer = null;
    console.log('[KeepAlive] watcher stopped');
  }
}


// Обрезка старых сессий по дате (retention)
function pruneOldSessions(sessions, cutoffDate) {
    const pruned = {};
    for (const [id, s] of Object.entries(sessions)) {
        const d = parseDateTime(s.startTime);
        if ( d >= cutoffDate ) pruned[id] = s;
    }
    return pruned;
}

// Добавляем обработчик сообщений для content script
if ( typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage ) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if ( request.action === 'parseSessions' ) {
            parseSessions(request.forceUpdate || false).then(sendResponse);
            return true;
        }
    });
}

window.DataParser = {
    waiting,
    parseDateTime,
    parseIncome,
    getTotalPages,
    parsePage,
    calculateStatsFromSessions,
    parseSessions,
    delayManager,
    // new
    quickFrontSweep,
    startRecentPagesWatcher,
    stopRecentPagesWatcher,
    indexOpenSessions,
    parseReviewsPage,
    quickReviewFrontSweep,
    fetchAllReviewsFull,
    frontSweepToTargetPlusOne,
    pickTargetSession,
    historicalBackfillTick,
    ensureHistoryAnchor,
    resetHistoryAnchor,
    ensureReviewsHistoryAnchor,
    historicalBackfillTick,
    _tickSessionsNoBusy,
    _tickReviewsNoBusy,
    historicalBackfillReviewsTick,
    resyncAllSessions
};

// === автозапуск keep-alive только на /merchant/*, один раз ===
(() => {
  try {
    if (typeof window !== 'undefined' &&
        !window.__fogKeepAliveStarted &&
        /^\/merchant\//.test(location.pathname)) {
      window.__fogKeepAliveStarted = true;
      setTimeout(() => {
        try { startRecentPagesWatcher(5, 1, 3); } catch (e) { console.warn(e); }
      }, 3000); // даём странице прогрузиться
    }
  } catch (e) {}
})();