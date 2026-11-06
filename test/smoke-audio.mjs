/* ============================================================================
 * smoke-audio.mjs — 启动音轨引擎（lib/audio.js）冒烟
 * ----------------------------------------------------------------------------
 * 用 node:vm + mock HTMLAudioElement 加载 lib/audio.js（无显示器、无音频设备）。
 * 覆盖面（design-spec §5 / §7 contract / PAUSE-STATE §4）：
 *  [1] 契约形状（window.VYRON_AUDIO / __vyronAudio / 方法齐全）
 *  [2] init 建元素：boot/chime 挂 body、data-vyron-audio、音量、preservesPitch
 *  [3] rate 透传与钳制（0.5–1.5，chime 固定 1）与 wallDuration
 *  [4] 音量钳制 0–1（含非法值回默认 0.65）
 *  [5] start / sync / stop 基本播放与漂移校正
 *  [6] 自动播放被拦（NotAllowedError）→ blocked + 一次性手势补播
 *  [7] 手势后仍被拒 → 只 warn 一次、静音降级
 *  [8] 资源 404 / 解码失败 → 只 warn 一次、failed=true、不抛异常
 *  [9] chime 交接钟声（rate=1、重复 init 重建、blocked 手势补播）
 *  [10] reduced 分支（mode=chime、只播钟声、rate=1）
 *  [11] enabled=false（不播、mode=silent）
 *  [12] stop 淡出（默认 180ms → 时钟推进后 pause）
 *  [13] dispose 清理
 *  [14] headless 无 HTMLAudioElement → 静音降级不崩
 *
 * 运行：node test/smoke-audio.mjs
 * ========================================================================== */
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { createHarness, makeEnv, readFile } from './_mocks.mjs'

const AUDIO_CODE = readFile('lib/audio.js')
const H = createHarness('AUDIO')

const SRC = '../lib/assets/audio/vyron-boot.wav'
const CHIME = '../lib/assets/audio/handoff.wav'

function loadAudio(opts = {}) {
  const env = makeEnv(opts)
  const context = vm.createContext(env.sandbox())
  vm.runInContext(AUDIO_CODE, context, { filename: 'audio.js' })
  return { env, context, api: env.window.VYRON_AUDIO }
}

/* 让已创建的音频元素带上"媒体已加载"的元数据（真实浏览器在 loadedmetadata 后可用） */
function prime(run, bootDuration = 10.4, chimeDuration = 1.4) {
  if (run.env.audios[0]) run.env.audios[0].duration = bootDuration
  if (run.env.audios[1]) run.env.audios[1].duration = chimeDuration
}

/* ───────────────────────────────────────────── [1] 契约形状 */
console.log('[1] 契约形状')
let run = loadAudio()
H.check('window.VYRON_AUDIO 存在', () => assert.equal(typeof run.api, 'object'))
H.check('__vyronAudio 标记', () => assert.equal(run.api.__vyronAudio, true))
H.check('version 字段', () => assert.match(String(run.api.version), /^\d+\.\d+\.\d+$/))
for (const fn of ['init', 'start', 'sync', 'stop', 'chime', 'state', 'dispose']) {
  H.check('导出 ' + fn + '()', () => assert.equal(typeof run.api[fn], 'function'))
}
H.check('加载阶段不抛异常、不 console.error', () => {
  assert.equal(run.env.logs.error.length, 0)
})
H.check('未 init 时 state 可安全调用', () => {
  const st = run.api.state()
  assert.equal(st.enabled, true)
  assert.equal(st.playing, false)
  assert.equal(st.mode, 'silent')
})

