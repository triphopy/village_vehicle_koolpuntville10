ระบบตรวจสอบทะเบียนรถลูกบ้าน (Vehicle Verification System) คือระบบแชทบอทบน LINE ที่มีวัตถุประสงค์เพื่อจัดเก็บและตรวจสอบข้อมูลทะเบียนรถของผู้อยู่อาศัยภายในโครงการ รองรับการใช้งานโดยลูกบ้านและเจ้าหน้าที่ที่เกี่ยวข้อง ผ่านแอปพลิเคชัน LINE ที่คุ้นเคย เพื่อเสริมสร้างความปลอดภัยและความเป็นระเบียบในการบริหารจัดการยานพาหนะภายในพื้นที่โครงการ

## โครงสร้างโปรเจกต์

โปรเจกต์นี้พัฒนาบน Google Apps Script และ deploy ด้วย `clasp` โดยใช้ `src/` เป็น `rootDir`

```text
src/
  appCore.js
  appsscript.json
  webhook/
    doPost.js
    eventRouter.js
  handlers/
    followHandler.js
    imageHandler.js
    textHandler.js
  services/
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
      listUsersCommand.js
      logCommand.js
      removeUserCommand.js
      setRoleCommand.js
      setStatusCommand.js
      statusCommand.js
      visitorsCommand.js
      whoisCommand.js
```

## การทำงานโดยสรุป

1. LINE webhook เรียก `doPost(e)` ใน `src/webhook/doPost.js`
2. `eventRouter.js` แยกประเภท event
3. event จะถูกส่งต่อไปยัง handler ตามชนิดของข้อความ
4. handler เรียกใช้ service ที่เกี่ยวข้อง เช่น OCR, ค้นหาทะเบียน, สิทธิ์ผู้ใช้, LINE API
5. คำสั่ง admin จะถูก route ต่อไปยัง command แยกรายคำสั่ง

## หน้าที่ของแต่ละส่วน

### Core

- `src/appCore.js`
- เก็บ shared configuration, column mapping, `onEdit(e)`, และ `debugToLine()`

### Webhook

- `src/webhook/doPost.js`
- จุดเข้า Web App และ parse request

- `src/webhook/eventRouter.js`
- แยก event ไปยัง handler ที่เหมาะสม

### Handlers

- `src/handlers/followHandler.js`
- ตอบกลับเมื่อ user เพิ่ม bot

- `src/handlers/imageHandler.js`
- จัดการรูปภาพและ flow OCR

- `src/handlers/textHandler.js`
- จัดการข้อความทั่วไป, search, help, และ admin command entry

### Services

- `src/services/ocrService.js`
- OCR, fuzzy match, correction logic

- `src/services/staffService.js`
- staff lookup, cache, และสิทธิ์การใช้งาน

- `src/services/lineService.js`
- LINE profile lookup, reply, push message

- `src/services/vehicleSearchService.js`
- ค้นหาทะเบียนและบ้านเลขที่

- `src/services/visitorService.js`
- ติดตามผู้ใช้ที่เคยใช้งานระบบ

- `src/services/logService.js`
- เขียน log ลงชีต

- `src/services/maintenanceService.js`
- backup, cleanup, และ maintenance jobs

### Commands

- `src/commands/adminCommandRouter.js`
- แยก admin command ไปยังคำสั่งย่อย

- `src/commands/admin/*.js`
- แยก logic ของแต่ละคำสั่ง admin ออกจากกันเพื่อลด conflict และ review ง่ายขึ้น

## จุดที่ GAS เรียกโดยตรง

- `doPost(e)` สำหรับ Web App webhook
- `onEdit(e)` สำหรับ clear cache หลังแก้ข้อมูลในชีต
- ฟังก์ชัน maintenance เช่น `keepAlive()` หรือ `dailyMaintenance()` สามารถนำไปตั้ง time-driven trigger ได้

## ประโยชน์ของโครงสร้างใหม่

- ลด conflict จากไฟล์ monolithic เดิม
- แยกความรับผิดชอบของแต่ละส่วนชัดเจนขึ้น
- เพิ่ม feature และรีวิวโค้ดได้ง่ายขึ้น
- รองรับการทำงานพร้อมกันหลายคนได้ดีกว่าเดิม
