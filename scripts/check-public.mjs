#!/usr/bin/env node
/* ============================================================================
 * check-public.mjs — 公开仓库门禁（零依赖，纯 node）
 * ----------------------------------------------------------------------------
 * 在推送 / CI 前断言：
 *   [1] 仓库（git 跟踪文件）里不存在本地专用第三方素材：
 *       lib/assets/{hero-4k,hero-2k,poster}.webp、lib/assets/fonts/Anurati-Regular.otf
 *   [2] 不存在本机交付二进制 / 构建产物（*.tgz、*.zip、*.mp4、*.webm、releases/）
 *   [3] 不存在本机绝对路径（Windows 盘符路径）与密钥 / 私钥串
 *   [4] 必需文件齐全（LICENSE、THIRD-PARTY-NOTICES、ASSETS、licenses/OFL-*.txt、CI 等）
 *   [5] lib/assets/manifest.json 覆盖全部**已跟踪**资产，size / sha256 一致
 *
 * 只检查 git 跟踪的文件：本地恢复素材（.gitignore 忽略）不会误报。
 * 用法：node scripts/check-public.mjs
 * ========================================================================== */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const fails = []
const passed = []

function check(label, fn) {
  try {
    fn()
    passed.push(label)
    console.log('  ok   ' + label)
  } catch (err) {
    fails.push({ label, message: String((err && err.message) || err) })
    console.log('  FAIL ' + label + ' :: ' + String((err && err.message) || err))
  }
}

const assert = (cond, msg) => { if (!cond) throw new Error(msg) }

/* ── 文件清单：优先 git 跟踪（忽略 .gitignore 的本地素材） ─────────────── */
function trackedFiles() {
  try {
    const out = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    const list = out.split('\0').filter(Boolean)
    if (list.length) return list
  } catch (err) {
    /* 非 git 环境（如 tarball 解压）回落到全量遍历 */
  }
  const walk = (dir, base) => {
    const out = []
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue
      const rel = base ? base + '/' + entry.name : entry.name
      const abs = path.join(dir, entry.name)
      if (entry.isDirectory()) out.push(...walk(abs, rel))
      else if (entry.isFile()) out.push(rel)
    }
    return out
  }
  return walk(ROOT, '')
}

const files = trackedFiles()

/* ── [1] 本地专用第三方素材不得入库 ───────────────────────────────────── */
const FORBIDDEN_ASSETS = new Set([
  'lib/assets/hero-4k.webp',
  'lib/assets/hero-2k.webp',
  'lib/assets/poster.webp',
  'lib/assets/fonts/Anurati-Regular.otf',
])
check('不含 4 个本地专用第三方文件（3 张壁纸底图 + Anurati）', () => {
  const hits = files.filter((f) => FORBIDDEN_ASSETS.has(f))
  assert(hits.length === 0, '发现应排除的文件：' + hits.join(', '))
})

/* ── [2] 本机交付二进制不得入库 ───────────────────────────────────────── */
const FORBIDDEN_EXT = new Set(['.tgz', '.zip', '.mp4', '.webm', '.exe', '.dll'])
check('不含本机交付二进制 / 构建产物', () => {
  const hits = files.filter((f) => FORBIDDEN_EXT.has(path.extname(f).toLowerCase()) || f.startsWith('releases/'))
  assert(hits.length === 0, '发现：' + hits.join(', '))
})

/* ── [3] 必需文件齐全 ────────────────────────────────────────────────── */
const REQUIRED = [
  'LICENSE',
  'README.md',
  'INSTALL.md',
  'CHANGELOG.md',
  'ASSETS.md',
  'THIRD-PARTY-NOTICES.md',
  'package.json',
  'release.json',
  'cordis.patch.yml',
  'icon.svg',
  '.gitignore',
  '.gitattributes',
  '.github/workflows/test.yml',
  'scripts/check-public.mjs',
  'scripts/prepare-local-media.ps1',
  'scripts/build-manifest.py',
  'scripts/make-audio.py',
  'licenses/OFL-Quicksand.txt',
  'licenses/OFL-Montserrat.txt',
  'licenses/OFL-Oxanium.txt',
  'licenses/OFL-ShareTechMono.txt',
  'licenses/OFL-JetBrainsMono.txt',
  'licenses/OFL-NotoSansJP.txt',
  'licenses/FONT-CREDITS.md',
  'lib/assets/manifest.json',
]
check('必需文件齐全', () => {
  const missing = REQUIRED.filter((rel) => !fs.existsSync(path.join(ROOT, rel)))
  assert(missing.length === 0, '缺少：' + missing.join(', '))
})

