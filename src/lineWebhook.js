/**
 * 🏢 ระบบบริหารจัดการยานพาหนะและพนักงานนิติ (Fully Optimized Version)
 * สำหรับโปรเจกต์ Google Apps Script + LINE Bot
 */

// ============================
// 1. CONFIGURATION (เรียกใช้ Properties Service)
// ============================
const props = PropertiesService.getScriptProperties();
const LINE_ACCESS_TOKEN  = props.getProperty('LINE_ACCESS_TOKEN');
const RETENTION_DAYS     = Number(props.getProperty('LOG_RETENTION_DAYS')) || 30;
const CACHE_TIME         = 3600; // 1 ชั่วโมง

// ============================
// 2. MAIN ENTRY POINT (doPost)
// ============================
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (!data.events) return;

    // รองรับหลาย Event พร้อมกันด้วย forEach
    data.events.forEach(event => {
      const userId = event.source.userId;
      const replyToken = event.replyToken;

      // เคสแอด Bot ใหม่
      if (event.type === 'follow') {
        return replyToLine(replyToken, `👋 สวัสดีครับ!\n\n📋 User ID ของคุณคือ:\n${userId}\n\nกรุณาแจ้ง ID นี้กับนิติบุคคลครับ`);
      }

      // กรองเฉพาะข้อความตัวอักษร
      if (event.type !== 'message' || event.message.type !== 'text') return;
      const query = event.message.text.trim();

      // Track ข้อมูลคนพิมพ์ (Visitors) และดึงชื่อ LINE
      const lineName = getLineDisplayName(userId);
      trackUser(userId, lineName);

      // ตรวจสอบสิทธิ์ Staff
      const staff = getStaff(userId);
      if (!staff) {
        return replyToLine(replyToken, '🚫 ไม่มีสิทธิ์เข้าถึงระบบ\nกรุณาติดต่อนิติบุคคล');
      }

      // แยกจัดการ Command (Admin) หรือ Search (General)
      let result;
      if (query.startsWith('/')) {
        if (staff.role === 'admin') {
          result = { message: handleAdminCommand(query, userId), found: true };
        } else {
          result = { message: '🚫 คำสั่งนี้สำหรับ Admin เท่านั้น', found: false };
        }
      } else {
        // เลือกระบบค้นหา (ถ้ามี / ให้หาจากบ้านเลขที่)
        result = (query.indexOf('/') !== -1) ? searchByHouse(query) : searchByPlate(query);
      }

      // บันทึก Log และตอบกลับ
      writeLog(userId, staff.name, lineName, query, result.found ? 'พบข้อมูล' : 'ไม่พบข้อมูล');
      replyToLine(replyToken, result.message);
    });
  } catch (err) {
    console.error('doPost Error: ' + err.stack);
  }
}

// ============================
// 3. ADMIN COMMAND CENTER
// ============================
function handleAdminCommand(query, adminId) {
  const parts = query.split(/\s+/);
  const cmd = parts[0].toLowerCase();

  switch (cmd) {
    case '/add':
      if (parts.length < 4) return '❌ รูปแบบ: /add <ID> <ชื่อ> <role>';
      return addStaff(parts[1], parts[2], parts[3]);

    case '/list':
      return getStaffList();

    case '/visitors':
      return getVisitorsReport();

    case '/clearcache':
      CacheService.getScriptCache().removeAll(['vehicles', 'staff_list']);
      return '✅ ล้าง Cache สำเร็จ';

    case '/help':
      return '📋 คำสั่ง Admin:\n/add <ID> <ชื่อ> <role>\n/list (ดู Staff)\n/visitors (ดูผู้ติดต่อ)\n/clearcache\n/status <ID>';

    case '/status':
      const targetStaff = getStaff(parts[1]);
      return targetStaff ? `📋 ${targetStaff.name}\nRole: ${targetStaff.role}` : '❌ ไม่พบข้อมูล';

    default:
      return '❌ ไม่รู้จักคำสั่งนี้ พิมพ์ /help เพื่อดูทั้งหมด';
  }
}

// ============================
// 4. SEARCH ENGINE (Optimized)
// ============================
function searchByPlate(query) {
  const data = getCachedSheetData('Vehicles');
  const q = query.replace(/\s/g, '').toLowerCase();
  
  const matches = data.slice(1).filter(row => 
    row[0].toString().replace(/\s/g, '').toLowerCase().includes(q)
  );

  if (matches.length === 0) return { found: false, message: '❌ ไม่พบข้อมูลทะเบียนนี้' };

  const msg = matches.map(row => 
    `🚗 ${row[0]}\n   ${row[1]} ${row[2]} | สี${row[3]}\n🏠 บ้าน: ${row[4]}\n${getStatusLabel(row[6])}`
  ).join('\n\n');

  return { found: true, message: `✅ พบ ${matches.length} รายการ\n\n${msg}` };
}

