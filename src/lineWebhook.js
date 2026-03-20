/**
 * 🏢 Vehicle Verification System (Group Event + UID Tracking)
 */

// ============================
// 1. CONFIGURATION
// ============================
const props               = PropertiesService.getScriptProperties();
const LINE_ACCESS_TOKEN   = props.getProperty('LINE_ACCESS_TOKEN');
const LINE_CHANNEL_SECRET = props.getProperty('LINE_CHANNEL_SECRET');
const RETENTION_DAYS      = Number(props.getProperty('LOG_RETENTION_DAYS')) || 30;
const BACKUPRETENTION_DAYS      = Number(props.getProperty('BACKUP_RETENTION_DAYS')) || 30;

const CACHE_TIME          = 3600;
const BACKUP_FOLDER_NAME  = props.getProperty('BACKUP_FOLDER_NAME');
const SPREADSHEET_ID = props.getProperty('SPREADSHEET_ID');

// ดึง Allowed Group IDs จาก Properties
const ALLOWED_GROUP_IDS = (props.getProperty('ALLOWED_GROUP_IDS') || '')
  .split(',')
  .map(id => id.trim())
  .filter(id => id);

// ============================
// 2. MAIN ENTRY POINT
// ============================
function doPost(e) {
  try {

    const token = e.parameter.token;
    if (token !== props.getProperty('WEBHOOK_SECRET')) {
      return ContentService.createTextOutput('Unauthorized');
    }

    debugToLine(JSON.stringify(e, null, 2));


    const data = JSON.parse(e.postData.contents);
    if (!data.events) return ContentService.createTextOutput('OK');

    data.events.forEach(event => {
      const userId     = event.source.userId;
      const replyToken = event.replyToken;
      const groupId    = event.source.groupId || null;

      if (!userId) return;

      // ตอนแอด Bot → ส่ง User ID กลับอัตโนมัติ
      if (event.type === 'follow') {
        return replyToLine(replyToken,
          '👋 สวัสดีครับ!\n\n' +
          '📋 User ID ของคุณคือ:\n' + userId + '\n\n' +
          'กรุณาแจ้ง ID นี้กับนิติบุคคลเพื่อเปิดสิทธิ์ใช้งานครับ'
        );
      }

      if (event.type !== 'message' || event.message.type !== 'text') return;

      const query    = event.message.text.trim();
      const lineName = getLineDisplayName(userId);
      const staff    = getStaff(userId);
      const isAdmin  = staff && staff.role === 'admin';

      // /myid → ทุกคนใช้ได้
      if (query === '/myid') {
        const lines = ['📋 ข้อมูลของคุณ\n'];
        lines.push('👤 User ID: ' + userId);
        if (staff) {
          lines.push('📝 ชื่อ: '  + staff.name);
          lines.push('🔑 Role: '  + staff.role);
          lines.push('🟢 Status: active');
        } else {
          lines.push('⚠️ ยังไม่มีสิทธิ์ในระบบ');
        }
        if (groupId) lines.push('💬 Group ID: ' + groupId);
        return replyToLine(replyToken, lines.join('\n'));
      }

      // /help → ทุกคนใช้ได้ แต่แสดงตาม role
      if (query === '/help') {
        let msg = '📋 คำสั่งที่ใช้ได้\n\n👤 ทุกคน\n/myid\n/help';
        if (isAdmin) {
          msg += '\n\n👑 Admin เท่านั้น\n' +
                 '/add <userId> <ชื่อ> <role>\n' +
                 '/remove <userId>\n' +
                 '/setstatus <userId> <active|inactive>\n' +
                 '/setrole <userId> <admin|staff>\n' +
                 '/list\n' +
                 '/status <userId>\n' +
                 '/whois\n' +
                 '/visitors\n' +
                 '/log <จำนวน>\n' +
                 '/clearcache';
        }
        return replyToLine(replyToken, msg);
      }

      // ถ้าไม่ใช่ Admin → ต้องอยู่ในกลุ่มที่อนุญาตเท่านั้น
      if (!isAdmin) {
        const isAllowedGroup = groupId && ALLOWED_GROUP_IDS.includes(groupId);
        if (!isAllowedGroup) {
          return replyToLine(replyToken, '🚫 กรุณาใช้งานในกลุ่มที่กำหนดเท่านั้นครับ');
        }
      }

      // Track ผู้ใช้
      trackUser(userId, lineName);

      // ตรวจสอบสิทธิ์
      if (!staff) {
        return replyToLine(replyToken, '🚫 ไม่มีสิทธิ์เข้าถึงระบบ\nกรุณาติดต่อนิติบุคคล');
      }

      // Admin Commands
      if (query.startsWith('/')) {
        if (isAdmin) {
          const cmdResult = handleAdminCommand(query, userId, event);
          replyToLine(replyToken, cmdResult);
        } else {
          replyToLine(replyToken, '🚫 คำสั่งนี้สำหรับ Admin เท่านั้น');
        }
        return;
      }

      // ค้นหาปกติ
      let result;
      if (query.match(/^\d/) && query.indexOf('/') !== -1) {
        result = searchByHouse(query);
      } else {
        result = searchByPlate(query);
      }

      writeLog(userId, staff.name, lineName, query, result.found ? 'พบข้อมูล' : 'ไม่พบข้อมูล');
      replyToLine(replyToken, result.message);
    });

  } catch(err) {
    console.error('doPost Error: ' + err.stack);
  }

  return ContentService.createTextOutput('OK');
}

