function keepAlive() {
  Logger.log('keep alive: ' + new Date());
}

function runMaintenanceStep(name, fn) {
  const startedAt = new Date().getTime();
  try {
    const ok = fn();
    return {
      name: name,
      ok: !!ok,
      durationMs: new Date().getTime() - startedAt
    };
  } catch (err) {
    console.error(name + ' failed with exception: ' + err.message);
    return {
      name: name,
      ok: false,
      durationMs: new Date().getTime() - startedAt,
      error: err.message
    };
  }
}

function sendMaintenanceAlert(results) {
  const failed = results.filter(function (item) { return !item.ok; });
  if (failed.length === 0) return false;

  const lines = ['[ALERT] Daily maintenance partial failure', ''];
  results.forEach(function (item) {
    const status = item.ok ? 'OK' : 'FAIL';
    const detail = item.error ? ' - ' + item.error : '';
    lines.push(status + ' ' + item.name + ' (' + item.durationMs + ' ms)' + detail);
  });

  writeSystemLog(
    'ALERT',
    'maintenanceService',
    'maintenance_partial_failure',
    'Daily maintenance completed with partial failures',
    results.map(function (item) {
      return (item.ok ? 'OK ' : 'FAIL ') + item.name + ' (' + item.durationMs + ' ms)' + (item.error ? ' - ' + item.error : '');
    }).join(' | '),
    '',
    'trigger=dailyMaintenance'
  );

  return sendAdminAlert(lines.join('\n'));
}

function dailyCleanup() {
  try {
    const ss = getSpreadsheetOrThrow();
    ['Log', 'Visitors', 'SystemLog'].forEach(function (name) {
      const sheet = name === 'SystemLog'
        ? getOrCreateSystemLogSheet()
        : ss.getSheetByName(name);
      if (!sheet) return;

      const data = sheet.getDataRange().getValues();
      const dateIdx = name === 'Log'
        ? COL_LOG.TIMESTAMP
        : name === 'Visitors'
          ? COL_VISITOR.LAST_SEEN
          : COL_SYSTEM_LOG.TIMESTAMP;
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
  flushBufferedSystemLogs();
  const results = [
    runMaintenanceStep('dailyBackup', dailyBackup),
    runMaintenanceStep('cleanOldBackups', cleanOldBackups),
    runMaintenanceStep('dailyCleanup', dailyCleanup)
  ];
  const allOk = results.every(function (item) { return item.ok; });

  if (allOk) {
    console.log('Daily Maintenance completed: ' + new Date());
  } else {
    console.warn('Daily Maintenance completed with partial failures: ' + new Date());
    sendMaintenanceAlert(results);
  }
}
