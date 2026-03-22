function doPost(e) {
  try {
    const request = parseWebhookRequest(e);
    if (!request.ok) return request.response;

    request.events.forEach(routeLineEvent);
    return ContentService.createTextOutput('OK');
  } catch (err) {
    const eventSummary = extractWebhookEventSummary(e);
    console.error('doPost Error: ' + eventSummary + '\n' + err.stack);
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
    return {
      ok: false,
      response: ContentService.createTextOutput('Bad Request')
    };
  }

  return {
    ok: true,
    events: data.events || []
  };
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
