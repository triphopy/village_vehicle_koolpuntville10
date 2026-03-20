function trackUser(userId, displayName) {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'tracked_' + userId;
  const cached = cache.get(cacheKey);
  if (cached === '1') return;

  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Visitors');
  if (!sheet) return;

  const data = sheet.getDataRange().getValues();
  const index = data.findIndex(row => row[COL_VISITOR.UID] === userId);

  if (index !== -1) {
    const rowNumber = index + 1;
    sheet.getRange(rowNumber, COL_VISITOR.LAST_SEEN + 1).setValue(new Date());
    if (displayName && data[index][COL_VISITOR.DISPLAYNAME] !== displayName) {
      sheet.getRange(rowNumber, COL_VISITOR.DISPLAYNAME + 1).setValue(displayName);
    }
  } else {
    sheet.appendRow([userId, displayName, new Date()]);
  }

  cache.put(cacheKey, '1', 300);
}
