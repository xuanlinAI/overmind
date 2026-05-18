const PRIVACY_PATTERNS = [
  /\b1[3-9]\d{9}\b/,
  /\b[\w.-]+@[\w.-]+\.\w+\b/,
  /收货地址|收货人|详细地址|联系地址|住址|家庭地址/,
  /手机号|联系电话|手机号码|电话号/,
  /身份证号|身份证|公民身份号码/,
  /access_token=[a-zA-Z0-9_-]+/,
  /sk-[a-zA-Z0-9]+/,
  /密码|password|secret|token=/,
  /省.*市.*区.*(?:新村|小区|花园|路|街)/,
]

function hasPrivacy(content) {
  for (const p of PRIVACY_PATTERNS) {
    if (p.test(content)) return true
  }
  return false
}

function shouldSkipExtraction(content) {
  if (!content) return true
  if (hasPrivacy(content)) return true
  if (content.length < 5) return true
  return false
}

module.exports = { hasPrivacy, shouldSkipExtraction, PRIVACY_PATTERNS }
