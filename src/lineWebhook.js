/**
 * 🏢 Vehicle Verification System (Group Event + UID Tracking + OCR)
 * เพิ่ม: OCR ด้วย Gemini 2.5 Flash-Lite + Fuzzy Match
 */

// ============================
// 1. CONFIGURATION
// ============================
const props               = PropertiesService.getScriptProperties();
const LINE_ACCESS_TOKEN   = props.getProperty('LINE_ACCESS_TOKEN');
const LINE_CHANNEL_SECRET = props.getProperty('LINE_CHANNEL_SECRET');
const GEMINI_API_KEY      = props.getProperty('GEMINI_API_KEY');       // 🆕 เพิ่มใน Script Properties
const RETENTION_DAYS      = Number(props.getProperty('LOG_RETENTION_DAYS')) || 30;
const BACKUPRETENTION_DAYS      = Number(props.getProperty('BACKUP_RETENTION_DAYS')) || 30;

const CACHE_TIME          = 3600;
const BACKUP_FOLDER_NAME  = props.getProperty('BACKUP_FOLDER_NAME');
const SPREADSHEET_ID      = props.getProperty('SPREADSHEET_ID');

const COL_VEHICLE = {
  PLATE  : 0,
  BRAND  : 1,
  MODEL  : 2,
  COLOR  : 3,
  HOUSE  : 4,
  OWNER  : 5,
  STATUS : 6
};

const COL_STAFF = {
  NAME   : 0,
  UID    : 1,
  STATUS : 2,
  ROLE   : 3
};

const COL_VISITOR = {
  UID         : 0,
  DISPLAYNAME : 1,
  LAST_SEEN   : 2
};

const COL_LOG = {
  TIMESTAMP : 0,
  UID       : 1,
  STAFF_NAME: 2,
  LINE_NAME : 3,
  QUERY     : 4,
  RESULT    : 5
};

const ALLOWED_GROUP_IDS = (props.getProperty('ALLOWED_GROUP_IDS') || '')
  .split(',')
  .map(id => id.trim())
  .filter(id => id);

