function runAddUserCommand(context) {
  const parts = context.parts;
  if (parts.length < 4) {
    return '❌ Usage:\n/add <userId> <name> <role>\nExample: /add U578... Somchai staff';
  }

  const newId = parts[1].trim();
  const newName = parts[2].trim();
  const newRole = parts[3].trim().toLowerCase();
  if (newRole !== 'admin' && newRole !== 'staff') {
    return '❌ role ต้องเป็น admin หรือ staff เท่านั้น';
  }

  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Staff');
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][COL_STAFF.UID].toString().trim() === newId) {
      return '⚠️ User ID นี้มีในระบบแล้ว';
    }
  }

  sheet.appendRow([newName, newId, 'active', newRole]);
  clearStaffCache(newId);
  return '✅ เพิ่ม ' + newName + ' (' + newRole + ') สำเร็จ';
}
