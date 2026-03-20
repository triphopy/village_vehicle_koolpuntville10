function searchByPlate(query, options) {
  return searchByPlateDetailed(query, options);
}

function searchByPlateDetailed(query, options) {
  const opts = options || {};
  const source = opts.source || 'text';
  const forcedSuggestions = opts.forcedSuggestions || [];
  const normalizedQuery = normalizePlateSearchText(query);
  const isPartialQuery = source === 'text' && isPartialPlateQuery(query);
  const isTail4Query = source === 'text' && isTailFourSearchQuery(query);

  if (!normalizedQuery) {
    return {
      found: false,
      message: source === 'ocr'
        ? '❌ ไม่พบข้อมูลตรงตัวในระบบ\nผลตรวจ: ให้แลกบัตร'
        : '❌ ไม่พบข้อมูลรถในระบบ\nผลตรวจ: ให้แลกบัตร',
      logResult: 'ไม่พบข้อมูล'
    };
  }

  if (source === 'text' && !isValidPlateSearchQuery(query)) {
    return {
      found: false,
      message: '⚠️ ข้อมูลยังไม่พอสำหรับค้นหา\nผลตรวจ: กรุณาพิมพ์เลขทะเบียนให้มากขึ้น หรือส่งรูปป้าย',
      logResult: 'ข้อมูลไม่พอสำหรับค้นหา'
    };
  }

  const data = getCachedSheetData('Vehicles');
  const matches = data.slice(1).filter(function (row) {
    const normalizedPlate = normalizePlateSearchText(row[COL_VEHICLE.PLATE]);
    return source === 'ocr'
      ? normalizedPlate === normalizedQuery
      : normalizedPlate.includes(normalizedQuery);
  });

  if (matches.length === 0) {
    const suggestions = findSuggestedPlates(query, forcedSuggestions, 3);
    if (suggestions.length > 0) {
      const lines = [
        isPartialQuery
          ? '🔎 ค้นหาจากทะเบียนบางส่วน: ' + compactPlateText(query)
          : null,
        source === 'ocr' ? '❌ ไม่พบข้อมูลตรงตัวในระบบ' : '❌ ไม่พบข้อมูลรถในระบบ',
        '',
        'ใกล้เคียงที่อาจเป็น:',
        suggestions.map(function (plate) { return '• ' + plate; }).join('\n'),
        source === 'ocr'
          ? 'ผลตรวจ: กรุณาตรวจป้ายอีกครั้ง'
          : isPartialQuery
            ? 'ผลตรวจ: กรุณาตรวจทะเบียนให้ครบอีกครั้ง'
          : 'ผลตรวจ: กรุณาตรวจทะเบียนอีกครั้ง'
      ].filter(function (line) { return line !== null; });

      return {
        found: false,
        message: lines.join('\n'),
        logResult: source === 'ocr' ? 'ไม่พบข้อมูล (มีเลขใกล้เคียงจาก OCR)' : 'ไม่พบข้อมูล (มีเลขใกล้เคียง)'
      };
    }

    return {
      found: false,
      message: source === 'ocr'
        ? '❌ ไม่พบข้อมูลตรงตัวในระบบ\nผลตรวจ: ให้แลกบัตร'
        : '❌ ไม่พบข้อมูลรถในระบบ\nผลตรวจ: ให้แลกบัตร',
      logResult: 'ไม่พบข้อมูล'
    };
  }

  if (isTail4Query) {
    return {
      found: false,
      message: buildTailFourMessage(query, matches),
      logResult: 'ค้นหาจากเลขท้ายทะเบียน: พบ ' + matches.length + ' รายการ'
    };
  }

  if (isPartialQuery) {
    return {
      found: false,
      message: buildPartialPlateMessage(query, matches),
      logResult: 'ค้นหาทะเบียนบางส่วน: พบ ' + matches.length + ' รายการ'
    };
  }

  const message = buildPlateMatchMessage(matches);
  const statuses = matches.map(function (row) {
    return ((row[COL_VEHICLE.STATUS] || '') + '').toLowerCase() || 'unknown';
  });

  return {
    found: true,
    message: message,
    logResult: buildPlateLogResult(statuses)
  };
}

function searchByHouse(query) {
  return searchByHouseDetailed(query);
}

