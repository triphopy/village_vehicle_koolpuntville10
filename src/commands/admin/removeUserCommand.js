function runRemoveUserCommand(context) {
  const parts = context.parts;
  if (parts.length < 2) return '❌ รูปแบบ:\n/remove <userId>';

  const removeId = parts[1].trim();
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Staff');
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][COL_STAFF.UID].toString().trim() === removeId) {
      const name = values[i][COL_STAFF.NAME];
      sheet.deleteRow(i + 1);
      clearStaffCache(removeId);
      return '✅ ลบ ' + name + ' ออกจากระบบแล้ว';
    }
  }

  return '❌ ไม่พบ User ID นี้ในระบบ';
}
