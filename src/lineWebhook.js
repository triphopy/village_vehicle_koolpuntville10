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

    if (!event || event.type !== 'message' || event.message.type !== 'text') return;

    var userId     = event.source.userId;
    var replyToken = event.replyToken;
    var query      = event.message.text.trim();

    // ตรวจสอบสิทธิ์
    if (!isAuthorized(userId)) {
      replyToLine(replyToken, '🚫 ไม่มีสิทธิ์เข้าถึงระบบ\nกรุณาติดต่อนิติบุคคล');
      return;
    }

    var result = '';

    // แยกประเภทการค้นหา: มี "/" = บ้านเลขที่, อื่นๆ = ทะเบียน
    if (query.indexOf('/') !== -1) {
      result = searchByHouse(query);
    } else {
      result = searchByPlate(query);
    }

    // บันทึก Log
    writeLog(userId, query, result.found ? 'พบข้อมูล' : 'ไม่พบข้อมูล');

    replyToLine(replyToken, result.message);

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
  var cache  = CacheService.getScriptCache();
  var cached = cache.get('auth_' + userId);
  if (cached) return cached === 'true';

  var sheet  = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Staff');
  var values = sheet.getDataRange().getValues();

  for (var i = 1; i < values.length; i++) {
    if (values[i][1].toString().trim() === userId &&
        values[i][2].toString().trim().toLowerCase() === 'active') {
      cache.put('auth_' + userId, 'true', 3600);
      return true;
    }
  }
  cache.put('auth_' + userId, 'false', 3600);
  return false;
}

// ============================
// ดึงชื่อ LINE Profile
// ============================
function getLineDisplayName(userId) {
  // เช็ค Cache ก่อน
  var cache  = CacheService.getScriptCache();
  var cached = cache.get('line_name_' + userId);
  if (cached) return cached;

  try {
    var response = UrlFetchApp.fetch(
      'https://api.line.me/v2/bot/profile/' + userId, {
      method: 'get',
      headers: { 'Authorization': 'Bearer ' + LINE_ACCESS_TOKEN }
    });
    var profile     = JSON.parse(response.getContentText());
    var displayName = profile.displayName || userId;

    // Cache ชื่อไว้ 1 ชั่วโมง
    cache.put('line_name_' + userId, displayName, 3600);
    return displayName;

  } catch(err) {
    return userId;
  }
}

// ============================
// ดึงชื่อจาก Sheet Staff
// ============================
function getStaffName(userId) {
  // เช็ค Cache ก่อน
  var cache  = CacheService.getScriptCache();
  var cached = cache.get('staff_name_' + userId);
  if (cached) return cached;

  var sheet  = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Staff');
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (values[i][1].toString().trim() === userId) {
      var name = values[i][0].toString().trim();
      // Cache ชื่อไว้ 1 ชั่วโมง
      cache.put('staff_name_' + userId, name, 3600);
      return name;
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
// ส่งข้อความกลับ LINE
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
// Cache ข้อมูลรถ
// ============================
function getVehicleData() {
  var cache      = CacheService.getScriptCache();
  var chunkSize  = 50; // เก็บครั้งละ 50 แถว
  var cached0    = cache.get('vehicles_0');

  if (cached0) {
    // ดึงทุก chunk มารวมกัน
    var all = [];
    var i   = 0;
    while (true) {
      var chunk = cache.get('vehicles_' + i);
      if (!chunk) break;
      all = all.concat(JSON.parse(chunk));
      i++;
    }
    return all;
  }

  // ถ้าไม่มี Cache ค่อยเปิด Sheet แล้วแบ่ง chunk
  var sheet  = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Vehicles');
  var values = sheet.getDataRange().getValues();

  for (var i = 0; i < values.length; i += chunkSize) {
    var chunk = values.slice(i, i + chunkSize);
    cache.put('vehicles_' + (i / chunkSize), JSON.stringify(chunk), 600);
  }

  return values;
}

// ============================
// Keep Alive
// ============================
function keepAlive() {
  // แค่รัน script ให้ตื่นอยู่เสมอ
  Logger.log('keep alive: ' + new Date());
}

// ============================
// Auto Delete Log เกิน 90 วัน
// ============================
var LOG_RETENTION_DAYS = 1;

function deleteOldLogs() {
  var sheet  = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Log');
  var data   = sheet.getDataRange().getValues();
  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - LOG_RETENTION_DAYS);

  var toKeep = [data[0]]; // เก็บ header ไว้เสมอ

  for (var i = 1; i < data.length; i++) {
    var logDate = new Date(data[i][0]); // คอลัมน์แรก = timestamp
    if (logDate >= cutoff) {
      toKeep.push(data[i]);
    }
  }

  var deleted = data.length - toKeep.length;

  // เขียนกลับ Sheet
  sheet.clearContents();
  sheet.getRange(1, 1, toKeep.length, toKeep[0].length)
       .setValues(toKeep);

  Logger.log('Deleted: ' + deleted + ' rows | Remaining: ' + (toKeep.length - 1) + ' rows');
}