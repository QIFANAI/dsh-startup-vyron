/* ============================================================================
 * smoke-assets.mjs — 资产清单完整性冒烟
 * ----------------------------------------------------------------------------
 * 纯 node 文件校验（无浏览器、无显示器）。覆盖面（design-spec §2.2 / §6）：
 *  [1] 必需文件存在且非空（4K 底板 / 品牌 SVG / 字体 / 音轨 / locale / icon）
 *  [2] WebP 体积预算 + 真实像素尺寸（RIFF/VP8 头解析）
 *  [3] WAV 头校验（RIFF/fmt/data、44.1k / 2ch / 16bit、时长 10.4s / 1.4s ±0.1、非静音）
 *  [4] 品牌 SVG 结构（svg 根 / viewBox / currentColor / 无外链 / 体积）
 *  [5] 字体文件魔数（wOF2 / OTTO）与体积预算
 *  [6] locale en/zh 的 meta.title / meta.description
 *  [7] icon.svg 结构（≤256KiB / 128×128 / 单 svg 根）
 *  [8] manifest.json 完整性（fileCount / totalBytes / sha256 全量复核 / 必需路径齐全）
 *
 * 运行：node test/smoke-assets.mjs
 * ========================================================================== */
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { createHarness, ROOT, readFile, fileExists, fileSize } from './_mocks.mjs'

const H = createHarness('ASSETS')
const p = (rel) => path.join(ROOT, rel)

/* ────────────────────────────────────────────────────── 解析工具 */
function readBuffer(rel) { return fs.readFileSync(p(rel)) }

/* WebP：RIFF 容器 + VP8 / VP8L / VP8X 帧头 */
function webpSize(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error('不是 WebP（RIFF/WEBP 魔数不符）')
  }
  let off = 12
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4)
    const size = buf.readUInt32LE(off + 4)
    const data = off + 8
    if (id === 'VP8X') return { width: buf.readUIntLE(data + 4, 3) + 1, height: buf.readUIntLE(data + 7, 3) + 1, chunk: id }
    if (id === 'VP8L') {
      const bits = buf.readUInt32LE(data + 1)
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, chunk: id }
    }
    if (id === 'VP8 ') {
      if (buf[data + 3] !== 0x9d || buf[data + 4] !== 0x01 || buf[data + 5] !== 0x2a) throw new Error('VP8 帧头同步码错误')
      return { width: buf.readUInt16LE(data + 6) & 0x3fff, height: buf.readUInt16LE(data + 8) & 0x3fff, chunk: id }
    }
    off = data + size + (size & 1)
  }
  throw new Error('缺少图像帧 chunk')
}

/* WAV：遍历 chunk，读 fmt / data，校验 PCM 峰值 */
function wavInfo(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('不是 WAV（RIFF/WAVE 魔数不符）')
  }
  let off = 12
  let fmt = null
  let data = null
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4)
    const size = buf.readUInt32LE(off + 4)
    const body = off + 8
    if (id === 'fmt ') {
      fmt = {
        audioFormat: buf.readUInt16LE(body),
        channels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        byteRate: buf.readUInt32LE(body + 8),
        blockAlign: buf.readUInt16LE(body + 12),
        bitsPerSample: buf.readUInt16LE(body + 14),
      }
    }
    if (id === 'data') data = { offset: body, size: Math.min(size, buf.length - body) }
    off = body + size + (size & 1)
  }
  if (!fmt || !data) throw new Error('缺少 fmt/data chunk')
  const duration = data.size / fmt.byteRate
  let peak = 0
  const step = Math.max(2, fmt.blockAlign || 2)
  for (let i = data.offset; i + 1 < data.offset + data.size; i += step) {
    const v = Math.abs(buf.readInt16LE(i)) / 32768
    if (v > peak) peak = v
  }
  return Object.assign({ duration, peak }, fmt)
}

