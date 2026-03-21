const SHEET_CACHE_TTL_SECONDS = 600;
const SHEET_STALE_CACHE_TTL_SECONDS = 21600;
const SERVICE_UNAVAILABLE_CODE = 'SERVICE_UNAVAILABLE';

function createServiceUnavailableError(serviceName, operation, cause) {
  const message = serviceName + ' unavailable during ' + operation +
    (cause && cause.message ? ': ' + cause.message : '');
  const error = new Error(message);
  error.name = 'ServiceUnavailableError';
  error.code = SERVICE_UNAVAILABLE_CODE;
  error.serviceName = serviceName;
  error.operation = operation;
  return error;
}

function isServiceUnavailableError(err) {
  return !!err && (err.code === SERVICE_UNAVAILABLE_CODE || err.name === 'ServiceUnavailableError');
}

function buildServiceUnavailableMessage() {
  return '⚠️ ระบบฐานข้อมูลชั่วคราวใช้งานไม่ได้\nกรุณาลองใหม่อีกครั้งในอีกสักครู่';
}

function getSheetCacheKey(sheetName) {
  return 'sheet_' + sheetName.toLowerCase();
}

function getStaleSheetCacheKey(sheetName) {
  return getSheetCacheKey(sheetName) + '_stale';
}

function getSpreadsheetOrThrow() {
  try {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  } catch (err) {
    throw createServiceUnavailableError('SpreadsheetApp', 'open spreadsheet', err);
  }
}

function getSheetOrThrow(sheetName) {
  const sheet = getSpreadsheetOrThrow().getSheetByName(sheetName);
  if (!sheet) {
    throw createServiceUnavailableError('SpreadsheetApp', 'get sheet ' + sheetName, new Error('Sheet not found'));
  }
  return sheet;
}

function cacheSheetData(sheetName, values) {
  const payload = JSON.stringify(values);
  const cache = CacheService.getScriptCache();
  cache.put(getSheetCacheKey(sheetName), payload, SHEET_CACHE_TTL_SECONDS);
  cache.put(getStaleSheetCacheKey(sheetName), payload, SHEET_STALE_CACHE_TTL_SECONDS);
}

function readSheetDataOrThrow(sheetName) {
  try {
    return getSheetOrThrow(sheetName).getDataRange().getValues();
  } catch (err) {
    if (isServiceUnavailableError(err)) throw err;
    throw createServiceUnavailableError('SpreadsheetApp', 'read sheet ' + sheetName, err);
  }
}

function getCachedSheetData(sheetName) {
  const cache = CacheService.getScriptCache();
  const cacheKey = getSheetCacheKey(sheetName);
  const staleCacheKey = getStaleSheetCacheKey(sheetName);
  const cached = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);

  try {
    const values = readSheetDataOrThrow(sheetName);
    cacheSheetData(sheetName, values);
    return values;
  } catch (err) {
    const staleCached = cache.get(staleCacheKey);
    if (staleCached) {
      console.warn('Using stale cache for sheet ' + sheetName + ': ' + err.message);
      return JSON.parse(staleCached);
    }
    throw err;
  }
}

function getStaff(userId) {
  const staff = getStaffRecord(userId);
  if (!staff || staff.status !== 'active') return null;
  return {
    name: staff.name,
    role: staff.role
  };
}

function getStaffRecord(userId) {
  if (!userId) return null;

  const cache = CacheService.getScriptCache();
  const cached = cache.get('staff_record_' + userId);
  if (cached) return JSON.parse(cached);

  const data = getCachedSheetData('Staff');
  const row = data.find(r => r[COL_STAFF.UID].toString().trim() === userId);

  if (row) {
    const staff = {
      name: row[COL_STAFF.NAME],
      role: row[COL_STAFF.ROLE].toString().toLowerCase(),
      status: row[COL_STAFF.STATUS].toString().trim().toLowerCase()
    };
    cache.put('staff_record_' + userId, JSON.stringify(staff), CACHE_TIME);
    return staff;
  }

  cache.put('staff_record_' + userId, JSON.stringify(null), 300);
  return null;
}

function clearStaffCache(userId) {
  const cache = CacheService.getScriptCache();
  cache.remove('staff_' + userId);
  cache.remove('staff_record_' + userId);
  cache.remove('staff');
  cache.remove('staff_list');
}
