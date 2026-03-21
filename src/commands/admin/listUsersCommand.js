function runListUsersCommand() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Staff');
  const values = sheet.getDataRange().getValues();
  const lines = ['👥 รายชื่อผู้ใช้งานทั้งหมด\n'];

  for (let i = 1; i < values.length; i++) {
    if (values[i][COL_STAFF.NAME]) {
      const icon = values[i][COL_STAFF.ROLE] === 'admin' ? '🧑' : '👤';
      const status = values[i][COL_STAFF.STATUS] === 'active' ? '🟢' : '🔴';
      lines.push(icon + ' ' + values[i][COL_STAFF.NAME] + ' (' + values[i][COL_STAFF.ROLE] + ') ' + status);
    }
  }

  return lines.join('\n');
}
