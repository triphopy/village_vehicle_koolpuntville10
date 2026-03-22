const HEALTH_SLOW_CHECK_MS = 1500;
const HEALTH_SLOW_TOTAL_MS = 3000;

function runHealthCommand(context) {
  const isFullCheck = context.parts && context.parts[1] && context.parts[1].toLowerCase() === 'full';
  const checks = [
    timedHealthCheck('Config', function () { return checkRequiredProperties(); }),
    timedHealthCheck('Spreadsheet', function () { return checkSpreadsheetHealth(); }),
    timedHealthCheck('Cache', function () { return checkCacheHealth(); }),
    timedHealthCheck('Drive', function () { return checkDriveHealth(); }),
    timedHealthCheck('LINE API', function () { return checkLineHealth(context.adminId, isFullCheck); }),
    timedHealthCheck('Gemini API', function () { return checkGeminiHealth(isFullCheck); })
  ];
  const totalDurationMs = checks.reduce(function (sum, item) {
    return sum + (item.durationMs || 0);
  }, 0);

  const failed = checks.filter(function (item) { return item.status === 'fail'; }).length;
  const warned = checks.filter(function (item) { return item.status === 'warn'; }).length;
  const slowChecks = checks.filter(function (item) { return item.durationMs >= HEALTH_SLOW_CHECK_MS; });
  const header = failed > 0
    ? '🚨 Health check พบปัญหา ' + failed + ' รายการ'
    : warned > 0
      ? '⚠️ Health check พบจุดที่ควรตรวจสอบ ' + warned + ' รายการ'
      : '✅ Health check ปกติ';

  const lines = [header + (isFullCheck ? ' (full)' : ''), ''];
  lines.push('⏱️ Total: ' + totalDurationMs + ' ms');
  if (slowChecks.length > 0) {
    lines.push('🐢 Slow checks: ' + slowChecks.map(function (item) {
      return item.label + ' ' + item.durationMs + ' ms';
    }).join(', '));
  } else if (totalDurationMs >= HEALTH_SLOW_TOTAL_MS) {
    lines.push('🐢 Response ช้ากว่าปกติ แต่ยังไม่พบ check ที่ช้าเกิน threshold');
  }
  lines.push('');
  checks.forEach(function (item) {
    lines.push(item.icon + ' ' + item.label + ' (' + item.durationMs + ' ms): ' + item.message);
  });

  if (failed > 0 || warned > 0 || slowChecks.length > 0 || totalDurationMs >= HEALTH_SLOW_TOTAL_MS) {
    writeSystemLog(
      failed > 0 ? 'ERROR' : warned > 0 ? 'WARN' : 'INFO',
      'healthCommand',
      'health_summary',
      header + (isFullCheck ? ' (full)' : ''),
      'totalMs=' + totalDurationMs + '; slow=' + slowChecks.map(function (item) { return item.label + ':' + item.durationMs; }).join(', '),
      context.adminId,
      'mode=' + (isFullCheck ? 'full' : 'default')
    );
  }

  return lines.join('\n');
}

function timedHealthCheck(label, fn) {
  const startedAt = new Date().getTime();
  try {
    const result = fn();
    result.label = result.label || label;
    result.durationMs = new Date().getTime() - startedAt;
    return result;
  } catch (err) {
    return buildHealthResult('fail', label, err.message, new Date().getTime() - startedAt);
  }
}

function checkRequiredProperties() {
  const requiredKeys = [
    'LINE_ACCESS_TOKEN',
    'LINE_CHANNEL_SECRET',
    'GEMINI_API_KEY',
    'SPREADSHEET_ID',
    'ALLOWED_GROUP_IDS'
  ];
  const missing = requiredKeys.filter(function (key) {
    return !props.getProperty(key);
  });

  if (missing.length > 0) {
    return buildHealthResult('fail', 'Config', 'missing: ' + missing.join(', '));
  }

  return buildHealthResult('ok', 'Config', 'required properties present');
}

function checkSpreadsheetHealth() {
  try {
    const ss = getSpreadsheetOrThrow();
    const requiredSheets = ['Staff', 'Vehicles', 'Visitors', 'Log'];
    const missingSheets = requiredSheets.filter(function (name) {
      return !ss.getSheetByName(name);
    });

    if (missingSheets.length > 0) {
      return buildHealthResult('fail', 'Spreadsheet', 'missing sheets: ' + missingSheets.join(', '));
    }

    return buildHealthResult('ok', 'Spreadsheet', 'connected and sheets are available');
  } catch (err) {
    return buildHealthResult('fail', 'Spreadsheet', err.message);
  }
}

