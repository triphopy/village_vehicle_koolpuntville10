function writeLog(uid, sName, lName, q, res) {
  try {
    getSheetOrThrow('Log').appendRow([new Date(), uid, sName, lName, q, res]);
    return true;
  } catch (err) {
    console.error('writeLog skipped: ' + err.message);
    return false;
  }
}
