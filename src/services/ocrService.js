/**
 * Accepts an image ID from LINE, fetches the image, sends it to Gemini 2.5 Flash-Lite,
 * and returns the detected plate text.
 * @param {string} imageId
 * @returns {string|null}
 */
function extractPlateFromImage(imageId) {
  const steps = [];
  const cachedResult = getCachedOcrResultByImageId(imageId);
  if (cachedResult) {
    LAST_OCR_STATUS = cachedResult.status || 'success';
    pushOcrDebugStep(steps, 'cache', 'hit status=' + LAST_OCR_STATUS);
    flushOcrDebugSummary(steps);
    return cachedResult.plateText;
  }
  try {
    LAST_OCR_STATUS = 'idle';
    if (!LINE_ACCESS_TOKEN || !GEMINI_API_KEY) {
      pushOcrDebugStep(steps, 'config', 'missing token or api key');
      flushOcrDebugSummary(steps);
      return null;
    }
    pushOcrDebugStep(steps, 'start', 'imageId=' + imageId);

    const imageBlob = fetchLineImageBlob(imageId, steps);
    if (!imageBlob) {
      flushOcrDebugSummary(steps);
      return null;
    }

    const imageHash = computeImageHash(imageBlob);
    pushOcrDebugStep(steps, 'hash', imageHash);
    const cachedByHash = getCachedOcrResultByHash(imageHash);
    if (cachedByHash) {
      LAST_OCR_STATUS = cachedByHash.status || 'success';
      cacheOcrResult(imageId, cachedByHash.plateText, LAST_OCR_STATUS, CACHE_TIME, imageHash);
      pushOcrDebugStep(steps, 'cache', 'hash_hit status=' + LAST_OCR_STATUS);
      flushOcrDebugSummary(steps);
      return cachedByHash.plateText;
    }

    const firstPass = requestPlateOcr(imageBlob, buildOcrPrompt(), undefined, steps);
    if (!firstPass || firstPass.toLowerCase() === 'null') {
      if (LAST_OCR_STATUS === 'idle') {
        LAST_OCR_STATUS = 'no_text';
      }
      pushOcrDebugStep(steps, 'result', 'ocr returned null');
      cacheOcrResult(imageId, null, LAST_OCR_STATUS, 600, imageHash);
      flushOcrDebugSummary(steps);
      return null;
    }

    const cleanedFirstPass = cleanPlateText(firstPass);
    pushOcrDebugStep(steps, 'clean', safeDebugValue(cleanedFirstPass));
    if (!cleanedFirstPass) {
      if (LAST_OCR_STATUS === 'idle') {
        LAST_OCR_STATUS = 'no_text';
      }
      pushOcrDebugStep(steps, 'result', 'cleanPlateText returned null');
      cacheOcrResult(imageId, null, LAST_OCR_STATUS, 600, imageHash);
      flushOcrDebugSummary(steps);
      return null;
    }

    LAST_OCR_STATUS = 'success';
    pushOcrDebugStep(steps, 'result', 'success=' + cleanedFirstPass);
    cacheOcrResult(imageId, cleanedFirstPass, LAST_OCR_STATUS, CACHE_TIME, imageHash);
    flushOcrDebugSummary(steps);
    return cleanedFirstPass;
  } catch (err) {
    LAST_OCR_STATUS = 'exception';
    console.error('extractPlateFromImage Error: ' + err.message);
    pushOcrDebugStep(steps, 'exception', err.message);
    flushOcrDebugSummary(steps);
    return null;
  }
}

function getCachedOcrResult(imageId) {
  if (!imageId) return null;

  const cached = CacheService.getScriptCache().get('ocr_' + imageId);
  if (!cached) return null;

  const parsed = JSON.parse(cached);
  return shouldCacheOcrResult(parsed.status) ? parsed : null;
}

function getCachedOcrResultByImageId(imageId) {
  return getCachedOcrResult(imageId ? 'image_' + imageId : null);
}

function getCachedOcrResultByHash(imageHash) {
  return getCachedOcrResult(imageHash ? 'hash_' + imageHash : null);
}

function cacheOcrResult(imageId, plateText, status, ttlSeconds, imageHash) {
  if (!shouldCacheOcrResult(status)) return;

  const payload = JSON.stringify({
    plateText: plateText || null,
    status: status || 'idle'
  });
  const cache = CacheService.getScriptCache();

  if (imageId) {
    cache.put('ocr_image_' + imageId, payload, ttlSeconds || CACHE_TIME);
  }

  if (imageHash) {
    cache.put('ocr_hash_' + imageHash, payload, ttlSeconds || CACHE_TIME);
  }
}

function shouldCacheOcrResult(status) {
  return status === 'success' || status === 'no_text';
}

