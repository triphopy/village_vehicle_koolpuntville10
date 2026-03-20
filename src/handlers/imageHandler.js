function handleImageMessage(context) {
  const event = context.event;
  const userId = context.userId;
  const replyToken = context.replyToken;
  const groupId = context.groupId;
  const lineName = getLineDisplayName(userId);
  const staff = getStaff(userId);
  const isAdmin = staff && staff.role === 'admin';

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

  const imageId = event.message.id;
  const plateText = extractPlateFromImage(imageId);

  if (!plateText) {
    writeLog(userId, staff.name, lineName, '[OCR] ส่งรูป', 'อ่านไม่ได้');
    replyToLine(
      replyToken,
      '📷 อ่านทะเบียนไม่ได้ครับ\n\nกรุณาลองใหม่:\n• ถ่ายให้ใกล้และชัดขึ้น\n• แสงเพียงพอ\n• หรือพิมพ์เลขทะเบียนตรงๆ ได้เลยครับ'
    );
    return;
  }

  const correctedPlate = resolvePlateFromOcr(plateText);
  const result = searchByPlate(correctedPlate || plateText);

  const ocrNote = correctedPlate && correctedPlate !== plateText
    ? '🔍 อ่านจากรูปได้: ' + plateText + '\n📝 ตรวจในระบบแล้ว: ' + correctedPlate + '\n⚠️ กรุณาตรวจป้ายอีกครั้งก่อนอนุญาต\n\n'
    : '🔍 อ่านจากรูปได้: ' + plateText + '\n\n';

  writeLog(
    userId,
    staff.name,
    lineName,
    '[OCR] ' + (correctedPlate || plateText),
    result.found ? 'พบข้อมูล' : 'ไม่พบข้อมูล'
  );
  replyToLine(replyToken, ocrNote + result.message);
}
