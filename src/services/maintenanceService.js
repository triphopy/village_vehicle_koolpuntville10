function keepAlive() {
  Logger.log('keep alive: ' + new Date());
}

function dailyCleanup() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  ['Log', 'Visitors'].forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (!sheet) return;

    const data = sheet.getDataRange().getValues();
    const dateIdx = name === 'Log' ? COL_LOG.TIMESTAMP : COL_VISITOR.LAST_SEEN;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

    const toKeep = data.filter((row, i) => i === 0 || new Date(row[dateIdx]) >= cutoff);
    if (data.length !== toKeep.length) {
      sheet.clearContents();
      sheet.getRange(1, 1, toKeep.length, toKeep[0].length).setValues(toKeep);
    }
  });
}

function getOrCreateBackupFolder() {
  const folders = DriveApp.getFoldersByName(BACKUP_FOLDER_NAME);
  return folders.hasNext()
    ? folders.next()
    : DriveApp.createFolder(BACKUP_FOLDER_NAME);
}

function dailyBackup() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const folder = getOrCreateBackupFolder();
  const date = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd');
  const backup = SpreadsheetApp.create('Backup_' + date);
  const backupFile = DriveApp.getFileById(backup.getId());

  ss.getSheets().forEach(function (sheet) {
    sheet.copyTo(backup).setName(sheet.getName());
  });

  const defaultSheet = backup.getSheets()[0];
  if (defaultSheet) {
    backup.deleteSheet(defaultSheet);
  }

  backupFile.moveTo(folder);
  console.log('Backup สำเร็จ: ' + date);
}

function cleanOldBackups() {
  const folder = getOrCreateBackupFolder();
  const files = folder.getFiles();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - BACKUPRETENTION_DAYS);

  while (files.hasNext()) {
    const file = files.next();
    if (file.getDateCreated() < cutoff) file.setTrashed(true);
  }

  console.log('✅ ลบ Backup เก่าเกิน ' + BACKUPRETENTION_DAYS + ' วันแล้ว');
}

function dailyMaintenance() {
  dailyBackup();
  cleanOldBackups();
  dailyCleanup();
  console.log('✅ Daily Maintenance เสร็จสิ้น: ' + new Date());
}
