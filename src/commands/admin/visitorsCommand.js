function runVisitorsCommand() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Visitors');
  if (!sheet) return '❌ ไม่พบ Sheet Visitors';

  const values = sheet.getDataRange().getValues();
  const dataRows = values.slice(1);
  if (dataRows.length === 0) return '📋 ยังไม่มีข้อมูล';

  const lines = ['👥 คนที่เคยพิมพ์ในระบบ ' + dataRows.length + ' คน\n'];
  dataRows.forEach(row => {
    const uid = row[COL_VISITOR.UID] || '-';
    const name = row[COL_VISITOR.DISPLAYNAME] || '-';
    const lastSeen = row[COL_VISITOR.LAST_SEEN]
      ? Utilities.formatDate(new Date(row[COL_VISITOR.LAST_SEEN]), 'Asia/Bangkok', 'dd/MM HH:mm')
      : '-';
    const staff = getStaff(uid);
    const icon = staff ? '✅' : '❓';
    lines.push(icon + ' ' + name + '\n    ' + uid + '\n    last: ' + lastSeen);
  });

  return lines.join('\n');
}
