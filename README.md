# Vehicle Verification System

ระบบตรวจสอบทะเบียนรถลูกบ้านบน LINE Bot สำหรับโครงการหมู่บ้าน พัฒนาด้วย Google Apps Script และใช้งาน Google Sheets เป็นฐานข้อมูลหลัก รองรับการค้นหาทะเบียนด้วยข้อความ, OCR จากรูปภาพ, คำสั่งแอดมิน, system health check, system alerts และ logging สำหรับงานปฏิบัติการ

## ภาพรวม

- รับ webhook จาก LINE Messaging API ผ่าน `doPost(e)`
- รองรับการค้นหาด้วยทะเบียนรถและบ้านเลขที่
- รองรับ OCR จากรูปภาพผ่าน LINE Content API + Gemini API
- แยก admin commands เป็นไฟล์ย่อยเพื่อลด conflict และรีวิวได้ง่าย
- มี `SystemLog`, `/health`, `/health full`, `/syslog`, `/testalert`
- มี maintenance jobs สำหรับ backup, cleanup และแจ้งเตือน partial failures
- มี local automated tests สำหรับ pure logic ที่รันได้เร็ว

## โครงสร้างโปรเจกต์

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
```

## การทำงานโดยสรุป

1. LINE ส่ง event มาที่ `src/webhook/doPost.js`
2. `src/webhook/eventRouter.js` route event ไปยัง handler ที่เหมาะสม
3. `textHandler` รับผิดชอบข้อความทั่วไป, help, search, และ admin command entry
4. `imageHandler` รับผิดชอบ OCR flow และค้นหาทะเบียนจากภาพ
5. services จะเชื่อมกับ Google Sheets, CacheService, Google Drive, LINE API และ Gemini API
6. admin commands จะถูก dispatch ต่อใน `src/commands/adminCommandRouter.js`

รายละเอียด flow แบบเต็มดูได้ที่ [docs/architecture-flow.md](./docs/architecture-flow.md)

หน้าเอกสารหลัก:

- [docs/index.html](./docs/index.html)

คู่มือที่อัปเดตตาม codebase ปัจจุบัน:

- [docs/user-manual.html](./docs/user-manual.html)
- [docs/technical-guide.html](./docs/technical-guide.html)
- [docs/architecture-flow.html](./docs/architecture-flow.html)

GitHub Pages support:

- entry page: [docs/index.html](./docs/index.html)
- workflow: [.github/workflows/docs-pages.yml](./.github/workflows/docs-pages.yml)

## Google Sheets ที่ระบบใช้

- `Staff`
  ใช้เก็บชื่อ, LINE UID, status, role
- `Vehicles`
  ใช้เก็บทะเบียนรถ, บ้านเลขที่, เจ้าของ และสถานะรถ
- `Visitors`
  ใช้เก็บผู้ใช้ที่เคยใช้งานบอท และเวลาใช้งานล่าสุด
- `Log`
  ใช้เก็บ search logs ของผู้ใช้
- `SystemLog`
  ใช้เก็บ system events เช่น alert, health summary, maintenance failure, admin command failures

`SystemLog` สามารถถูกสร้างอัตโนมัติพร้อม header ได้เมื่อระบบเริ่มใช้งานคำสั่งที่เกี่ยวข้อง เช่น `/health`

## Script Properties หลัก

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

## คำสั่งที่รองรับ

### ทุกคน

- `/myid`
- `/help`

### Admin เท่านั้น

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

## Ops และ Monitoring

### `/health`

- เช็ก `Config`, `Spreadsheet`, `Cache`, `Drive`
- ตรวจว่า `SystemLog` มีอยู่และพร้อมใช้งาน
- แสดงเวลารวมและเวลาของแต่ละ check
- โหมดปกติจะไม่ยิง LINE live check และไม่ยิง Gemini live check

### `/health full`

- ทำทุกอย่างเหมือน `/health`
- เพิ่ม live check ของ LINE Profile API
- เพิ่ม live check ของ Gemini API
- เหมาะกับการ debug มากกว่าการใช้เป็น routine check

### `/syslog <count>`

- อ่าน `SystemLog` ล่าสุด
- flush buffered system logs ก่อนอ่าน
- จำกัดจำนวนที่อ่านต่อครั้งไม่เกิน 20 รายการ

### `/testalert`

- สร้าง `SystemLog` ระดับ `ALERT`
- flush ลงชีตทันที
- push admin alert ไปยัง LINE
- ใช้ทดสอบ alert pipeline โดยไม่ต้องทำให้ระบบจริงพัง

## Logging และ Alerting

### Search log

- `writeLog()` จะ buffer logs ไว้ก่อน
- flush ลงชีต `Log` เมื่อครบ 10 รายการ หรือเมื่อ maintenance เรียก flush

### System log

- `writeSystemLog()` เขียนลง `SystemLog`
- `ALERT` และ `ERROR` จะ flush ลงชีตทันที
- `WARN` และ `INFO` จะ buffer และ flush เมื่อครบ 5 รายการ หรือเมื่อมี explicit flush
- มี `requestId` สำหรับ trace event สำคัญ

### Maintenance alerts

- `dailyMaintenance()` รัน `dailyBackup`, `cleanOldBackups`, `dailyCleanup`
- ถ้ามี step ใด fail จะส่ง admin alert และเขียน `SystemLog`

## การจัดการ cache และ performance

- `visitorService` มี row map cache สำหรับ `Visitors`
- `logService` ใช้ buffering เพื่อลดการเขียนชีตถี่เกินไป
- `httpService` รวม retry/error handling ของ LINE, Gemini และ GitHub checks
- `onEdit(e)` จะล้าง cache อัตโนมัติเมื่อแก้ `Staff`, `Vehicles`, `Visitors`

## Automated Tests

ชุด test ปัจจุบันเป็น local tests สำหรับ pure logic ที่ไม่ต้องแตะ GAS runtime จริง

รันด้วย:

```bash
node tests/pure-logic.test.js
```

หรือ:

```bash
npm test
```

สิ่งที่เทสอยู่ตอนนี้:

- plate normalization
- OCR cleanup
- OCR candidate generation
- OCR resolution
- fuzzy matching
- similarity/edit distance logic

## Deployment

โปรเจกต์นี้ deploy ด้วย `clasp` โดยใช้ `src/` เป็น `rootDir`

- push ไป `main`
  deploy ไป BLUE / production
- push ไป `feature/**`
  deploy ไป GREEN / staging

workflow อยู่ที่ [.github/workflows/deploy.yml](./.github/workflows/deploy.yml)

ระหว่าง CI จะมีการ:

1. ติดตั้ง `@google/clasp`
2. เขียน `.clasprc.json` จาก `CLASP_TOKEN`
3. เขียน `.clasp.json` ให้ตรงกับ branch
4. inject `src/versionInfo.js`
5. รัน `clasp push --force`
6. รัน `clasp deploy`

## Runtime entrypoints

- Web App webhook entrypoint: `doPost(e)` ใน `src/webhook/doPost.js`
- Spreadsheet trigger: `onEdit(e)` ใน `src/appCore.js`
- time-driven trigger candidates:
  - `keepAlive()`
  - `dailyMaintenance()`

## หมายเหตุ

- ข้อความตอบผู้ใช้ใน LINE ตั้งใจคงภาษาไทยไว้
- developer-facing text, usage placeholders และ internal docs ค่อย ๆ ปรับเป็นอังกฤษเพื่อลดปัญหา encoding ระหว่างแก้ไขไฟล์