// ============================
// 2. MAIN ENTRY POINT
// ============================
// Legacy entry retained temporarily during phase 1 refactor.
// Active webhook flow now lives in src/webhook/* and src/handlers/*.
function legacyDoPostMonolith(e) {
  try {
    const token = e && e.parameter ? e.parameter.token : null;
    if (token !== props.getProperty('WEBHOOK_SECRET')) {
      return ContentService.createTextOutput('Unauthorized');
    }

    debugToLine(JSON.stringify(e, null, 2));

    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput('Bad Request');
    }

    const data = JSON.parse(e.postData.contents);
    if (!data.events) return ContentService.createTextOutput('OK');

    data.events.forEach(event => {
      const userId     = event.source.userId;
      const replyToken = event.replyToken;
      const groupId    = event.source.groupId || null;

      if (!userId) return;

      // ตอนแอด Bot
      if (event.type === 'follow') {
        return replyToLine(replyToken,
          '👋 สวัสดีครับ!\n\n' +
          '📋 User ID ของคุณคือ:\n' + userId + '\n\n' +
          'กรุณาแจ้ง ID นี้กับนิติบุคคลเพื่อเปิดสิทธิ์ใช้งานครับ'
        );
      }

      // 🆕 รองรับรูปภาพ (OCR)
      if (event.type === 'message' && event.message.type === 'image') {
        const lineName = getLineDisplayName(userId);
        const staff    = getStaff(userId);
        const isAdmin  = staff && staff.role === 'admin';

        // ตรวจสิทธิ์กลุ่ม (เหมือน text)
        if (!isAdmin) {
          const isAllowedGroup = groupId && ALLOWED_GROUP_IDS.includes(groupId);
          if (!isAllowedGroup) {
            return replyToLine(replyToken, '🚫 กรุณาใช้งานในกลุ่มที่กำหนดเท่านั้นครับ');
          }
        }

        trackUser(userId, lineName);

        if (!staff) {
          return replyToLine(replyToken, '🚫 ไม่มีสิทธิ์เข้าถึงระบบ\nกรุณาติดต่อนิติบุคคล');
        }

        const imageId   = event.message.id;
        const plateText = extractPlateFromImage(imageId);

        if (!plateText) {
          writeLog(userId, staff.name, lineName, '[OCR] ส่งรูป', 'อ่านไม่ได้');
          return replyToLine(replyToken,
            '📷 อ่านทะเบียนไม่ได้ครับ\n\nกรุณาลองใหม่:\n• ถ่ายให้ใกล้และชัดขึ้น\n• แสงเพียงพอ\n• หรือพิมพ์เลขทะเบียนตรงๆ ได้เลยครับ'
          );
        }

        // Fuzzy Match กับทะเบียนในระบบ
        const correctedPlate = resolvePlateFromOcr(plateText);
        const result         = searchByPlate(correctedPlate || plateText);

        const ocrNote = (correctedPlate && correctedPlate !== plateText)
          ? '🔍 OCR อ่านได้: "' + plateText + '"\n📝 ปรับเป็น: "' + correctedPlate + '"\n\n'
          : '🔍 OCR อ่านได้: "' + plateText + '"\n\n';

        writeLog(userId, staff.name, lineName, '[OCR] ' + (correctedPlate || plateText), result.found ? 'พบข้อมูล' : 'ไม่พบข้อมูล');
        return replyToLine(replyToken, ocrNote + result.message);
      }

      // กรองเฉพาะ text
      if (event.type !== 'message' || event.message.type !== 'text') return;

      const query = event.message.text.trim();

      if (query.length > 50) {
        return replyToLine(replyToken, '❌ ข้อความยาวเกินไป กรุณาลองใหม่ครับ');
      }

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

      // /help → ทุกคนใช้ได้
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

      // ถ้าไม่ใช่ Admin → ต้องอยู่ในกลุ่มที่อนุญาต
      if (!isAdmin) {
        const isAllowedGroup = groupId && ALLOWED_GROUP_IDS.includes(groupId);
        if (!isAllowedGroup) {
          return replyToLine(replyToken, '🚫 กรุณาใช้งานในกลุ่มที่กำหนดเท่านั้นครับ');
        }
      }

      trackUser(userId, lineName);

      if (!staff) {
        return replyToLine(replyToken, '🚫 ไม่มีสิทธิ์เข้าถึงระบบ\nกรุณาติดต่อนิติบุคคล');
      }

      // Admin Commands
      if (query.startsWith('/')) {
        if (isAdmin) {
          replyToLine(replyToken, handleAdminCommand(query, userId, event));
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
// 3. OCR ENGINE 🆕
// ============================

/**
 * รับ imageId จาก LINE → ดึงรูป → ส่ง Gemini 2.5 Flash-Lite → คืนค่าทะเบียน
 * @param {string} imageId
 * @returns {string|null}
 */
// Phase 2 refactor: OCR logic moved to src/services/ocrService.js

function handleAdminCommand(query, adminId, event) {
  const parts   = query.split(/\s+/);
  const cmd     = parts[0].toLowerCase();
  const groupId = event && event.source ? event.source.groupId || null : null;

  switch(cmd) {

    case '/add': {
      if (parts.length < 4) return '❌ รูปแบบ:\n/add <userId> <ชื่อ> <role>\nเช่น: /add U578... สมชาย staff';
      const newId   = parts[1].trim();
      const newName = parts[2].trim();
      const newRole = parts[3].trim().toLowerCase();
      if (newRole !== 'admin' && newRole !== 'staff') return '❌ role ต้องเป็น admin หรือ staff เท่านั้น';
      const sheet  = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Staff');
      const values = sheet.getDataRange().getValues();
      for (let i = 1; i < values.length; i++) {
        if (values[i][COL_STAFF.UID].toString().trim() === newId) return '⚠️ User ID นี้มีในระบบแล้ว';
      }
      sheet.appendRow([newName, newId, 'active', newRole]);
      clearStaffCache(newId);
      return '✅ เพิ่ม ' + newName + ' (' + newRole + ') สำเร็จ';
    }

    case '/remove': {
      if (parts.length < 2) return '❌ รูปแบบ:\n/remove <userId>';
      const removeId = parts[1].trim();
      const sheet    = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Staff');
      const values   = sheet.getDataRange().getValues();
      for (let i = 1; i < values.length; i++) {
        if (values[i][COL_STAFF.UID].toString().trim() === removeId) {
          const name = values[i][COL_STAFF.NAME];
          sheet.deleteRow(i + 1);
          clearStaffCache(removeId);
          return '✅ ลบ ' + name + ' ออกจากระบบแล้ว';
        }
      }
      return '❌ ไม่พบ User ID นี้ในระบบ';
    }

    case '/setstatus': {
      if (parts.length < 3) return '❌ รูปแบบ:\n/setstatus <userId> <active|inactive>';
      const targetId  = parts[1].trim();
      const newStatus = parts[2].trim().toLowerCase();
      if (newStatus !== 'active' && newStatus !== 'inactive') return '❌ status ต้องเป็น active หรือ inactive';
      const sheet  = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Staff');
      const values = sheet.getDataRange().getValues();
      for (let i = 1; i < values.length; i++) {
        if (values[i][COL_STAFF.UID].toString().trim() === targetId) {
          sheet.getRange(i + 1, COL_STAFF.STATUS + 1).setValue(newStatus);
          clearStaffCache(targetId);
          return '✅ เปลี่ยน status ของ ' + values[i][COL_STAFF.NAME] + ' เป็น ' + newStatus + ' แล้ว';
        }
      }
      return '❌ ไม่พบ User ID นี้ในระบบ';
    }

    case '/setrole': {
      if (parts.length < 3) return '❌ รูปแบบ:\n/setrole <userId> <admin|staff>';
      const targetId = parts[1].trim();
      const newRole  = parts[2].trim().toLowerCase();
      if (newRole !== 'admin' && newRole !== 'staff') return '❌ role ต้องเป็น admin หรือ staff เท่านั้น';
      const sheet  = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Staff');
      const values = sheet.getDataRange().getValues();
      for (let i = 1; i < values.length; i++) {
        if (values[i][COL_STAFF.UID].toString().trim() === targetId) {
          sheet.getRange(i + 1, COL_STAFF.ROLE + 1).setValue(newRole);
          clearStaffCache(targetId);
          return '✅ เปลี่ยน role ของ ' + values[i][COL_STAFF.NAME] + ' เป็น ' + newRole + ' แล้ว';
        }
      }
      return '❌ ไม่พบ User ID นี้ในระบบ';
    }

    case '/list': {
      const sheet  = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Staff');
      const values = sheet.getDataRange().getValues();
      const lines  = ['👥 รายชื่อผู้ใช้งานทั้งหมด\n'];
      for (let i = 1; i < values.length; i++) {
        if (values[i][COL_STAFF.NAME]) {
          const icon   = values[i][COL_STAFF.ROLE]   === 'admin'  ? '👑' : '👤';
          const status = values[i][COL_STAFF.STATUS] === 'active' ? '🟢' : '🔴';
          lines.push(icon + ' ' + values[i][COL_STAFF.NAME] + ' (' + values[i][COL_STAFF.ROLE] + ') ' + status);
        }
      }
      return lines.join('\n');
    }

    case '/status': {
      if (parts.length < 2) return '❌ รูปแบบ:\n/status <userId>';
      const checkId     = parts[1].trim();
      const targetStaff = getStaffRecord(checkId);
      if (!targetStaff) return '❌ ไม่พบ User ID นี้ในระบบ';
      return '📋 ' + targetStaff.name + '\nRole: ' + targetStaff.role + '\nStatus: ' + targetStaff.status;
    }

    case '/whois': {
      const sheet  = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Staff');
      const values = sheet.getDataRange().getValues();
      const lines  = ['👥 รายชื่อที่มีสิทธิ์ในระบบ\n'];
      for (let i = 1; i < values.length; i++) {
        if (values[i][COL_STAFF.NAME]) {
          const icon   = values[i][COL_STAFF.ROLE]   === 'admin'  ? '👑' : '👤';
          const status = values[i][COL_STAFF.STATUS] === 'active' ? '🟢' : '🔴';
          lines.push(icon + ' ' + values[i][COL_STAFF.NAME] + '\n    ' + status + ' ' + values[i][COL_STAFF.ROLE] + '\n    ' + values[i][COL_STAFF.UID]);
        }
      }
      return lines.join('\n');
    }

    case '/visitors': {
      const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Visitors');
      if (!sheet) return '❌ ไม่พบ Sheet Visitors';
      const values   = sheet.getDataRange().getValues();
      const dataRows = values.slice(1);
      if (dataRows.length === 0) return '📋 ยังไม่มีข้อมูล';
      const lines = ['👥 คนที่เคยพิมพ์ในระบบ ' + dataRows.length + ' คน\n'];
      dataRows.forEach(row => {
        const uid      = row[COL_VISITOR.UID]         || '-';
        const name     = row[COL_VISITOR.DISPLAYNAME] || '-';
        const lastSeen = row[COL_VISITOR.LAST_SEEN]
          ? Utilities.formatDate(new Date(row[COL_VISITOR.LAST_SEEN]), 'Asia/Bangkok', 'dd/MM HH:mm')
          : '-';
        const s    = getStaff(uid);
        const icon = s ? '✅' : '❓';
        lines.push(icon + ' ' + name + '\n    ' + uid + '\n    last: ' + lastSeen);
      });
      return lines.join('\n');
    }

    case '/log': {
      const parsedLimit = parts[1] ? parseInt(parts[1], 10) : 5;
      const limit       = Math.max(1, Math.min(isNaN(parsedLimit) ? 5 : parsedLimit, 20));
      const sheet    = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Log');
      const values   = sheet.getDataRange().getValues();
      const dataRows = values.slice(1);
      if (dataRows.length === 0) return '📋 ยังไม่มี Log ในระบบ';
      const lastRows = dataRows.slice(-limit).reverse();
      const lines    = ['📋 Log ' + limit + ' รายการล่าสุด\n'];
      lastRows.forEach(row => {
        const time = row[COL_LOG.TIMESTAMP]
          ? Utilities.formatDate(new Date(row[COL_LOG.TIMESTAMP]), 'Asia/Bangkok', 'dd/MM HH:mm')
          : '-';
        const name = row[COL_LOG.STAFF_NAME] || row[COL_LOG.UID] || '-';
        const q    = row[COL_LOG.QUERY]  || '-';
        const res  = row[COL_LOG.RESULT] || '-';
        const icon = res === 'พบข้อมูล' ? '✅' : '❌';
        lines.push(icon + ' ' + time + ' | ' + name + '\n    🔍 ' + q);
      });
      return lines.join('\n');
    }

    case '/clearcache': {
      const sheet  = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Staff');
      const values = sheet.getDataRange().getValues();
      const keys   = ['vehicles'];
      for (let i = 1; i < values.length; i++) {
        if (values[i][COL_STAFF.UID]) {
          const uid = values[i][COL_STAFF.UID].toString().trim();
          keys.push('staff_' + uid);
          keys.push('staff_record_' + uid);
          keys.push('name_' + uid);
          keys.push('tracked_' + uid);
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
// 5. SEARCH ENGINE
// ============================
// Phase 2 refactor: vehicle and staff services moved to src/services/*.js

// ============================
// 7. UTILITIES
// ============================
function trackUser(userId, displayName) {
  const cache    = CacheService.getScriptCache();
  const cacheKey = 'tracked_' + userId;
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Visitors');
  if (!sheet) return;
  const data  = sheet.getDataRange().getValues();
  const index = data.findIndex(row => row[COL_VISITOR.UID] === userId);

  if (index !== -1) {
    const rowNumber = index + 1;
    sheet.getRange(rowNumber, COL_VISITOR.LAST_SEEN + 1).setValue(new Date());
    if (displayName && data[index][COL_VISITOR.DISPLAYNAME] !== displayName) {
      sheet.getRange(rowNumber, COL_VISITOR.DISPLAYNAME + 1).setValue(displayName);
    }
  } else {
    sheet.appendRow([userId, displayName, new Date()]);
  }

  cache.put(cacheKey, '1', 300);
}

function writeLog(uid, sName, lName, q, res) {
  SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Log')
    .appendRow([new Date(), uid, sName, lName, q, res]);
}

// Phase 2 refactor: LINE API helpers moved to src/services/lineService.js

// ============================
// 8. AUTO MAINTENANCE
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
    const dateIdx = name === 'Log' ? COL_LOG.TIMESTAMP : COL_VISITOR.LAST_SEEN;
    const cutoff  = new Date();
    cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
    const toKeep = data.filter((row, i) => i === 0 || new Date(row[dateIdx]) >= cutoff);
    if (data.length !== toKeep.length) {
      sheet.clearContents();
      sheet.getRange(1, 1, toKeep.length, toKeep[0].length).setValues(toKeep);
    }
  });
}

function getOrCreateBackupFolder() {
  const folders = DriveApp.getFoldersByName(BACKUP_FOLDER_NAME);
  return folders.hasNext()
    ? folders.next()
    : DriveApp.createFolder(BACKUP_FOLDER_NAME);
}

function dailyBackup() {
  const ss     = SpreadsheetApp.openById(SPREADSHEET_ID);
  const folder = getOrCreateBackupFolder();
  const date   = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd');
  DriveApp.getFileById(ss.getId()).makeCopy('Backup_' + date, folder);
  console.log('Backup สำเร็จ: ' + date);
}

function cleanOldBackups() {
  const folder = getOrCreateBackupFolder();
  const files  = folder.getFiles();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - BACKUPRETENTION_DAYS);
  while (files.hasNext()) {
    const file = files.next();
    if (file.getDateCreated() < cutoff) file.setTrashed(true);
  }
  console.log('✅ ลบ Backup เก่าเกิน ' + BACKUPRETENTION_DAYS + ' วันแล้ว');
}

function dailyMaintenance() {
  dailyBackup();
  cleanOldBackups();
  dailyCleanup();
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
    const userId = sheet.getRange(row, COL_STAFF.UID + 1).getValue();
    if (userId) {
      cache.remove('staff_' + userId);
      cache.remove('staff_record_' + userId);
      cache.remove('staff_list');
      cache.remove('staff');
      console.log('Auto-cleared cache for Staff ID: ' + userId);
    }
  }

  if (sheetName === 'Vehicles') {
    cache.remove('vehicles');
    console.log('Auto-cleared vehicle cache due to manual edit');
  }
}

function debugToLine(msg) {
  if (props.getProperty('DEBUG_MODE') !== 'true') return;
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

