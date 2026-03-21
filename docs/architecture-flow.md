# Architecture and Process Flow

เอกสารนี้สรุป flow การทำงานของระบบตั้งแต่รับ webhook จาก LINE ไปจนถึงค้นหาข้อมูล, OCR, admin commands และ deployment

## 1. System Overview

```mermaid
flowchart TD
    U["LINE User"] --> LINE["LINE Messaging API"]
    LINE --> WEBHOOK["GAS Web App<br/>doPost(e)"]
    WEBHOOK --> PARSE["parseWebhookRequest"]
    PARSE --> ROUTER["routeLineEvent"]

    ROUTER --> FOLLOW["followHandler"]
    ROUTER --> TEXT["textHandler"]
    ROUTER --> IMAGE["imageHandler"]

    TEXT --> STAFF["staffService"]
    TEXT --> SEARCH["vehicleSearchService"]
    TEXT --> ADMIN["adminCommandRouter"]
    TEXT --> TRACK["visitorService"]
    TEXT --> LOG["logService"]
    TEXT --> LINEAPI["lineService"]

    IMAGE --> STAFF
    IMAGE --> OCR["ocrService"]
    IMAGE --> SEARCH
    IMAGE --> TRACK
    IMAGE --> LOG
    IMAGE --> LINEAPI

    FOLLOW --> LINEAPI
    STAFF --> SHEETS["Google Sheets"]
    SEARCH --> SHEETS
    TRACK --> SHEETS
    LOG --> SHEETS
    ADMIN --> SHEETS
    OCR --> LINECONTENT["LINE Content API"]
    OCR --> GEMINI["Gemini API"]
```

## 2. Text Query Flow

```mermaid
flowchart TD
    A["LINE text message"] --> B["doPost(e)"]
    B --> C["routeLineEvent"]
    C --> D["textHandler"]
    D --> E["getLineDisplayName"]
    D --> F["getStaff"]
    F --> G{"staff lookup ok?"}

    G -- "no, service unavailable" --> H["Reply: ระบบฐานข้อมูลชั่วคราวใช้งานไม่ได้"]
    G -- "yes" --> I{"allowed group or admin?"}
    I -- "no" --> J["Reply: ปฏิเสธการใช้งาน"]
    I -- "yes" --> K["trackUser"]
    K --> L{"authorized?"}
    L -- "no" --> M["Reply: ไม่มีสิทธิ์เข้าถึงระบบ"]
    L -- "yes" --> N{"starts with / ?"}

    N -- "yes" --> O["adminCommandRouter"]
    O --> P["Admin command"]
    P --> Q["Reply to LINE"]

    N -- "no" --> R{"house query?"}
    R -- "yes" --> S["searchByHouseDetailed"]
    R -- "no" --> T["searchByPlateDetailed"]
    S --> U["writeLog"]
    T --> U
    U --> V["Reply to LINE"]
```

## 3. OCR Image Flow

```mermaid
flowchart TD
    A["LINE image message"] --> B["doPost(e)"]
    B --> C["routeLineEvent"]
    C --> D["imageHandler"]
    D --> E["getStaff"]
    E --> F{"staff lookup ok?"}

    F -- "no, service unavailable" --> G["Reply: ระบบฐานข้อมูลชั่วคราวใช้งานไม่ได้"]
    F -- "yes" --> H{"allowed group or admin?"}
    H -- "no" --> I["Reply: ปฏิเสธการใช้งาน"]
    H -- "yes" --> J["trackUser"]
    J --> K{"authorized?"}
    K -- "no" --> L["Reply: ไม่มีสิทธิ์เข้าถึงระบบ"]
    K -- "yes" --> M["extractPlateFromImage"]

    M --> N["Fetch image from LINE Content API"]
    N --> O["OCR with Gemini API"]
    O --> P{"plate extracted?"}

    P -- "no" --> Q{"rate limited?"}
    Q -- "yes" --> R["Reply: OCR ระบบหนาแน่น"]
    Q -- "no" --> S["Reply: อ่านป้ายไม่ชัด"]

    P -- "yes" --> T["resolvePlateFromOcr"]
    T --> U["searchByPlateDetailed"]
    U --> V["writeLog"]
    V --> W["Reply with OCR result and vehicle status"]
```

## 4. Backend Degradation Flow

```mermaid
flowchart TD
    A["Request needs Google Sheets"] --> B["getCachedSheetData"]
    B --> C{"fresh cache exists?"}
    C -- "yes" --> D["Use fresh cache"]
    C -- "no" --> E["Try live read from SpreadsheetApp"]
    E --> F{"live read ok?"}
    F -- "yes" --> G["Cache latest values"]
    G --> H["Continue flow"]
    F -- "no" --> I{"stale cache exists?"}
    I -- "yes" --> J["Use stale cache and log warning"]
    I -- "no" --> K["Throw ServiceUnavailableError"]
    K --> L["Handler replies with temporary unavailable message"]
```

## 5. Deployment Flow

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

## 6. Main Components

- `src/webhook/doPost.js`: รับ webhook และกัน error ชั้นนอก
- `src/webhook/eventRouter.js`: แยก follow, text, image
- `src/handlers/textHandler.js`: flow ค้นหาข้อความและ admin entry point
- `src/handlers/imageHandler.js`: flow OCR จากภาพ
- `src/services/staffService.js`: lookup staff, cache, graceful handling เมื่อ Sheets มีปัญหา
- `src/services/vehicleSearchService.js`: ค้นหาทะเบียนและบ้านเลขที่
- `src/services/ocrService.js`: OCR, normalization, fuzzy matching
- `src/services/logService.js`: เขียน log แบบ fail-soft
- `src/services/visitorService.js`: อัปเดตผู้ใช้ที่เคยใช้งานแบบ fail-soft
- `src/services/maintenanceService.js`: backup และ cleanup jobs
- `.github/workflows/deploy.yml`: deploy ไป GAS อัตโนมัติตาม branch
