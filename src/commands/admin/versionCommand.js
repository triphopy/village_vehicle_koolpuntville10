function runVersionCommand() {
  const version    = VERSION_INFO.version    || 'N/A';
  const env        = VERSION_INFO.env        || 'N/A';
  const deployTime = VERSION_INFO.deployTime || 'N/A';
  const repo       = PropertiesService.getScriptProperties()
                       .getProperty('GITHUB_REPO') || '';

  // แยก branch และ SHA จาก version string
  // เช่น "feature/debugToLine-a1b2c3d" → branch="feature/debugToLine", sha="a1b2c3d"
  //      "main-a1b2c3d"                → branch="main",                  sha="a1b2c3d"
  const lastDash   = version.lastIndexOf('-');
  const branch     = lastDash !== -1 ? version.substring(0, lastDash) : '';
  const currentSha = lastDash !== -1 ? version.substring(lastDash + 1) : '';

  const lines = [
    '📦 Version Info',
    '',
    '🔢 Version    : ' + version,
    '🌐 Environment: ' + env,
    '🕐 Deployed   : ' + deployTime,
  ];

  if (repo && branch && currentSha) {
    const latestSha = getLatestSha(repo, branch);
    if (!latestSha) {
      lines.push('', '⚠️ ไม่สามารถตรวจสอบ version ล่าสุดได้');
    } else if (latestSha.startsWith(currentSha)) {
      lines.push('', '✅ เป็น version ล่าสุดแล้ว');
    } else {
      lines.push('', '⚠️ outdated — มี commit ใหม่กว่าบน ' + branch);
      lines.push('🆕 Latest SHA : ' + latestSha.substring(0, 7));
    }
  } else if (!repo) {
    lines.push('', 'ℹ️ ตั้งค่า GITHUB_REPO ใน Script Properties เพื่อเปรียบเทียบ version');
  }

  return lines.join('\n');
}

function getLatestSha(repo, branch) {
  try {
    const url = 'https://api.github.com/repos/' + repo + '/commits/' + encodeURIComponent(branch);
    const res = UrlFetchApp.fetch(url, {
      headers: { 'User-Agent': 'GAS-VersionChecker' },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) return null;
    return JSON.parse(res.getContentText()).sha || null;
  } catch (e) {
    console.error('getLatestSha error: ' + e);
    return null;
  }
}