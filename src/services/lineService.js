function getLineDisplayName(userId) {
  if (!userId) return 'Unknown';

  const cache = CacheService.getScriptCache();
  const cached = cache.get('name_' + userId);
  if (cached) return cached;

  try {
    const res = UrlFetchApp.fetch('https://api.line.me/v2/bot/profile/' + userId, {
      headers: { 'Authorization': 'Bearer ' + LINE_ACCESS_TOKEN },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() === 200) {
      const name = JSON.parse(res.getContentText()).displayName;
      cache.put('name_' + userId, name, CACHE_TIME);
      return name;
    }
    return 'User-' + userId.substring(userId.length - 4);
  } catch (e) {
    return 'Unknown';
  }
}

function replyToLine(token, msg) {
  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + LINE_ACCESS_TOKEN
    },
    payload: JSON.stringify({
      replyToken: token,
      messages: [{ type: 'text', text: msg }]
    }),
    muteHttpExceptions: true
  });
}

function pushToLine(userId, message) {
  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + LINE_ACCESS_TOKEN
    },
    payload: JSON.stringify({
      to: userId,
      messages: [{ type: 'text', text: message }]
    }),
    muteHttpExceptions: true
  });
}
