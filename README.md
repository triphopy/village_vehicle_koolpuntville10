# Vehicle Verification System

ระบบตรวจสอบทะเบียนรถสำหรับโครงการหมู่บ้านผ่าน LINE Bot โดยใช้ Google Apps Script เป็น runtime หลัก และ Google Sheets เป็นฐานข้อมูล ระบบรองรับการค้นหาด้วยข้อความ, OCR จากรูปภาพ, คำสั่งผู้ดูแลระบบ, health checks, system logging และ maintenance jobs สำหรับงานดูแลระบบประจำวัน

## Overview

- รับ webhook จาก LINE Messaging API ผ่าน `doPost(e)`
- ค้นหาทะเบียนรถและบ้านเลขที่จากข้อมูลใน Google Sheets
- อ่านทะเบียนจากรูปภาพผ่าน LINE Content API และ Gemini API
- แยก admin commands เป็นโมดูลย่อยเพื่อลด conflict ระหว่างการแก้ไข
- มี `SystemLog`, `/health`, `/health full`, `/syslog`, `/testalert`, `/version`
- รองรับ backup, cleanup, retention และ admin alerts
- มี local automated tests สำหรับ pure logic ที่รันได้เร็ว

## Project Structure

```text
src/
  appCore.js
  appsscript.json
  versionInfo.js
  webhook/
    doPost.js
    eventRouter.js
  handlers/
    followHandler.js
    imageHandler.js
    textHandler.js
  services/
    httpService.js
    lineService.js
    logService.js
    maintenanceService.js
    ocrService.js
    staffService.js
    vehicleSearchService.js
    visitorService.js
  commands/
    adminCommandRouter.js
    admin/
      addUserCommand.js
      clearCacheCommand.js
      healthCommand.js
      listUsersCommand.js
      logCommand.js
      removeUserCommand.js
      setRoleCommand.js
      setStatusCommand.js
      statusCommand.js
      syslogCommand.js
      testAlertCommand.js
      versionCommand.js
      visitorsCommand.js
      whoisCommand.js
tests/
  helpers/
    load-gas-file.js
  pure-logic.test.js
docs/
  architecture-flow.md
  architecture-flow.html
  technical-guide.html
  user-manual.html
  index.html
```

## Core Flows

1. LINE ส่ง event มาที่ `src/webhook/doPost.js`
2. `src/webhook/eventRouter.js` route event ไปยัง handler ที่เหมาะสม
3. `src/handlers/textHandler.js` รับผิดชอบคำสั่งทั่วไป, การค้นหา และทางเข้า admin commands
4. `src/handlers/imageHandler.js` รับผิดชอบ OCR flow และค้นหาทะเบียนจากภาพ
5. services เชื่อมกับ Google Sheets, CacheService, Google Drive, LINE API และ Gemini API
6. admin commands ถูก dispatch ต่อผ่าน `src/commands/adminCommandRouter.js`

ดู flow แบบละเอียดได้ที่ [docs/architecture-flow.md](./docs/architecture-flow.md)

## Documentation

- Entry page: [docs/index.html](./docs/index.html)
- User manual: [docs/user-manual.html](./docs/user-manual.html)
- Technical guide: [docs/technical-guide.html](./docs/technical-guide.html)
- Architecture flow: [docs/architecture-flow.html](./docs/architecture-flow.html)
- GitHub Pages workflow: [.github/workflows/docs-pages.yml](./.github/workflows/docs-pages.yml)

## Data Model

### Vehicles Schema

```text
license_plate | brand | model | color | house_no | owner_name | status | vehicle_type
```

- `vehicle_type` recommended values are `car` and `motorcycle`
- runtime normalizes the first 8 `Vehicles` headers to this schema before reading sheet data
- search replies use `🏍️` for `motorcycle` rows and `🚗` for other vehicle rows

ระบบใช้งาน Google Sheets หลักดังนี้

- `Staff`: ชื่อผู้ใช้, LINE UID, สถานะ และ role
- `Vehicles`: ทะเบียนรถ, บ้านเลขที่, เจ้าของ และสถานะรถ
- `Visitors`: ผู้ใช้ที่เคยใช้งานบอทและเวลาใช้งานล่าสุด
- `Log`: search logs สำหรับการใช้งานปกติ
- `SystemLog`: operational events เช่น alerts, health summary, maintenance failures และ admin command failures

`SystemLog` สามารถถูกสร้างอัตโนมัติพร้อม header เมื่อมีคำสั่งหรือ flow ที่ต้องใช้งาน

## Script Properties

- `LINE_ACCESS_TOKEN`
- `LINE_CHANNEL_SECRET`
- `GEMINI_API_KEY`
- `SPREADSHEET_ID`
- `ALLOWED_GROUP_IDS`
- `ADMIN_UID`
- `LOG_RETENTION_DAYS`
- `BACKUP_RETENTION_DAYS`
- `BACKUP_FOLDER_NAME`
- `DEBUG_MODE`
- `GITHUB_REPO`

