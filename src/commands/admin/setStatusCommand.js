function runSetStatusCommand(context) {
  const parts = context.parts;
  if (parts.length < 3) return '❌ Usage:\n/setstatus <userId> <active|inactive>';

  const targetId = parts[1].trim();
  const newStatus = parts[2].trim().toLowerCase();
  if (newStatus !== 'active' && newStatus !== 'inactive') {
    return '❌ status ต้องเป็น active หรือ inactive';
  }

  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Staff');
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][COL_STAFF.UID].toString().trim() === targetId) {
      sheet.getRange(i + 1, COL_STAFF.STATUS + 1).setValue(newStatus);
      clearStaffCache(targetId);
      return '✅ เปลี่ยน status ของ ' + values[i][COL_STAFF.NAME] + ' เป็น ' + newStatus + ' แล้ว';
    }
  }

  return '❌ ไม่พบ User ID นี้ในระบบ';
}