// ============================
// 3. ADMIN COMMAND CENTER
// ============================
function handleAdminCommand(query, adminId, event) {
  const parts   = query.split(/\s+/);
  const cmd     = parts[0].toLowerCase();
  const groupId = event && event.source ? event.source.groupId || null : null;

  switch(cmd) {

    // /add <userId> <ชื่อ> <role>
    case '/add': {
      if (parts.length < 4) return '❌ รูปแบบ:\n/add <userId> <ชื่อ> <role>\nเช่น: /add U578... สมชาย staff';
      const newId   = parts[1].trim();
      const newName = parts[2].trim();
      const newRole = parts[3].trim().toLowerCase();
      if (newRole !== 'admin' && newRole !== 'staff') return '❌ role ต้องเป็น admin หรือ staff เท่านั้น';
      const sheet  = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Staff');
      const values = sheet.getDataRange().getValues();
      for (let i = 1; i < values.length; i++) {
        if (values[i][1].toString().trim() === newId) return '⚠️ User ID นี้มีในระบบแล้ว';
      }
      sheet.appendRow([newName, newId, 'active', newRole]);
      clearStaffCache(newId);
      return '✅ เพิ่ม ' + newName + ' (' + newRole + ') สำเร็จ';
    }

    // /remove <userId>
    case '/remove': {
      if (parts.length < 2) return '❌ รูปแบบ:\n/remove <userId>';
      const removeId = parts[1].trim();
      const sheet    = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Staff');
      const values   = sheet.getDataRange().getValues();
      for (let i = 1; i < values.length; i++) {
        if (values[i][1].toString().trim() === removeId) {
          const name = values[i][0];
          sheet.deleteRow(i + 1);
          clearStaffCache(removeId);
          return '✅ ลบ ' + name + ' ออกจากระบบแล้ว';
        }
      }
      return '❌ ไม่พบ User ID นี้ในระบบ';
    }

    // /setstatus <userId> <active|inactive>
    case '/setstatus': {
      if (parts.length < 3) return '❌ รูปแบบ:\n/setstatus <userId> <active|inactive>';
      const targetId  = parts[1].trim();
      const newStatus = parts[2].trim().toLowerCase();
      if (newStatus !== 'active' && newStatus !== 'inactive') return '❌ status ต้องเป็น active หรือ inactive';
      const sheet  = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Staff');
      const values = sheet.getDataRange().getValues();
      for (let i = 1; i < values.length; i++) {
        if (values[i][1].toString().trim() === targetId) {
          sheet.getRange(i + 1, 3).setValue(newStatus);
          clearStaffCache(targetId);
          return '✅ เปลี่ยน status ของ ' + values[i][0] + ' เป็น ' + newStatus + ' แล้ว';
        }
      }
      return '❌ ไม่พบ User ID นี้ในระบบ';
    }

    // /setrole <userId> <admin|staff>
    case '/setrole': {
      if (parts.length < 3) return '❌ รูปแบบ:\n/setrole <userId> <admin|staff>';
      const targetId = parts[1].trim();
      const newRole  = parts[2].trim().toLowerCase();
      if (newRole !== 'admin' && newRole !== 'staff') return '❌ role ต้องเป็น admin หรือ staff เท่านั้น';
      const sheet  = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Staff');
      const values = sheet.getDataRange().getValues();
      for (let i = 1; i < values.length; i++) {
        if (values[i][1].toString().trim() === targetId) {
          sheet.getRange(i + 1, 4).setValue(newRole);
          clearStaffCache(targetId);
          return '✅ เปลี่ยน role ของ ' + values[i][0] + ' เป็น ' + newRole + ' แล้ว';
        }
      }
      return '❌ ไม่พบ User ID นี้ในระบบ';
    }

    // /list
    case '/list': {
      const sheet  = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Staff');
      const values = sheet.getDataRange().getValues();
      const lines  = ['👥 รายชื่อผู้ใช้งานทั้งหมด\n'];
      for (let i = 1; i < values.length; i++) {
        if (values[i][0]) {
          const icon   = values[i][3] === 'admin' ? '👑' : '👤';
          const status = values[i][2] === 'active' ? '🟢' : '🔴';
          lines.push(icon + ' ' + values[i][0] + ' (' + values[i][3] + ') ' + status);
        }
      }
      return lines.join('\n');
    }

    // /status <userId>
    case '/status': {
      if (parts.length < 2) return '❌ รูปแบบ:\n/status <userId>';
      const checkId     = parts[1].trim();
      const targetStaff = getStaff(checkId);
      if (!targetStaff) return '❌ ไม่พบ User ID นี้ในระบบ หรือ status ไม่ใช่ active';
      return '📋 ' + targetStaff.name + '\nRole: ' + targetStaff.role + '\nStatus: active';
    }

    // /whois
    case '/whois': {
      const sheet  = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Staff');
      const values = sheet.getDataRange().getValues();
      const lines  = ['👥 รายชื่อที่มีสิทธิ์ในระบบ\n'];
      for (let i = 1; i < values.length; i++) {
        if (values[i][0]) {
          const icon   = values[i][3] === 'admin' ? '👑' : '👤';
          const status = values[i][2] === 'active' ? '🟢' : '🔴';
          lines.push(icon + ' ' + values[i][0] + '\n    ' + status + ' ' + values[i][3] + '\n    ' + values[i][1]);
        }
      }
      return lines.join('\n');
    }

    // /visitors
    case '/visitors': {
      const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Visitors');
      if (!sheet) return '❌ ไม่พบ Sheet Visitors';
      const values   = sheet.getDataRange().getValues();
      const dataRows = values.slice(1);
      if (dataRows.length === 0) return '📋 ยังไม่มีข้อมูล';
      const lines = ['👥 คนที่เคยพิมพ์ในระบบ ' + dataRows.length + ' คน\n'];
      dataRows.forEach(row => {
        const uid      = row[0] || '-';
        const name     = row[1] || '-';
        const lastSeen = row[2] ? Utilities.formatDate(new Date(row[2]), 'Asia/Bangkok', 'dd/MM HH:mm') : '-';
        const s        = getStaff(uid);
        const icon     = s ? '✅' : '❓';
        lines.push(icon + ' ' + name + '\n    ' + uid + '\n    last: ' + lastSeen);
      });
      return lines.join('\n');
    }

    // /log <จำนวน>
    case '/log': {
      const limit    = Math.min(parts[1] ? parseInt(parts[1]) : 5, 20);
      const sheet    = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Log');
      const values   = sheet.getDataRange().getValues();
      const dataRows = values.slice(1);
      if (dataRows.length === 0) return '📋 ยังไม่มี Log ในระบบ';
      const lastRows = dataRows.slice(-limit).reverse();
      const lines    = ['📋 Log ' + limit + ' รายการล่าสุด\n'];
      lastRows.forEach(row => {
        const time = row[0] ? Utilities.formatDate(new Date(row[0]), 'Asia/Bangkok', 'dd/MM HH:mm') : '-';
        const name = row[2] || row[1] || '-';
        const q    = row[4] || '-';
        const res  = row[5] || '-';
        const icon = res === 'พบข้อมูล' ? '✅' : '❌';
        lines.push(icon + ' ' + time + ' | ' + name + '\n    🔍 ' + q);
      });
      return lines.join('\n');
    }

    // /clearcache
    case '/clearcache': {
      const sheet  = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Staff');
      const values = sheet.getDataRange().getValues();
      const keys   = ['vehicles'];
      for (let i = 1; i < values.length; i++) {
        if (values[i][1]) {
          keys.push('staff_'   + values[i][1].toString().trim());
          keys.push('name_'    + values[i][1].toString().trim());
          keys.push('tracked_' + values[i][1].toString().trim());
        }
      }
      CacheService.getScriptCache().removeAll(keys);
      return '✅ ล้าง Cache สำเร็จ ' + keys.length + ' รายการ';
    }

    default:
      return '❌ ไม่รู้จักคำสั่งนี้\nพิมพ์ /help เพื่อดูคำสั่งทั้งหมด';
  }
}