function searchByHouseDetailed(query) {
  const q = (query || '').toString().trim();
  const data = getCachedSheetData('Vehicles');

  const matches = data.slice(1).filter(function (row) {
    const house = ((row[COL_VEHICLE.HOUSE] || '') + '').trim();
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
      message: '❌ ไม่พบข้อมูลบ้านเลขที่นี้ในระบบ',
      logResult: 'ค้นบ้านเลขที่: ไม่พบข้อมูล'
    };
  }

  const msg = matches.map(function (row) {
    return '🚗 ' + row[COL_VEHICLE.PLATE] + '\n' +
      formatVehicleLine(row) + '\n' +
      getStatusLabel(row[COL_VEHICLE.STATUS]);
  }).join('\n\n');

  return {
    found: true,
    message: '🏠 บ้านเลขที่ ' + q + ' พบรถ ' + matches.length + ' คัน\n\n' + msg,
    logResult: 'ค้นบ้านเลขที่: พบ ' + matches.length + ' คัน'
  };
}

function buildPlateMatchMessage(matches) {
  const msg = matches.map(function (row) {
    return '🚗 ' + row[COL_VEHICLE.PLATE] + '\n' +
      formatVehicleLine(row) + '\n' +
      '🏠 บ้านเลขที่: ' + row[COL_VEHICLE.HOUSE] + '\n' +
      getStatusLabel(row[COL_VEHICLE.STATUS]) + '\n' +
      getDecisionLabel(row[COL_VEHICLE.STATUS]);
  }).join('\n\n');

  const header = matches.length > 1
    ? '⚠️ พบหลายคัน กรุณาตรวจทะเบียนให้ตรงอีกครั้ง\n✅ พบข้อมูล ' + matches.length + ' รายการ\n\n'
    : '✅ พบข้อมูลในระบบ\n\n';

  return header + msg;
}

function buildPartialPlateMessage(query, matches) {
  const compactQuery = compactPlateText(query);
  const list = matches.slice(0, 5).map(function (row) {
    return '• ' + row[COL_VEHICLE.PLATE];
  }).join('\n');
  const extraCount = matches.length - Math.min(matches.length, 5);
  const extraLine = extraCount > 0 ? '\n• และอีก ' + extraCount + ' รายการ' : '';

  return '🔎 ค้นหาจากทะเบียนบางส่วน: ' + compactQuery + '\n\n' +
    '⚠️ กรุณาตรวจทะเบียนให้ครบอีกครั้ง\n' +
    'พบข้อมูลที่ใกล้เคียง:\n' +
    list +
    extraLine +
    '\n\nผลตรวจ: กรุณาตรวจทะเบียนให้ครบอีกครั้ง';
}

function buildTailFourMessage(query, matches) {
  const compactQuery = compactPlateText(query);
  const list = matches.slice(0, 5).map(function (row) {
    return '• ' + row[COL_VEHICLE.PLATE];
  }).join('\n');
  const extraCount = matches.length - Math.min(matches.length, 5);
  const extraLine = extraCount > 0 ? '\n• และอีก ' + extraCount + ' รายการ' : '';

  return '🔎 ค้นหาจากเลขท้ายทะเบียน: ' + compactQuery + '\n\n' +
    '⚠️ กรุณาตรวจทะเบียนให้ตรงอีกครั้ง\n' +
    'พบข้อมูลที่ใกล้เคียง:\n' +
    list +
    extraLine +
    '\n\nผลตรวจ: กรุณาตรวจทะเบียนให้ตรงอีกครั้ง';
}

function formatVehicleLine(row) {
  const brand = ((row[COL_VEHICLE.BRAND] || '') + '').trim();
  const model = ((row[COL_VEHICLE.MODEL] || '') + '').trim();
  const color = ((row[COL_VEHICLE.COLOR] || '') + '').trim();

  if (brand && model) return brand + ' ' + model + ' | สี' + color;
  if (brand) return brand + ' | สี' + color;
  return 'สี' + color;
}

