function routeLineEvent(event) {
  const context = buildEventContext(event);
  if (!context) return;

  if (event.type === 'follow') {
    handleFollowEvent(context);
    return;
  }

  if (event.type === 'message' && event.message.type === 'image') {
    handleImageMessage(context);
    return;
  }

  if (event.type === 'message' && event.message.type === 'text') {
    handleTextMessage(context);
  }
}

function buildEventContext(event) {
  const source = event && event.source ? event.source : {};
  const userId = source.userId;

  if (!userId) return null;

  return {
    event: event,
    userId: userId,
    replyToken: event.replyToken,
    groupId: source.groupId || null
  };
}
