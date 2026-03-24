# LINE/GAS Test Cases

เอกสารนี้ใช้เป็น checklist สำหรับทดสอบระบบ Vehicle Verification System หลัง deploy หรือหลังแก้โค้ด โดยครอบคลุม flow ปกติ, OCR, admin commands, health checks, alerts, maintenance และ system logging

## How to Use This Document

- ใช้ร่วมกับ staging หรือ production ตามขอบเขตที่ต้องการทดสอบ
- เลือก test case ตามส่วนที่ได้รับผลกระทบจากการแก้โค้ด
- ถ้ามี incident หรือ regression ให้บันทึกทั้งข้อความตอบกลับของบอท, แถวที่เกี่ยวข้องใน `Log` หรือ `SystemLog` และ commit/version ที่กำลังทดสอบ

## Test Setup

เตรียมข้อมูลและ environment ก่อนเริ่มทดสอบ

หมายเหตุ: ตัวอย่างทะเบียนและบ้านเลขที่ในเอกสารนี้เป็นข้อมูลสมมติสำหรับการทดสอบเท่านั้น

- มี user ในชีต `Staff` อย่างน้อย 3 แบบ
- `admin_user` สถานะ `active`, role `admin`
- `staff_user` สถานะ `active`, role `staff`
- `inactive_user` สถานะ `inactive`, role ใดก็ได้
- มีข้อมูลในชีต `Vehicles` อย่างน้อยดังนี้

```text
PLATE       BRAND   MODEL   COLOR   HOUSE    OWNER   STATUS
ทด1234      Toyota  Yaris   ขาว    10/23    A       active
1ทด2345     Honda   City    ดำ     10/24    B       inactive
80-0001     Isuzu   Dmax    เทา    20/10    C       active
3ทฮ7007     Mazda   2       แดง    30/12    D       active
```

- ใน Script Properties มีค่า `ALLOWED_GROUP_IDS`
- bot ถูกเชิญเข้า group ทดสอบที่อยู่ใน allowlist แล้ว
- มี `ADMIN_UID`, `LINE_ACCESS_TOKEN`, `SPREADSHEET_ID`, `GEMINI_API_KEY`, `BACKUP_FOLDER_NAME`
- ถ้าจะทดสอบ maintenance failure ให้เตรียม staging environment ที่แก้ config ได้ชั่วคราว

## LINE Command Tests

### TC-01 `/help` สำหรับ admin

- ผู้ทดสอบ: `admin_user`
- ส่งข้อความ:

```text
/help
```

- คาดหวัง:
- เห็น `/myid`, `/help`
- เห็น admin commands ทั้งหมด รวม `/syslog`, `/health`, `/health full`, `/testalert`, `/version`

### TC-02 `/help` สำหรับ staff

- ผู้ทดสอบ: `staff_user`
- ส่งข้อความ:

```text
/help
```

- คาดหวัง:
- เห็นเฉพาะคำสั่งทั่วไป
- ไม่เห็น admin commands

### TC-03 `/myid` ในแชตส่วนตัว

- ผู้ทดสอบ: `staff_user`
- ส่งข้อความ:

```text
/myid
```

- คาดหวัง:
- มี `User ID`
- มีชื่อและ role ถ้า user อยู่ใน `Staff`
- ไม่มี `Group ID`

### TC-04 `/myid` ใน group ที่อนุญาต

- ผู้ทดสอบ: `staff_user`
- ส่งใน group ที่อนุญาต:

```text
/myid
```

- คาดหวัง:
- มี `User ID`
- มี `Group ID`

### TC-05 staff ใช้งานนอก group ที่อนุญาต

- ผู้ทดสอบ: `staff_user`
- ส่งในห้องที่ไม่อยู่ใน `ALLOWED_GROUP_IDS`:

```text
ทด1234
```

- คาดหวัง:
- ระบบตอบปฏิเสธการใช้งานในกลุ่มที่ไม่อนุญาต

### TC-06 admin ใช้งานนอก group ที่อนุญาต

- ผู้ทดสอบ: `admin_user`
- ส่งข้อความ:

```text
ทด1234
```

- คาดหวัง:
- ค้นหาได้ปกติ

### TC-07 ค้นหาทะเบียนแบบตรงตัว

- ผู้ทดสอบ: `staff_user`
- ส่งข้อความ:

```text
ทด1234
```

- คาดหวัง:
- พบข้อมูลรถ
- แสดงยี่ห้อ รุ่น สี บ้านเลขที่ และสถานะ

### TC-08 ค้นหาทะเบียนที่ไม่มี

