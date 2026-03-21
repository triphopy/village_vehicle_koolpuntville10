# LINE/GAS Test Cases

เอกสารนี้ใช้สำหรับทดสอบระบบ Vehicle Verification System หลัง deploy หรือหลังแก้โค้ด โดยเน้นทั้ง flow ปกติ, OCR, admin commands และกรณี backend service มีปัญหา

## Test Setup

เตรียมข้อมูลก่อนเริ่มทดสอบ

- มี user ในชีต `Staff` อย่างน้อย 3 แบบ
- `admin_user` สถานะ `active`, role `admin`
- `staff_user` สถานะ `active`, role `staff`
- `inactive_user` สถานะ `inactive`, role ใดก็ได้
- มีข้อมูลในชีต `Vehicles` อย่างน้อยดังนี้

```text
PLATE       BRAND   MODEL   COLOR   HOUSE    OWNER   STATUS
กข1234      Toyota  Yaris   ขาว    1/23     A       active
1กข2345     Honda   City    ดำ     1/24     B       inactive
80-1234     Isuzu   Dmax    เทา    2/10     C       active
3ขฮ8777     Mazda   2       แดง    3/12     D       active
```

- ใน Script Properties มีค่า `ALLOWED_GROUP_IDS`
- bot ถูกเชิญเข้า group ทดสอบที่อยู่ใน allowlist แล้ว
- มี Web App URL สำหรับยิงทดสอบ webhook
- ถ้าจะทดสอบกรณี service down ให้เตรียมวิธีทำให้ `SPREADSHEET_ID`, สิทธิ์ Spreadsheet หรือสิทธิ์ Drive ใช้งานไม่ได้ชั่วคราว

## LINE Command Tests

### TC-01 `/help` สำหรับ admin

- ผู้ทดสอบ: `admin_user`
- ส่งข้อความ:

```text
/help
```

- คาดหวัง:
- เห็น `/myid`, `/help`
- เห็น admin commands เช่น `/add`, `/remove`, `/setstatus`, `/setrole`, `/list`, `/status`, `/whois`, `/visitors`, `/log`, `/clearcache`, `/version`

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
- มีชื่อและ role
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
กข1234
```

- คาดหวัง:
- ระบบตอบปฏิเสธการใช้งานในกลุ่มที่ไม่อนุญาต

### TC-06 admin ใช้งานนอก group ที่อนุญาต

- ผู้ทดสอบ: `admin_user`
- ส่งข้อความ:

```text
กข1234
```

- คาดหวัง:
- ค้นหาได้ปกติ

### TC-07 ค้นหาทะเบียนแบบตรงตัว

- ผู้ทดสอบ: `staff_user`
- ส่งข้อความ:

```text
กข1234
```

- คาดหวัง:
- พบข้อมูลรถ
- แสดงยี่ห้อ รุ่น สี บ้านเลขที่ และสถานะ

### TC-08 ค้นหาทะเบียนที่ไม่มี

- ผู้ทดสอบ: `staff_user`
- ส่งข้อความ:

```text
กก9999
```

- คาดหวัง:
- ตอบว่าไม่พบทะเบียนในระบบ

### TC-09 ค้นหาทะเบียนเลขล้วนมีขีด

- ผู้ทดสอบ: `staff_user`
- ส่งข้อความ:

```text
80-1234
```

- คาดหวัง:
- พบข้อมูลรถคันที่ตรงกัน

### TC-10 ค้นหาบ้านเลขที่

- ผู้ทดสอบ: `staff_user`
- ส่งข้อความ:

```text
1/23
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
- ส่งรูปป้าย `กข1234`
- คาดหวัง:
- แสดง `อ่านจากรูปได้: กข1234`
- แสดงข้อมูลรถตามสถานะ
- ไม่แสดงรายการใกล้เคียง

### TC-14 OCR อ่านได้แต่ไม่พบตรงตัว และมีเลขใกล้เคียง

