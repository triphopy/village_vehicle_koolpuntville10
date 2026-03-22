function runHealthCommand(context) {
  const isFullCheck = context.parts && context.parts[1] && context.parts[1].toLowerCase() === 'full';
  const checks = [
    checkRequiredProperties(),
    checkSpreadsheetHealth(),
    checkCacheHealth(),
    checkDriveHealth(),
    checkLineHealth(context.adminId, isFullCheck),
    checkGeminiHealth(isFullCheck)
  ];

  const failed = checks.filter(function (item) { return item.status === 'fail'; }).length;
  const warned = checks.filter(function (item) { return item.status === 'warn'; }).length;
  const header = failed > 0
    ? '🚨 Health check พบปัญหา ' + failed + ' รายการ'
    : warned > 0
      ? '⚠️ Health check พบจุดที่ควรตรวจสอบ ' + warned + ' รายการ'
      : '✅ Health check ปกติ';

  const lines = [header + (isFullCheck ? ' (full)' : ''), ''];
  checks.forEach(function (item) {
    lines.push(item.icon + ' ' + item.label + ': ' + item.message);
  });

  return lines.join('\n');
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

function buildHealthResult(status, label, message) {
  const iconMap = {
    ok: '✅',
    warn: '⚠️',
    fail: '❌'
  };

  return {
    status: status,
    label: label,
    message: message,
    icon: iconMap[status] || 'ℹ️'
  };
}
