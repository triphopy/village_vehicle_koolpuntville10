# Architecture and Process Flow

เอกสารนี้สรุป flow การทำงานของระบบตั้งแต่รับ webhook จาก LINE ไปจนถึงการค้นหาข้อมูล, OCR, admin commands, health checks, logging, maintenance และ deployment เพื่อใช้เป็นภาพรวมสำหรับการดูแลระบบและรีวิวการเปลี่ยนแปลง

## 1. System Overview

```mermaid
flowchart TD
    U["LINE User"] --> LINE["LINE Messaging API"]
    LINE --> WEBHOOK["GAS Web App doPost(e)"]
    WEBHOOK --> PARSE["parse request + requestId"]
    PARSE --> ROUTER["routeLineEvent"]

    ROUTER --> FOLLOW["followHandler"]
    ROUTER --> TEXT["textHandler"]
    ROUTER --> IMAGE["imageHandler"]

    TEXT --> STAFF["staffService"]
    TEXT --> SEARCH["vehicleSearchService"]
    TEXT --> ADMIN["adminCommandRouter"]
    TEXT --> VISITOR["visitorService"]
    TEXT --> LOG["logService"]
    TEXT --> LINEAPI["lineService"]

    IMAGE --> STAFF
    IMAGE --> OCR["ocrService"]
    IMAGE --> SEARCH
    IMAGE --> VISITOR
    IMAGE --> LOG
    IMAGE --> LINEAPI

    ADMIN --> HEALTH["healthCommand"]
    ADMIN --> SYSLOG["syslogCommand"]
    ADMIN --> TESTALERT["testAlertCommand"]
    ADMIN --> VERSION["versionCommand"]

    STAFF --> SHEETS["Google Sheets"]
    SEARCH --> SHEETS
    VISITOR --> SHEETS
    LOG --> SHEETS
    HEALTH --> SHEETS
    OCR --> LINECONTENT["LINE Content API"]
    OCR --> GEMINI["Gemini API"]
    LINEAPI --> LINEHTTP["LINE Reply / Push / Profile API"]
```

## 2. Component Map

```mermaid
flowchart LR
    subgraph CLIENT["Client Layer"]
        U["LINE User"]
        LINE["LINE Messaging API"]
    end

    subgraph GAS["Google Apps Script Application"]
        WEBHOOK["Webhook Layer<br/>doPost.js / eventRouter.js"]
        HANDLERS["Handlers<br/>textHandler / imageHandler / followHandler"]
        COMMANDS["Admin Commands<br/>adminCommandRouter + admin/*.js"]
        SERVICES["Services<br/>http / line / log / maintenance / ocr / staff / search / visitor"]
        CORE["Core Config<br/>appCore.js / versionInfo.js"]
    end

    subgraph GOOGLE["Google Platform"]
        SHEETS["Google Sheets<br/>Staff / Vehicles / Visitors / Log / SystemLog"]
        DRIVE["Google Drive<br/>Backup Folder"]
        CACHE["GAS CacheService"]
        PROPS["Script Properties"]
        LOCKS["LockService"]
    end

    subgraph EXTERNAL["External APIs"]
        LINEAPI["LINE Messaging APIs"]
        LINECONTENT["LINE Content API"]
        GEMINI["Gemini API"]
        GITHUB["GitHub API"]
    end

    U --> LINE
    LINE --> WEBHOOK
    WEBHOOK --> HANDLERS
    HANDLERS --> COMMANDS
    HANDLERS --> SERVICES
    HANDLERS --> CORE
    COMMANDS --> SERVICES
    SERVICES --> SHEETS
    SERVICES --> DRIVE
    SERVICES --> CACHE
    SERVICES --> LOCKS
    CORE --> PROPS
    SERVICES --> LINEAPI
    SERVICES --> LINECONTENT
    SERVICES --> GEMINI
    COMMANDS --> GITHUB
```

## 3. Text Query Flow