/* ── [4] 本机绝对路径 / 密钥 / 私钥扫描（只扫文本类跟踪文件） ─────────── */
const TEXT_EXT = new Set(['.md', '.mdx', '.js', '.mjs', '.cjs', '.json', '.yml', '.yaml', '.ts', '.css', '.html', '.ps1', '.py', '.txt', '.svg', '.gitignore', '.gitattributes'])
const SENSITIVE = [
  { label: '本机绝对路径', re: /(?<![A-Za-z0-9+.-])[A-Za-z]:[\\/](?![\\/])/g },
  { label: 'GitHub Token', re: /gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/g },
  { label: 'AWS Access Key', re: /AKIA[0-9A-Z]{16}/g },
  { label: '私钥文件头', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
]
const violations = []
for (const rel of files) {
  const ext = path.extname(rel).toLowerCase()
  if (!TEXT_EXT.has(ext) && ext !== '') continue
  const abs = path.join(ROOT, rel)
  if (!fs.existsSync(abs)) continue
  const size = fs.statSync(abs).size
  if (size > 512 * 1024) continue
  let text
  try {
    text = fs.readFileSync(abs, 'utf8')
  } catch (err) {
    continue
  }
  for (const { label, re } of SENSITIVE) {
    re.lastIndex = 0
    const m = text.match(re)
    if (m) violations.push(rel + ' [' + label + '] ' + m.slice(0, 3).join(' | '))
  }
}
check('不含本机绝对路径 / Token / 私钥', () => assert(violations.length === 0, '\n' + violations.slice(0, 20).join('\n')))

/* ── [5] manifest.json 与已跟踪资产一致 ─────────────────────────────── */
const ASSET_ROOT = path.join(ROOT, 'lib', 'assets')
const sha256 = (abs) => createHash('sha256').update(fs.readFileSync(abs)).digest('hex')
check('manifest.json 覆盖全部已跟踪资产（无多无少）', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ASSET_ROOT, 'manifest.json'), 'utf8'))
  const listed = manifest.files.map((f) => f.path).sort()
  const tracked = files
    .filter((f) => f.startsWith('lib/assets/') && f !== 'lib/assets/manifest.json')
    .map((f) => f.slice('lib/assets/'.length))
    .sort()
  assert(listed.join('\n') === tracked.join('\n'), 'manifest 与磁盘资产集合不一致：\n' + listed.join('\n') + '\n---\n' + tracked.join('\n'))
})
check('manifest.json 每项 bytes / sha256 与磁盘一致', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ASSET_ROOT, 'manifest.json'), 'utf8'))
  for (const entry of manifest.files) {
    const abs = path.join(ASSET_ROOT, entry.path)
    assert(fs.statSync(abs).size === entry.bytes, entry.path + ' bytes 不符')
    assert(sha256(abs) === entry.sha256, entry.path + ' sha256 不符')
  }
  assert(manifest.fileCount === manifest.files.length, 'fileCount 与 files 长度不一致')
  assert(manifest.totalBytes === manifest.files.reduce((a, f) => a + f.bytes, 0), 'totalBytes 与各文件 bytes 之和不一致')
})

/* ── [6] package.json / release.json 基本口径 ─────────────────────────── */
check('package.json 名称 / 版本 / 许可正确', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  assert(pkg.name === 'dsh-startup-vyron', 'name=' + pkg.name)
  assert(pkg.version === '0.2.1', 'version=' + pkg.version)
  assert(pkg.license === 'MIT', 'license=' + pkg.license)
})
check('release.json 声明为公开源码分发且不含媒体', () => {
  const rel = JSON.parse(fs.readFileSync(path.join(ROOT, 'release.json'), 'utf8'))
  assert(rel.name === 'dsh-startup-vyron', 'name=' + rel.name)
  assert(rel.distribution === 'source', 'distribution=' + rel.distribution)
  assert(rel.mediaIncluded === false, 'mediaIncluded 必须为 false')
})

/* ── 汇总 ───────────────────────────────────────────────────────────── */
console.log('')
if (fails.length) {
  console.log('CHECK NOTICES ')
  for (const f of fails) console.log('  ✗ ' + f.label + '\n    ' + f.message.replace(/\n/g, '\n    '))
  console.log('')
  console.log('CHECK PUBLIC FAIL ' + fails.length + ' / ' + (fails.length + passed.length))
  process.exitCode = 1
} else {
  console.log('CHECK PUBLIC PASS ' + passed.length + ' / ' + passed.length + '（' + files.length + ' 个跟踪文件）')
}
