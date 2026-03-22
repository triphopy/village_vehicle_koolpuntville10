function handleAdminCommand(query, adminId, event) {
  const context = parseAdminCommandContext(query, adminId, event);

  try {
    switch (context.cmd) {
      case '/add':
        return runAddUserCommand(context);
      case '/remove':
        return runRemoveUserCommand(context);
      case '/setstatus':
        return runSetStatusCommand(context);
      case '/setrole':
        return runSetRoleCommand(context);
      case '/list':
        return runListUsersCommand(context);
      case '/status':
        return runStatusCommand(context);
      case '/whois':
        return runWhoisCommand(context);
      case '/visitors':
        return runVisitorsCommand(context);
      case '/log':
        return runLogCommand(context);
      case '/health':
        return runHealthCommand(context);
      case '/testalert':
        return runTestAlertCommand(context);
      case '/clearcache':
        return runClearCacheCommand(context);
      case '/version':
        return runVersionCommand();
      default:
        return '❌ ไม่รู้จักคำสั่งนี้\nพิมพ์ /help เพื่อดูคำสั่งทั้งหมด';
    }
  } catch (err) {
    if (isServiceUnavailableError(err)) {
      return buildServiceUnavailableMessage();
    }
    console.error('handleAdminCommand failed: ' + err.message);
    return '⚠️ คำสั่งนี้ทำงานไม่สำเร็จชั่วคราว\nกรุณาลองใหม่อีกครั้ง';
  }
}

function parseAdminCommandContext(query, adminId, event) {
  const parts = query.split(/\s+/);
  return {
    query: query,
    adminId: adminId,
    event: event,
    parts: parts,
    cmd: parts[0].toLowerCase(),
    groupId: event && event.source ? event.source.groupId || null : null
  };
}
