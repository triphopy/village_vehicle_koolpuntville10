function handleAdminCommand(query, adminId, event) {
  const context = parseAdminCommandContext(query, adminId, event);

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
    case '/clearcache':
      return runClearCacheCommand(context);
    default:
      return '❌ ไม่รู้จักคำสั่งนี้\nพิมพ์ /help เพื่อดูคำสั่งทั้งหมด';
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
