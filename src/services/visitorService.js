const VISITOR_ROW_CACHE_TTL_SECONDS = 600;

function getVisitorRowMap() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('visitor_row_map');
  if (cached) return JSON.parse(cached);

  const sheet = getSheetOrThrow('Visitors');
  const data = sheet.getDataRange().getValues();
  const map = {};

  data.slice(1).forEach(function (row, index) {
    const uid = row[COL_VISITOR.UID];
    if (uid) map[uid] = index + 2;
  });

  cache.put('visitor_row_map', JSON.stringify(map), VISITOR_ROW_CACHE_TTL_SECONDS);
  return map;
}

function cacheVisitorRowMap(map) {
  CacheService.getScriptCache().put('visitor_row_map', JSON.stringify(map || {}), VISITOR_ROW_CACHE_TTL_SECONDS);
}

function clearVisitorRowMap() {
  CacheService.getScriptCache().remove('visitor_row_map');
}

function trackUser(userId, displayName) {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'tracked_' + userId;
  const cached = cache.get(cacheKey);
  if (cached === '1') return;

  try {
    const sheet = getSheetOrThrow('Visitors');
    const visitorRowMap = getVisitorRowMap();
    const rowNumber = visitorRowMap[userId] || 0;

    if (rowNumber > 0) {
      sheet.getRange(rowNumber, COL_VISITOR.LAST_SEEN + 1).setValue(new Date());
      if (displayName) {
        sheet.getRange(rowNumber, COL_VISITOR.DISPLAYNAME + 1).setValue(displayName);
      }
    } else {
      sheet.appendRow([userId, displayName, new Date()]);
      visitorRowMap[userId] = sheet.getLastRow();
      cacheVisitorRowMap(visitorRowMap);
    }

    cache.put(cacheKey, '1', 300);
  } catch (err) {
    console.error('trackUser skipped: ' + err.message);
  }
}