/* ───────────────────────────────────── [2] init 建元素 */
console.log('[2] init 建元素')
run = loadAudio()
run.api.init({ src: SRC, chimeSrc: CHIME, enabled: true, volume: 0.65, reduced: false, rate: 0.85 })
const [bootEl, chimeEl] = run.env.audios
H.check('创建 2 个音频元素', () => assert.equal(run.env.audios.length, 2))
H.check('boot 元素属性', () => {
  assert.ok(bootEl)
  assert.equal(bootEl.getAttribute('data-vyron-audio'), 'boot')
  assert.equal(bootEl.getAttribute('aria-hidden'), 'true')
  assert.equal(bootEl.getAttribute('preload'), 'auto')
  assert.equal(bootEl.loop, false)
  assert.equal(bootEl.style.display, 'none')
  assert.equal(bootEl.src, SRC)
})
H.check('chime 元素属性', () => {
  assert.ok(chimeEl)
  assert.equal(chimeEl.getAttribute('data-vyron-audio'), 'chime')
  assert.equal(chimeEl.src, CHIME)
})
H.check('元素挂到 body', () => {
  assert.equal(bootEl.parentNode, run.env.body)
  assert.equal(chimeEl.parentNode, run.env.body)
})
H.check('boot 音量 = 0.65', () => assert.equal(bootEl.volume, 0.65))
H.check('boot preservesPitch = true', () => assert.equal(bootEl.preservesPitch, true))
H.check('boot playbackRate = 0.85', () => assert.equal(bootEl.playbackRate, 0.85))
H.check('chime playbackRate 固定 1', () => assert.equal(chimeEl.playbackRate, 1))
H.check('chime preservesPitch = true', () => assert.equal(chimeEl.preservesPitch, true))
H.check('init 后 state.mode=boot', () => assert.equal(run.api.state().mode, 'boot'))
H.check('init 后 state.enabled=true', () => assert.equal(run.api.state().enabled, true))

/* ───────────────────────── [3] rate 透传与钳制 */
console.log('[3] rate 透传与钳制')
{
  const r = loadAudio()
  r.api.init({ src: SRC, chimeSrc: CHIME, rate: 2 })
  H.check('rate 2 钳到 1.5', () => {
    assert.equal(r.env.audios[0].playbackRate, 1.5)
    assert.equal(r.api.state().rate, 1.5)
  })
}
{
  const r = loadAudio()
  r.api.init({ src: SRC, chimeSrc: CHIME, rate: 0.1 })
  H.check('rate 0.1 钳到 0.5', () => assert.equal(r.env.audios[0].playbackRate, 0.5))
}
{
  const r = loadAudio()
  r.api.init({ src: SRC, chimeSrc: CHIME, rate: 'abc' })
  H.check("非法 rate 'abc' 回 1", () => assert.equal(r.env.audios[0].playbackRate, 1))
}
{
  const r = loadAudio()
  r.api.init({ src: SRC, chimeSrc: CHIME, rate: 0.85 })
  prime(r, 10.4, 1.4)
  const st = r.api.state()
  H.check('state.preservesPitch', () => assert.equal(st.preservesPitch, true))
  H.check('wallDuration = duration/rate（10.4/0.85）', () => {
    assert.ok(Math.abs(st.wallDuration - 10.4 / 0.85) < 1e-6, String(st.wallDuration))
  })
  r.api.start()
  H.check('start() 不改变 rate', () => assert.equal(r.env.audios[0].playbackRate, 0.85))
  H.check('chime 元素始终 1.0x', () => assert.equal(r.env.audios[1].playbackRate, 1))
}

/* ───────────────────────────── [4] 音量钳制 */
console.log('[4] 音量钳制')
for (const [input, expected] of [[1.5, 1], [-1, 0], [0.42, 0.42]]) {
  const r = loadAudio()
  r.api.init({ src: SRC, chimeSrc: CHIME, volume: input })
  H.check('volume ' + input + ' 钳到 ' + expected, () => {
    assert.equal(r.env.audios[0].volume, expected)
    assert.equal(r.api.state().volume, expected)
  })
}
{
  const r = loadAudio()
  r.api.init({ src: SRC, chimeSrc: CHIME })
  H.check('volume 缺省 0.65', () => assert.equal(r.api.state().volume, 0.65))
}
{
  const r = loadAudio()
  r.api.init({ src: SRC, chimeSrc: CHIME, volume: 'abc' })
  H.check('volume 非法值钳到 0', () => assert.equal(r.api.state().volume, 0))
}

