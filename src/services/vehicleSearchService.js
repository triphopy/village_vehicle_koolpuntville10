function searchByPlate(query) {
  const data = getCachedSheetData('Vehicles');
  const q = query.replace(/\s/g, '').toLowerCase();

  const matches = data.slice(1).filter(row =>
    row[COL_VEHICLE.PLATE].toString().replace(/\s/g, '').toLowerCase().includes(q)
  );

  if (matches.length === 0) {
    return {
      found: false,
      message: '❌ ไม่พบข้อมูลรถในระบบ\nกรุณาแลกบัตรตามขั้นตอนปกติ\n\nผลตรวจ: ไม่พบข้อมูล ให้แลกบัตร'
    };
  }

  const msg = matches.map(row =>
    '🚗 ' + row[COL_VEHICLE.PLATE] + '\n' +
    '    ' + row[COL_VEHICLE.BRAND] + ' ' + row[COL_VEHICLE.MODEL] + ' | สี' + row[COL_VEHICLE.COLOR] + '\n' +
    '🏠 บ้านเลขที่: ' + row[COL_VEHICLE.HOUSE] + '\n' +
    getStatusLabel(row[COL_VEHICLE.STATUS]) + '\n' +
    getDecisionLabel(row[COL_VEHICLE.STATUS])
  ).join('\n\n');

  const header = matches.length > 1
    ? '✅ พบข้อมูล ' + matches.length + ' รายการ\n\n'
    : '✅ พบข้อมูลในระบบ\n\n';

  return { found: true, message: header + msg };
}

function searchByHouse(query) {
  const data = getCachedSheetData('Vehicles');
  const q = query.trim();

  const matches = data.slice(1).filter(row => {
    const house = row[COL_VEHICLE.HOUSE].toString().trim();
    if (house === q) return true;
    if (house.includes('-') && q.includes('/')) {
      const houseParts = house.split('/');
      const queryParts = q.split('/');
      const prefix = houseParts[0];
      const range = houseParts[1];
      const qPrefix = queryParts[0];
      const qNumStr = queryParts[1];
      const rangeParts = range.split('-').map(Number);
      return prefix === qPrefix && Number(qNumStr) >= rangeParts[0] && Number(qNumStr) <= rangeParts[1];
    }
    return false;
  });

  if (matches.length === 0) {
    return {
      found: false,
      message: '❌ ไม่พบข้อมูลบ้านเลขที่นี้ในระบบ\n\nผลตรวจ: ไม่พบข้อมูล'
    };
  }

  const msg = matches.map(row =>
    '🚗 ' + row[COL_VEHICLE.PLATE] + '\n' +
    '    ' + row[COL_VEHICLE.BRAND] + ' ' + row[COL_VEHICLE.MODEL] + ' | สี' + row[COL_VEHICLE.COLOR] + '\n' +
    getStatusLabel(row[COL_VEHICLE.STATUS]) + '\n' +
    getDecisionLabel(row[COL_VEHICLE.STATUS])
  ).join('\n\n');

  return { found: true, message: '🏠 บ้านเลขที่ ' + q + ' พบรถ ' + matches.length + ' คัน\n\n' + msg };
}

function getStatusLabel(status) {
  const s = (status || '').toString().toLowerCase();
  if (s === 'active') return '✅ สถานะ: อนุญาต';
  if (s === 'inactive') return '⛔ สถานะ: ไม่อนุญาต';
  if (s === 'blacklist') return '🚨 สถานะ: Blacklist';
  return '❓ สถานะ: ไม่ระบุ';
}

function getDecisionLabel(status) {
  const s = (status || '').toString().toLowerCase();
  if (s === 'active') return 'ผลตรวจ: เข้าได้';
  if (s === 'inactive') return 'ผลตรวจ: ไม่อนุญาต';
  if (s === 'blacklist') return 'ผลตรวจ: ห้ามเข้า';
  return 'ผลตรวจ: กรุณาตรวจสอบข้อมูล';
}
