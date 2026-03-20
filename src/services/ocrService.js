/**
 * รับ imageId จาก LINE → ดึงรูป → ส่ง Gemini 2.5 Flash-Lite → คืนค่าทะเบียน
 * @param {string} imageId
 * @returns {string|null}
 */
function extractPlateFromImage(imageId) {
  try {
    if (!LINE_ACCESS_TOKEN || !GEMINI_API_KEY) return null;

    const imageResponse = UrlFetchApp.fetch(
      'https://api-data.line.me/v2/bot/message/' + imageId + '/content',
      {
        headers: { 'Authorization': 'Bearer ' + LINE_ACCESS_TOKEN },
        muteHttpExceptions: true
      }
    );

    if (imageResponse.getResponseCode() !== 200) {
      console.error('LINE Content API Error: ' + imageResponse.getContentText());
      return null;
    }

    const imageBlob = imageResponse.getBlob();
    const base64 = Utilities.base64Encode(imageBlob.getBytes());

    const response = UrlFetchApp.fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=' + GEMINI_API_KEY,
      {
        method: 'post',
        contentType: 'application/json',
        muteHttpExceptions: true,
        payload: JSON.stringify({
          contents: [{
            parts: [
              {
                inline_data: {
                  mime_type: imageBlob.getContentType() || 'image/jpeg',
                  data: base64
                }
              },
              {
                text: 'ดูรูปนี้แล้วหาป้ายทะเบียนรถ\n' +
                      'ตอบแค่ตัวอักษรและตัวเลขบนป้ายทะเบียนเท่านั้น ไม่ต้องมีช่องว่าง เช่น "กข1234" หรือ "1กข2345"\n' +
                      'ถ้ามีหลายป้าย ให้ตอบป้ายที่เห็นชัดที่สุดเพียงป้ายเดียว\n' +
                      'ถ้าไม่มีป้ายทะเบียนหรืออ่านไม่ได้เลย ตอบว่า "null"\n' +
                      'ห้ามอธิบาย ห้ามใส่ข้อความอื่นใด'
              }
            ]
          }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 30
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

    return cleanPlateText(text);
  } catch (err) {
    console.error('extractPlateFromImage Error: ' + err.message);
    return null;
  }
}

function cleanPlateText(rawText) {
  if (!rawText) return null;

  const original = rawText.trim();
  const cleaned = original.replace(/[\s\-]/g, '');

  const patterns = [
    /^[ก-ฮ]{1,3}\d{1,4}$/,
    /^\d{1,2}[ก-ฮ]{1,2}\d{4}$/,
    /^\d{1,2}\d{4}$/
  ];

  if (/^\d{1,2}-\d{4}$/.test(original)) return original;
  if (patterns.some(p => p.test(cleaned))) return cleaned;

  const extracted = cleaned.match(/[ก-ฮ]{1,3}\d{1,4}|\d{1,2}[ก-ฮ]{1,2}\d{4}|\d{1,2}\d{4}/);
  return extracted ? extracted[0] : null;
}

function fuzzySearchPlate(ocrText) {
  if (!ocrText) return null;

  const data = getCachedSheetData('Vehicles');
  const normalizedOcr = normalizePlateForComparison(ocrText);
  const plates = data.slice(1).map(row => {
    const plate = row[COL_VEHICLE.PLATE].toString().replace(/\s/g, '');
    return {
      plate: plate,
      normalized: normalizePlateForComparison(plate)
    };
  });

  const best = plates
    .map(item => ({
      plate: item.plate,
      score: stringSimilarity(normalizedOcr, item.normalized)
    }))
    .filter(r => r.score >= 0.75)
    .sort((a, b) => b.score - a.score)[0];

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
  const target = (text || '').replace(/\s/g, '');
  if (!target) return null;

  const data = getCachedSheetData('Vehicles');
  const match = data.slice(1).find(row =>
    row[COL_VEHICLE.PLATE].toString().replace(/\s/g, '') === target
  );

  return match ? match[COL_VEHICLE.PLATE].toString().replace(/\s/g, '') : null;
}

function findPlateByGeneratedCandidates(ocrText) {
  const target = (ocrText || '').replace(/\s/g, '');
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

  data.slice(1).forEach(row => {
    const plate = row[COL_VEHICLE.PLATE].toString().replace(/\s/g, '');
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

  const compact = text.replace(/[\s\-]/g, '');
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
  confusionGroups.forEach(group => {
    const canonical = group[0];
    group.forEach(char => {
      map[char] = canonical;
    });
  });

  return compact
    .split('')
    .map(char => map[char] || char)
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
