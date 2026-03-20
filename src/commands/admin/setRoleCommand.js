function runSetRoleCommand(context) {
  const parts = context.parts;
  if (parts.length < 3) return '❌ รูปแบบ:\n/setrole <userId> <admin|staff>';

  const targetId = parts[1].trim();
  const newRole = parts[2].trim().toLowerCase();
  if (newRole !== 'admin' && newRole !== 'staff') {
    return '❌ role ต้องเป็น admin หรือ staff เท่านั้น';
  }

  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Staff');
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][COL_STAFF.UID].toString().trim() === targetId) {
      sheet.getRange(i + 1, COL_STAFF.ROLE + 1).setValue(newRole);
      clearStaffCache(targetId);
      return '✅ เปลี่ยน role ของ ' + values[i][COL_STAFF.NAME] + ' เป็น ' + newRole + ' แล้ว';
    }
  }

  return '❌ ไม่พบ User ID นี้ในระบบ';
}
