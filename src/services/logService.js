const LOG_BUFFER_CACHE_KEY = 'log_buffer_v1';
const LOG_BUFFER_MAX_ITEMS = 10;

function getBufferedLogs() {
  const cached = CacheService.getScriptCache().get(LOG_BUFFER_CACHE_KEY);
  return cached ? JSON.parse(cached) : [];
}

function setBufferedLogs(entries) {
  CacheService.getScriptCache().put(LOG_BUFFER_CACHE_KEY, JSON.stringify(entries || []), CACHE_TIME);
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
