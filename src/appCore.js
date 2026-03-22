/**
 * Vehicle Verification System (Group Event + UID Tracking + OCR)
 * Added OCR with Gemini 2.5 Flash-Lite and fuzzy matching
 */

// ============================
// 1. CONFIGURATION
// ============================
const props = PropertiesService.getScriptProperties();
const LINE_ACCESS_TOKEN = props.getProperty('LINE_ACCESS_TOKEN');
const LINE_CHANNEL_SECRET = props.getProperty('LINE_CHANNEL_SECRET');
const GEMINI_API_KEY = props.getProperty('GEMINI_API_KEY');
const RETENTION_DAYS = Number(props.getProperty('LOG_RETENTION_DAYS')) || 30;
const BACKUPRETENTION_DAYS = Number(props.getProperty('BACKUP_RETENTION_DAYS')) || 30;

const CACHE_TIME = 3600;
const BACKUP_FOLDER_NAME = props.getProperty('BACKUP_FOLDER_NAME');
const SPREADSHEET_ID = props.getProperty('SPREADSHEET_ID');

const COL_VEHICLE = {
  PLATE: 0,
  BRAND: 1,
  MODEL: 2,
  COLOR: 3,
  HOUSE: 4,
  OWNER: 5,
  STATUS: 6
};

const COL_STAFF = {
  NAME: 0,
  UID: 1,
  STATUS: 2,
  ROLE: 3
};

const COL_VISITOR = {
  UID: 0,
  DISPLAYNAME: 1,
  LAST_SEEN: 2
};

const COL_LOG = {
  TIMESTAMP: 0,
  UID: 1,
  STAFF_NAME: 2,
  LINE_NAME: 3,
  QUERY: 4,
  RESULT: 5
};

const COL_SYSTEM_LOG = {
  TIMESTAMP: 0,
  LEVEL: 1,
  SOURCE: 2,
  EVENT: 3,
  MESSAGE: 4,
  DETAIL: 5,
  USER_ID: 6,
  CONTEXT: 7,
  REQUEST_ID: 8
};

const ALLOWED_GROUP_IDS = (props.getProperty('ALLOWED_GROUP_IDS') || '')
  .split(',')
  .map(function (id) { return id.trim(); })
  .filter(function (id) { return id; });

let LAST_OCR_STATUS = 'idle';

// ============================
// 2. REFACTORED STRUCTURE
// ============================
// Webhook entry, routing, services, and admin commands now live in:
// - src/webhook/*
// - src/handlers/*
// - src/services/*
// - src/commands/*

// ============================
// 3. SHARED CORE
// ============================
// Visitor and log helpers moved to src/services/visitorService.js and src/services/logService.js

// ============================
// 4. MAINTENANCE HOOKS
// ============================
// Scheduled maintenance moved to src/services/maintenanceService.js

function onEdit(e) {
  const range = e.range;
  const sheet = range.getSheet();
  const sheetName = sheet.getName();
  const cache = CacheService.getScriptCache();

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

  if (sheetName === 'Visitors') {
    clearVisitorRowMap();
    console.log('Auto-cleared visitor row cache due to manual edit');
  }
}

function debugToLine(msg) {
  if (props.getProperty('DEBUG_MODE') !== 'true') return;
  sendAdminAlert('[DEBUG]\n' + msg.substring(0, 4900));
}

function sendAdminAlert(msg) {
  const adminUids = getAdminUids();
  if (adminUids.length === 0) {
    console.warn('sendAdminAlert skipped: ADMIN_UID is empty');
    writeSystemLog('WARN', 'appCore', 'admin_alert_skipped', 'Admin alert skipped', 'ADMIN_UID is empty');
    return false;
  }

  let sent = false;
  adminUids.forEach(function (adminUid) {
    const ok = pushToLine(adminUid, msg.substring(0, 4900));
    if (!ok) {
      console.error('sendAdminAlert push failed for ' + adminUid);
      writeSystemLog('ERROR', 'appCore', 'admin_alert_failed', 'Admin alert push failed', 'adminUid=' + adminUid, adminUid);
      return;
    }
    sent = true;
  });

  if (sent) {
    writeSystemLog('ALERT', 'appCore', 'admin_alert_sent', 'Admin alert delivered', msg.substring(0, 300));
  }

  return sent;
}

function getAdminUids() {
  return (props.getProperty('ADMIN_UID') || '')
    .split(',')
    .map(function (id) { return id.trim(); })
    .filter(function (id) { return id; });
}
