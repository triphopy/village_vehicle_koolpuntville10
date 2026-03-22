# AGENTS.md

## Repo workflows

- This project is a Google Apps Script app deployed with `clasp` using `src/` as `rootDir`.
- GitHub Actions deploys on pushes to `main` and `feature/**` via `.github/workflows/deploy.yml`.
- CI installs `@google/clasp`, writes `.clasprc.json` from `CLASP_TOKEN`, writes `.clasp.json`, then runs:
  - `clasp push --force`
  - `clasp deploy --deploymentId $DEPLOYMENT_ID --description "<commit message>"`
- `main` deploys to the BLUE/production script and `feature/**` deploys to the GREEN/staging script.

## Generated and runtime files

- `.github/workflows/deploy.yml` writes `src/versionInfo.js` during CI.
- The repo keeps `src/versionInfo.js` as the fallback `VERSION_INFO` file with `N/A` defaults. Treat this file as CI-managed unless a task explicitly requires changing it.

## GAS entrypoints and triggers

- Web App entrypoint: `doPost(e)` in `src/webhook/doPost.js`
- Spreadsheet trigger: `onEdit(e)` in `src/appCore.js`
- Time-driven trigger candidates in `src/services/maintenanceService.js`:
  - `keepAlive()`
  - `dailyMaintenance()`

## Admin commands and script properties

- Admin commands are routed by `src/commands/adminCommandRouter.js`.
- Supported admin commands include:
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
- `/version` is implemented in `src/commands/admin/versionCommand.js` and uses the `GITHUB_REPO` script property to compare the deployed SHA with the latest commit on the current branch.
- `/health` is implemented in `src/commands/admin/healthCommand.js` and supports a lightweight default mode plus a live-check `full` mode.
- `/syslog` is implemented in `src/commands/admin/syslogCommand.js` and reads recent `SystemLog` entries.
- `/testalert` is implemented in `src/commands/admin/testAlertCommand.js` and is used to test admin alert delivery plus `SystemLog` writes.
- Script properties observed in `src/appCore.js`:
  - `LINE_ACCESS_TOKEN`
  - `LINE_CHANNEL_SECRET`
  - `GEMINI_API_KEY`
  - `LOG_RETENTION_DAYS`
  - `BACKUP_RETENTION_DAYS`
  - `BACKUP_FOLDER_NAME`
  - `SPREADSHEET_ID`
  - `ALLOWED_GROUP_IDS`
  - `DEBUG_MODE`
  - `ADMIN_UID`
  - `GITHUB_REPO`

## Sheets and logging

- Primary sheets used by the app are `Staff`, `Vehicles`, `Visitors`, `Log`, and `SystemLog`.
- `SystemLog` is auto-created by the runtime when needed and stores operational events with request tracing.
- `src/services/logService.js` buffers `Log` writes and `SystemLog` writes to reduce sheet write frequency.
- `ALERT` and `ERROR` system log levels flush immediately; `WARN` and `INFO` can remain buffered until threshold or explicit flush.

## Local testing

- The repo provides a lightweight local test command:
  - `node tests/pure-logic.test.js`
- `package.json` exposes the same test suite via:
  - `npm test`