function findSuggestedPlates(query, forcedSuggestions, limit) {
  const maxItems = limit || 3;
  const queryCompact = compactPlateText(query).toUpperCase();
  const queryNormalized = normalizePlateForComparison(queryCompact);
  const unique = {};
  const suggestions = [];

  function pushSuggestion(plate) {
    if (!plate) return;
    const key = compactPlateText(plate).toUpperCase();
    if (!key || unique[key]) return;
    unique[key] = true;
    suggestions.push(plate);
  }

  forcedSuggestions.forEach(pushSuggestion);

  if (queryCompact) {
    const candidateMap = buildPlateCandidateMap();
    const generatedCandidates = generatePlateCandidates(queryCompact, 2);
    generatedCandidates.forEach(function (candidate) {
      if (candidateMap[candidate]) {
        pushSuggestion(candidateMap[candidate]);
      }
    });
  }

  const data = getCachedSheetData('Vehicles');
  const scored = data.slice(1).map(function (row) {
    const plate = compactPlateText(row[COL_VEHICLE.PLATE]).toUpperCase();
    return {
      plate: plate,
      score: stringSimilarity(queryNormalized, normalizePlateForComparison(plate))
    };
  }).filter(function (item) {
    return item.plate && item.plate !== queryCompact && item.score >= 0.75;
  }).sort(function (a, b) {
    return b.score - a.score;
  });

  scored.forEach(function (item) {
    pushSuggestion(item.plate);
  });

  return suggestions.slice(0, maxItems);
}

function buildPlateLogResult(statuses) {
  const counts = {};
  statuses.forEach(function (status) {
    counts[status] = (counts[status] || 0) + 1;
  });

  const keys = Object.keys(counts);
  if (keys.length === 1 && statuses.length === 1) {
    return 'พบข้อมูล: ' + keys[0];
  }

  return 'พบข้อมูล ' + statuses.length + ' รายการ: ' + keys.join(', ');
}

function normalizePlateSearchText(text) {
  return ((text || '') + '')
    .replace(/[\s\-]/g, '')
    .toLowerCase();
}

function isValidPlateSearchQuery(query) {
  const normalized = normalizePlateSearchText(query).toUpperCase();
  if (!normalized) return false;
  if (!looksLikePlateQuery(normalized)) return false;
  if (/^\d{4}$/.test(normalized)) return true;
  if (/^[ก-ฮ]{1,3}\d{1,4}$/.test(normalized)) return true;
  if (/^\d{1,2}[ก-ฮ]{1,2}\d{4}$/.test(normalized)) return true;
  if (isPartialPlateQuery(query)) return true;
  return false;
}

function isPartialPlateQuery(query) {
  const normalized = normalizePlateSearchText(query).toUpperCase();
  if (!normalized) return false;
  if (/^\d{4}$/.test(normalized)) return false;
  if (/^[ก-ฮ]{1,3}\d{1,4}$/.test(normalized)) return false;
  if (/^\d{1,2}[ก-ฮ]{1,2}\d{4}$/.test(normalized)) return false;
  const thaiMatches = normalized.match(/[ก-ฮ]/g) || [];
  const digitMatches = normalized.match(/\d/g) || [];
  return thaiMatches.length >= 2 && digitMatches.length >= 2;
}

function isTailFourSearchQuery(query) {
  const normalized = normalizePlateSearchText(query).toUpperCase();
  return /^\d{4}$/.test(normalized);
}

function looksLikePlateQuery(normalized) {
  if (!normalized) return false;

  const hasThai = /[ก-ฮ]/.test(normalized);
  const hasDigit = /\d/.test(normalized);

  if (/^\d{4}$/.test(normalized)) return true;
  if (hasThai && hasDigit) return true;

  return false;
}

function getStatusLabel(status) {
  const s = ((status || '') + '').toLowerCase();
  if (s === 'active') return '✅ สถานะ: อนุญาต';
  if (s === 'inactive') return '⛔ สถานะ: ไม่อนุญาต';
  if (s === 'blacklist') return '🚨 สถานะ: Blacklist';
  return '❓ สถานะ: ไม่ระบุ';
}

function getDecisionLabel(status) {
  const s = ((status || '') + '').toLowerCase();
  if (s === 'active') return 'ผลตรวจ: เข้าได้';
  if (s === 'inactive') return 'ผลตรวจ: ไม่อนุญาต';
  if (s === 'blacklist') return 'ผลตรวจ: ห้ามเข้า';
  return 'ผลตรวจ: กรุณาตรวจสอบข้อมูล';
}
