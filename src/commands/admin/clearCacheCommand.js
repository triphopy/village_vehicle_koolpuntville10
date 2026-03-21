function runClearCacheCommand() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Staff');
  const values = sheet.getDataRange().getValues();
  const keys = ['vehicles'];

  for (let i = 1; i < values.length; i++) {
    if (values[i][COL_STAFF.UID]) {
      const uid = values[i][COL_STAFF.UID].toString().trim();
      keys.push('staff_' + uid);
      keys.push('staff_record_' + uid);
      keys.push('name_' + uid);
      keys.push('tracked_' + uid);
    }
  }

  CacheService.getScriptCache().removeAll(keys);
  return '✅ ล้าง Cache สำเร็จ ' + keys.length + ' รายการ';
}
