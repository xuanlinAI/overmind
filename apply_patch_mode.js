// Apply Patch Mode — convert edits into reviewable patches instead of direct writes
const { execSync } = require('child_process')
const path = require('path'), fs = require('fs')
const ROOT = path.dirname(__filename)
const PATCH_DIR = path.join(ROOT, '.cc-patches')

let patchSeq = 0

function generatePatch(targetFile, newContent) {
  if (!fs.existsSync(PATCH_DIR)) fs.mkdirSync(PATCH_DIR, { recursive: true })

  // Write current file to temp for comparison
  let oldContent = ''
  try { oldContent = fs.readFileSync(targetFile, 'utf-8') } catch(e) {}

  if (oldContent === newContent) return null // no change

  const oldTmp = path.join(PATCH_DIR, `.old_${path.basename(targetFile)}`)
  const newTmp = path.join(PATCH_DIR, `.new_${path.basename(targetFile)}`)
  fs.writeFileSync(oldTmp, oldContent)
  fs.writeFileSync(newTmp, newContent)

  // Generate unified diff
  let diff = ''
  try {
    diff = execSync(`diff -u "${oldTmp}" "${newTmp}"`, { encoding: 'utf-8', timeout: 3000 })
  } catch(e) {
    // diff exits with 1 when there ARE differences (non-zero exit ≠ error for diff)
    diff = e.stdout || e.stderr || ''
  }

  // Write patch file
  patchSeq++
  const patchFile = path.join(PATCH_DIR, `${String(patchSeq).padStart(3,'0')}-${path.basename(targetFile)}.patch`)
  fs.writeFileSync(patchFile, diff)

  // Update apply.sh
  const applyScript = path.join(PATCH_DIR, 'apply.sh')
  let script = '#!/bin/bash\n# Overmind Patch Apply\nset -e\n'
  const patches = fs.readdirSync(PATCH_DIR).filter(f => f.endsWith('.patch'))
  for (const pf of patches) {
    script += `echo "Applying: ${pf}"\npatch -p0 < "${path.join(PATCH_DIR, pf).replace(/\\/g, '/')}"\n`
  }
  fs.writeFileSync(applyScript, script)
  try { execSync(`chmod +x "${applyScript}"`, { timeout: 1000 }) } catch(e) {}

  // Cleanup temps
  try { fs.unlinkSync(oldTmp); fs.unlinkSync(newTmp) } catch(e) {}

  return {
    patchFile, targetFile,
    constraint: `📝 补丁已生成，文件未动。查看 .cc-patches/${path.basename(patchFile)} 后运行 \`bash .cc-patches/apply.sh\` 或回复"应用补丁"生效。`
  }
}

function format(patch) {
  if (!patch) return ''
  return `\n## 📝 补丁模式\n\n${patch.constraint}\n`
}

module.exports = { generatePatch, format }
