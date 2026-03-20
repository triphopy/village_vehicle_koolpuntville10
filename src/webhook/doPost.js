function doPost(e) {
  try {
    const request = parseWebhookRequest(e);
    if (!request.ok) return request.response;

    request.events.forEach(routeLineEvent);
  } catch (err) {
    console.error('doPost Error: ' + err.stack);
  }

  return ContentService.createTextOutput('OK');
}

function parseWebhookRequest(e) {
  const token = e && e.parameter ? e.parameter.token : null;
  if (token !== props.getProperty('WEBHOOK_SECRET')) {
    return {
      ok: false,
      response: ContentService.createTextOutput('Unauthorized')
    };
  }

  debugToLine(JSON.stringify(e, null, 2));

  if (!e || !e.postData || !e.postData.contents) {
    return {
      ok: false,
      response: ContentService.createTextOutput('Bad Request')
    };
  }

  const data = JSON.parse(e.postData.contents);

  return {
    ok: true,
    events: data.events || []
  };
}
