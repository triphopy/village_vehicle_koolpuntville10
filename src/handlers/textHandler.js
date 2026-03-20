function handleTextMessage(context) {
  const event = context.event;
  const userId = context.userId;
  const replyToken = context.replyToken;
  const groupId = context.groupId;
  const query = event.message.text.trim();

  if (query.length > 50) {
    replyToLine(replyToken, '❌ ข้อความยาวเกินไป กรุณาลองใหม่ครับ');
    return;
  }

  const lineName = getLineDisplayName(userId);
  const staff = getStaff(userId);
  const isAdmin = staff && staff.role === 'admin';

  if (query === '/myid') {
    const lines = ['📋 ข้อมูลของคุณ\n'];
    lines.push('👤 User ID: ' + userId);
    if (staff) {
      lines.push('📝 ชื่อ: ' + staff.name);
      lines.push('🔑 Role: ' + staff.role);
      lines.push('🟢 Status: active');
    } else {
      lines.push('⚠️ ยังไม่มีสิทธิ์ในระบบ');
    }
    if (groupId) lines.push('💬 Group ID: ' + groupId);
    replyToLine(replyToken, lines.join('\n'));
    return;
  }

  if (query === '/help') {
    let msg = '📋 คำสั่งที่ใช้ได้\n\n👤 ทุกคน\n/myid\n/help';
    if (isAdmin) {
      msg += '\n\n🧑 Admin เท่านั้น\n' +
             '/add <userId> <ชื่อ> <role>\n' +
             '/remove <userId>\n' +
             '/setstatus <userId> <active|inactive>\n' +
             '/setrole <userId> <admin|staff>\n' +
             '/list\n' +
             '/status <userId>\n' +
             '/whois\n' +
             '/visitors\n' +
             '/log <จำนวน>\n' +
             '/clearcache';
    }
    replyToLine(replyToken, msg);
    return;
  }

  if (!isAdmin) {
    const isAllowedGroup = groupId && ALLOWED_GROUP_IDS.includes(groupId);
    if (!isAllowedGroup) {
      replyToLine(replyToken, '🚫 กรุณาใช้งานในกลุ่มที่กำหนดเท่านั้นครับ');
      return;
    }
  }

  trackUser(userId, lineName);

  if (!staff) {
    replyToLine(replyToken, '🚫 ไม่มีสิทธิ์เข้าถึงระบบ\nกรุณาติดต่อ นิติบุคคล');
    return;
  }

  if (query.startsWith('/')) {
    if (isAdmin) {
      replyToLine(replyToken, handleAdminCommand(query, userId, event));
    } else {
      replyToLine(replyToken, '🚫 คำสั่งนี้สำหรับ Admin เท่านั้น');
    }
    return;
  }

  const result = query.match(/^\d/) && query.indexOf('/') !== -1
    ? searchByHouse(query)
    : searchByPlate(query);

  writeLog(userId, staff.name, lineName, query, result.found ? 'พบข้อมูล' : 'ไม่พบข้อมูล');
  replyToLine(replyToken, result.message);
}
