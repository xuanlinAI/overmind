// TDD Enforcer — block implementation until failing test exists
const path = require('path'), fs = require('fs')

const PROD_CODE = /src\//i
const TEST_FILE_MAP = { '.js': ['.test.js', '.spec.js'], '.py': ['_test.py', 'test_.py'], '.ts': ['.test.ts', '.spec.ts'] }

function check(targetFile) {
  if (!targetFile) return null
  if (!PROD_CODE.test(targetFile)) return null // not production code, skip

  const ext = path.extname(targetFile)
  if (!TEST_FILE_MAP[ext]) return null

  // Find corresponding test files
  const dir = path.dirname(targetFile)
  const base = path.basename(targetFile, ext)
  const tests = TEST_FILE_MAP[ext].map(suffix => path.join(dir, base + suffix))

  let testExists = false, testContent = ''
  for (const tf of tests) {
    if (fs.existsSync(tf)) {
      testExists = true
      try { testContent = fs.readFileSync(tf, 'utf-8').substring(0, 500) } catch(e) {}
      break
    }
  }

  if (!testExists) {
    return {
      targetFile,
      testPaths: tests,
      hasExistingTest: false,
      constraint: `🧪 强制 TDD: "${path.basename(targetFile)}" 没有对应测试。先写一个会失败的测试再改它。`,
      suggestedTestPath: tests[0]
    }
  }

  // Test exists — but does it have content? Could be empty stub
  if (testContent.length < 20) {
    return {
      targetFile,
      testPaths: tests,
      hasExistingTest: true,
      emptyTest: true,
      constraint: `🧪 测试文件存在但几乎为空。先写一个会失败的测试再改代码。`
    }
  }

  return null // test exists with content, pass
}

function format(result) {
  if (!result) return ''
  return `\n## 🧪 TDD 约束\n\n${result.constraint}\n` +
    `**目标文件:** ${result.targetFile}\n` +
    `**建议测试路径:** ${result.suggestedTestPath || result.testPaths[0]}\n`
}

module.exports = { check, format }