- ผู้ทดสอบ: `staff_user`
- ในชีตมี `3ขฮ8777`
- ส่งรูปที่ OCR อ่านออกเป็น `3ขอ8777`
- คาดหวัง:
- แสดง `อ่านจากรูปได้: 3ขอ8777`
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
3ขอ8777
```

- ในชีตมี `3ขฮ8777`
- คาดหวัง:
- แสดง `ใกล้เคียงที่อาจเป็น`
- แสดง `ผลตรวจ: กรุณาตรวจทะเบียนอีกครั้ง`

### TC-20 พิมพ์ทะเบียนพร้อมช่องว่างหรือขีด

- ผู้ทดสอบ: `staff_user`
- ส่งข้อความหลายแบบ เช่น:

```text
3 ขฮ 8777
3ขฮ-8777
80 1234
80-1234
```

- คาดหวัง:
- ระบบค้นหาเจอข้อมูลเดียวกันได้
- ไม่ติดจากช่องว่างหรือขีด

### TC-21 ค้นหาบ้านเลขที่ไม่ควรมี `ผลตรวจ:`

- ผู้ทดสอบ: `staff_user`
- ส่งข้อความ:

```text
1/23
```

- คาดหวัง:
- แสดงรายการรถตามบ้านเลขที่
- แสดงสถานะ
- ไม่แสดง `ผลตรวจ:`

## Admin Command Tests

### TC-22 `/status` ของ user active

- ผู้ทดสอบ: `admin_user`
- ส่งข้อความ:

```text
/status <admin_user_id>
```

- คาดหวัง:
- แสดงชื่อ
- แสดง role
- แสดง `Status: active`

### TC-23 `/status` ของ user inactive

- ผู้ทดสอบ: `admin_user`
- ส่งข้อความ:

```text
/status <inactive_user_id>
```

- คาดหวัง:
- แสดงชื่อจริงของ user
- แสดง `Status: inactive`
- ไม่ตอบว่า “ไม่พบ”

### TC-24 `/status` ของ user ที่ไม่มีในระบบ

- ผู้ทดสอบ: `admin_user`
- ส่งข้อความ:

```text
/status U_NOT_FOUND
```

- คาดหวัง:
- ตอบว่าไม่พบ User ID นี้ในระบบ

### TC-25 `/log` แบบปกติ

- ผู้ทดสอบ: `admin_user`
- ส่งข้อความ:

```text
/log 5
```

- คาดหวัง:
- แสดง log ล่าสุด 5 รายการหรือน้อยกว่า
- ไม่เกิด error

### TC-26 `/log` ใส่ค่ามั่ว

- ผู้ทดสอบ: `admin_user`
- ส่งข้อความ:

```text
/log abc
```

- คาดหวัง:
- ไม่พัง
- ใช้ค่า default แทน

### TC-27 `/log` เกิน limit

- ผู้ทดสอบ: `admin_user`
- ส่งข้อความ:

```text
/log 999
```

- คาดหวัง:
- ไม่พัง
- จำกัดจำนวนสูงสุดตามที่ระบบกำหนด

### TC-28 `/visitors` แสดงผู้ใช้เคยเข้าระบบ

- ผู้ทดสอบ: `admin_user`
- ส่งข้อความ:

```text
/visitors
```

- คาดหวัง:
- เห็น user ที่เคยส่งข้อความเข้า bot
- มี `last:` ของแต่ละคน

### TC-29 ทดสอบ `last seen` ขยับจริง

- ผู้ทดสอบ: `staff_user`
- ขั้นตอน:

```text
1. ส่ง "กข1234"
2. รอ 2-3 นาที
3. ส่ง "1/23"
4. ให้ admin ส่ง "/visitors"
```

- คาดหวัง:
- `last seen` เป็นเวลาล่าสุดจากข้อความรอบสอง ไม่ใช่เวลารอบแรก

### TC-30 เพิ่ม staff ใหม่

- ผู้ทดสอบ: `admin_user`
- ส่งข้อความ:

```text
/add <new_user_id> ทดสอบ staff
```

- คาดหวัง:
- ตอบว่าเพิ่มสำเร็จ
- `/status <new_user_id>` เห็น `active`

### TC-31 เปลี่ยน status เป็น inactive

- ผู้ทดสอบ: `admin_user`
- ส่งข้อความ:

```text
/setstatus <new_user_id> inactive
```

- คาดหวัง:
- ตอบว่าเปลี่ยนสำเร็จ
- `/status <new_user_id>` แสดง `inactive`
- user นี้ค้นหาทะเบียนต่อไม่ได้

### TC-32 เปลี่ยน role เป็น admin

- ผู้ทดสอบ: `admin_user`
- ส่งข้อความ:

```text
/setrole <new_user_id> admin
```

- คาดหวัง:
- ตอบว่าเปลี่ยนสำเร็จ
- `/status <new_user_id>` แสดง role เป็น `admin`

### TC-33 ลบ user

- ผู้ทดสอบ: `admin_user`
- ส่งข้อความ:

```text
/remove <new_user_id>
```

- คาดหวัง:
- ตอบว่าลบสำเร็จ
- `/status <new_user_id>` ต้องไม่พบ

## GAS / Webhook Tests

หมายเหตุ: โค้ดปัจจุบันไม่มี query token guard ที่ webhook แล้ว จึงควรทดสอบตามพฤติกรรมจริงของ `doPost(e)`

### TC-34 เรียก webhook โดยไม่มี body

- เครื่องมือ: Postman หรือ `curl`
- ส่ง `POST` ไป Web App URL โดยไม่มี JSON body
- คาดหวัง:
- response เป็น `Bad Request`
- ไม่มี exception หลุดใน execution log

### TC-35 เรียก webhook ด้วย body ว่าง

- เครื่องมือ: Postman หรือ `curl`
- body:

```json
{"events":[]}
```

- คาดหวัง:
- response เป็น `OK`

### TC-36 เรียก webhook ด้วย payload ที่ไม่มี `userId`

- เครื่องมือ: Postman หรือ `curl`
- body:

```json
{
  "events": [
    {
      "type": "message",
      "replyToken": "dummy",
      "message": { "type": "text", "text": "กข1234" },
      "source": {}
    }
  ]
}
```

- คาดหวัง:
- response เป็น `OK`
- ระบบไม่พัง
- event ถูก ignore เพราะไม่มี `userId`

### TC-37 ตรวจ execution log ตอน OCR ล้มเหลว

- ตั้ง `GEMINI_API_KEY` ให้ผิดชั่วคราว
- ส่งรูปเข้า bot
- คาดหวัง:
- bot ตอบว่าอ่านไม่ได้
- ไม่มี script crash
- มี log สำหรับ debug

## Service Outage Tests

### TC-38 Sheets อ่านสดไม่ได้ แต่มี stale cache

- วิธีเตรียม:
- ให้ `staff_user` ค้นหา `กข1234` อย่างน้อย 1 ครั้ง เพื่อ warm cache
- จากนั้นทำให้ Spreadsheet อ่านสดไม่ได้ชั่วคราว เช่น เปลี่ยน `SPREADSHEET_ID` หรือปิดสิทธิ์
- ผู้ทดสอบ: `staff_user`
- ส่งข้อความ:

```text
กข1234
```

- คาดหวัง:
- ระบบยังตอบได้จาก cache เดิม
- ไม่มี 500
- execution log มีข้อความประมาณ `Using stale cache for sheet ...`

### TC-39 Sheets อ่านไม่ได้ และไม่มี stale cache

- วิธีเตรียม:
- ล้าง cache หรือใช้ environment ใหม่ที่ยังไม่เคย warm cache
- ทำให้ Spreadsheet อ่านไม่ได้ชั่วคราว
- ผู้ทดสอบ: `staff_user`
- ส่งข้อความ:

```text
กข1234
```

- คาดหวัง:
- bot ตอบ `⚠️ ระบบฐานข้อมูลชั่วคราวใช้งานไม่ได้`
- webhook ไม่ตกเป็น `Internal Server Error`

### TC-40 staff lookup ล้มระหว่างเช็กสิทธิ์

- วิธีเตรียม:
- ทำให้ชีต `Staff` อ่านไม่ได้ชั่วคราว
- ผู้ทดสอบ: `staff_user`
- ส่งข้อความ:

```text
/myid
```

- คาดหวัง:
- bot ตอบ `⚠️ ระบบฐานข้อมูลชั่วคราวใช้งานไม่ได้`
- ไม่เกิด exception หลุด

### TC-41 admin command ตอน Sheets ใช้งานไม่ได้

- วิธีเตรียม:
- ทำให้ชีต `Staff` อ่านหรือเขียนไม่ได้ชั่วคราว
- ผู้ทดสอบ: `admin_user`
- ส่งข้อความ:

```text
/list
```

- คาดหวัง:
- bot ตอบ `⚠️ ระบบฐานข้อมูลชั่วคราวใช้งานไม่ได้`
- admin command ไม่พา request ล้มทั้งก้อน

### TC-42 track visitor หรือ write log เขียนชีตไม่ได้

- วิธีเตรียม:
- ทำให้เขียนชีต `Visitors` หรือ `Log` ไม่ได้ชั่วคราว
- ผู้ทดสอบ: `staff_user`
- ส่งข้อความ:

```text
กข1234
```

- คาดหวัง:
- bot ยังตอบผลค้นหาได้
- execution log มีข้อความ `trackUser skipped:` หรือ `writeLog skipped:`
- request ไม่พังเพราะงานเขียน log/visitor

### TC-43 Daily maintenance ตอน Drive ใช้งานไม่ได้

- วิธีเตรียม:
- ทำให้ `DriveApp` ใช้งานไม่ได้ชั่วคราว หรือโฟลเดอร์ backup เข้าถึงไม่ได้
- เรียก `dailyMaintenance()`
- คาดหวัง:
- ฟังก์ชันไม่ crash ทั้งชุด
- execution log มี `dailyBackup failed:` หรือ `cleanOldBackups failed:`
- มี log ว่า maintenance จบแบบ `partial failures`

## Curl Examples

แทนค่า `<WEB_APP_URL>`

### ส่ง webhook โดยตรง

```bash
curl -X POST "<WEB_APP_URL>" ^
  -H "Content-Type: application/json" ^
  -d "{\"events\":[]}"
```

### ส่ง webhook แบบ message text จำลอง

```bash
curl -X POST "<WEB_APP_URL>" ^
  -H "Content-Type: application/json" ^
  -d "{\"events\":[{\"type\":\"message\",\"replyToken\":\"dummy\",\"message\":{\"type\":\"text\",\"text\":\"กข1234\"},\"source\":{\"userId\":\"U_TEST\",\"groupId\":\"G_TEST\"}}]}"
```
