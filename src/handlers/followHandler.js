function handleFollowEvent(context) {
  replyToLine(
    context.replyToken,
    '👋 สวัสดีครับ!\n\n' +
      '📋 User ID ของคุณคือ:\n' + context.userId + '\n\n' +
      'กรุณาแจ้ง ID นี้กับนิติบุคคลเพื่อเปิดสิทธิ์ใช้งานครับ'
  );
}
