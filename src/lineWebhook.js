// ============================
// ตั้งค่าตรงนี้ก่อนใช้งาน
// ============================
var props = PropertiesService.getScriptProperties();
var LINE_ACCESS_TOKEN  = props.getProperty('LINE_ACCESS_TOKEN');
var LINE_CHANNEL_SECRET = props.getProperty('LINE_CHANNEL_SECRET');

// ============================
// รับข้อความจาก LINE
// ============================
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var event = data.events[0];

    // ตอนแอด Bot → ส่ง User ID กลับอัตโนมัติ
    if (event.type === 'follow') {
      replyToLine(event.replyToken,
        '👋 สวัสดีครับ!\n\n' +
        '📋 User ID ของคุณคือ:\n' +
        event.source.userId + '\n\n' +
        'กรุณาแจ้ง ID นี้กับนิติบุคคลเพื่อเปิดสิทธิ์ใช้งานครับ'
      );
      return;
    }

    if (!event || event.type !== 'message') return;

    var userId     = event.source.userId;
    var replyToken = event.replyToken;

    // ตรวจสอบสิทธิ์
    if (!isAuthorized(userId)) {
      replyToLine(replyToken, '🚫 ไม่มีสิทธิ์เข้าถึงระบบ\nกรุณาติดต่อนิติบุคคล');
      return;
    }

    var result = '';

    if (event.message.type === 'text') {
      // ค้นหาจากข้อความ
      var query = event.message.text.trim();
      if (query.indexOf('/') !== -1) {
        result = searchByHouse(query);
      } else {
        result = searchByPlate(query);
      }
      writeLog(userId, query, result.found ? 'พบข้อมูล' : 'ไม่พบข้อมูล');
      replyToLine(replyToken, result.message);

    } else if (event.message.type === 'image') {
      replyToLine(replyToken, '🔍 กำลังอ่านทะเบียน รอสักครู่...');

      var imageUrl = 'https://api-data.line.me/v2/bot/message/' + event.message.id + '/content';
      var ocr      = ocrLicensePlate(imageUrl);

      var resultMsg = '';
      if (ocr.plate) {
        result    = searchByPlate(ocr.plate);
        resultMsg = '📷 อ่านทะเบียนได้: ' + ocr.plate + '\n\n' + result.message;
      } else {
        result    = { found: false };
        // ส่ง error กลับมาให้เห็นเลย
        resultMsg = '❌ OCR Error:\n' + ocr.error;
      }

      writeLog(userId, '[รูปภาพ]', result.found ? 'พบข้อมูล' : 'ไม่พบข้อมูล');
      pushToLine(userId, resultMsg);
    }

  } catch(err) {
    Logger.log(err);
  }
}

// ============================
// ค้นหาจากทะเบียนรถ
// ============================
function searchByPlate(query) {
  var sheet   = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Vehicles');
  var values  = sheet.getDataRange().getValues();
  var q       = query.replace(/\s/g, '').toLowerCase();
  var results = [];

  for (var i = 1; i < values.length; i++) {
    var plate = values[i][0].toString().replace(/\s/g, '').toLowerCase();
    if (plate.includes(q)) {
      results.push(
        '🚗 ' + values[i][0] + '\n' +
        '    ' + values[i][1] + ' ' + values[i][2] + ' | สี' + values[i][3] + '\n' +
        '🏠 บ้านเลขที่: ' + values[i][4]
      );
    }
  }

  if (results.length > 0) {
    var header = results.length > 1
      ? '✅ พบข้อมูล ' + results.length + ' รายการ\n\n'
      : '✅ พบข้อมูลในระบบ\n\n';
    return { found: true, message: header + results.join('\n\n') };
  }

  return { found: false, message: '❌ ไม่พบทะเบียนนี้ในระบบ\nกรุณาแลกบัตรตามขั้นตอนปกติ' };
}

// ============================
// ค้นหาจากบ้านเลขที่
// ============================
function searchByHouse(query) {
  var sheet   = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Vehicles');
  var values  = sheet.getDataRange().getValues();
  var q       = query.trim();
  var results = [];

  for (var i = 1; i < values.length; i++) {
    var house = values[i][4].toString().trim();
    var match = false;

    if (house === q) {
      // แบบที่ 1: ตรงเป๊ะ เช่น 171/1 = 171/1
      match = true;

    } else if (house.indexOf('-') !== -1) {
      // แบบที่ 2: เป็น range เช่น 171/160-164
      var prefix    = house.split('/')[0];
      var rangePart = house.split('/')[1];
      var rangeNums = rangePart.split('-');
      var qPrefix   = q.split('/')[0];
      var qNum      = parseInt(q.split('/')[1]);
      var rangeMin  = parseInt(rangeNums[0]);
      var rangeMax  = parseInt(rangeNums[1]);

      if (qPrefix === prefix && qNum >= rangeMin && qNum <= rangeMax) {
        match = true;
      }
    }

    if (match) {
      results.push(
        '🚗 ' + values[i][0] + '\n' +
        '    ' + values[i][1] + ' ' + values[i][2] + ' | สี' + values[i][3]
      );
    }
  }

  if (results.length > 0) {
    var msg = '🏠 บ้านเลขที่ ' + query + ' พบรถ ' + results.length + ' คัน\n\n' +
              results.join('\n\n');
    return { found: true, message: msg };
  }

  return { found: false, message: '❌ ไม่พบข้อมูลบ้านเลขที่นี้ในระบบ' };
}