// ============================
// 4. SEARCH ENGINE
// ============================
function searchByPlate(query) {
  const data = getCachedSheetData('Vehicles');
  const q    = query.replace(/\s/g, '').toLowerCase();

  const matches = data.slice(1).filter(row =>
    row[0].toString().replace(/\s/g, '').toLowerCase().includes(q)
  );

  if (matches.length === 0) return { found: false, message: '❌ ไม่พบทะเบียนนี้ในระบบ\nกรุณาแลกบัตรตามขั้นตอนปกติ' };

  const msg = matches.map(row =>
    '🚗 ' + row[0] + '\n' +
    '    ' + row[1] + ' ' + row[2] + ' | สี' + row[3] + '\n' +
    '🏠 บ้านเลขที่: ' + row[4] + '\n' +
    getStatusLabel(row[6])
  ).join('\n\n');

  const header = matches.length > 1
    ? '✅ พบข้อมูล ' + matches.length + ' รายการ\n\n'
    : '✅ พบข้อมูลในระบบ\n\n';

  return { found: true, message: header + msg };
}

function searchByHouse(query) {
  const data = getCachedSheetData('Vehicles');
  const q    = query.trim();

  const matches = data.slice(1).filter(row => {
    const house = row[4].toString().trim();
    if (house === q) return true;
    if (house.includes('-') && q.includes('/')) {
      const [prefix, range]    = house.split('/');
      const [qPrefix, qNumStr] = q.split('/');
      const [min, max]         = range.split('-').map(Number);
      return prefix === qPrefix && Number(qNumStr) >= min && Number(qNumStr) <= max;
    }
    return false;
  });

  if (matches.length === 0) return { found: false, message: '❌ ไม่พบข้อมูลบ้านเลขที่นี้ในระบบ' };

  const msg = matches.map(row =>
    '🚗 ' + row[0] + '\n' +
    '    ' + row[1] + ' ' + row[2] + ' | สี' + row[3] + '\n' +
    getStatusLabel(row[6])
  ).join('\n\n');

  return { found: true, message: '🏠 บ้านเลขที่ ' + q + ' พบรถ ' + matches.length + ' คัน\n\n' + msg };
}