```mermaid
flowchart TD
    A["LINE text message"] --> B["doPost(e)"]
    B --> C["generate requestId"]
    C --> D["routeLineEvent"]
    D --> E["textHandler"]
    E --> F["getLineDisplayName"]
    E --> G["getStaff"]
    G --> H{"staff lookup ok?"}

    H -- "no, service unavailable" --> I["Reply temporary unavailable"]
    H -- "yes" --> J{"allowed group or admin?"}
    J -- "no" --> K["Reply deny group access"]
    J -- "yes" --> L["trackUser"]
    L --> M{"authorized?"}
    M -- "no" --> N["Reply unauthorized"]
    M -- "yes" --> O{"starts with / ?"}

    O -- "yes" --> P["adminCommandRouter"]
    P --> Q["run admin command with requestId"]
    Q --> R["Reply to LINE"]

    O -- "no" --> S{"house query?"}
    S -- "yes" --> T["searchByHouseDetailed"]
    S -- "no" --> U["searchByPlateDetailed"]
    T --> V["writeLog (buffered)"]
    U --> V
    V --> W["Reply to LINE"]
```

## 4. OCR Image Flow

```mermaid
flowchart TD
    A["LINE image message"] --> B["doPost(e)"]
    B --> C["generate requestId"]
    C --> D["routeLineEvent"]
    D --> E["imageHandler"]
    E --> F["getStaff"]
    F --> G{"staff lookup ok?"}

    G -- "no, service unavailable" --> H["Reply temporary unavailable"]
    G -- "yes" --> I{"allowed group or admin?"}
    I -- "no" --> J["Reply deny group access"]
    I -- "yes" --> K["trackUser"]
    K --> L{"authorized?"}
    L -- "no" --> M["Reply unauthorized"]
    L -- "yes" --> N["extractPlateFromImage"]

    N --> O["Fetch image from LINE Content API"]
    O --> P["OCR with Gemini API"]
    P --> Q{"plate extracted?"}

    Q -- "no" --> R{"rate limited?"}
    R -- "yes" --> S["Reply OCR busy + writeSystemLog WARN"]
    R -- "no" --> T["Reply image unclear"]

    Q -- "yes" --> U["resolvePlateFromOcr (post-OCR normalization and hinting)"]
    U --> V["searchByPlateDetailed"]
    V --> W["writeLog (buffered)"]
    W --> X["Reply with OCR result and vehicle status"]
```

หมายเหตุ: `resolvePlateFromOcr()` เป็นขั้นตอน post-processing หลัง OCR เพื่อ normalize ข้อความ, สร้าง candidate และช่วยจับคู่กับข้อมูลทะเบียนที่มีอยู่ ไม่ได้ทำหน้าที่เป็น OCR model โดยตรง

## 5. Admin and Ops Flow

```mermaid
flowchart TD
    A["Admin sends /health /syslog /testalert /version"] --> B["textHandler"]
    B --> C["adminCommandRouter"]
    C --> D{"command"}

    D -- "/health" --> E["runHealthCommand"]
    D -- "/syslog" --> F["runSyslogCommand"]
    D -- "/testalert" --> G["runTestAlertCommand"]
    D -- "/version" --> H["runVersionCommand"]

    E --> I["Config / Spreadsheet / Cache / Drive checks"]
    E --> J["Optional LINE + Gemini live checks in full mode"]
    E --> K["writeSystemLog on warn/fail/slow"]

    F --> L["flushBufferedSystemLogs"]
    F --> M["read SystemLog sheet"]

    G --> N["writeSystemLog ALERT"]
    G --> O["flushBufferedSystemLogs"]
    G --> P["sendAdminAlert"]

    H --> Q["GitHub repo version check"]
```

## 6. Logging and Fail-soft Flow

```mermaid
flowchart TD
    A["Feature needs logging"] --> B{"search log or system log?"}
    B -- "search log" --> C["writeLog"]
    B -- "system log" --> D["writeSystemLog"]

    C --> E["buffer in CacheService"]
    E --> F{"items >= 10 ?"}
    F -- "yes" --> G["flush to Log sheet"]
    F -- "no" --> H["wait for explicit flush or maintenance"]

    D --> I["buffer in CacheService"]
    I --> J{"level is ALERT/ERROR ?"}
    J -- "yes" --> K["flush to SystemLog immediately"]
    J -- "no" --> L{"items >= 5 ?"}
    L -- "yes" --> M["flush to SystemLog"]
    L -- "no" --> N["wait for explicit flush or maintenance"]
```

