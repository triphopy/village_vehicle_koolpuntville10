function writeLog(uid, sName, lName, q, res) {
  SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Log')
    .appendRow([new Date(), uid, sName, lName, q, res]);
}
