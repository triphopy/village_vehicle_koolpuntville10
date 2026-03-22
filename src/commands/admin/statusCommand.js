function runStatusCommand(context) {
  const parts = context.parts;
  if (parts.length < 2) return '❌ Usage:\n/status <userId>';

  const checkId = parts[1].trim();
  const targetStaff = getStaffRecord(checkId);
  if (!targetStaff) return '❌ ไม่พบ User ID นี้ในระบบ';

  return '📋 ' + targetStaff.name + '\nRole: ' + targetStaff.role + '\nStatus: ' + targetStaff.status;
}