// ============================
// ตรวจสอบสิทธิ์จาก Sheet: Staff
// ============================
function isAuthorized(userId) {
  var sheet  = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Staff');
  var values = sheet.getDataRange().getValues();

  for (var i = 1; i < values.length; i++) {
    if (values[i][1].toString().trim() === userId &&
        values[i][2].toString().trim().toLowerCase() === 'active') {
      return true;
    }
  }
  return false;
}

// ============================
// ดึงชื่อ LINE Profile
// ============================
function getLineDisplayName(userId) {
  try {
    var response = UrlFetchApp.fetch(
      'https://api.line.me/v2/bot/profile/' + userId, {
      method: 'get',
      headers: {
        'Authorization': 'Bearer ' + LINE_ACCESS_TOKEN
      }
    });
    var profile = JSON.parse(response.getContentText());
    return profile.displayName || userId;
  } catch(err) {
    return userId; // ถ้าดึงไม่ได้ให้ใช้ userId แทน
  }
}

// ============================
// ดึงชื่อจาก Sheet Staff
// ============================
function getStaffName(userId) {
  var sheet  = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Staff');
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (values[i][1].toString().trim() === userId) {
      return values[i][0].toString().trim();
    }
  }
  return '-';
}

// ============================
// บันทึก Log
// ============================
function writeLog(userId, query, result) {
  var sheet     = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Log');
  var staffName = getStaffName(userId);
  var lineName  = getLineDisplayName(userId);
  sheet.appendRow([new Date(), userId, staffName, lineName, query, result]);
}

// ============================
// ส่งข้อความกลับ LINE (Reply)
// ============================
function replyToLine(replyToken, message) {
  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + LINE_ACCESS_TOKEN
    },
    payload: JSON.stringify({
      replyToken: replyToken,
      messages: [{ type: 'text', text: message }]
    })
  });
}

// ============================
// ส่งข้อความ LINE (Push)
// ============================
function pushToLine(userId, message) {
  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + LINE_ACCESS_TOKEN
    },
    payload: JSON.stringify({
      to: userId,
      messages: [{ type: 'text', text: message }]
    })
  });
}

// ============================
// OCR ทะเบียนรถด้วย Gemini
// ============================
function ocrLicensePlate(imageUrl) {
  try {
    var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    if (!apiKey) return { plate: null, error: 'ไม่พบ GEMINI_API_KEY' };

    var imageResponse = UrlFetchApp.fetch(imageUrl, {
      headers: { 'Authorization': 'Bearer ' + LINE_ACCESS_TOKEN }
    });
    if (imageResponse.getResponseCode() !== 200) {
      return { plate: null, error: 'ดึงรูปไม่ได้ code: ' + imageResponse.getResponseCode() };
    }

    var imageBase64 = Utilities.base64Encode(imageResponse.getContent());
    var mimeType    = imageResponse.getHeaders()['Content-Type'] || 'image/jpeg';

    var response = UrlFetchApp.fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: mimeType, data: imageBase64 } },
            { text: 'อ่านเลขทะเบียนรถในรูปนี้ ตอบแค่เลขทะเบียนเท่านั้น ไม่ต้องมีคำอธิบาย เช่น กข1234 หรือ 1กข234' }
          ]
        }]
      })
    });

    var geminiResult = JSON.parse(response.getContentText());
    var plate = geminiResult.candidates[0].content.parts[0].text.trim();
    return { plate: plate, error: null };

  } catch(err) {
    return { plate: null, error: err.toString() };
  }
}

// ============================
// Cache ข้อมูลรถ
// ============================
function getVehicleData() {
  var cache  = CacheService.getScriptCache();
  var cached = cache.get('vehicles');

  if (cached) {
    return JSON.parse(cached);
  }

  var sheet  = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Vehicles');
  var values = sheet.getDataRange().getValues();
  cache.put('vehicles', JSON.stringify(values), 600);
  return values;
}

// ============================
// Keep Alive
// ============================
function keepAlive() {
  Logger.log('keep alive: ' + new Date());
}