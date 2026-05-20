// Commit Gate — refuses risky ops unless git state is clean
const { execSync } = require('child_process')
const path = require('path')

function check(cwd = process.cwd()) {
  let unclean = '', staged = ''
  try { unclean = execSync('git diff --name-only', { encoding:'utf-8', timeout:3000, cwd }).trim() } catch(e) {}
  try { staged = execSync('git diff --cached --name-only', { encoding:'utf-8', timeout:3000, cwd }).trim() } catch(e) {}
  try { execSync('git rev-parse --git-dir', { timeout:2000, cwd }) } catch(e) { return null } // not a git repo

  const files = (unclean + '\n' + staged).split('\n').filter(Boolean)
  if (files.length === 0) return null // clean, pass

  return {
    files: files.slice(0, 10),
    count: files.length,
    constraint: `⚠️ ${files.length} 个文件未提交。执行高风险修改前先 commit 或 stash。`,
    suggested: files.filter(f => f.endsWith('.js') || f.endsWith('.py')).slice(0, 3)
  }
}

function format(result) {
  if (!result) return ''
  return `\n## 🛑 提交门禁\n\n${result.constraint}\n` +
    `**未提交文件:** ${result.files.join(', ')}\n` +
    (result.suggested.length ? `**建议先处理:** ${result.suggested.join(', ')}\n` : '') +
    `\n> 违反此约束可能导致修改丢失。先 git add + commit，再继续。`
}

module.exports = { check, format }
