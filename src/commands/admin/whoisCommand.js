function runWhoisCommand() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Staff');
  const values = sheet.getDataRange().getValues();
  const lines = ['👥 รายชื่อที่มีสิทธิ์ในระบบ\n'];

  for (let i = 1; i < values.length; i++) {
    if (values[i][COL_STAFF.NAME]) {
      const icon = values[i][COL_STAFF.ROLE] === 'admin' ? '🧑' : '👤';
      const status = values[i][COL_STAFF.STATUS] === 'active' ? '🟢' : '🔴';
      lines.push(icon + ' ' + values[i][COL_STAFF.NAME] + '\n    ' + status + ' ' + values[i][COL_STAFF.ROLE] + '\n    ' + values[i][COL_STAFF.UID]);
    }
  }

  return lines.join('\n');
}