function checkCacheHealth() {
  const cache = CacheService.getScriptCache();
  const testKey = 'health_check_' + new Date().getTime();
  const testValue = 'ok';

  try {
    cache.put(testKey, testValue, 30);
    const cached = cache.get(testKey);
    cache.remove(testKey);

    if (cached !== testValue) {
      return buildHealthResult('warn', 'Cache', 'write succeeded but readback mismatched');
    }

    return buildHealthResult('ok', 'Cache', 'read/write succeeded');
  } catch (err) {
    return buildHealthResult('fail', 'Cache', err.message);
  }
}

function checkDriveHealth() {
  if (!BACKUP_FOLDER_NAME) {
    return buildHealthResult('warn', 'Drive', 'BACKUP_FOLDER_NAME is not configured');
  }

  try {
    const folders = DriveApp.getFoldersByName(BACKUP_FOLDER_NAME);
    if (!folders.hasNext()) {
      return buildHealthResult('warn', 'Drive', 'backup folder not found yet: ' + BACKUP_FOLDER_NAME);
    }

    return buildHealthResult('ok', 'Drive', 'backup folder is accessible');
  } catch (err) {
    return buildHealthResult('fail', 'Drive', err.message);
  }
}

function checkLineHealth(adminId, isFullCheck) {
  if (!LINE_ACCESS_TOKEN) {
    return buildHealthResult('fail', 'LINE API', 'LINE_ACCESS_TOKEN is missing');
  }

  if (!adminId) {
    return buildHealthResult('warn', 'LINE API', 'admin user id is missing in current context');
  }

  if (!isFullCheck) {
    return buildHealthResult('ok', 'LINE API', 'token is configured (skip live check in default mode)');
  }

  try {
    const response = fetchWithRetry('https://api.line.me/v2/bot/profile/' + adminId, {
      headers: { 'Authorization': 'Bearer ' + LINE_ACCESS_TOKEN }
    }, {
      serviceName: 'LINE Profile API',
      operation: 'health check profile ' + adminId,
      retries: 1
    });

    if (response.getResponseCode() !== 200) {
      return buildHealthResult('fail', 'LINE API', 'status=' + response.getResponseCode());
    }

    return buildHealthResult('ok', 'LINE API', 'profile lookup succeeded');
  } catch (err) {
    return buildHealthResult('fail', 'LINE API', err.message);
  }
}

function checkGeminiHealth(isFullCheck) {
  if (!GEMINI_API_KEY) {
    return buildHealthResult('fail', 'Gemini API', 'GEMINI_API_KEY is missing');
  }

  if (!isFullCheck) {
    return buildHealthResult('ok', 'Gemini API', 'API key is configured (skip live check in default mode)');
  }

  try {
    const response = fetchWithRetry(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=' + GEMINI_API_KEY,
      {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({
          contents: [{
            parts: [{ text: 'Reply with OK' }]
          }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 5
          }
        })
      },
      {
        serviceName: 'Gemini API',
        operation: 'health check',
        retries: 1
      }
    );

    if (response.getResponseCode() === 429) {
      return buildHealthResult('warn', 'Gemini API', 'rate limited');
    }

    if (response.getResponseCode() !== 200) {
      return buildHealthResult('fail', 'Gemini API', 'status=' + response.getResponseCode());
    }

    const payload = JSON.parse(response.getContentText());
    const text = payload &&
      payload.candidates &&
      payload.candidates[0] &&
      payload.candidates[0].content &&
      payload.candidates[0].content.parts &&
      payload.candidates[0].content.parts[0] &&
      payload.candidates[0].content.parts[0].text;

    if (!text) {
      return buildHealthResult('warn', 'Gemini API', 'no response text returned');
    }

    return buildHealthResult('ok', 'Gemini API', 'text generation succeeded');
  } catch (err) {
    return buildHealthResult('fail', 'Gemini API', err.message);
  }
}

function buildHealthResult(status, label, message, durationMs) {
  const iconMap = {
    ok: '✅',
    warn: '⚠️',
    fail: '❌'
  };

  return {
    status: status,
    label: label,
    message: message,
    icon: iconMap[status] || 'ℹ️',
    durationMs: durationMs || 0
  };
}
