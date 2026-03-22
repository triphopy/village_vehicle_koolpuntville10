function keepAlive() {
  Logger.log('keep alive: ' + new Date());
}

function dailyCleanup() {
  try {
    const ss = getSpreadsheetOrThrow();
    ['Log', 'Visitors'].forEach(function (name) {
      const sheet = ss.getSheetByName(name);
      if (!sheet) return;

      const data = sheet.getDataRange().getValues();
      const dateIdx = name === 'Log' ? COL_LOG.TIMESTAMP : COL_VISITOR.LAST_SEEN;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

      const toKeep = data.filter(function (row, i) {
        return i === 0 || new Date(row[dateIdx]) >= cutoff;
      });
      if (data.length !== toKeep.length) {
        sheet.clearContents();
        sheet.getRange(1, 1, toKeep.length, toKeep[0].length).setValues(toKeep);
        if (name === 'Visitors') clearVisitorRowMap();
      }
    });
    return true;
  } catch (err) {
    console.error('dailyCleanup failed: ' + err.message);
    return false;
  }
}

function getOrCreateBackupFolder() {
  try {
    const folders = DriveApp.getFoldersByName(BACKUP_FOLDER_NAME);
    return folders.hasNext()
      ? folders.next()
      : DriveApp.createFolder(BACKUP_FOLDER_NAME);
  } catch (err) {
    throw createServiceUnavailableError('DriveApp', 'get backup folder', err);
  }
}

function dailyBackup() {
  try {
    const ss = getSpreadsheetOrThrow();
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
    return true;
  } catch (err) {
    console.error('dailyBackup failed: ' + err.message);
    return false;
  }
}

function cleanOldBackups() {
  try {
    const folder = getOrCreateBackupFolder();
    const files = folder.getFiles();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - BACKUPRETENTION_DAYS);

    while (files.hasNext()) {
      const file = files.next();
      if (file.getDateCreated() < cutoff) file.setTrashed(true);
    }

    console.log('ลบ Backup เก่าเกิน ' + BACKUPRETENTION_DAYS + ' วันแล้ว');
    return true;
  } catch (err) {
    console.error('cleanOldBackups failed: ' + err.message);
    return false;
  }
}

function dailyMaintenance() {
  flushBufferedLogs();
  const backupOk = dailyBackup();
  const cleanupBackupOk = cleanOldBackups();
  const cleanupOk = dailyCleanup();
  if (backupOk && cleanupBackupOk && cleanupOk) {
    console.log('Daily Maintenance completed: ' + new Date());
  } else {
    console.warn('Daily Maintenance completed with partial failures: ' + new Date());
  }
}