## 7. Maintenance Flow

```mermaid
flowchart TD
    A["dailyMaintenance() trigger"] --> B["flushBufferedLogs"]
    B --> C["flushBufferedSystemLogs"]
    C --> D["dailyBackup"]
    D --> E["cleanOldBackups"]
    E --> F["dailyCleanup"]
    F --> G{"all steps ok?"}
    G -- "yes" --> H["write console success"]
    G -- "no" --> I["sendMaintenanceAlert"]
    I --> J["writeSystemLog ALERT"]
    I --> K["push LINE alert to admins"]
```

## 8. Request Tracing

- `doPost(e)` สร้าง `requestId` สำหรับ request ใหม่
- `eventRouter`, handlers และ admin commands จะส่ง `requestId` ต่อไป
- `SystemLog` บันทึก `REQUEST_ID` เพื่อใช้ trace incident
- `/syslog` แสดง `req:` ให้เช็กความเชื่อมโยงของ event ได้เร็วขึ้น

## 9. Main Components

- `src/appCore.js`
  เก็บ shared config, column map, trigger hooks, admin alert helper
- `src/webhook/doPost.js`
  รับ webhook, parse payload, สร้าง `requestId`, log invalid payload
- `src/webhook/eventRouter.js`
  แยก follow, text, image
- `src/handlers/textHandler.js`
  flow ค้นหาข้อความ, help, `/myid`, admin command entry point
- `src/handlers/imageHandler.js`
  flow OCR จากภาพ และ fallback กรณี OCR fail/rate limit
- `src/services/httpService.js`
  wrapper สำหรับ retry, timeout และ error handling ของ external HTTP
- `src/services/staffService.js`
  lookup staff, cache, graceful handling เมื่อ Sheets มีปัญหา
- `src/services/vehicleSearchService.js`
  ค้นหาทะเบียนและบ้านเลขที่
- `src/services/ocrService.js`
  OCR integration, cleanup, normalization, candidate generation และ OCR-aware matching heuristics
- `src/services/visitorService.js`
  อัปเดตผู้ใช้ที่เคยใช้งาน พร้อม row map cache
- `src/services/logService.js`
  จัดการ `Log`, `SystemLog`, buffering, flush และ auto-create `SystemLog`
- `src/services/maintenanceService.js`
  backup, cleanup, retention และ alert เมื่อ maintenance fail บางส่วน
- `src/commands/admin/*.js`
  แยก logic รายคำสั่ง เช่น `/health`, `/syslog`, `/testalert`, `/version`
- `tests/pure-logic.test.js`
  local automated tests สำหรับ pure logic

## 10. Deployment Flow

```mermaid
flowchart TD
    A["Developer pushes to main or feature/**"] --> B["GitHub Actions deploy.yml"]
    B --> C["Checkout code"]
    C --> D["Setup Node.js"]
    D --> E["Install clasp"]
    E --> F["Write .clasprc.json"]
    F --> G["Write .clasp.json based on branch"]
    G --> H["Inject src/versionInfo.js"]
    H --> I["clasp push --force"]
    I --> J["clasp deploy"]
    J --> K{"branch = main?"}
    K -- "yes" --> L["BLUE / Production GAS"]
    K -- "no" --> M["GREEN / Staging GAS"]
```

## 11. Automated Tests

ก่อน deploy หรือก่อน push logic สำคัญ แนะนำให้รัน local tests ดังนี้

```bash
node tests/pure-logic.test.js
```

หรือ:

```bash
npm test
```

ชุด test ปัจจุบันครอบคลุมหัวข้อหลักดังนี้

- plate normalization
- OCR cleanup
- OCR candidate generation
- OCR result resolution
- edit distance
- string similarity

## 12. Vehicles Sheet Schema

```text
license_plate | brand | model | color | house_no | owner_name | status | vehicle_type
```

- `vehicle_type` should use English values: `car` or `motorcycle`
- Runtime normalizes the first 8 `Vehicles` headers to this schema before reading sheet data
- Search and OCR reply messages use the car icon for `car` rows and the motorcycle icon for `motorcycle` rows