function searchByHouse(query) {
  const data = getCachedSheetData('Vehicles');
  const q = query.trim();
  
  const matches = data.slice(1).filter(row => {
    const house = row[4].toString().trim();
    if (house === q) return true;
    // รองรับรูปแบบบ้านเลขที่ช่วง (เช่น 123/1-10)
    if (house.includes('-') && q.includes('/')) {
      const [prefix, range] = house.split('/');
      const [qPrefix, qNumStr] = q.split('/');
      const [min, max] = range.split('-').map(Number);
      return prefix === qPrefix && Number(qNumStr) >= min && Number(qNumStr) <= max;
    }
    return false;
  });

  if (matches.length === 0) return { found: false, message: '❌ ไม่พบข้อมูลบ้านเลขที่นี้' };

  const msg = matches.map(row => `🚗 ${row[0]} | ${row[1]}\n${getStatusLabel(row[6])}`).join('\n\n');
  return { found: true, message: `🏠 บ้านเลขที่ ${q} พบรถ ${matches.length} คัน\n\n${msg}` };
}

// ============================
// 5. DATA ACCESS & CACHING
// ============================
function getCachedSheetData(sheetName) {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(sheetName.toLowerCase());
  if (cached) return JSON.parse(cached);

  const values = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName).getDataRange().getValues();
  cache.put(sheetName.toLowerCase(), JSON.stringify(values), 600); // เก็บ 10 นาที
  return values;
}

function getStaff(userId) {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('staff_' + userId);
  if (cached) return JSON.parse(cached);

  const data = getCachedSheetData('Staff');
  const row = data.find(r => r[1] === userId && r[2].toString().toLowerCase() === 'active');
  
  if (row) {
    const staff = { name: row[0], role: row[3].toLowerCase() };
    cache.put('staff_' + userId, JSON.stringify(staff), CACHE_TIME);
    return staff;
  }
  return null;
}

// ============================
// 6. UTILITIES (Log, Track, API)
// ============================
function trackUser(userId, displayName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Visitors');
  const data = sheet.getDataRange().getValues();
  const index = data.findIndex(row => row[0] === userId);

  if (index !== -1) {
    sheet.getRange(index + 1, 3).setValue(new Date());
  } else {
    sheet.appendRow([userId, displayName, new Date()]);
  }
}

function writeLog(uid, sName, lName, q, res) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Log');
  sheet.appendRow([new Date(), uid, sName, lName, q, res]);
}

function getLineDisplayName(userId) {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('name_' + userId);
  if (cached) return cached;

  try {
    const res = UrlFetchApp.fetch('https://api.line.me/v2/bot/profile/' + userId, {
      headers: { 'Authorization': 'Bearer ' + LINE_ACCESS_TOKEN }
    });
    const name = JSON.parse(res.getContentText()).displayName;
    cache.put('name_' + userId, name, CACHE_TIME);
    return name;
  } catch (e) { return userId; }
}

function replyToLine(token, msg) {
  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'post',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + LINE_ACCESS_TOKEN },
    payload: JSON.stringify({ replyToken: token, messages: [{ type: 'text', text: msg }] }),
    muteHttpExceptions: true
  });
}

function getStatusLabel(status) {
  const s = status.toString().toLowerCase();
  if (s === 'active') return '✅ สถานะ: อนุญาต';
  if (s === 'inactive') return '🚨 สถานะ: ไม่อนุญาต';
  return '⛔ ระงับสิทธิ์';
}

// ============================
// 7. AUTO MAINTENANCE (Set Triggers)
// ============================
function dailyCleanup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ['Log', 'Visitors'].forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (!sheet) return;
    const data = sheet.getDataRange().getValues();
    const dateIdx = (name === 'Log') ? 0 : 2;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
    
    const toKeep = data.filter((row, i) => i === 0 || new Date(row[dateIdx]) >= cutoff);
    if (data.length !== toKeep.length) {
      sheet.clearContents();
      sheet.getRange(1, 1, toKeep.length, toKeep[0].length).setValues(toKeep);
    }
  });
}

/**
 * ฟังก์ชันพิเศษ: ทำงานอัตโนมัติเมื่อมีการแก้ไขข้อมูลใน Sheet
 * เพื่อล้าง Cache ทันทีที่มีการเปลี่ยน Status หรือ Role ของ Staff
 */
function onEdit(e) {
  const range = e.range;
  const sheet = range.getSheet();
  const sheetName = sheet.getName();
  const cache = CacheService.getScriptCache();
  
  // 1. กรณีแก้ไขข้อมูลในหน้า Staff
  if (sheetName === "Staff") {
    const row = range.getRow();
    if (row <= 1) return; // ข้าม Header

    // ดึงข้อมูล Line User ID จากคอลัมน์ที่ 2 (B) 
    // และดึงข้อมูล Status จากคอลัมน์ที่ 3 (C) เพื่อความชัวร์
    const userId = sheet.getRange(row, 2).getValue();
    
    if (userId) {
      // ลบ Cache รายบุคคล (staff_...)
      cache.remove("staff_" + userId);
      
      // ลบ Cache รายชื่อพนักงานทั้งหมด (ถ้ามี)
      cache.remove("staff_list");
      
      console.log("Auto-cleared cache for Staff ID: " + userId);
    }
  }

  // 2. กรณีแก้ไขข้อมูลในหน้า Vehicles (แถมให้)
  if (sheetName === "Vehicles") {
    cache.remove("vehicles");
    console.log("Auto-cleared vehicle cache due to manual edit");
  }
}