// ============================
// 5. DATA ACCESS & CACHING
// ============================
function getCachedSheetData(sheetName) {
  const cache  = CacheService.getScriptCache();
  const cached = cache.get(sheetName.toLowerCase());
  if (cached) return JSON.parse(cached);

  const values = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(sheetName).getDataRange().getValues();
  cache.put(sheetName.toLowerCase(), JSON.stringify(values), 600);
  return values;
}

function getStaff(userId) {
  if (!userId) return null;

  const adminUids = (props.getProperty('ADMIN_UIDS') || '')
                      .split(',')
                      .map(u => u.trim());

  const cache  = CacheService.getScriptCache();
  const cached = cache.get('staff_' + userId);
  if (cached) {
    const staff = JSON.parse(cached);
    if (staff && adminUids.includes(userId)) staff.role = 'admin';
    return staff;
  }

  const data = getCachedSheetData('Staff');
  const row  = data.find(r =>
    r[1].toString().trim() === userId &&
    r[2].toString().trim().toLowerCase() === 'active'
  );

  if (row) {
    const staff = {
      name: row[0],
      role: adminUids.includes(userId) ? 'admin' : row[3].toString().toLowerCase()
    };
    cache.put('staff_' + userId, JSON.stringify(staff), CACHE_TIME);
    return staff;
  }

  cache.put('staff_' + userId, JSON.stringify(null), 300);
  return null;
}

function clearStaffCache(userId) {
  const cache = CacheService.getScriptCache();
  cache.remove('staff_' + userId); // cache รายคน
  cache.remove('staff');            // ✅ เพิ่ม: cache Sheet ทั้งหมด
  cache.remove('staff_list');       // cache รายชื่อ
}

// ============================
// 6. UTILITIES
// ============================
function trackUser(userId, displayName) {
  const cache    = CacheService.getScriptCache();
  const cacheKey = 'tracked_' + userId;
  if (cache.get(cacheKey)) return;

  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Visitors');
  if (!sheet) return;
  const data  = sheet.getDataRange().getValues();
  const index = data.findIndex(row => row[0] === userId);
  if (index !== -1) {
    sheet.getRange(index + 1, 3).setValue(new Date());
  } else {
    sheet.appendRow([userId, displayName, new Date()]);
  }

  cache.put(cacheKey, '1', 3600); // 1 ชั่วโมง
}

function writeLog(uid, sName, lName, q, res) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Log');
  sheet.appendRow([new Date(), uid, sName, lName, q, res]);
}

