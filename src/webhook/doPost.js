function doPost(e) {
  try {
    const request = parseWebhookRequest(e);
    if (!request.ok) return request.response;

    request.events.forEach(function (event) {
      routeLineEvent(event, request.requestId);
    });
    return ContentService.createTextOutput('OK');
  } catch (err) {
    const eventSummary = extractWebhookEventSummary(e);
    const requestId = generateRequestId('webhook');
    console.error('doPost Error: ' + eventSummary + '\n' + err.stack);
    writeSystemLog('ERROR', 'doPost', 'webhook_exception', 'Webhook request failed', eventSummary + ' :: ' + err.message, '', '', requestId);
    return ContentService.createTextOutput('Internal Server Error');
  }
}

function parseWebhookRequest(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return {
      ok: false,
      response: ContentService.createTextOutput('Bad Request')
    };
  }

  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    console.error('parseWebhookRequest invalid json: ' + err.message);
    writeSystemLog('ERROR', 'doPost', 'invalid_webhook_payload', 'Invalid webhook payload', err.message, '', '', generateRequestId('webhook'));
    return {
      ok: false,
      response: ContentService.createTextOutput('Bad Request')
    };
  }

  return {
    ok: true,
    events: data.events || [],
    requestId: generateRequestId('webhook')
  };
}

function generateRequestId(prefix) {
  const base = Utilities.getUuid().replace(/-/g, '').substring(0, 12);
  return (prefix || 'req') + '_' + base;
}

function extractWebhookEventSummary(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) return 'no event payload';
    const data = JSON.parse(e.postData.contents);
    const event = data.events && data.events[0] ? data.events[0] : null;
    if (!event) return 'no events';

    const eventType = event.type || 'unknown';
    const messageType = event.message && event.message.type ? event.message.type : 'none';
    const userId = event.source && event.source.userId ? event.source.userId : 'unknown';
    return 'type=' + eventType + ', messageType=' + messageType + ', userId=' + userId;
  } catch (parseErr) {
    return 'failed to parse event summary: ' + parseErr.message;
  }
}
