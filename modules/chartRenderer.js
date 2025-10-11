// modules/chartRenderer.js

function formatDateYYYYMMDD(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

function intervalsOverlap(a, b, c, d) {
    return a <= d && b >= c;
}

function createGeneralSection() {
    const generalSection = document.createElement('div');
    generalSection.innerHTML = `
        <h1>Общий доход в день</h1>
        <canvas id="generalIncomeChart"></canvas>
        <h1>Общая карта простоя</h1>
        <div id="summary" style="margin-top:10px;"></div>
        <span style="font-weight: lighter">Зелёный — компьютер был активен весь час.<br>
        Оранжевый — компьютер был активен частично.<br>
        Красный — компьютер был неактивен.<br></span>
        <canvas id="generalHeatmap"></canvas>
    `;
    return generalSection;
}

function createDivider() {
    const divider = document.createElement('div');
    divider.style.margin = '40px 0';
    divider.style.borderTop = '2px solid #30363d';
    return divider;
}

function createDetailSection() {
    const detailSection = document.createElement('div');
    detailSection.classList.add('detail-section');
    detailSection.innerHTML = '<h1>Детализация по компьютерам</h1>';
    return detailSection;
}

function prepareIncomeData(sessions) {
    const incomeByDate = {};
    sessions.forEach(s => {
        const date = s.startTime.split(" ")[0];
        incomeByDate[date] = (incomeByDate[date] || 0) + window.DataParser.parseIncome(s.income);
    });

    return {
        labels: Object.keys(incomeByDate).sort(),
        data: Object.keys(incomeByDate).sort().map(date => incomeByDate[date])
    };
}

function drawGeneralIncomeChart(data) {
    const canvas = document.getElementById('generalIncomeChart');
    const ctx = canvas.getContext('2d');
    const margin = 50;

    canvas.width = canvas.parentElement.offsetWidth;
    canvas.height = 400;

    const width = canvas.width;
    const height = canvas.height;
    const chartWidth = width - margin * 2;
    const chartHeight = height - margin * 2;
    const maxVal = Math.max(...data.data, 1);

    ctx.clearRect(0, 0, width, height);

    ctx.beginPath();
    ctx.moveTo(margin, height - margin);
    ctx.lineTo(width - margin, height - margin);
    ctx.moveTo(margin, height - margin);
    ctx.lineTo(margin, margin);
    ctx.strokeStyle = '#fdfbfb';
    ctx.lineWidth = 2;
    ctx.stroke();

    const getX = i => margin + i * (chartWidth / (data.labels.length - 1 || 1));
    const getY = val => margin + (1 - val / maxVal) * chartHeight;

    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    data.labels.forEach((label, i) => {
        const [y, m, d] = label.split('-');
        const dateObj = new Date(y, m - 1, d);
        const shortLabel = `${d}.${m}`;
        const x = getX(i);
        const yPos = height - margin + 20;

        ctx.fillStyle = dateObj.getDay() === 0 || dateObj.getDay() === 6 ? '#ff4646' : '#f5f0f0';
        ctx.fillText(shortLabel, x, yPos);
    });

    const yTicks = 5;
    for (let i = 0; i <= yTicks; i++) {
        const val = (maxVal / yTicks) * i;
        const y = getY(val);

        ctx.beginPath();
        ctx.moveTo(margin, y);
        ctx.lineTo(width - margin, y);
        ctx.strokeStyle = '#30363d';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = '#fdfcfc';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(Math.round(val), margin - 10, y);
    }

    ctx.beginPath();
    data.data.forEach((val, i) => {
        const x = getX(i);
        const y = getY(val);

        if ( i === 0 ) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    ctx.strokeStyle = '#abccf3';
    ctx.lineWidth = 2;
    ctx.stroke();

    data.data.forEach((val, i) => {
        const x = getX(i);
        const y = getY(val);

        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#96bbe3';
        ctx.fill();

        ctx.fillStyle = '#f8f4f4';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(val.toFixed(2), x, y - 5);
    });
}

function prepareHeatmapData(sessions) {
    const dateSet = new Set();
    sessions.forEach(s => dateSet.add(formatDateYYYYMMDD(window.DataParser.parseDateTime(s.startTime))));
    let allDates = Array.from(dateSet).sort();
    if ( allDates.length > 28 ) allDates = allDates.slice(-28);

    const daysCount = allDates.length;
    const hoursCount = 24;
    const heatmapData = Array.from({length: daysCount}, () =>
        Array.from({length: hoursCount}, () => [false, false, false])
    );

    sessions.forEach(s => {
        const start = window.DataParser.parseDateTime(s.startTime);
        const end = window.DataParser.parseDateTime(s.endTime);
        let current = new Date(start);

        while (current <= end) {
            const currentDateStr = formatDateYYYYMMDD(current);
            const dayIndex = allDates.indexOf(currentDateStr);

            if ( dayIndex !== -1 ) {
                const dayEnd = new Date(current);
                dayEnd.setHours(23, 59, 59, 999);
                const subEnd = dayEnd < end ? dayEnd : end;

                const startHour = current.getHours();
                const endHour = subEnd.getHours();

                for (let h = startHour; h <= endHour && h < 24; h++) {
                    for (let slot = 0; slot < 3; slot++) {
                        const slotStartMin = slot * 20;
                        const slotEndMin = slot * 20 + 19;
                        const slotStart = new Date(current);
                        slotStart.setHours(h, slotStartMin, 0, 0);
                        const slotEnd = new Date(current);
                        slotEnd.setHours(h, slotEndMin, 59, 999);

                        if ( slotEnd.getDate() !== current.getDate() ) continue;
                        if ( intervalsOverlap(slotStart, slotEnd, current, subEnd) ) {
                            heatmapData[dayIndex][h][slot] = true;
                        }
                    }
                }
            }
            current.setHours(24, 0, 0, 0);
        }
    });

    return {
        dates: allDates,
        data: heatmapData,
        daysCount,
        hoursCount
    };
}

function drawGeneralHeatmap(data) {
    const canvas = document.getElementById('generalHeatmap');
    const ctx = canvas.getContext('2d');

    canvas.width = canvas.parentElement.offsetWidth;
    canvas.height = 400;

    const width = canvas.width;
    const height = canvas.height;
    const marginLeft = 60;
    const marginRight = 60;
    const marginTop = 30;
    const gap = 2;

    const availableWidth = width - marginLeft - marginRight;
    const availableHeight = height - marginTop;
    const cellWidth = (availableWidth - gap * (data.daysCount - 1)) / data.daysCount;
    const cellHeight = (availableHeight - gap * (data.hoursCount - 1)) / data.hoursCount;

    ctx.clearRect(0, 0, width, height);

    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    data.dates.forEach((dayStr, i) => {
        const [y, mo, d] = dayStr.split('-').map(Number);
        const dateObj = new Date(y, mo - 1, d);
        const label = `${String(d).padStart(2, '0')}.${String(mo).padStart(2, '0')}`;
        const xCenter = marginLeft + i * (cellWidth + gap) + cellWidth / 2;
        const yCenter = marginTop / 2;
        ctx.fillStyle = dateObj.getDay() === 0 || dateObj.getDay() === 6 ? 'red' : '#fff';
        ctx.fillText(label, xCenter, yCenter);
    });

    for (let row = 0; row < data.hoursCount; row++) {
        const hourLabel = String(row).padStart(2, '0') + ':00';
        const labelY = marginTop + row * (cellHeight + gap) + cellHeight / 2;

        ctx.fillStyle = '#fff';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(hourLabel, marginLeft - 5, labelY);

        ctx.textAlign = 'left';
        ctx.fillText(hourLabel, marginLeft + availableWidth + 5, labelY);

        for (let d = 0; d < data.daysCount; d++) {
            const cellX = marginLeft + d * (cellWidth + gap);
            const cellY = marginTop + row * (cellHeight + gap);
            const subSlots = data.data[d][row];
            const subCount = subSlots.filter(Boolean).length;
            const fillColor = subCount === 0 ? '#ff5a5a' :
                subCount === 3 ? '#4caf50' : 'orange';
            ctx.fillStyle = fillColor;
            ctx.fillRect(cellX, cellY, cellWidth, cellHeight);
        }
    }
}

function createPCContainer(pcName) {
    const pcContainer = document.createElement('div');
    pcContainer.className = 'pc-stats-container';
    pcContainer.style.marginBottom = '40px';
    pcContainer.style.padding = '20px';
    pcContainer.style.backgroundColor = 'rgba(178,219,249,.08)';
    pcContainer.style.borderRadius = '8px';

    const pcTitle = document.createElement('h2');
    pcTitle.textContent = pcName;
    pcTitle.style.color = '#ffffff';
    pcTitle.style.fontSize = '18px';
    pcTitle.style.marginBottom = '20px';
    pcContainer.appendChild(pcTitle);

    const chartsContainer = document.createElement('div');
    chartsContainer.style.display = 'grid';
    chartsContainer.style.gridTemplateColumns = '1fr 1fr';
    chartsContainer.style.gap = '20px';
    pcContainer.appendChild(chartsContainer);

    return {
        container: pcContainer,
        chartsContainer: chartsContainer
    };
}

function createPCCharts(pcObj, sessions) {
    const incomeCanvas = document.createElement('canvas');
    incomeCanvas.height = 300;
    const heatmapCanvas = document.createElement('canvas');
    heatmapCanvas.height = 300;

    pcObj.chartsContainer.appendChild(incomeCanvas);
    pcObj.chartsContainer.appendChild(heatmapCanvas);

    function resizeCanvases() {
        const parentWidth = incomeCanvas.parentElement.offsetWidth;
        incomeCanvas.width = parentWidth / 2;
        heatmapCanvas.width = parentWidth / 2;

        drawPCIncomeChart(incomeCanvas, sessions);
        drawPCHeatmap(heatmapCanvas, sessions);
    }

    resizeCanvases();
    window.addEventListener('resize', resizeCanvases);
    setTimeout(resizeCanvases, 1000)

    return {incomeCanvas, heatmapCanvas};
}

function drawPCIncomeChart(canvas, sessions) {
    const ctx = canvas.getContext('2d');
    const margin = 50;

    const incomeByDate = {};
    sessions.forEach(s => {
        const date = s.startTime.split(" ")[0];
        incomeByDate[date] = (incomeByDate[date] || 0) + window.DataParser.parseIncome(s.income);
    });

    const labels = Object.keys(incomeByDate).sort();
    const data = labels.map(date => incomeByDate[date]);
    const maxVal = Math.max(...data, 1);

    const width = canvas.width;
    const height = canvas.height;
    const chartWidth = width - margin * 2;
    const chartHeight = height - margin * 2;

    ctx.clearRect(0, 0, width, height);

    ctx.beginPath();
    ctx.moveTo(margin, height - margin);
    ctx.lineTo(width - margin, height - margin);
    ctx.moveTo(margin, height - margin);
    ctx.lineTo(margin, margin);
    ctx.strokeStyle = '#fdfbfb';
    ctx.lineWidth = 2;
    ctx.stroke();

    const getX = i => margin + i * (chartWidth / (labels.length - 1 || 1));
    const getY = val => margin + (1 - val / maxVal) * chartHeight;

    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    labels.forEach((label, i) => {
        const [y, m, d] = label.split('-');
        const dateObj = new Date(y, m - 1, d);
        const shortLabel = `${d}.${m}`;
        const x = getX(i);
        const yPos = height - margin + 20;

        ctx.fillStyle = dateObj.getDay() === 0 || dateObj.getDay() === 6 ? '#ff4646' : '#f5f0f0';
        ctx.fillText(shortLabel, x, yPos);
    });

    ctx.beginPath();
    data.forEach((val, i) => {
        const x = getX(i);
        const y = getY(val);

        if ( i === 0 ) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    ctx.strokeStyle = '#abccf3';
    ctx.lineWidth = 2;
    ctx.stroke();

    data.forEach((val, i) => {
        const x = getX(i);
        const y = getY(val);

        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#96bbe3';
        ctx.fill();

        ctx.fillStyle = '#f8f4f4';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(val.toFixed(2), x, y - 5);
    });
}

function drawPCHeatmap(canvas, sessions) {
    const ctx = canvas.getContext('2d');

    const dateSet = new Set();
    sessions.forEach(s => dateSet.add(formatDateYYYYMMDD(window.DataParser.parseDateTime(s.startTime))));
    let allDates = Array.from(dateSet).sort();
    if ( allDates.length > 28 ) allDates = allDates.slice(-28);

    const daysCount = allDates.length;
    const hoursCount = 24;
    const heatmapData = Array.from({length: daysCount}, () =>
        Array.from({length: hoursCount}, () => [false, false, false])
    );

    sessions.forEach(s => {
        const start = window.DataParser.parseDateTime(s.startTime);
        const end = window.DataParser.parseDateTime(s.endTime);
        let current = new Date(start);

        while (current <= end) {
            const currentDateStr = formatDateYYYYMMDD(current);
            const dayIndex = allDates.indexOf(currentDateStr);

            if ( dayIndex !== -1 ) {
                const dayEnd = new Date(current);
                dayEnd.setHours(23, 59, 59, 999);
                const subEnd = dayEnd < end ? dayEnd : end;

                const startHour = current.getHours();
                const endHour = subEnd.getHours();

                for (let h = startHour; h <= endHour && h < 24; h++) {
                    for (let slot = 0; slot < 3; slot++) {
                        const slotStartMin = slot * 20;
                        const slotEndMin = slot * 20 + 19;
                        const slotStart = new Date(current);
                        slotStart.setHours(h, slotStartMin, 0, 0);
                        const slotEnd = new Date(current);
                        slotEnd.setHours(h, slotEndMin, 59, 999);

                        if ( slotEnd.getDate() !== current.getDate() ) continue;
                        if ( intervalsOverlap(slotStart, slotEnd, current, subEnd) ) {
                            heatmapData[dayIndex][h][slot] = true;
                        }
                    }
                }
            }
            current.setHours(24, 0, 0, 0);
        }
    });

    const width = canvas.width;
    const height = canvas.height;
    const marginLeft = 60;
    const marginRight = 60;
    const marginTop = 30;
    const gap = 2;

    const availableWidth = width - marginLeft - marginRight;
    const availableHeight = height - marginTop;
    const cellWidth = (availableWidth - gap * (daysCount - 1)) / daysCount;
    const cellHeight = (availableHeight - gap * (hoursCount - 1)) / hoursCount;

    ctx.clearRect(0, 0, width, height);

    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    allDates.forEach((dayStr, i) => {
        const [y, mo, d] = dayStr.split('-').map(Number);
        const dateObj = new Date(y, mo - 1, d);
        const label = `${String(d).padStart(2, '0')}.${String(mo).padStart(2, '0')}`;
        const xCenter = marginLeft + i * (cellWidth + gap) + cellWidth / 2;
        const yCenter = marginTop / 2;
        ctx.fillStyle = dateObj.getDay() === 0 || dateObj.getDay() === 6 ? 'red' : '#fff';
        ctx.fillText(label, xCenter, yCenter);
    });

    for (let row = 0; row < hoursCount; row++) {
        const hourLabel = String(row).padStart(2, '0') + ':00';
        const labelY = marginTop + row * (cellHeight + gap) + cellHeight / 2;

        ctx.fillStyle = '#fff';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(hourLabel, marginLeft - 5, labelY);

        ctx.textAlign = 'left';
        ctx.fillText(hourLabel, marginLeft + availableWidth + 5, labelY);

        for (let d = 0; d < daysCount; d++) {
            const cellX = marginLeft + d * (cellWidth + gap);
            const cellY = marginTop + row * (cellHeight + gap);
            const subSlots = heatmapData[d][row];
            const subCount = subSlots.filter(Boolean).length;
            const fillColor = subCount === 0 ? '#ff5a5a' :
                subCount === 3 ? '#4caf50' : 'orange';
            ctx.fillStyle = fillColor;
            ctx.fillRect(cellX, cellY, cellWidth, cellHeight);
        }
    }
}

async function drawGeneralCharts(sessions) {
    const incomeData = prepareIncomeData(sessions);
    drawGeneralIncomeChart(incomeData);

    const heatmapData = prepareHeatmapData(sessions);
    drawGeneralHeatmap(heatmapData);
}

async function drawPCCharts(sessions) {
    const pcSessions = {};
    sessions.forEach(session => {
        if ( !pcSessions[session.pcName] ) {
            pcSessions[session.pcName] = [];
        }
        pcSessions[session.pcName].push(session);
    });

    const detailSection = document.querySelector('.detail-section');

    Object.entries(pcSessions).forEach(([pcName, pcSessionList]) => {
        const pcContainer = createPCContainer(pcName);
        const {incomeCanvas, heatmapCanvas} = createPCCharts(pcContainer, pcSessionList);

        drawPCIncomeChart(incomeCanvas, pcSessionList);
        drawPCHeatmap(heatmapCanvas, pcSessionList);

        detailSection.appendChild(pcContainer.container);
    });
}

async function fillCharts() {
    let {sessions, filteredSessions} = await chrome.storage.local.get(["sessions", "filteredSessions"]);
    if ( !sessions || Object.keys(sessions).length === 0 ) return;
    sessions = filteredSessions ? filteredSessions : Object.values(sessions);

    const mainContainer = document.getElementById("chartContainer");
    mainContainer.innerHTML = '';

    const generalSection = createGeneralSection();
    const divider = createDivider();
    const detailSection = createDetailSection();

    mainContainer.appendChild(generalSection);
    mainContainer.appendChild(divider);
    mainContainer.appendChild(detailSection);

    await drawGeneralCharts(sessions);
    await drawPCCharts(sessions);
}

window.ChartRenderer = {
    fillCharts,
    drawGeneralCharts,
    drawPCCharts,
    formatDateYYYYMMDD,
    intervalsOverlap
};