## Supported Commands

### For Everyone

- `/myid`
- `/help`

### For Admins

- `/add <userId> <name> <role>`
- `/remove <userId>`
- `/setstatus <userId> <active|inactive>`
- `/setrole <userId> <admin|staff>`
- `/list`
- `/status <userId>`
- `/whois`
- `/visitors`
- `/log <count>`
- `/syslog <count>`
- `/health`
- `/health full`
- `/testalert`
- `/clearcache`
- `/version`

## Ops and Monitoring

### `/health`

- ตรวจ `Config`, `Spreadsheet`, `Cache` และ `Drive`
- ตรวจว่า `SystemLog` พร้อมใช้งาน
- รายงานเวลารวมและเวลาของแต่ละ check
- โหมดปกติจะไม่ยิง LINE live check และ Gemini live check

### `/health full`

- ทำทุกอย่างเหมือน `/health`
- เพิ่ม live check ของ LINE Profile API
- เพิ่ม live check ของ Gemini API
- เหมาะสำหรับ debugging มากกว่าการตรวจ routine

### `/syslog <count>`

- อ่าน `SystemLog` ล่าสุด
- flush buffered system logs ก่อนอ่าน
- จำกัดจำนวนผลลัพธ์สูงสุดต่อครั้ง

### `/testalert`

- สร้าง `SystemLog` ระดับ `ALERT`
- flush ลงชีตทันที
- ส่ง admin alert ไปยัง LINE
- ใช้ทดสอบ alert pipeline โดยไม่กระทบ production incident จริง

## Logging and Maintenance

### Search Log

- `writeLog()` ใช้ buffering เพื่อลดการเขียนชีตถี่เกินไป
- flush ลงชีต `Log` เมื่อครบ threshold หรือเมื่อมี explicit flush

### System Log

- `writeSystemLog()` เขียนลง `SystemLog`
- `ALERT` และ `ERROR` flush ทันที
- `WARN` และ `INFO` จะ buffer ก่อน flush
- แต่ละ event สำคัญมี `requestId` สำหรับ trace incident

### Maintenance

- `dailyMaintenance()` รัน `dailyBackup`, `cleanOldBackups` และ `dailyCleanup`
- ถ้ามี step ใด fail บางส่วน ระบบจะส่ง admin alert และเขียน `SystemLog`

## Caching and Performance

- `visitorService` มี row map cache สำหรับ `Visitors`
- `logService` ใช้ buffering เพื่อลดการเขียนชีตถี่เกินไป
- `httpService` รวม retry และ error handling สำหรับ LINE, Gemini และ GitHub checks
- `onEdit(e)` ล้าง cache ที่เกี่ยวข้องเมื่อแก้ `Staff`, `Vehicles` หรือ `Visitors`

## Automated Tests

ชุด test ปัจจุบันเป็น local tests สำหรับ pure logic ที่ไม่ต้องใช้งาน GAS runtime จริง

```bash
node tests/pure-logic.test.js
```

หรือ

```bash
npm test
```

สิ่งที่ครอบคลุมในปัจจุบัน

- plate normalization
- OCR cleanup
- OCR candidate generation
- OCR result resolution
- fuzzy matching
- similarity and edit distance logic
- `vehicle_type` formatting and icon selection for replies

## Deployment

โปรเจกต์นี้ deploy ด้วย `clasp` โดยใช้ `src/` เป็น `rootDir`

- push ไป `main`: deploy ไป BLUE / production
- push ไป `feature/**`: deploy ไป GREEN / staging

workflow อยู่ที่ [.github/workflows/deploy.yml](./.github/workflows/deploy.yml)

ระหว่าง CI จะมีการทำงานตามลำดับดังนี้

1. ติดตั้ง `@google/clasp`
2. เขียน `.clasprc.json` จาก `CLASP_TOKEN`
3. เขียน `.clasp.json` ให้ตรงกับ branch ปัจจุบัน
4. อัปเดต `src/versionInfo.js`
5. รัน `clasp push --force`
6. รัน `clasp deploy`

## Runtime Entrypoints

- Web App entrypoint: `doPost(e)` ใน `src/webhook/doPost.js`
- Spreadsheet trigger: `onEdit(e)` ใน `src/appCore.js`
- Time-driven trigger candidates:
  - `keepAlive()`
  - `dailyMaintenance()`

## Notes

- ข้อความที่ตอบผู้ใช้ผ่าน LINE คงภาษาไทยเป็นหลัก
- เอกสารสำหรับนักพัฒนาและ placeholder บางส่วนคงภาษาอังกฤษเพื่อให้ง่ายต่อการดูแลรักษา
- `src/versionInfo.js` เป็นไฟล์ที่ CI จัดการเป็นหลักและควรถือเป็น CI-managed file
