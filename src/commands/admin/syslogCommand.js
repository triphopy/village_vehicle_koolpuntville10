function runSyslogCommand(context) {
  const parts = context.parts;
  const parsedLimit = parts[1] ? parseInt(parts[1], 10) : 10;
  const limit = Math.max(1, Math.min(isNaN(parsedLimit) ? 10 : parsedLimit, 20));

  flushBufferedSystemLogs();
  const sheet = getOrCreateSystemLogSheet();
  const values = sheet.getDataRange().getValues();
  const dataRows = values.slice(1);
  if (dataRows.length === 0) return '📋 ยังไม่มี SystemLog ในระบบ';

  const lastRows = dataRows.slice(-limit).reverse();
  const lines = ['📋 SystemLog ' + limit + ' รายการล่าสุด\n'];

  lastRows.forEach(function (row) {
    const time = row[COL_SYSTEM_LOG.TIMESTAMP]
      ? Utilities.formatDate(new Date(row[COL_SYSTEM_LOG.TIMESTAMP]), 'Asia/Bangkok', 'dd/MM HH:mm')
      : '-';
    const level = row[COL_SYSTEM_LOG.LEVEL] || '-';
    const source = row[COL_SYSTEM_LOG.SOURCE] || '-';
    const eventName = row[COL_SYSTEM_LOG.EVENT] || '-';
    const message = row[COL_SYSTEM_LOG.MESSAGE] || '-';
    const requestId = row[COL_SYSTEM_LOG.REQUEST_ID] || '-';

    lines.push(
      getSystemLogLevelIcon(level) + ' ' + time + ' | ' + level + ' | ' + source +
      '\n    ' + eventName +
      '\n    ' + message +
      '\n    req: ' + requestId
    );
  });

  return lines.join('\n');
}

function getSystemLogLevelIcon(level) {
  const normalized = ((level || '') + '').toUpperCase();
  if (normalized === 'ALERT' || normalized === 'ERROR') return '🚨';
  if (normalized === 'WARN') return '⚠️';
  return 'ℹ️';
}
