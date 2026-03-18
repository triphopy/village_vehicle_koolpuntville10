// ============================
// ตั้งค่าตรงนี้ก่อนใช้งาน
// ============================
var props = PropertiesService.getScriptProperties();
var LINE_ACCESS_TOKEN   = props.getProperty('LINE_ACCESS_TOKEN');
var LINE_CHANNEL_SECRET = props.getProperty('LINE_CHANNEL_SECRET');

// ============================
// รับข้อความจาก LINE
// ============================
function doPost(e) {
  try {
    var data  = JSON.parse(e.postData.contents);
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
    var staff = getStaff(userId);
    if (!staff) {
      replyToLine(replyToken, '🚫 ไม่มีสิทธิ์เข้าถึงระบบ\nกรุณาติดต่อนิติบุคคล');
      return;
    }

    // Admin Commands
    if (query.startsWith('/') && staff.role === 'admin') {
      var result = handleAdminCommand(query, userId);
      replyToLine(replyToken, result);
      return;
    }

    // ถ้าพิมพ์ / แต่ไม่ใช่ admin
    if (query.startsWith('/add') || query.startsWith('/remove') || query.startsWith('/list')) {
      replyToLine(replyToken, '🚫 คำสั่งนี้สำหรับ Admin เท่านั้น');
      return;
    }

    // ค้นหาปกติ
    var result = '';
    if (query.indexOf('/') !== -1) {
      result = searchByHouse(query);
    } else {
      result = searchByPlate(query);
    }

    writeLog(userId, query, result.found ? 'พบข้อมูล' : 'ไม่พบข้อมูล');
    replyToLine(replyToken, result.message);

  } catch(err) {
    Logger.log(err);
  }
}

// ============================
// Admin Commands
// ============================
function handleAdminCommand(query, adminId) {
  var parts = query.split(' ');
  var cmd   = parts[0].toLowerCase();

  // /add <userId> <ชื่อ> <role>
  // เช่น /add U578c3f... สมชาย staff
  if (cmd === '/add') {
    if (parts.length < 4) return '❌ รูปแบบไม่ถูกต้อง\nใช้: /add <userId> <ชื่อ> <role>\nเช่น: /add U578c3f... สมชาย staff';
    var newId   = parts[1].trim();
    var newName = parts[2].trim();
    var newRole = parts[3].trim().toLowerCase();

    if (newRole !== 'admin' && newRole !== 'staff') {
      return '❌ role ต้องเป็น admin หรือ staff เท่านั้น';
    }

    var sheet  = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Staff');
    var values = sheet.getDataRange().getValues();
    for (var i = 1; i < values.length; i++) {
      if (values[i][1].toString().trim() === newId) {
        return '⚠️ User ID นี้มีในระบบแล้ว';
      }
    }
    sheet.appendRow([newName, newId, 'active', newRole]);
    clearStaffCache(newId);
    return '✅ เพิ่ม ' + newName + ' (' + newRole + ') สำเร็จ';
  }

  // /remove <userId>
  if (cmd === '/remove') {
    if (parts.length < 2) return '❌ รูปแบบไม่ถูกต้อง\nใช้: /remove <userId>';
    var removeId = parts[1].trim();
    var sheet    = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Staff');
    var values   = sheet.getDataRange().getValues();
    for (var i = 1; i < values.length; i++) {
      if (values[i][1].toString().trim() === removeId) {
        sheet.deleteRow(i + 1);
        clearStaffCache(removeId);
        return '✅ ลบ ' + values[i][0] + ' ออกจากระบบแล้ว';
      }
    }
    return '❌ ไม่พบ User ID นี้ในระบบ';
  }

  // /list
  if (cmd === '/list') {
    var sheet  = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Staff');
    var values = sheet.getDataRange().getValues();
    var list   = ['👥 รายชื่อผู้ใช้งานทั้งหมด\n'];
    for (var i = 1; i < values.length; i++) {
      if (values[i][0]) {
        var icon = values[i][3] === 'admin' ? '👑' : '👤';
        list.push(icon + ' ' + values[i][0] + ' (' + values[i][3] + ') - ' + values[i][2]);
      }
    }
    return list.join('\n');
  }

  // /status <userId>
  if (cmd === '/status') {
    if (parts.length < 2) return '❌ รูปแบบไม่ถูกต้อง\nใช้: /status <userId>';
    var checkId = parts[1].trim();
    var staff   = getStaff(checkId);
    if (!staff) return '❌ ไม่พบ User ID นี้ในระบบ';
    return '📋 ' + staff.name + '\nRole: ' + staff.role + '\nStatus: ' + staff.status;
  }

  return '❌ ไม่รู้จักคำสั่งนี้\nคำสั่งที่ใช้ได้: /add /remove /list /status';
}

// ============================
// ดึงข้อมูล Staff (พร้อม Cache)
// ============================
function getStaff(userId) {
  var cache  = CacheService.getScriptCache();
  var cached = cache.get('staff_' + userId);
  if (cached) {
    var data = JSON.parse(cached);
    return data.found ? data : null;
  }

  var sheet  = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Staff');
  var values = sheet.getDataRange().getValues();

  for (var i = 1; i < values.length; i++) {
    if (values[i][1].toString().trim() === userId &&
        values[i][2].toString().trim().toLowerCase() === 'active') {
      var staff = {
        found:  true,
        name:   values[i][0].toString().trim(),
        userId: userId,
        status: values[i][2].toString().trim(),
        role:   values[i][3].toString().trim().toLowerCase() || 'staff'
      };
      cache.put('staff_' + userId, JSON.stringify(staff), 3600);
      return staff;
    }
  }

  cache.put('staff_' + userId, JSON.stringify({ found: false }), 300);
  return null;
}

// ============================
// ล้าง Staff Cache
// ============================
function clearStaffCache(userId) {
  var cache = CacheService.getScriptCache();
  cache.remove('staff_' + userId);
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
      match = true;
    } else if (house.indexOf('-') !== -1) {
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
// บันทึก Log
// ============================
function writeLog(userId, query, result) {
  var sheet     = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Log');
  var staff     = getStaff(userId);
  var staffName = staff ? staff.name : '-';
  var lineName  = getLineDisplayName(userId);
  sheet.appendRow([new Date(), userId, staffName, lineName, query, result]);
}

// ============================
// ดึงชื่อ LINE Profile (พร้อม Cache)
// ============================
function getLineDisplayName(userId) {
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
    cache.put('line_name_' + userId, displayName, 3600);
    return displayName;
  } catch(err) {
    return userId;
  }
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
  var cache  = CacheService.getScriptCache();
  var cached = cache.get('vehicles');
  if (cached) return JSON.parse(cached);

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