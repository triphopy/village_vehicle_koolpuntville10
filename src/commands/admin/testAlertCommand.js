function runTestAlertCommand(context) {
  const requestId = 'testalert_' + new Date().getTime();
  const message = '[TEST ALERT]\nSystem alert pipeline is working\nrequestId=' + requestId;

  writeSystemLog(
    'ALERT',
    'testAlertCommand',
    'manual_test_alert',
    'Manual test alert triggered by admin',
    'Triggered via /testalert',
    context.adminId,
    'command=/testalert',
    requestId
  );
  flushBufferedSystemLogs();

  const sent = sendAdminAlert(message);
  if (!sent) {
    return '⚠️ Test alert was logged, but admin push notification could not be delivered';
  }

  return '✅ Test alert sent and SystemLog entry created\nrequestId=' + requestId;
}