function computeImageHash(imageBlob) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    imageBlob.getBytes()
  );

  return digest.map(function (byte) {
    const value = byte < 0 ? byte + 256 : byte;
    return ('0' + value.toString(16)).slice(-2);
  }).join('');
}

function fetchLineImageBlob(imageId, steps) {
  const imageResponse = fetchWithRetry(
    'https://api-data.line.me/v2/bot/message/' + imageId + '/content',
    {
      headers: { Authorization: 'Bearer ' + LINE_ACCESS_TOKEN }
    },
    {
      serviceName: 'LINE Content API',
      operation: 'fetch image ' + imageId
    }
  );

  if (imageResponse.getResponseCode() !== 200) {
    LAST_OCR_STATUS = 'line_error';
    console.error('LINE Content API Error: ' + imageResponse.getContentText());
    pushOcrDebugStep(steps, 'line', 'status=' + imageResponse.getResponseCode());
    return null;
  }

  const blob = imageResponse.getBlob();
  pushOcrDebugStep(steps, 'line', 'status=200 mime=' + (blob.getContentType() || 'unknown') + ' bytes=' + blob.getBytes().length);
  return blob;
}

function requestPlateOcr(imageBlob, promptText, maxOutputTokens, steps) {
  const response = fetchWithRetry(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=' + GEMINI_API_KEY,
    {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        contents: [{
          parts: [
            {
              inline_data: {
                mime_type: imageBlob.getContentType() || 'image/jpeg',
                data: Utilities.base64Encode(imageBlob.getBytes())
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
    },
    {
      serviceName: 'Gemini API',
      operation: 'ocr plate image'
    }
  );

  if (response.getResponseCode() === 429) {
    LAST_OCR_STATUS = 'gemini_rate_limit';
    console.error('Gemini API Rate Limit: ' + response.getContentText());
    pushOcrDebugStep(steps, 'gemini', 'status=429 rate_limit');
    return null;
  }

  pushOcrDebugStep(steps, 'gemini', 'status=' + response.getResponseCode());
  const json = JSON.parse(response.getContentText());
  if (json.error) {
    LAST_OCR_STATUS = classifyGeminiError(json.error);
    console.error('Gemini API Error: ' + JSON.stringify(json.error));
    pushOcrDebugStep(steps, 'gemini_error', truncateDebugText(JSON.stringify(json.error), 160));
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
  pushOcrDebugStep(steps, 'gemini_text', safeDebugValue(text));
  return text;
}

function buildOcrPrompt() {
  return 'อ่านเลขทะเบียนรถจากภาพนี้\n' +
    'ตอบเฉพาะเลขทะเบียนที่เห็น โดยไม่ต้องใส่ช่องว่าง\n' +
    'รูปแบบอาจเป็นเช่น กข1234, งล441, 3ขฮ8777, 1กข2345 หรือ 80-1234\n' +
    'ถ้ามีหลายป้าย ให้ตอบป้ายที่ชัดที่สุดเพียงป้ายเดียว\n' +
    'ถ้าไม่มีป้ายหรือมองไม่ออกจริงๆ ให้ตอบ null';
}

function classifyGeminiError(error) {
  const code = error && error.code;
  const status = error && error.status;
  const message = error && error.message ? error.message.toLowerCase() : '';

  if (code === 429 || status === 'RESOURCE_EXHAUSTED' || message.indexOf('quota') !== -1 || message.indexOf('rate') !== -1) {
    return 'gemini_rate_limit';
  }

  return 'gemini_error';
}

function cleanPlateText(rawText) {
  if (!rawText) return null;

  const original = rawText.trim()
    .replace(/["'`]/g, '')
    .replace(/[：:]/g, ' ')
    .replace(/\s+/g, ' ');
  const cleaned = original.replace(/[\s\-]/g, '');
  const cleanedUpper = cleaned.toUpperCase();

  const patterns = [
    /^[ก-ฮ]{1,3}\d{1,4}$/,
    /^\d{1,2}[ก-ฮ]{1,2}\d{4}$/,
    /^\d{1,2}\d{4}$/
  ];

  if (/^\d{1,2}-\d{4}$/.test(original)) return original;
  if (patterns.some(function (pattern) { return pattern.test(cleanedUpper); })) return cleanedUpper;

  const extracted = cleanedUpper.match(/[ก-ฮ]{1,3}\d{1,4}|\d{1,2}[ก-ฮ]{1,2}\d{4}|\d{1,2}\d{4}/);
  if (extracted) return extracted[0];

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
    const candidate = tokens[j].replace(/[\s\-]/g, '');
    if (patterns.some(function (pattern) { return pattern.test(candidate); })) {
      return candidate;
    }
  }

  return null;
}

function compactPlateText(text) {
  return (text || '').toString().replace(/\s/g, '');
}

function normalizePlateForComparison(text) {
  if (!text) return '';

  const compact = compactPlateText(text);
  const confusionGroups = getPlateCharacterConfusionGroups();

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

function resolvePlateFromOcr(ocrText) {
  if (!ocrText) return null;

  const exactMatch = findExactPlateMatch(ocrText);
  if (exactMatch) return exactMatch;

  const generatedMatch = findPlateByGeneratedCandidates(ocrText);
  if (generatedMatch) return generatedMatch;

  const structuralMatch = findPlateByStructureHeuristics(ocrText);
  if (structuralMatch) return structuralMatch;

  return fuzzySearchPlate(ocrText);
}

function findExactPlateMatch(text) {
  const target = compactPlateText(text);
  if (!target) return null;

  const data = getCachedSheetData('Vehicles');
  const match = data.slice(1).find(function (row) {
    return compactPlateText(row[COL_VEHICLE.PLATE]) === target;
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
  const confusionMap = {};
  getPlateCharacterConfusionGroups().forEach(function (group) {
    group.forEach(function (char) {
      confusionMap[char] = group.slice();
    });
  });
  return confusionMap;
}

function getPlateCharacterConfusionGroups() {
  return [
    ['ฮ', 'อ', 'ฬ'],
    ['ข', 'ช'],
    ['ง', 'จ', 'ฉ', 'ม'],
    ['บ', '6', '8'],
    ['0', 'O', 'D', 'Q'],
    ['1', 'I', 'l'],
    ['2', 'Z'],
    ['5', 'S'],
    ['8', 'B']
  ];
}

function findPlateByStructureHeuristics(ocrText) {
  const target = parsePlateComponents(ocrText);
  if (!target) return null;

  const normalizedLetters = normalizePlateForComparison(target.letters);
  if (!normalizedLetters || !target.digits) return null;

  const matches = getCachedSheetData('Vehicles')
    .slice(1)
    .map(function (row) {
      const plate = compactPlateText(row[COL_VEHICLE.PLATE]);
      const parsed = parsePlateComponents(plate);
      if (!parsed) return null;
      if (parsed.format !== target.format) return null;
      if (parsed.prefix !== target.prefix) return null;
      if (parsed.letters.length !== target.letters.length) return null;
      if (parsed.digits !== target.digits) return null;

      return {
        plate: plate,
        score: stringSimilarity(normalizedLetters, normalizePlateForComparison(parsed.letters))
      };
    })
    .filter(function (item) {
      return item && item.score >= 0.85;
    })
    .sort(function (a, b) {
      return b.score - a.score;
    });

  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0].plate;
  if (matches[0].score >= matches[1].score + 0.1) return matches[0].plate;
  return null;
}

function parsePlateComponents(text) {
  const compact = compactPlateText(text).toUpperCase();
  if (!compact) return null;

  let match = compact.match(/^([ก-ฮ]{1,3})(\d{1,4})$/);
  if (match) {
    return {
      format: 'letters_digits',
      prefix: '',
      letters: match[1],
      digits: match[2]
    };
  }

  match = compact.match(/^(\d{1,2})([ก-ฮ]{1,2})(\d{4})$/);
  if (match) {
    return {
      format: 'prefix_letters_digits',
      prefix: match[1],
      letters: match[2],
      digits: match[3]
    };
  }

  match = compact.match(/^(\d{1,2})-(\d{4})$/);
  if (match) {
    return {
      format: 'dash_digits',
      prefix: match[1],
      letters: '',
      digits: match[2]
    };
  }

  return null;
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

function stringSimilarity(a, b) {
  const longer = a.length >= b.length ? a : b;
  const shorter = a.length >= b.length ? b : a;
  if (longer.length === 0) return 1.0;
  return (longer.length - editDistance(longer, shorter)) / longer.length;
}

function editDistance(a, b) {
  const dp = Array.from({ length: b.length + 1 }, function (_, i) { return i; });
  for (let i = 1; i <= a.length; i++) {
    let prevDiagonal = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const previousRow = dp[j];
      dp[j] = a[i - 1] === b[j - 1]
        ? prevDiagonal
        : 1 + Math.min(dp[j], dp[j - 1], prevDiagonal);
      prevDiagonal = previousRow;
    }
  }
  return dp[b.length];
}

function pushOcrDebugStep(steps, label, value) {
  if (!steps) return;
  steps.push(label + '=' + truncateDebugText(value, 180));
}

function flushOcrDebugSummary(steps) {
  if (!steps || steps.length === 0) return;
  debugToLine('[OCR DEBUG]\n' + steps.join('\n'));
}

function safeDebugValue(value) {
  if (value === null || value === undefined) return 'null';
  return String(value);
}

function truncateDebugText(text, maxLen) {
  const value = safeDebugValue(text);
  return value.length > maxLen ? value.substring(0, maxLen) + '...' : value;
}
