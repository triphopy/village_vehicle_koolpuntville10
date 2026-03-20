function searchByPlate(query) {
  const result = searchByPlateDetailed(query);
  return {
    found: result.found,
    message: result.message
  };
}

function searchByPlateDetailed(query) {
  if (!isSufficientPlateQuery(query)) {
    return {
      found: false,
      message: '⚠️ ข้อมูลยังไม่พอสำหรับค้นหา\nผลตรวจ: กรุณาพิมพ์เลขทะเบียนให้มากขึ้น หรือส่งรูปป้าย',
      logResult: 'ค้นหาไม่สำเร็จ (ข้อมูลไม่พอ)'
    };
  }

  const data = getCachedSheetData('Vehicles');
  const q = compactPlateText(query).toLowerCase();
  const isLastFourDigitsQuery = /^\d{4}$/.test(q);

  const matches = data.slice(1).filter(row =>
    compactPlateText(row[COL_VEHICLE.PLATE]).toLowerCase().includes(q)
  );

  if (matches.length === 0) {
    const suggestions = getSuggestedPlateMatches(query);
    const suggestionText = suggestions.length > 0
      ? '\n\nใกล้เคียงที่อาจเป็น:\n• ' + suggestions.join('\n• ') + '\nผลตรวจ: กรุณาตรวจทะเบียนอีกครั้ง'
      : '\nผลตรวจ: ให้แลกบัตร';

    return {
      found: false,
      message: '❌ ไม่พบข้อมูลรถในระบบ' + suggestionText,
      logResult: suggestions.length > 0 ? 'ไม่พบข้อมูล (มีเลขใกล้เคียง)' : 'ไม่พบข้อมูล',
      suggestions: suggestions
    };
  }

  const msg = matches.map(row =>
    '🚗 ' + row[COL_VEHICLE.PLATE] + '\n' +
    row[COL_VEHICLE.BRAND] + ' ' + row[COL_VEHICLE.MODEL] + ' | สี' + row[COL_VEHICLE.COLOR] + '\n' +
    '🏠 บ้านเลขที่: ' + row[COL_VEHICLE.HOUSE] + '\n' +
    getStatusLabel(row[COL_VEHICLE.STATUS]) + '\n' +
    getDecisionLabel(row[COL_VEHICLE.STATUS])
  ).join('\n\n');

  const header = matches.length > 1
    ? '✅ พบข้อมูล ' + matches.length + ' รายการ\n\n'
    : '✅ พบข้อมูลในระบบ\n\n';
  const queryHeader = isLastFourDigitsQuery
    ? '🔎 ค้นหาจากเลขท้ายทะเบียน: ' + q + '\n\n'
    : '';
  const statuses = matches.map(function (row) {
    return (row[COL_VEHICLE.STATUS] || '').toString().toLowerCase() || 'unknown';
  });

  return {
    found: true,
    message: queryHeader + header + msg,
    logResult: buildPlateLogResult(statuses, matches.length),
    statuses: statuses,
    count: matches.length
  };
}

function searchByHouse(query) {
  const result = searchByHouseDetailed(query);
  return {
    found: result.found,
    message: result.message
  };
}

function searchByHouseDetailed(query) {
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
      message: '❌ ไม่พบข้อมูลบ้านเลขที่นี้ในระบบ\nผลตรวจ: ไม่พบข้อมูล',
      logResult: 'ค้นบ้านเลขที่: ไม่พบข้อมูล'
    };
  }

  const msg = matches.map(row =>
    '🚗 ' + row[COL_VEHICLE.PLATE] + '\n' +
    row[COL_VEHICLE.BRAND] + ' ' + row[COL_VEHICLE.MODEL] + ' | สี' + row[COL_VEHICLE.COLOR] + '\n' +
    getStatusLabel(row[COL_VEHICLE.STATUS])
  ).join('\n\n');

  return {
    found: true,
    message: '🏠 บ้านเลขที่ ' + q + ' พบรถ ' + matches.length + ' คัน\n\n' + msg,
    logResult: 'ค้นบ้านเลขที่: พบ ' + matches.length + ' คัน',
    count: matches.length
  };
}

function buildPlateLogResult(statuses, count) {
  const uniqueStatuses = statuses.filter(function (status, index, arr) {
    return arr.indexOf(status) === index;
  });

  if (count > 1) {
    return 'พบข้อมูล ' + count + ' รายการ: ' + uniqueStatuses.join(', ');
  }

  if (uniqueStatuses[0] === 'active') return 'พบข้อมูล: active';
  if (uniqueStatuses[0] === 'inactive') return 'พบข้อมูล: inactive';
  if (uniqueStatuses[0] === 'blacklist') return 'พบข้อมูล: blacklist';
  return 'พบข้อมูล';
}

function isSufficientPlateQuery(query) {
  const compact = compactPlateText(query);
  if (!compact) return false;
  if (/^\d{4}$/.test(compact)) return true;
  if (compact.length >= 5) return true;
  return false;
}

function getSuggestedPlateMatches(query) {
  const target = compactPlateText(query);
  if (!target) return [];

  const candidateMap = buildPlateCandidateMap();
  const generatedCandidates = generatePlateCandidates(target, 2)
    .filter(function (candidate) { return candidateMap[candidate]; })
    .filter(function (candidate) { return candidate !== target; });

  const data = getCachedSheetData('Vehicles');
  const normalizedTarget = normalizePlateForComparison(target);
  const fuzzySuggestions = data.slice(1)
    .map(row => {
      const plate = compactPlateText(row[COL_VEHICLE.PLATE]);
      return {
        plate: plate,
        score: stringSimilarity(normalizedTarget, normalizePlateForComparison(plate))
      };
    })
    .filter(item => item.plate && item.score >= 0.75)
    .sort((a, b) => b.score - a.score)
    .filter((item, index, arr) =>
      arr.findIndex(function (candidate) { return candidate.plate === item.plate; }) === index
    )
    .slice(0, 3)
    .map(item => item.plate);

  return generatedCandidates
    .concat(fuzzySuggestions)
    .filter(function (plate, index, arr) {
      return arr.indexOf(plate) === index;
    })
    .slice(0, 3);
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