function svgCheck(rel) {
  const text = readFile(rel)
  assert.match(text, /<svg[\s>]/, rel + ' 缺 <svg 根')
  assert.equal((text.match(/<svg[\s>]/g) || []).length, 1, rel + ' svg 根数量应为 1')
  assert.match(text, /<\/svg>\s*$/, rel + ' 未以 </svg> 收尾')
  assert.doesNotMatch(text, /undefined|NaN/, rel + ' 含 undefined/NaN')
  assert.doesNotMatch(text, /<script/i, rel + ' 含 script')
  assert.doesNotMatch(text, /(?:href|src)\s*=\s*["']https?:/i, rel + ' 含外链')
  return text
}

/* ────────────────────────────────────── [1] 必需文件存在且非空 */
console.log('[1] 必需文件存在且非空')
const REQUIRED = [
  'lib/assets/brand/whale.svg',
  'lib/assets/brand/whale-official.svg',
  'lib/assets/brand/whale-silhouette.svg',
  'lib/assets/brand/lockup.svg',
  'lib/assets/brand/wordmark.svg',
  'lib/assets/audio/vyron-boot.wav',
  'lib/assets/audio/handoff.wav',
  'locale/en.json',
  'locale/zh.json',
  'icon.svg',
  'lib/assets/manifest.json',
]
for (const rel of REQUIRED) {
  H.check(rel + ' 存在且非空', () => {
    assert.ok(fileExists(rel), rel + ' 不存在')
    assert.ok(fileSize(rel) > 0, rel + ' 为空文件')
  })
}
H.check('字体文件 ≥7 个且均非空', () => {
  const fonts = fs.readdirSync(p('lib/assets/fonts'))
  assert.ok(fonts.length >= 7, '字体数 ' + fonts.length)
  for (const f of fonts) assert.ok(fileSize('lib/assets/fonts/' + f) > 1024, f + ' 过小')
})

/* ────────── [2] WebP 体积预算与像素尺寸（仅本地恢复素材后生效） ────────── */
console.log('[2] WebP 体积与尺寸（公开仓库可缺，缺则 skip）')
const WEBP_BUDGET = [
  ['lib/assets/hero-4k.webp', 1.2 * 1024 * 1024, 3840, 2160],
  ['lib/assets/hero-2k.webp', 400 * 1024, 1920, 1080],
  ['lib/assets/poster.webp', 200 * 1024, 1280, 720],
]
for (const [rel, budget, width, height] of WEBP_BUDGET) {
  if (!fileExists(rel)) {
    H.skip(path.basename(rel) + ' 体积/尺寸', '公开仓库不含第三方底图（本地恢复见 scripts/prepare-local-media.ps1）')
    continue
  }
  const size = fileSize(rel)
  H.check(path.basename(rel) + ' ≤ ' + Math.round(budget / 1024) + 'KB（实测 ' + Math.round(size / 1024) + 'KB）', () => {
    assert.ok(size <= budget, rel + ' 超预算：' + size + 'B > ' + budget + 'B')
  })
  H.check(path.basename(rel) + ' 像素 ' + width + '×' + height, () => {
    const dim = webpSize(readBuffer(rel))
    assert.equal(dim.width, width)
    assert.equal(dim.height, height)
  })
}

/* ──────────────────────── [3] WAV 头校验与波形非静音 */
console.log('[3] WAV 头校验')
const bootWav = wavInfo(readBuffer('lib/assets/audio/vyron-boot.wav'))
const handoffWav = wavInfo(readBuffer('lib/assets/audio/handoff.wav'))
for (const [name, info] of [['vyron-boot.wav', bootWav], ['handoff.wav', handoffWav]]) {
  H.check(name + ' PCM 44.1kHz / 2ch / 16bit', () => {
    assert.equal(info.audioFormat, 1, '应为 PCM(1)')
    assert.equal(info.sampleRate, 44100)
    assert.equal(info.channels, 2)
    assert.equal(info.bitsPerSample, 16)
    assert.equal(info.blockAlign, 4)
    assert.equal(info.byteRate, 176400)
  })
}
H.check('vyron-boot.wav 时长 10.4s ±0.1', () => {
  assert.ok(Math.abs(bootWav.duration - 10.4) <= 0.1, 'duration=' + bootWav.duration)
})
H.check('handoff.wav 时长 1.4s ±0.1', () => {
  assert.ok(Math.abs(handoffWav.duration - 1.4) <= 0.1, 'duration=' + handoffWav.duration)
})
H.check('vyron-boot.wav 体积 ≤2.0MB', () => assert.ok(fileSize('lib/assets/audio/vyron-boot.wav') <= 2.0 * 1024 * 1024))
H.check('handoff.wav 体积 ≤300KB', () => assert.ok(fileSize('lib/assets/audio/handoff.wav') <= 300 * 1024))
H.check('两条音轨非静音（PCM 峰值 > 0.01）', () => {
  assert.ok(bootWav.peak > 0.01, 'boot peak=' + bootWav.peak)
  assert.ok(handoffWav.peak > 0.01, 'handoff peak=' + handoffWav.peak)
})
H.check('音轨峰值不削顶（< 0.999）', () => {
  assert.ok(bootWav.peak < 0.999, 'boot peak=' + bootWav.peak)
  assert.ok(handoffWav.peak < 0.999, 'handoff peak=' + handoffWav.peak)
})

/* ────────────────────────── [4] 品牌 SVG 结构 */
console.log('[4] 品牌 SVG 结构')
const BRAND = [
  ['lib/assets/brand/whale.svg', 12 * 1024],
  ['lib/assets/brand/whale-official.svg', 12 * 1024],
  ['lib/assets/brand/whale-silhouette.svg', 20 * 1024],
  ['lib/assets/brand/lockup.svg', 20 * 1024],
  ['lib/assets/brand/wordmark.svg', 20 * 1024],
]
for (const [rel, budget] of BRAND) {
  H.check(path.basename(rel) + ' 结构合法且 ≤' + Math.round(budget / 1024) + 'KB', () => {
    const text = svgCheck(rel)
    assert.match(text, /viewBox=/, rel + ' 缺 viewBox')
    assert.ok(fileSize(rel) <= budget, rel + ' 体积 ' + fileSize(rel) + 'B 超 ' + budget + 'B')
  })
}
H.check('whale.svg 用 currentColor（可随皮肤着色）', () => {
  const text = readFile('lib/assets/brand/whale.svg')
  assert.match(text, /currentColor/)
  assert.match(text, /viewBox="0 0 50 50"/)
})
H.check('lockup.svg 含 DEEPSEEK HARNESS 字标', () => {
  const text = readFile('lib/assets/brand/lockup.svg')
  assert.match(text, /deepseek/i)
  assert.match(text, /harness/i)
})
H.check('wordmark.svg 含 DEEPSEEK 字样', () => {
  const text = readFile('lib/assets/brand/wordmark.svg')
  assert.match(text, /deepseek/i)
})

/* ────────────────────────── [5] 字体魔数与体积 */
console.log('[5] 字体魔数与体积')
const FONT_REQUIRED = [
  ['lib/assets/fonts', /^quicksand/i, 'OTTO'],
  ['lib/assets/fonts', /^oxanium-200/i, 'wOF2'],
  ['lib/assets/fonts', /^share-tech-mono/i, 'wOF2'],
  ['lib/assets/fonts', /^jetbrains-mono-400/i, 'wOF2'],
  ['lib/assets/fonts', /^jetbrains-mono-500/i, 'wOF2'],
  ['lib/assets/fonts', /^montserrat-medium/i, 'wOF2'],
]
const fontFiles = fs.readdirSync(p('lib/assets/fonts'))
for (const [dir, re, magic] of FONT_REQUIRED) {
  const match = fontFiles.find((f) => re.test(f))
  H.check('字体 ' + re.source.replace(/\^|\$|\//g, '') + ' 存在且为 ' + magic, () => {
    assert.ok(match, '缺失匹配 ' + re)
    const rel = dir + '/' + match
    assert.ok(fileSize(rel) <= 100 * 1024, rel + ' 超 100KB')
    const head = readBuffer(rel).subarray(0, 4).toString('ascii')
    if (magic === 'wOF2') assert.equal(head, 'wOF2', rel + ' 魔数=' + JSON.stringify(head))
    else assert.equal(head, 'OTTO', rel + ' 魔数=' + JSON.stringify(head))
  })
}

/* Anurati：个人使用授权字体，不随公开仓库分发；本地恢复后可选校验 */
const anurati = fontFiles.find((f) => /^anurati/i.test(f))
if (!anurati) {
  H.skip('字体 anurati', '公开仓库不含 Anurati（Free for personal use，非 OFL）；本地恢复见 scripts/prepare-local-media.ps1')
} else {
  H.check('字体 anurati 存在且为 OTTO', () => {
    const rel = 'lib/assets/fonts/' + anurati
    assert.ok(fileSize(rel) <= 100 * 1024, rel + ' 超 100KB')
    assert.equal(readBuffer(rel).subarray(0, 4).toString('ascii'), 'OTTO', rel + ' 魔数不符')
  })
}

/* ────────────────────────── [6] locale 元数据 */
console.log('[6] locale 元数据')
for (const lang of ['en', 'zh']) {
  H.check('locale/' + lang + '.json 可解析且含 meta.title/description', () => {
    const data = JSON.parse(readFile('locale/' + lang + '.json'))
    assert.ok(data.meta, '缺 meta')
    assert.equal(typeof data.meta.title, 'string')
    assert.ok(data.meta.title.trim().length >= 4, 'title 过短')
    assert.equal(typeof data.meta.description, 'string')
    assert.ok(data.meta.description.trim().length >= 20, 'description 过短')
    assert.match(data.meta.title, /VYRON/i, 'title 未含 VYRON')
    assert.match(data.meta.description, /DSH|DEEPSEEK|DeepSeek/, 'description 未含 DSH 品牌')
  })
}
H.check('中英文 title 不同（本地化生效）', () => {
  const en = JSON.parse(readFile('locale/en.json')).meta.title
  const zh = JSON.parse(readFile('locale/zh.json')).meta.title
  assert.notEqual(en, zh)
})

/* ────────────────────────── [7] icon.svg */
console.log('[7] icon.svg')
H.check('icon.svg ≤256KiB', () => assert.ok(fileSize('icon.svg') <= 256 * 1024))
H.check('icon.svg 结构合法 128×128', () => {
  const text = svgCheck('icon.svg')
  assert.match(text, /viewBox=/, '缺 viewBox')
  assert.match(text, /width="128"/)
  assert.match(text, /height="128"/)
})
H.check('icon.svg 含品牌元素（鱼/弧/星海之一）', () => {
  const text = readFile('icon.svg')
  assert.ok(/path|circle|ellipse/.test(text), '无可绘制元素')
})

/* ────────────────────────── [8] manifest 完整性（本地恢复素材后优先 manifest.local.json） */
console.log('[8] manifest 完整性')
const MANIFEST_REL = fileExists('lib/assets/manifest.local.json') ? 'lib/assets/manifest.local.json' : 'lib/assets/manifest.json'
const manifest = JSON.parse(readFile(MANIFEST_REL))
H.check('manifest 名称/根目录', () => {
  assert.equal(manifest.name, 'dsh-startup-vyron')
  assert.equal(manifest.root, 'lib/assets')
  assert.equal(typeof manifest.generatedAt, 'string')
  assert.match(manifest.generatedAt, /^\d{4}-\d{2}-\d{2}T/)
})
H.check('manifest fileCount 与 files 长度一致', () => assert.equal(manifest.fileCount, manifest.files.length))
H.check('manifest totalBytes = 各文件 bytes 之和', () => {
  const sum = manifest.files.reduce((acc, f) => acc + f.bytes, 0)
  assert.equal(manifest.totalBytes, sum)
})
H.check('manifest 无重复路径', () => {
  const paths = manifest.files.map((f) => f.path)
  assert.equal(new Set(paths).size, paths.length)
})
const manifestByPath = new Map(manifest.files.map((f) => [f.path, f]))
H.check('manifest 覆盖全部必需资产', () => {
  for (const rel of REQUIRED) {
    if (rel === 'lib/assets/manifest.json' || !rel.startsWith('lib/assets/')) continue
    const key = rel.slice('lib/assets/'.length)
    assert.ok(manifestByPath.has(key), 'manifest 缺 ' + key)
  }
})
H.check('manifest 覆盖磁盘上的全部资产文件（除 manifest 自身）', () => {
  const walk = (dir, base) => {
    const out = []
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name)
      const rel = base ? base + '/' + entry.name : entry.name
      if (entry.isDirectory()) out.push(...walk(abs, rel))
      else if (rel !== 'manifest.json' && rel !== 'manifest.local.json') out.push(rel)
    }
    return out
  }
  const onDisk = walk(p('lib/assets'), '')
  assert.deepEqual(Array.from(manifestByPath.keys()).sort(), onDisk.sort())
})
H.check('manifest 每个文件 bytes 与磁盘一致', () => {
  for (const entry of manifest.files) {
    const rel = 'lib/assets/' + entry.path
    assert.equal(fileSize(rel), entry.bytes, rel + ' bytes 不符')
  }
})
H.check('manifest sha256 全量复核通过', () => {
  let checked = 0
  for (const entry of manifest.files) {
    const rel = 'lib/assets/' + entry.path
    const hash = crypto.createHash('sha256').update(fs.readFileSync(p(rel))).digest('hex')
    assert.equal(hash, entry.sha256, rel + ' sha256 不符')
    checked++
  }
  assert.equal(checked, manifest.fileCount, '复核文件数与 manifest.fileCount 不一致')
  assert.ok(checked >= 15, '复核文件数 ' + checked + '（公开版 15，本地全量 19）')
})
H.check('manifest 图片带尺寸', () => {
  for (const entry of manifest.files.filter((f) => f.kind === 'image')) {
    assert.ok(entry.width > 0 && entry.height > 0, entry.path + ' 缺尺寸')
  }
})
H.check('manifest 音频带采样参数', () => {
  for (const entry of manifest.files.filter((f) => f.kind === 'audio')) {
    assert.equal(entry.sampleRate, 44100, entry.path)
    assert.equal(entry.channels, 2, entry.path)
    assert.equal(entry.bits, 16, entry.path)
    assert.ok(Math.abs(entry.seconds - (entry.path.includes('boot') ? 10.4 : 1.4)) <= 0.1, entry.path)
  }
})

H.done()
