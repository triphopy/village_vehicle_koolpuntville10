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
    const isRateLimit = LAST_OCR_STATUS === 'gemini_rate_limit';
    writeLog(userId, staff.name, lineName, '[OCR] ส่งรูป', isRateLimit ? 'OCR ระบบหนาแน่น' : 'อ่านไม่ได้');
    replyToLine(
      replyToken,
      isRateLimit
        ? '⚠️ ระบบ OCR ใช้งานหนาแน่นชั่วคราว\nผลตรวจ: กรุณาลองใหม่อีกครั้ง'
        : '📷 อ่านป้ายไม่ชัด\nผลตรวจ: กรุณาถ่ายใหม่ หรือพิมพ์เลขทะเบียน'
    );
    return;
  }

  const hintedPlate = resolvePlateFromOcr(plateText);
  const forcedSuggestions = hintedPlate && compactPlateText(hintedPlate) !== compactPlateText(plateText)
    ? [hintedPlate]
    : [];
  const result = searchByPlateDetailed(plateText, {
    source: 'ocr',
    forcedSuggestions: forcedSuggestions
  });
  const hasHint = forcedSuggestions.length > 0 && !result.found;
  const hasHighRiskChars = /[อฮฬ]/.test(plateText);
  const warningNote = (hasHint || hasHighRiskChars)
    ? '⚠️ กรุณาตรวจตัวอักษรบนป้ายอีกครั้งก่อนอนุญาต\n\n'
    : '';
  const ocrNote = '🔍 อ่านจากรูปได้: ' + plateText + '\n\n';

  writeLog(
    userId,
    staff.name,
    lineName,
    '[OCR] ' + plateText + (hasHint ? ' -> ' + forcedSuggestions[0] : ''),
    result.logResult || (result.found ? 'พบข้อมูล' : 'ไม่พบข้อมูล')
  );

  replyToLine(replyToken, ocrNote + warningNote + result.message);
}
