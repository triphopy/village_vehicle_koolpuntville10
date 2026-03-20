/**
 * รับ imageId จาก LINE -> ดึงรูป -> ส่ง Gemini 2.5 Flash-Lite -> คืนค่าทะเบียน
 * @param {string} imageId
 * @returns {string|null}
 */
function extractPlateFromImage(imageId) {
  try {
    if (!LINE_ACCESS_TOKEN || !GEMINI_API_KEY) return null;

    const imageResponse = UrlFetchApp.fetch(
      'https://api-data.line.me/v2/bot/message/' + imageId + '/content',
      {
        headers: { Authorization: 'Bearer ' + LINE_ACCESS_TOKEN },
        muteHttpExceptions: true
      }
    );

    if (imageResponse.getResponseCode() !== 200) {
      console.error('LINE Content API Error: ' + imageResponse.getContentText());
      return null;
    }

    const imageBlob = imageResponse.getBlob();
    const base64 = Utilities.base64Encode(imageBlob.getBytes());
    const mimeType = imageBlob.getContentType() || 'image/jpeg';
    const firstPass = callGeminiPlateOcr(base64, mimeType, buildPrimaryOcrPrompt(), 30);
    if (!firstPass) return null;

    const cleanedFirstPass = cleanPlateText(firstPass);
    if (!cleanedFirstPass) return null;

    return cleanedFirstPass;
  } catch (err) {
    console.error('extractPlateFromImage Error: ' + err.message);
    return null;
  }
}

function callGeminiPlateOcr(base64, mimeType, promptText, maxOutputTokens) {
  const response = UrlFetchApp.fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=' + GEMINI_API_KEY,
    {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      payload: JSON.stringify({
        contents: [{
          parts: [
            {
              inline_data: {
                mime_type: mimeType,
                data: base64
              }
            },
            {
              text: promptText
            }
          ]
        }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: maxOutputTokens || 30
        }
      })
    }
  );

  const json = JSON.parse(response.getContentText());
  if (json.error) {
    console.error('Gemini API Error: ' + JSON.stringify(json.error));
    return null;
  }

  const text = json.candidates &&
               json.candidates[0] &&
               json.candidates[0].content &&
               json.candidates[0].content.parts &&
               json.candidates[0].content.parts[0] &&
               json.candidates[0].content.parts[0].text
                 ? json.candidates[0].content.parts[0].text.trim()
                 : null;

  if (!text || text.toLowerCase() === 'null') return null;
  return text;
}

function buildPrimaryOcrPrompt() {
  return 'อ่านเลขทะเบียนรถจากภาพนี้\n' +
    'ตอบเฉพาะเลขทะเบียนที่เห็น โดยไม่ต้องใส่ช่องว่าง\n' +
    'ตัวอย่างรูปแบบ: กข1234, งล441, 3ขฮ8777, 1กข2345, 80-1234\n' +
    'ถ้ามีหลายป้าย ให้ตอบป้ายที่ชัดที่สุดเพียงป้ายเดียว\n' +
    'ถ้าไม่มีป้ายหรือมองไม่ออกจริงๆ ให้ตอบ null';
}

