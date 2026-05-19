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

// Low-value / noise patterns — skip facts matching these
const NOISE_PATTERNS = [
  // Temporary state & timestamps
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,  // ISO timestamps
  /(?:today|当前|现在).*(?:时间|time|timestamp)/i,
  /event_timestamp|check_time|time_\d{8}/,
  /日志.*检查|检查.*worker.*状态|检查.*运行.*状态/,
  // File paths & temp locations
  /(?:\/tmp\/|\\Temp\\|AppData\\Local\\Temp)/,
  /output_file_temp|temp_path/i,
  /(?:文件|file).*(?:位于|路径|在).*(?:d:\/|c:\/)/i,
  // Test artifacts & cleanup
  /clean_lock_before_test|test_.*environment/i,
  /(?:清理|删除).*(?:测试|锁|lock)/,
  // File existence (trivial)
  /(?:存在|exists?).*(?:文件|file|\.js|\.md|\.py|\.json)/i,
  /^file_.*(?:exists|存在)/i,
  /jsonl文件(?:标识|名为|的)/,
  /(?:文件|file).*(?:位于|路径|在).*(?:d:\/|c:\/|context-proxy)/i,
  // Meta stats
  /(?:full_catalog|total_skills|mem_size|语义\d+条|技能\d+个)/i,
  /^old_semantic_|^dedup_backfill/i,
  /monitored_conversation/i,
  /(?:全部.*技能|目录.*大小|catalog.*size|chars.*skills)/i,
  // Worker extraction meta
  /worker.*incremental/i,
  /extraction_api_parameters/i,
  /(?:从\d+行|从0行).*(?:提取|extract)/,
  // Conversation flow (not reusable knowledge)
  /^user_says?_|^user_agree(s|ment)_|^user_continu/i,
  /previous_request_continue/i,
  /^assistant_performed/i,
  // Historical operations
  /(?:删除了|已删除|deleted.*skills?|removed.*files?)/i,
  /(?:plugin.*reduced|plugins.*reduced)/i,
  // Short and useless
];

function isNoise(content) {
  if (!content) return true
  if (content.length < 15) return true
  for (const p of NOISE_PATTERNS) {
    if (p.test(content)) return true
  }
  return false
}

function shouldSkipExtraction(content) {
  if (!content) return true
  if (hasPrivacy(content)) return true
  if (isNoise(content)) return true
  if (content.length < 5) return true
  return false
}

module.exports = { hasPrivacy, shouldSkipExtraction, isNoise, PRIVACY_PATTERNS, NOISE_PATTERNS }
