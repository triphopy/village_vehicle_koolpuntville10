function getCachedSheetData(sheetName) {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(sheetName.toLowerCase());
  if (cached) return JSON.parse(cached);

  const values = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(sheetName).getDataRange().getValues();
  cache.put(sheetName.toLowerCase(), JSON.stringify(values), 600);
  return values;
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
