function getLineDisplayName(userId) {
  if (!userId) return 'Unknown';

  const cache = CacheService.getScriptCache();
  const cached = cache.get('name_' + userId);
  if (cached) return cached;

  try {
    const res = fetchWithRetry('https://api.line.me/v2/bot/profile/' + userId, {
      headers: { 'Authorization': 'Bearer ' + LINE_ACCESS_TOKEN },
    }, {
      serviceName: 'LINE Profile API',
      operation: 'get profile ' + userId
    });
    if (res.getResponseCode() === 200) {
      const name = JSON.parse(res.getContentText()).displayName;
      cache.put('name_' + userId, name, CACHE_TIME);
      return name;
    }
    return 'User-' + userId.substring(userId.length - 4);
  } catch (e) {
    console.error('getLineDisplayName fallback: ' + e.message);
    return 'Unknown';
  }
}

function replyToLine(token, msg) {
  const response = fetchWithRetry('https://api.line.me/v2/bot/message/reply', {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + LINE_ACCESS_TOKEN
    },
    payload: JSON.stringify({
      replyToken: token,
      messages: [{ type: 'text', text: msg }]
    })
  }, {
    serviceName: 'LINE Messaging API',
    operation: 'reply message'
  });

  if (response.getResponseCode() >= 300) {
    console.error('replyToLine failed: ' + response.getResponseCode() + ' ' + response.getContentText());
    return false;
  }

  return true;
}

function pushToLine(userId, message) {
  const response = fetchWithRetry('https://api.line.me/v2/bot/message/push', {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + LINE_ACCESS_TOKEN
    },
    payload: JSON.stringify({
      to: userId,
      messages: [{ type: 'text', text: message }]
    })
  }, {
    serviceName: 'LINE Messaging API',
    operation: 'push message'
  });

  if (response.getResponseCode() >= 300) {
    console.error('pushToLine failed for ' + userId + ': ' + response.getResponseCode() + ' ' + response.getContentText());
    return false;
  }

  return true;
}