- ผู้ทดสอบ: `staff_user`
- ส่งข้อความ:

```text
ทด9999
```

- คาดหวัง:
- ตอบว่าไม่พบทะเบียนในระบบ

### TC-09 ค้นหาทะเบียนเลขล้วนมีขีด

- ผู้ทดสอบ: `staff_user`
- ส่งข้อความ:

```text
80-0001
```

- คาดหวัง:
- พบข้อมูลรถคันที่ตรงกัน

### TC-10 ค้นหาบ้านเลขที่

- ผู้ทดสอบ: `staff_user`
- ส่งข้อความ:

```text
10/23
```

- คาดหวัง:
- พบรถของบ้านเลขที่นั้น

### TC-11 ข้อความยาวเกิน limit

- ผู้ทดสอบ: `staff_user`
- ส่งข้อความ:

```text
123456789012345678901234567890123456789012345678901
```

- คาดหวัง:
- ตอบว่าข้อความยาวเกินไป

### TC-12 staff เรียก admin command

- ผู้ทดสอบ: `staff_user`
- ส่งข้อความ:

```text
/list
```

- คาดหวัง:
- ตอบว่าคำสั่งนี้สำหรับ Admin เท่านั้น

## Search and OCR Matching Tests

### TC-13 OCR อ่านได้และพบทะเบียนตรงตัว

- ผู้ทดสอบ: `staff_user`
- ส่งรูปป้าย `ทด1234`
- คาดหวัง:
- แสดง `อ่านจากรูปได้: ทด1234`
- แสดงข้อมูลรถตามสถานะ
- ไม่แสดงรายการใกล้เคียง

### TC-14 OCR อ่านได้แต่ไม่พบตรงตัว และมีเลขใกล้เคียง

- ผู้ทดสอบ: `staff_user`
- ในชีตมี `3ทฮ7007`
- ส่งรูปที่ OCR อ่านออกเป็น `3ทอ7007`
- คาดหวัง:
- แสดง `อ่านจากรูปได้: 3ทอ7007`
- แสดงว่าไม่พบข้อมูลตรงตัวในระบบ
- แสดงส่วน `ใกล้เคียงที่อาจเป็น`
- แสดงผลตรวจให้ตรวจป้ายอีกครั้ง

### TC-15 OCR อ่านได้แต่ไม่พบตรงตัว และไม่มีเลขใกล้เคียง

- ผู้ทดสอบ: `staff_user`
- ส่งรูปที่ OCR อ่านได้เป็นทะเบียนที่ไม่มีในชีตและไม่ใกล้รายการใด
- คาดหวัง:
- แสดงว่าไม่พบข้อมูลตรงตัวในระบบ
- ไม่แสดงส่วน `ใกล้เคียงที่อาจเป็น`
- แสดง `ผลตรวจ: ให้แลกบัตร`

### TC-16 OCR รูปไม่ชัด

- ผู้ทดสอบ: `staff_user`
- ส่งรูปเบลอหรือมืดมาก
- คาดหวัง:
- แสดง `📷 อ่านป้ายไม่ชัด`
- แสดง `ผลตรวจ: กรุณาถ่ายใหม่ หรือพิมพ์เลขทะเบียน`
- ไม่มี exception หลุดจนระบบเงียบ

### TC-17 OCR จาก user ไม่มีสิทธิ์

- ผู้ทดสอบ: user ที่ไม่อยู่ใน `Staff`
- ส่งรูปทะเบียน
- คาดหวัง:
- bot ตอบว่าไม่มีสิทธิ์เข้าถึงระบบ

### TC-18 OCR จาก staff ใน group ที่ไม่อนุญาต

- ผู้ทดสอบ: `staff_user`
- ส่งรูปในกลุ่มที่ไม่อยู่ใน allowlist
- คาดหวัง:
- bot ปฏิเสธการใช้งาน

### TC-19 พิมพ์ทะเบียนผิด แต่มีเลขใกล้เคียง

- ผู้ทดสอบ: `staff_user`
- ส่งข้อความ:

```text
3ทอ7007
```

- ในชีตมี `3ทฮ7007`
- คาดหวัง:
- แสดง `ใกล้เคียงที่อาจเป็น`
- แสดง `ผลตรวจ: กรุณาตรวจทะเบียนอีกครั้ง`

### TC-20 พิมพ์ทะเบียนพร้อมช่องว่างหรือขีด

- ผู้ทดสอบ: `staff_user`
- ส่งข้อความหลายแบบ เช่น:

```text
3 ทฮ 7007
3ทฮ-7007
80 0001
80-0001
```

