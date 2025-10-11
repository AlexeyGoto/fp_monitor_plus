// modules/dataFilter.js

async function filterStatsByDateRange(stats, start, end) {
    const {sessions} = await chrome.storage.local.get("sessions");
    if (!sessions || Object.keys(sessions).length === 0) {
        await chrome.storage.local.set({filteredSessions: []});
        return {};
    }
    const filteredSessions = Object.values(sessions).filter((s) => {
        const d = s.startTime.split(" ")[0];
        return d >= start && d <= end;
    });
    await chrome.storage.local.set({filteredSessions});
    const grouped = {};
    filteredSessions.forEach((s) => {
        const d = s.startTime.split(" ")[0],
            name = s.pcName;
        if ( !grouped[name] ) grouped[name] = [];
        grouped[name].push(s);
    });
    const result = {};
    for (const [pcName, arr] of Object.entries(grouped)) {
        const statsObj = {
                totalIncome: 0,
                firstDate: null,
                lastDate: null,
                sessionCount: 0,
                totalMinutes: 0,
                daysWorked: 0
            },
            days = new Set();
        for (const s of arr) {
            const income = parseFloat(s.income.replace(/[^\d.,]/g, "").replace(",", ".")) || 0,
                duration = parseInt(s.duration) || 0,
                date = s.startTime.split(" ")[0];
            statsObj.totalIncome += income;
            statsObj.totalMinutes += duration;
            statsObj.sessionCount++;
            days.add(date);
            if ( !statsObj.firstDate || date < statsObj.firstDate ) statsObj.firstDate = date;
            if ( !statsObj.lastDate || date > statsObj.lastDate ) statsObj.lastDate = date;
        }
        statsObj.daysWorked = days.size;
        result[pcName] = statsObj;
    }
    return result;
}

function calculateTotalStats(stats) {
    if ( !stats || Object.keys(stats).length === 0 )
        return {income: 0, sessions: 0, minutes: 0, firstDate: null, lastDate: null, days: 0};
    const total = {income: 0, sessions: 0, minutes: 0, firstDate: null, lastDate: null, days: 0};
    Object.values(stats).forEach((pc) => {
        total.income += pc.totalIncome;
        total.sessions += pc.sessionCount;
        total.minutes += pc.totalMinutes;
        const fd = pc.firstDate.includes("T") ? pc.firstDate.split("T")[0] : pc.firstDate.split(" ")[0],
            ld = pc.lastDate.includes("T") ? pc.lastDate.split("T")[0] : pc.lastDate.split(" ")[0];
        if ( !total.firstDate || fd < total.firstDate ) total.firstDate = fd;
        if ( !total.lastDate || ld > total.lastDate ) total.lastDate = ld;
    });
    if ( total.firstDate && total.lastDate ) {
        const [sy, sm, sd] = total.firstDate.split("-").map(Number),
            [ey, em, ed] = total.lastDate.split("-").map(Number);
        if ( sy === ey && sm === em ) total.days = ed - sd + 1;
        else if ( sy === ey ) total.days = (em - sm) * 30 + (ed - sd + 1);
        else total.days = (ey - sy) * 365 + (em - sm) * 30 + (ed - sd + 1);
    }
    return total;
}

function calculateMonthlyForecast(totalIncome, daysWorked) {
    const now = new Date(),
        lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(),
        avg = totalIncome / daysWorked,
        daysLeft = lastDay - now.getDate();
    return avg * daysLeft + totalIncome;
}

function calculateTotalForecast(stats) {
    return Object.values(stats)
        .reduce((sum, pc) => sum + calculateMonthlyForecast(pc.totalIncome, pc.daysWorked), 0)
        .toFixed(2);
}

function formatTime(minutes) {
    const hours = Math.floor(minutes / 60),
        mins = minutes % 60;
    return `${hours}ч ${mins}м`;
}

window.DataFilter = {
    filterStatsByDateRange,
    calculateTotalStats,
    calculateMonthlyForecast,
    calculateTotalForecast,
    formatTime
};