/* ───────────────────── [5] start / sync / stop */
console.log('[5] start / sync / stop')
{
  const r = loadAudio()
  r.api.init({ src: SRC, chimeSrc: CHIME, volume: 0.65 })
  prime(r)
  r.api.start()
  const el = r.env.audios[0]
  H.check('start 播放 boot 且 currentTime=0', () => {
    assert.equal(el.playCalls, 1)
    assert.equal(el.paused, false)
    assert.equal(el.currentTime, 0)
  })
  H.check('state.playing=true', () => assert.equal(r.api.state().playing, true))
  r.api.sync(2)
  H.check('sync(2) 漂移 → currentTime=2', () => assert.equal(el.currentTime, 2))
  r.api.sync(2.2)
  H.check('sync(2.2) 漂移 <0.5s 不抖动', () => assert.equal(el.currentTime, 2))
  r.api.stop(0)
  H.check('stop(0) 立即暂停', () => {
    assert.equal(el.paused, true)
    assert.equal(r.api.state().playing, false)
  })
}
{
  const r = loadAudio()
  r.api.init({ src: SRC, chimeSrc: CHIME })
  prime(r)
  r.api.start()
  const el = r.env.audios[0]
  el.pause() /* 模拟外部暂停/ended */
  r.api.sync(10.39)
  H.check('靠近结尾不补播（SEEK_END_GUARD）', () => assert.equal(el.playCalls, 1))
  r.api.sync(4.0)
  H.check('暂停态 sync 从动画秒补播', () => {
    assert.equal(el.playCalls, 2)
    assert.equal(el.currentTime, 4)
    assert.equal(el.paused, false)
  })
}
{
  const r = loadAudio()
  r.api.init({ src: SRC, chimeSrc: CHIME })
  prime(r)
  r.api.sync(3.0)
  H.check('未 start 时 sync 不播放', () => assert.equal(r.env.audios[0].playCalls, 0))
}

/* ───────────────── [6] 自动播放被拦 → 手势补播 */
console.log('[6] 自动播放被拦降级')
{
  const r = loadAudio({ audioPolicy: { block: true, name: 'NotAllowedError' } })
  r.api.init({ src: SRC, chimeSrc: CHIME })
  prime(r)
  r.api.start()
  const el = r.env.audios[0]
  await r.env.flush()
  H.check('blocked=true', () => assert.equal(r.api.state().blocked, true))
  H.check('未播放（play 被拒）', () => assert.equal(el.paused, true))
  H.check('一次 pointerdown 手势即补播', () => {
    const before = el.playCalls
    r.env.audioPolicy.block = false
    r.env.document.dispatchEvent({ type: 'pointerdown' })
    assert.equal(el.playCalls, before + 1)
  })
  await r.env.flush()
  H.check('手势后从 pendingT 补播', () => {
    assert.equal(el.paused, false)
    assert.equal(el.currentTime, 0)
  })
  H.check('补播成功清除 blocked', () => assert.equal(r.api.state().blocked, false))
}
{
  const r = loadAudio({ audioPolicy: { block: true, name: 'NotAllowedError' } })
  r.api.init({ src: SRC, chimeSrc: CHIME })
  prime(r)
  r.api.start()
  r.api.sync(3.2)
  await r.env.flush()
  r.env.audioPolicy.block = false
  r.env.document.dispatchEvent({ type: 'pointerdown' })
  await r.env.flush()
  H.check('blocked 期间 sync(3.2) → 手势后从 3.2 补播', () => {
    assert.equal(r.env.audios[0].currentTime, 3.2)
    assert.equal(r.env.audios[0].paused, false)
  })
}
{
  const r = loadAudio({ audioPolicy: { block: true, name: 'NotAllowedError' } })
  r.api.init({ src: SRC, chimeSrc: CHIME })
  prime(r)
  r.api.start()
  await r.env.flush()
  r.env.audioPolicy.block = false
  r.env.document.dispatchEvent({ type: 'keydown' })
  await r.env.flush()
  H.check('keydown 手势同样可补播', () => {
    assert.equal(r.env.audios[0].paused, false)
    assert.equal(r.api.state().blocked, false)
  })
}

