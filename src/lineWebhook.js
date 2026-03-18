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
    
    // ✅ เช็คทั้ง 2 แบบ
    // แบบที่ 1: ตรงกันเป๊ะ เช่น 171/1 = 171/1
    // แบบที่ 2: อยู่ในช่วง เช่น 171/160 อยู่ใน 171/160-164
    if (house === q || house.includes(q)) {
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
      return values[i][0].toString().trim(); // คอลัมน์ name
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

function getVehicleData() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('vehicles');
  
  if (cached) {
    return JSON.parse(cached); // ดึงจาก Cache เร็วมาก
  }
  
  // ถ้าไม่มี Cache ค่อยเปิด Sheet
  var sheet  = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Vehicles');
  var values = sheet.getDataRange().getValues();
  
  // เก็บ Cache ไว้ 10 นาที
  cache.put('vehicles', JSON.stringify(values), 600);
  return values;
}

function keepAlive() {
  // แค่รัน script ให้ตื่นอยู่เสมอ
  Logger.log('keep alive: ' + new Date());
}