function getLineDisplayName(userId) {
  if (!userId) return 'Unknown';

  const cache  = CacheService.getScriptCache();
  const cached = cache.get('name_' + userId);
  if (cached) return cached;

  try {
    const res    = UrlFetchApp.fetch('https://api.line.me/v2/bot/profile/' + userId, {
      headers: { 'Authorization': 'Bearer ' + LINE_ACCESS_TOKEN },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() === 200) {
      const name = JSON.parse(res.getContentText()).displayName;
      cache.put('name_' + userId, name, CACHE_TIME);
      return name;
    }
    return 'User-' + userId.substring(userId.length - 4);
  } catch(e) {
    return 'Unknown';
  }
}

function replyToLine(token, msg) {
  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + LINE_ACCESS_TOKEN
    },
    payload: JSON.stringify({
      replyToken: token,
      messages: [{ type: 'text', text: msg }]
    }),
    muteHttpExceptions: true
  });
}

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
    }),
    muteHttpExceptions: true
  });
}

function getStatusLabel(status) {
  const s = (status || '').toString().toLowerCase();
  if (s === 'active')    return '✅ สถานะ: อนุญาต';
  if (s === 'inactive')  return '⛔ สถานะ: ไม่อนุญาต';
  if (s === 'blacklist') return '🚨 สถานะ: Blacklist';
  return '❓ สถานะ: ไม่ระบุ';
}

// ============================
// 7. AUTO MAINTENANCE
// ============================
function keepAlive() {
  Logger.log('keep alive: ' + new Date());
}

function dailyCleanup() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  ['Log', 'Visitors'].forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (!sheet) return;
    const data    = sheet.getDataRange().getValues();
    const dateIdx = name === 'Log' ? 0 : 2;
    const cutoff  = new Date();
    cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
    const toKeep = data.filter((row, i) => i === 0 || new Date(row[dateIdx]) >= cutoff);
    if (data.length !== toKeep.length) {
      sheet.clearContents();
      sheet.getRange(1, 1, toKeep.length, toKeep[0].length).setValues(toKeep);
    }
  });
}

// Backup Functions
function getOrCreateBackupFolder() {
  const folders = DriveApp.getFoldersByName(BACKUP_FOLDER_NAME);
  return folders.hasNext()
    ? folders.next()
    : DriveApp.createFolder(BACKUP_FOLDER_NAME);
}

function dailyBackup() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const folder = getOrCreateBackupFolder();
  const date = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd');

  DriveApp.getFileById(ss.getId()).makeCopy(`Backup_${date}`, folder);
  console.log('Backup สำเร็จ: ' + date);
}

function cleanOldBackups() {
  const folder = getOrCreateBackupFolder(); // ← เปลี่ยนจาก getFolderById('FOLDER_ID')
  const files = folder.getFiles();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - BACKUPRETENTION_DAYS); // ← ใช้ตัวแปรที่มีอยู่แล้ว

  while (files.hasNext()) {
    const file = files.next();
    if (file.getDateCreated() < cutoff) {
      file.setTrashed(true);
    }
  }
  console.log('✅ ลบ Backup เก่าเกิน ' + BACKUPRETENTION_DAYS + ' วันแล้ว');
}

function dailyMaintenance() {
  dailyBackup();      // สำรองข้อมูล
  cleanOldBackups();  // ลบ Backup เก่า
  dailyCleanup();     // ล้าง Log เก่า
  console.log('✅ Daily Maintenance เสร็จสิ้น: ' + new Date());
}

function onEdit(e) {
  const range     = e.range;
  const sheet     = range.getSheet();
  const sheetName = sheet.getName();
  const cache     = CacheService.getScriptCache();

  if (sheetName === 'Staff') {
    const row = range.getRow();
    if (row <= 1) return;
    const userId = sheet.getRange(row, 2).getValue();
    if (userId) {
      cache.remove('staff_' + userId); // cache รายคน
      cache.remove('staff_list');       // cache รายชื่อ
      cache.remove('staff');            // ✅ เพิ่ม: cache Sheet ทั้งหมด
      console.log('Auto-cleared cache for Staff ID: ' + userId);
    }
  }

  if (sheetName === 'Vehicles') {
    cache.remove('vehicles');
    console.log('Auto-cleared vehicle cache due to manual edit');
  }
}

function debugToLine(msg) {
  if (props.getProperty('DEBUG_MODE') !== 'true') return; // ปิดอยู่ก็ไม่ทำงาน
  const ADMIN_UID = props.getProperty('ADMIN_UID');
  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + LINE_ACCESS_TOKEN
    },
    payload: JSON.stringify({
      to: ADMIN_UID,
      messages: [{ type: 'text', text: '🔍 DEBUG\n' + msg.substring(0, 4900) }]
    }),
    muteHttpExceptions: true
  });
}