// modules/exportUtils.js

// ── exportUtils.js ────────────────────────────────────────────────────────────
function exportSessionsToXLS(sessions) {
  const arr = Array.isArray(sessions) ? sessions
            : typeof sessions === 'object' && sessions ? Object.entries(sessions).map(([id, s]) => ({ id, ...s }))
            : [];

  let tableHTML = `<table border="1">
    <tr>
      <th>ID</th>
      <th>PC Name</th>
      <th>Game</th>           <!-- NEW -->
      <th>Start Time</th>
      <th>End Time</th>
      <th>Duration</th>
      <th>Status</th>
      <th>Income</th>
      <th>Payment Status</th>
      <th>Payment Date</th>
      <th>Payment ID</th>
    </tr>`;

  for (const row of arr) {
    const s = row.data || row; // поддержка обоих форматов
    tableHTML += `<tr>
      <td>${row.id || ''}</td>
      <td>${s.pcName || ''}</td>
      <td>${s.gameName || ''}</td>  <!-- NEW -->
      <td>${s.startTime || ''}</td>
      <td>${s.endTime || ''}</td>
      <td>${s.duration || ''}</td>
      <td>${s.status || ''}</td>
      <td>${s.income || ''}</td>
      <td>${s.paymentStatus || ''}</td>
      <td>${s.paymentDate || ''}</td>
      <td>${s.paymentId || ''}</td>
    </tr>`;
  }

  tableHTML += `</table>`;

  const htmlContent = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:x="urn:schemas-microsoft-com:office:excel"
          xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="UTF-8"></head>
      <body>${tableHTML}</body>
    </html>`;

  const blob = new Blob([htmlContent], { type: "application/vnd.ms-excel" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "sessions.xls";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

window.ExportUtils = { exportSessionsToXLS };


window.ExportUtils = {
    exportSessionsToXLS
};