/* ───────────── [7] 手势后仍被拒 → 静音降级只 warn 一次 */
console.log('[7] 手势后仍被拒')
{
  const r = loadAudio({ audioPolicy: { block: true, name: 'NotAllowedError' } })
  r.api.init({ src: SRC, chimeSrc: CHIME })
  prime(r)
  r.api.start()
  await r.env.flush()
  r.env.document.dispatchEvent({ type: 'pointerdown' })
  await r.env.flush()
  const autoplayWarns = r.env.logs.warn.filter((line) => /autoplay still blocked/.test(line))
  H.check('仍被拒只 warn 一次', () => assert.equal(autoplayWarns.length, 1, r.env.logs.warn.join('|')))
  H.check('静音降级 failed=true', () => assert.equal(r.api.state().failed, true))
  H.check('不 console.error', () => assert.equal(r.env.logs.error.length, 0))
}

/* ───────────────────────── [8] 资源 404 / 解码失败 */
console.log('[8] 资源 404 / 解码失败')
{
  const r = loadAudio()
  r.api.init({ src: SRC, chimeSrc: CHIME })
  prime(r)
  r.api.start()
  const el = r.env.audios[0]
  el.emitError(4)
  el.emitError(4)
  const mediaWarns = r.env.logs.warn.filter((line) => /boot audio failed to load\/decode/.test(line))
  H.check('404/解码失败只 warn 一次', () => assert.equal(mediaWarns.length, 1, r.env.logs.warn.join('|')))
  H.check('failed=true 且 mode=silent', () => {
    const st = r.api.state()
    assert.equal(st.failed, true)
    assert.equal(st.mode, 'silent')
  })
  H.check('资源失败后 sync/start/stop 不抛异常', () => {
    r.api.sync(2)
    r.api.start()
    r.api.stop(0)
  })
  H.check('资源失败不 console.error', () => assert.equal(r.env.logs.error.length, 0))
  H.check('重新 init 可恢复（failed 复位）', () => {
    r.api.init({ src: SRC, chimeSrc: CHIME })
    assert.equal(r.api.state().failed, false)
  })
}

/* ───────────────────────── [9] chime 交接钟声 */
console.log('[9] chime 交接钟声')
{
  const r = loadAudio()
  r.api.init({ src: SRC, chimeSrc: CHIME })
  prime(r)
  const el = r.env.audios[1]
  H.check('chime() 返回 true', () => assert.equal(r.api.chime(), true))
  H.check('chime 元素播放且 rate=1', () => {
    assert.equal(el.playCalls, 1)
    assert.equal(el.paused, false)
    assert.equal(el.playbackRate, 1)
  })
  H.check('state.chimePlaying=true', () => assert.equal(r.api.state().chimePlaying, true))
}
{
  const r = loadAudio({ audioPolicy: { block: true, name: 'NotAllowedError' } })
  r.api.init({ src: SRC, chimeSrc: CHIME })
  prime(r)
  r.api.chime()
  await r.env.flush()
  H.check('钟声被拦 → blocked', () => assert.equal(r.api.state().blocked, true))
  r.env.audioPolicy.block = false
  r.env.document.dispatchEvent({ type: 'pointerdown' })
  await r.env.flush()
  H.check('手势后补播钟声', () => {
    assert.equal(r.env.audios[1].playCalls, 2)
    assert.equal(r.api.state().blocked, false)
  })
}

