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
      '📷 อ่านป้ายไม่ชัด\nผลตรวจ: กรุณาถ่ายใหม่ หรือพิมพ์เลขทะเบียน'
    );
    return;
  }

  const exactPlate = findExactPlateMatch(plateText);
  const ocrNote = '🔍 อ่านจากรูปได้: ' + plateText + '\n\n';

  if (!exactPlate) {
    const suggestions = getSuggestedPlateMatches(plateText);
    const suggestionMessage = suggestions.length > 0
      ? '❌ ไม่พบข้อมูลตรงตัวในระบบ\n\nใกล้เคียงที่อาจเป็น:\n• ' + suggestions.join('\n• ') + '\nผลตรวจ: กรุณาตรวจป้ายอีกครั้ง'
      : '❌ ไม่พบข้อมูลตรงตัวในระบบ\nผลตรวจ: ให้แลกบัตร';
    const logResult = suggestions.length > 0
      ? 'ไม่พบตรงตัว (มีเลขใกล้เคียง)'
      : 'ไม่พบตรงตัว';

    writeLog(
      userId,
      staff.name,
      lineName,
      '[OCR] ' + plateText,
      logResult
    );
    replyToLine(replyToken, ocrNote + suggestionMessage);
    return;
  }

  const result = searchByPlate(exactPlate);

  writeLog(
    userId,
    staff.name,
    lineName,
    '[OCR] ' + plateText,
    result.found ? 'พบข้อมูลตรงตัว' : 'ไม่พบข้อมูล'
  );
  replyToLine(replyToken, ocrNote + result.message);
}