function cleanPlateText(rawText) {
  if (!rawText) return null;

  const original = rawText.trim()
    .replace(/["'`]/g, '')
    .replace(/[：:]/g, ' ')
    .replace(/\s+/g, ' ');
  const compact = compactPlateText(original);
  const compactUpper = compact.toUpperCase();

  const compactPatterns = [
    /^[ก-ฮ]{1,3}\d{1,4}$/,
    /^\d{1,2}[ก-ฮ]{1,2}\d{4}$/,
    /^\d{1,2}\d{4}$/
  ];

  if (/^\d{1,2}-\d{4}$/.test(original)) return original;
  if (compactPatterns.some(function (pattern) { return pattern.test(compactUpper); })) return compactUpper;

  const extractedCompact = compactUpper.match(/[ก-ฮ]{1,3}\d{1,4}|\d{1,2}[ก-ฮ]{1,2}\d{4}|\d{1,2}\d{4}/);
  if (extractedCompact) return extractedCompact[0];

  const spacedPatterns = [
    /([ก-ฮ]{1,3})\s*(\d{1,4})/,
    /(\d{1,2})\s*([ก-ฮ]{1,2})\s*(\d{4})/,
    /(\d{1,2})\s*-\s*(\d{4})/
  ];

  for (let i = 0; i < spacedPatterns.length; i++) {
    const match = original.toUpperCase().match(spacedPatterns[i]);
    if (match) {
      return match.slice(1).join('').replace(/\s/g, '');
    }
  }

  const tokens = original.toUpperCase().split(/\s+/).filter(function (token) { return token; });
  for (let j = 0; j < tokens.length; j++) {
    const candidate = compactPlateText(tokens[j]);
    if (compactPatterns.some(function (pattern) { return pattern.test(candidate); })) {
      return candidate;
    }
  }

  return null;
}

function compactPlateText(text) {
  return (text || '').toString().replace(/[\s\-]/g, '');
}

function normalizePlateForLookup(text) {
  const compact = compactPlateText(text);
  const thaiPlateMatch = compact.match(/^([ก-ฮ]{1,3})(\d{1,4})$/);
  if (!thaiPlateMatch) return compact;

  const prefix = thaiPlateMatch[1];
  const digits = thaiPlateMatch[2].replace(/^0+/, '');
  return prefix + (digits || '0');
}

function fuzzySearchPlate(ocrText) {
  if (!ocrText) return null;

  const data = getCachedSheetData('Vehicles');
  const normalizedOcr = normalizePlateForComparison(ocrText);
  const plates = data.slice(1).map(function (row) {
    const plate = compactPlateText(row[COL_VEHICLE.PLATE]);
    return {
      plate: plate,
      normalized: normalizePlateForComparison(plate)
    };
  });

  const best = plates
    .map(function (item) {
      return {
        plate: item.plate,
        score: stringSimilarity(normalizedOcr, item.normalized)
      };
    })
    .filter(function (item) { return item.score >= 0.75; })
    .sort(function (a, b) { return b.score - a.score; })[0];

  return best ? best.plate : null;
}

function resolvePlateFromOcr(ocrText) {
  if (!ocrText) return null;

  const exactMatch = findExactPlateMatch(ocrText);
  if (exactMatch) return exactMatch;

  const generatedMatch = findPlateByGeneratedCandidates(ocrText);
  if (generatedMatch) return generatedMatch;

  return fuzzySearchPlate(ocrText);
}

function findExactPlateMatch(text) {
  const target = compactPlateText(text);
  const normalizedTarget = normalizePlateForLookup(text);
  if (!target) return null;

  const data = getCachedSheetData('Vehicles');
  const match = data.slice(1).find(function (row) {
    return compactPlateText(row[COL_VEHICLE.PLATE]) === target ||
      normalizePlateForLookup(row[COL_VEHICLE.PLATE]) === normalizedTarget;
  });

  return match ? compactPlateText(match[COL_VEHICLE.PLATE]) : null;
}

function findPlateByGeneratedCandidates(ocrText) {
  const target = compactPlateText(ocrText);
  if (!target) return null;

  const candidateMap = buildPlateCandidateMap();
  const candidates = generatePlateCandidates(target, 2);

  for (let i = 0; i < candidates.length; i++) {
    if (candidateMap[candidates[i]]) return candidateMap[candidates[i]];
  }

  return null;
}

function buildPlateCandidateMap() {
  const data = getCachedSheetData('Vehicles');
  const map = {};

  data.slice(1).forEach(function (row) {
    const plate = compactPlateText(row[COL_VEHICLE.PLATE]);
    if (plate) map[plate] = plate;
  });

  return map;
}

function generatePlateCandidates(text, maxChanges) {
  const confusionMap = getPlateConfusionMap();
  const results = {};
  const queue = [{ text: text, changes: 0, index: 0 }];

  while (queue.length > 0) {
    const current = queue.shift();
    results[current.text] = true;

    if (current.changes >= maxChanges) continue;

    for (let i = current.index; i < current.text.length; i++) {
      const char = current.text.charAt(i);
      const replacements = confusionMap[char] || [];
      for (let j = 0; j < replacements.length; j++) {
        const replacement = replacements[j];
        if (replacement === char) continue;
        const nextText = current.text.substring(0, i) + replacement + current.text.substring(i + 1);
        if (!results[nextText]) {
          queue.push({
            text: nextText,
            changes: current.changes + 1,
            index: i + 1
          });
        }
      }
    }
  }

  return Object.keys(results);
}

function getPlateConfusionMap() {
  return {
    'ฮ': ['ฮ', 'อ', 'ฬ'],
    'อ': ['อ', 'ฮ', 'ฬ'],
    'ฬ': ['ฬ', 'ฮ', 'อ'],
    'ข': ['ข', 'ช'],
    'ช': ['ช', 'ข'],
    'บ': ['บ', '6', '8'],
    '6': ['6', 'บ', '8'],
    '8': ['8', 'B', 'บ'],
    '0': ['0', 'O', 'D', 'Q'],
    'O': ['O', '0', 'D', 'Q'],
    'D': ['D', '0', 'O', 'Q'],
    'Q': ['Q', '0', 'O', 'D'],
    '1': ['1', 'I', 'l'],
    'I': ['I', '1', 'l'],
    'l': ['l', '1', 'I'],
    '2': ['2', 'Z'],
    'Z': ['Z', '2'],
    '5': ['5', 'S'],
    'S': ['S', '5'],
    'B': ['B', '8', 'บ']
  };
}

function normalizePlateForComparison(text) {
  if (!text) return '';

  const compact = compactPlateText(text);
  const confusionGroups = [
    ['ฮ', 'อ', 'ฬ'],
    ['ข', 'ช'],
    ['บ', '6'],
    ['0', 'O', 'D', 'Q'],
    ['1', 'I', 'l'],
    ['2', 'Z'],
    ['5', 'S'],
    ['8', 'B']
  ];

  const map = {};
  confusionGroups.forEach(function (group) {
    const canonical = group[0];
    group.forEach(function (char) {
      map[char] = canonical;
    });
  });

  return compact
    .split('')
    .map(function (char) { return map[char] || char; })
    .join('');
}

function stringSimilarity(a, b) {
  const longer = a.length >= b.length ? a : b;
  const shorter = a.length >= b.length ? b : a;
  if (longer.length === 0) return 1.0;
  return (longer.length - editDistance(longer, shorter)) / longer.length;
}

function editDistance(a, b) {
  const dp = Array.from({ length: b.length + 1 }, function (_, i) { return i; });
  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1]
        ? dp[j - 1]
        : 1 + Math.min(dp[j], dp[j - 1], prev);
      prev = temp;
    }
  }
  return dp[b.length];
}