/* ───────────────────────── [10] reduced 分支 */
console.log('[10] reduced 分支')
{
  const r = loadAudio()
  r.api.init({ src: SRC, chimeSrc: CHIME, reduced: true, rate: 0.85 })
  prime(r)
  H.check('reduced → mode=chime', () => assert.equal(r.api.state().mode, 'chime'))
  r.api.start()
  H.check('reduced start 只播钟声', () => {
    assert.equal(r.env.audios[0].playCalls, 0, 'boot 不应播放')
    assert.equal(r.env.audios[1].playCalls, 1, 'chime 应播放')
    assert.equal(r.env.audios[1].playbackRate, 1, 'chime 固定 1x')
  })
  H.check('reduced 不播风声/鲸叫（boot 元素未播）', () => assert.equal(r.env.audios[0].paused, true))
}

/* ───────────────────────── [11] enabled=false */
console.log('[11] enabled=false')
{
  const r = loadAudio()
  r.api.init({ src: SRC, chimeSrc: CHIME, enabled: false })
  prime(r)
  r.api.start()
  H.check('enabled=false 不播放', () => {
    assert.equal(r.env.audios[0].playCalls, 0)
    assert.equal(r.env.audios[1].playCalls, 0)
  })
  H.check('mode=silent', () => assert.equal(r.api.state().mode, 'silent'))
  H.check('chime() 返回 false', () => assert.equal(r.api.chime(), false))
  H.check('state.enabled=false', () => assert.equal(r.api.state().enabled, false))
}

/* ───────────────────────── [12] stop 淡出 */
console.log('[12] stop 淡出')
{
  const r = loadAudio()
  r.api.init({ src: SRC, chimeSrc: CHIME, volume: 0.65 })
  prime(r)
  r.api.start()
  const el = r.env.audios[0]
  r.api.stop()
  H.check('stop() 后进入淡出（仍暂停前先降音）', () => {
    r.env.advance(200)
    assert.equal(el.paused, true)
    assert.equal(el.volume, 0.65, '淡出结束恢复用户音量')
    assert.equal(r.api.state().playing, false)
  })
}

/* ───────────────────────── [13] dispose 清理 */
console.log('[13] dispose 清理')
{
  const r = loadAudio()
  r.api.init({ src: SRC, chimeSrc: CHIME })
  prime(r)
  r.api.start()
  r.api.dispose()
  H.check('dispose 移除元素', () => {
    assert.equal(r.env.audios[0].parentNode, null)
    assert.equal(r.env.audios[1].parentNode, null)
    assert.equal(r.env.audios[0].src, '')
  })
  H.check('dispose 后 state 安全且 mode=silent', () => {
    const st = r.api.state()
    assert.equal(st.mode, 'silent')
    assert.equal(st.playing, false)
  })
}

/* ───────────────────── [14] headless 无 HTMLAudioElement */
console.log('[14] headless 无 HTMLAudioElement')
{
  const r = loadAudio({ noAudio: true })
  r.api.init({ src: SRC, chimeSrc: CHIME })
  H.check('无 Audio 元素时静音降级不抛异常', () => {
    r.api.start()
    r.api.sync(1)
    r.api.stop(0)
    r.api.chime()
  })
  H.check('warn 一次 HTMLAudioElement unavailable', () => {
    const warns = r.env.logs.warn.filter((line) => /HTMLAudioElement unavailable/.test(line))
    assert.equal(warns.length, 1, r.env.logs.warn.join('|'))
  })
  H.check('state.failed=true / mode=silent', () => {
    assert.equal(r.api.state().failed, true)
    assert.equal(r.api.state().mode, 'silent')
  })
  H.check('不 console.error', () => assert.equal(r.env.logs.error.length, 0))
}

H.done()
