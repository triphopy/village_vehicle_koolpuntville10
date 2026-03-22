const LOG_BUFFER_CACHE_KEY = 'log_buffer_v1';
const LOG_BUFFER_MAX_ITEMS = 10;
const SYSTEM_LOG_BUFFER_CACHE_KEY = 'system_log_buffer_v1';
const SYSTEM_LOG_BUFFER_MAX_ITEMS = 5;
const SYSTEM_LOG_HEADERS = [[
  'TIMESTAMP',
  'LEVEL',
  'SOURCE',
  'EVENT',
  'MESSAGE',
  'DETAIL',
  'USER_ID',
  'CONTEXT',
  'REQUEST_ID'
]];

function getBufferedLogs() {
  const cached = CacheService.getScriptCache().get(LOG_BUFFER_CACHE_KEY);
  return cached ? JSON.parse(cached) : [];
}

function setBufferedLogs(entries) {
  CacheService.getScriptCache().put(LOG_BUFFER_CACHE_KEY, JSON.stringify(entries || []), CACHE_TIME);
}

function getBufferedSystemLogs() {
  const cached = CacheService.getScriptCache().get(SYSTEM_LOG_BUFFER_CACHE_KEY);
  return cached ? JSON.parse(cached) : [];
}

function setBufferedSystemLogs(entries) {
  CacheService.getScriptCache().put(SYSTEM_LOG_BUFFER_CACHE_KEY, JSON.stringify(entries || []), CACHE_TIME);
}

function flushBufferedLogsInternal() {
  try {
    const entries = getBufferedLogs();
    if (entries.length === 0) return true;

    const sheet = getSheetOrThrow('Log');
    sheet.getRange(sheet.getLastRow() + 1, 1, entries.length, entries[0].length).setValues(entries);
    setBufferedLogs([]);
    return true;
  } catch (err) {
    console.error('flushBufferedLogs skipped: ' + err.message);
    return false;
  }
}

function flushBufferedLogs() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(2000)) return false;

  try {
    return flushBufferedLogsInternal();
  } finally {
    lock.releaseLock();
  }
}

function flushBufferedSystemLogsInternal() {
  try {
    const entries = getBufferedSystemLogs();
    if (entries.length === 0) return true;

    const sheet = getOrCreateSystemLogSheet();
    sheet.getRange(sheet.getLastRow() + 1, 1, entries.length, entries[0].length).setValues(entries);
    setBufferedSystemLogs([]);
    return true;
  } catch (err) {
    console.error('flushBufferedSystemLogs skipped: ' + err.message);
    return false;
  }
}

function flushBufferedSystemLogs() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(2000)) return false;

  try {
    return flushBufferedSystemLogsInternal();
  } finally {
    lock.releaseLock();
  }
}

function writeLog(uid, sName, lName, q, res) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(2000)) {
    console.error('writeLog skipped: unable to acquire log lock');
    return false;
  }

  try {
    const entries = getBufferedLogs();
    entries.push([new Date(), uid, sName, lName, q, res]);
    setBufferedLogs(entries);
    if (entries.length >= LOG_BUFFER_MAX_ITEMS) {
      flushBufferedLogsInternal();
    }
    return true;
  } catch (err) {
    console.error('writeLog skipped: ' + err.message);
    return false;
  } finally {
    lock.releaseLock();
  }
}

function writeSystemLog(level, source, eventName, message, detail, userId, context, requestId) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(2000)) {
    console.error('writeSystemLog skipped: unable to acquire system log lock');
    return false;
  }

  try {
    const entries = getBufferedSystemLogs();
    entries.push([
      new Date(),
      level || 'INFO',
      source || '-',
      eventName || '-',
      truncateSystemLogValue(message, 200),
      truncateSystemLogValue(detail, 500),
      userId || '',
      truncateSystemLogValue(context, 200),
      requestId || ''
    ]);
    setBufferedSystemLogs(entries);
    if (entries.length >= SYSTEM_LOG_BUFFER_MAX_ITEMS) {
      flushBufferedSystemLogsInternal();
    }
    return true;
  } catch (err) {
    console.error('writeSystemLog skipped: ' + err.message);
    return false;
  } finally {
    lock.releaseLock();
  }
}

function truncateSystemLogValue(value, maxLen) {
  const text = value === null || value === undefined ? '' : String(value);
  return text.length > maxLen ? text.substring(0, maxLen) + '...' : text;
}

function getOrCreateSystemLogSheet() {
  const ss = getSpreadsheetOrThrow();
  let sheet = ss.getSheetByName('SystemLog');
  if (sheet) {
    ensureSystemLogHeaders(sheet);
    return sheet;
  }

  sheet = ss.insertSheet('SystemLog');
  ensureSystemLogHeaders(sheet);
  return sheet;
}

function ensureSystemLogHeaders(sheet) {
  if (!sheet) return;

  const lastRow = sheet.getLastRow();
  const headerWidth = SYSTEM_LOG_HEADERS[0].length;
  if (lastRow === 0) {
    sheet.getRange(1, 1, 1, headerWidth).setValues(SYSTEM_LOG_HEADERS);
    return;
  }

  const currentHeaders = sheet.getRange(1, 1, 1, headerWidth).getValues()[0];
  const needsInit = SYSTEM_LOG_HEADERS[0].some(function (header, index) {
    return currentHeaders[index] !== header;
  });

  if (needsInit) {
    sheet.getRange(1, 1, 1, headerWidth).setValues(SYSTEM_LOG_HEADERS);
  }
}
