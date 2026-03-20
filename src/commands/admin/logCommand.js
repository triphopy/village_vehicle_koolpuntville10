function runLogCommand(context) {
  const parts = context.parts;
  const parsedLimit = parts[1] ? parseInt(parts[1], 10) : 5;
  const limit = Math.max(1, Math.min(isNaN(parsedLimit) ? 5 : parsedLimit, 20));
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Log');
  const values = sheet.getDataRange().getValues();
  const dataRows = values.slice(1);
  if (dataRows.length === 0) return '📋 ยังไม่มี Log ในระบบ';

  const lastRows = dataRows.slice(-limit).reverse();
  const lines = ['📋 Log ' + limit + ' รายการล่าสุด\n'];
  lastRows.forEach(row => {
    const time = row[COL_LOG.TIMESTAMP]
      ? Utilities.formatDate(new Date(row[COL_LOG.TIMESTAMP]), 'Asia/Bangkok', 'dd/MM HH:mm')
      : '-';
    const name = row[COL_LOG.STAFF_NAME] || row[COL_LOG.UID] || '-';
    const q = row[COL_LOG.QUERY] || '-';
    const res = row[COL_LOG.RESULT] || '-';
    const icon = res === 'พบข้อมูล' ? '✅' : '❌';
    lines.push(icon + ' ' + time + ' | ' + name + '\n    🔍 ' + q);
  });

  return lines.join('\n');
}
