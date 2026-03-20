/**
 * /version — แสดงข้อมูล version ที่ deploy อยู่ปัจจุบัน
 * และเทียบกับ latest commit SHA บน main branch ของ GitHub
 *
 * Script Properties ที่ต้องตั้ง:
 *   APP_VERSION  — inject โดย GitHub Actions (เช่น main-a1b2c3d)
 *   DEPLOY_ENV   — inject โดย GitHub Actions (เช่น 🔵 BLUE (Production))
 *   DEPLOY_TIME  — inject โดย GitHub Actions (เช่น 2026-03-20 12:00:00)
 *   GITHUB_REPO  — ตั้งเองครั้งเดียว (เช่น triphopy/village_vehicle_koolpuntville10)
 */
function runVersionCommand() {
  const version    = VERSION_INFO.version    || 'N/A';
  const env        = VERSION_INFO.env        || 'N/A';
  const deployTime = VERSION_INFO.deployTime || 'N/A';
  const repo       = PropertiesService.getScriptProperties()
                       .getProperty('GITHUB_REPO') || '';

  const currentSha = version.includes('-') ? version.split('-').pop() : '';

  const lines = [
    '📦 Version Info',
    '',
    '🔢 Version    : ' + version,
    '🌐 Environment: ' + env,
    '🕐 Deployed   : ' + deployTime,
  ];

  if (repo && currentSha) {
    const latestSha = getLatestMainSha(repo);
    if (!latestSha) {
      lines.push('', '⚠️ ไม่สามารถตรวจสอบ version ล่าสุดได้');
    } else if (latestSha.startsWith(currentSha)) {
      lines.push('', '✅ เป็น version ล่าสุดแล้ว');
    } else {
      lines.push('', '⚠️ outdated — มี version ใหม่กว่าบน main');
      lines.push('🆕 Latest SHA : ' + latestSha.substring(0, 7));
    }
  } else if (!repo) {
    lines.push('', 'ℹ️ ตั้งค่า GITHUB_REPO ใน Script Properties เพื่อเปรียบเทียบ version');
  }

  return lines.join('\n');
}

function getLatestMainSha(repo) {
  try {
    const url = 'https://api.github.com/repos/' + repo + '/commits/main';
    const res = UrlFetchApp.fetch(url, {
      headers: { 'User-Agent': 'GAS-VersionChecker' },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) return null;
    return JSON.parse(res.getContentText()).sha || null;
  } catch (e) {
    console.error('getLatestMainSha error: ' + e);
    return null;
  }
}