- คาดหวัง:
- ระบบ normalize แล้วค้นหาได้ผลลัพธ์เดียวกัน

## Admin Command Tests

### TC-21 `/log <count>`

- ผู้ทดสอบ: `admin_user`
- ส่งข้อความ:

```text
/log 5
```

- คาดหวัง:
- เห็น search log ล่าสุด
- ถ้ามี buffered log อยู่ คำสั่งนี้ควร flush ก่อนอ่าน

### TC-22 `/syslog <count>`

- ผู้ทดสอบ: `admin_user`
- ส่งข้อความ:

```text
/syslog 5
```

- คาดหวัง:
- เห็น `SystemLog` ล่าสุด
- แสดงเวลา, level, source, event และ `req:`

### TC-23 `/health`

- ผู้ทดสอบ: `admin_user`
- ส่งข้อความ:

```text
/health
```

- คาดหวัง:
- มี header `Health check`
- มี `Total: ... ms`
- มีรายละเอียด `Config`, `Spreadsheet`, `Cache`, `Drive`, `LINE API`, `Gemini API`
- `LINE API` และ `Gemini API` ต้องเป็นการตรวจแบบ skip live check ใน default mode
- ถ้ายังไม่มี `SystemLog` ระบบควรสร้างชีตให้อัตโนมัติ

### TC-24 `/health full`

- ผู้ทดสอบ: `admin_user`
- ส่งข้อความ:

```text
/health full
```

- คาดหวัง:
- header มี `(full)`
- LINE API ถูกตรวจ live check
- Gemini API ถูกตรวจ live check
- ถ้า response ช้า อาจมี `Slow checks: ...`

### TC-25 `/testalert`

- ผู้ทดสอบ: `admin_user`
- ส่งข้อความ:

```text
/testalert
```

- คาดหวัง:
- bot ตอบว่าทำสำเร็จ
- admin ได้รับ push `[TEST ALERT]`
- ใน `SystemLog` มี event `manual_test_alert`
- แถว log ควรเห็นทันทีโดยไม่ต้องรอ buffer ครบ

### TC-26 `/version`

- ผู้ทดสอบ: `admin_user`
- ส่งข้อความ:

```text
/version
```

- คาดหวัง:
- แสดง SHA/branch/version ปัจจุบัน
- ถ้าตั้ง `GITHUB_REPO` ถูกต้อง ควรเปรียบเทียบกับ latest commit ได้

## SystemLog and Maintenance Tests

### TC-27 `SystemLog` auto-create

- ลบชีต `SystemLog` ใน staging
- ส่ง `/health`
- คาดหวัง:
- ระบบสร้าง `SystemLog` พร้อม header

### TC-28 `SystemLog` retention

- สร้างข้อมูลเก่าใน `SystemLog`
- รัน `dailyMaintenance()`
- คาดหวัง:
- ข้อมูลเก่ากว่า `LOG_RETENTION_DAYS` ถูกล้างออก

### TC-29 Maintenance partial failure alert

- ใน staging ทำให้หนึ่งใน maintenance steps fail ชั่วคราว
- รัน `dailyMaintenance()`
- คาดหวัง:
- admin ได้รับ alert `[ALERT] Daily maintenance partial failure`
- `SystemLog` มี event `maintenance_partial_failure`

### TC-30 Log buffering

- ทำการค้นหา 1-3 ครั้ง
- เปิดชีต `Log`
- คาดหวัง:
- อาจยังไม่เห็น log ทันทีถ้ายังไม่ครบ buffer
- เมื่อส่ง `/log 10` หรือรอให้มีการ flush แล้ว ข้อมูลต้องถูกเขียนลงชีต

## Local Automated Tests

### TC-31 รัน pure logic tests

- รันคำสั่ง:

```bash
node tests/pure-logic.test.js
```

- คาดหวัง:
- ผ่านทุก test
- ไม่มี dependency กับ GAS runtime จริง

### TC-32 รันผ่าน npm script

- รันคำสั่ง:

```bash
npm test
```

- คาดหวัง:
- ผลลัพธ์เทียบเท่ากับ `node tests/pure-logic.test.js`

## Notes

- ถ้า environment มี PowerShell execution policy ที่บล็อก `npm.ps1` ให้ใช้ `node tests/pure-logic.test.js` แทน
- การทดสอบ staging ควรทำหลัง deploy branch `feature/**` และตรวจสอบ `/version` ให้ตรงกับ commit ที่ต้องการ
- ถ้าต้อง debug incident ให้ใช้ `/health`, `/syslog`, `SystemLog` และ LINE admin alert ประกอบกัน
