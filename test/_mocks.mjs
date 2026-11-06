/* ============================================================================
 * VYRON 冒烟测试共享基建（零依赖）
 * ----------------------------------------------------------------------------
 * 1) createHarness(name)    ok 计数 / 失败明细 / `SMOKE <name> PASS n FAIL m TOTAL t` / 退出码
 * 2) 轻量 DOM               ClassList / Style / Elem / makeEnv（document / window / 时钟 / fetch）
 * 3) MockAudio              HTMLAudioElement 替身（play 可配置被自动播放策略拒绝）
 * 4) vm 沙箱               env.sandbox(extra) —— 供 lib/splash.js、lib/client.js、lib/audio.js 在
 *                          node 里以浏览器身份运行（无显示器、无真实音频设备）
 *
 * 设计原则：mock 只提供"浏览器应该有的行为"，断言永远写被测代码的契约，
 *           不为了让红线变绿而放宽 mock（见 AGENTS.md §6 验证纪律）。
 * ========================================================================== */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = fileURLToPath(new URL('..', import.meta.url))

export function readFile(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

export function fileExists(rel) {
  try {
    return fs.statSync(path.join(ROOT, rel)).isFile()
  } catch (err) {
    return false
  }
}

export function fileSize(rel) {
  return fs.statSync(path.join(ROOT, rel)).size
}

/* ─────────────────────────────────────────────────────────── 断言 harness */
export function createHarness(name) {
  let pass = 0
  const fails = []
  const skipped = []

  function check(label, fn) {
    try {
      fn()
      pass++
      console.log('  ok   ' + label)
    } catch (err) {
      fails.push({ label, err })
      console.log('  FAIL ' + label + ' :: ' + String((err && err.message) || err))
    }
  }

  function skip(label, reason) {
    skipped.push({ label, reason })
    console.log('  skip ' + label + '（' + reason + '）')
  }

  function done() {
    console.log('')
    if (skipped.length) {
      console.log('SKIP ' + skipped.length + ' 项：')
      for (const s of skipped) console.log('  - ' + s.label + '：' + s.reason)
      console.log('')
    }
    if (fails.length) {
      console.log('FAIL 明细：')
      for (const f of fails) {
        const stack = String((f.err && f.err.stack) || f.err).split('\n').slice(0, 4).join('\n    ')
        console.log('  ✗ ' + f.label)
        console.log('    ' + stack)
      }
      console.log('')
      process.exitCode = 1
    }
    console.log('SMOKE ' + name + ' PASS ' + pass + ' FAIL ' + fails.length + ' TOTAL ' + (pass + fails.length))
    return { pass, fail: fails.length }
  }

  return { check, skip, done }
}

/* ─────────────────────────────────────────────────────────────── 轻量 DOM */
export class ClassList {
  constructor(el) {
    this.el = el
    this.set = new Set()
  }
  add(...names) { for (const n of names) if (n) this.set.add(String(n)); this.sync() }
  remove(...names) { for (const n of names) this.set.delete(String(n)); this.sync() }
  contains(name) { return this.set.has(String(name)) }
  toggle(name, force) {
    const on = force === undefined ? !this.contains(name) : !!force
    if (on) this.add(name)
    else this.remove(name)
    return on
  }
  sync() { this.el._className = [...this.set].join(' ') }
  toString() { return [...this.set].join(' ') }
}

export class Style {
  constructor() {
    this.props = {}
  }
  setProperty(key, value) { this.props[String(key)] = String(value) }
  getPropertyValue(key) { return this.props[String(key)] === undefined ? '' : this.props[String(key)] }
  removeProperty(key) { const k = String(key); const v = this.props[k]; delete this.props[k]; return v === undefined ? '' : v }
  get cssText() { return Object.entries(this.props).map(([k, v]) => k + ':' + v).join(';') }
}

export class Elem {
  constructor(tag) {
    this.tagName = String(tag || 'div').toUpperCase()
    this._tag = String(tag || 'div').toLowerCase()
    this.children = []
    this.parentNode = null
    this.attrs = Object.create(null)
    this.style = new Style()
    this.listeners = {}
    this._className = ''
    this.classList = new ClassList(this)
    this.dataset = {}
    this.id = ''
    this.src = ''
    this.href = ''
    this.rel = ''
    this.textContent = ''
    this.hidden = false
    this.isConnected = false
    this._innerHTML = ''
    if (this.tagName === 'IFRAME') this.contentWindow = { __frame: this._tag }
  }
  get className() { return this._className }
  set className(value) {
    this._className = String(value || '')
    this.classList.set = new Set(this._className.split(/\s+/).filter(Boolean))
  }
  appendChild(child) {
    if (!child) return child
    if (child.parentNode) child.parentNode.removeChild(child)
    child.parentNode = this
    child.isConnected = this.isConnected || this._tag === 'html' ? true : this.isConnected
    this.children.push(child)
    return child
  }
  insertBefore(child, ref) {
    if (!child) return child
    if (child.parentNode) child.parentNode.removeChild(child)
    child.parentNode = this
    child.isConnected = this.isConnected
    const i = ref ? this.children.indexOf(ref) : -1
    if (i < 0) this.children.push(child)
    else this.children.splice(i, 0, child)
    return child
  }
  removeChild(child) {
    const i = this.children.indexOf(child)
    if (i >= 0) this.children.splice(i, 1)
    child.parentNode = null
    child.isConnected = false
    return child
  }
  get firstChild() { return this.children[0] || null }
  setAttribute(key, value) {
    this.attrs[String(key)] = String(value)
    if (key === 'src') this.src = String(value)
    if (key === 'href') this.href = String(value)
    if (key === 'id') this.id = String(value)
    if (key === 'class') this.className = String(value)
    if (key === 'rel') this.rel = String(value)
  }
  getAttribute(key) { return this.attrs[String(key)] === undefined ? null : this.attrs[String(key)] }
  removeAttribute(key) {
    delete this.attrs[String(key)]
    if (key === 'src') this.src = ''
    if (key === 'href') this.href = ''
  }
  hasAttribute(key) { return this.attrs[String(key)] !== undefined }
  addEventListener(type, fn) { (this.listeners[type] || (this.listeners[type] = [])).push(fn) }
  removeEventListener(type, fn) {
    const list = this.listeners[type]
    if (!list) return
    const i = list.indexOf(fn)
    if (i >= 0) list.splice(i, 1)
  }
  dispatch(type) {
    const event = { type, target: this, currentTarget: this, preventDefault() {}, stopPropagation() {} }
    for (const fn of (this.listeners[type] || []).slice()) fn(event)
    return event
  }
  set innerHTML(value) {
    this._innerHTML = String(value || '')
    this.children = []
    /* 只解析测试用到的形态：连续的 <span class="...">…</span>（ambient 层） */
    const re = /<span class="([^"]*)"[^>]*>(?:[^<]*)<\/span>/g
    let m
    while ((m = re.exec(this._innerHTML))) {
      const span = new Elem('span')
      span.className = m[1]
      span.parentNode = this
      span.isConnected = this.isConnected
      this.children.push(span)
    }
  }
  get innerHTML() { return this._innerHTML }
  set textContent(value) { this._text = String(value) }
  get textContent() { return this._text === undefined ? '' : this._text }
  closest(selector) {
    let node = this
    const want = String(selector || '').split(',').map((s) => s.trim())
    while (node) {
      for (const w of want) {
        if (w.startsWith('.') && node.classList.contains(w.slice(1))) return node
        if (w.startsWith('#') && node.id === w.slice(1)) return node
        if (w === 'button' && node.tagName === 'BUTTON') return node
        if (w === 'a' && node.tagName === 'A') return node
      }
      node = node.parentNode
    }
    return null
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 }
  }
}

export class MockEvent {
  constructor(type, init) {
    this.type = String(type)
    this.init = init || {}
    this.defaultPrevented = false
  }
  preventDefault() { this.defaultPrevented = true }
}

/* ─────────────────────────────────────────────────────── mock 音频元素 */
export class MockAudio {
  constructor(url, env) {
    this.env = env
    this.src = url || ''
    this.paused = true
    this.ended = false
    this.currentTime = 0
    this.duration = NaN
    this.volume = 1
    this.playbackRate = 1
    this.preservesPitch = true
    this.preload = ''
    this.loop = false
    this.error = null
    this.attrs = {}
    this.listeners = {}
    this.playCalls = 0
    this.style = new Style()
  }
  setAttribute(key, value) { this.attrs[String(key)] = String(value) }
  getAttribute(key) { return this.attrs[key] === undefined ? null : this.attrs[key] }
  removeAttribute(key) { delete this.attrs[key]; if (key === 'src') this.src = '' }
  addEventListener(type, fn) { (this.listeners[type] || (this.listeners[type] = [])).push(fn) }
  removeEventListener(type, fn) {
    const list = this.listeners[type] || []
    const i = list.indexOf(fn)
    if (i >= 0) list.splice(i, 1)
  }
  dispatch(type) { for (const fn of (this.listeners[type] || []).slice()) fn({ type, target: this }) }
  load() { this.dispatch('loadedmetadata') }
  play() {
    this.playCalls++
    const policy = this.env.audioPolicy
    if (policy && policy.block) {
      const err = new Error(policy.message || 'play blocked')
      err.name = policy.name || 'NotAllowedError'
      return Promise.reject(err)
    }
    if (policy && policy.fail) {
      const err = new Error(policy.message || 'play failed')
      err.name = policy.name || 'NotSupportedError'
      return Promise.reject(err)
    }
    this.paused = false
    this.ended = false
    this.dispatch('playing')
    return Promise.resolve()
  }
  pause() { this.paused = true }
  emitError(code) {
    this.error = { code: code || 4 }
    this.dispatch('error')
  }
}

/* ───────────────────────────────────────────────────────── mock 浏览器环境 */
export function makeEnv(opts = {}) {
  const clock = { now: 0 }
  const timeouts = new Map()
  const intervals = new Map()
  let seq = 0

  function scheduleTimeout(fn, ms) {
    const id = ++seq
    timeouts.set(id, { fn, at: clock.now + Math.max(0, Number(ms) || 0), canceled: false })
    return id
  }
  function cancelTimeout(id) {
    const t = timeouts.get(id)
    if (t) t.canceled = true
  }
  function scheduleInterval(fn, ms) {
    const id = ++seq
    const period = Math.max(1, Number(ms) || 1)
    intervals.set(id, { fn, period, at: clock.now + period, canceled: false })
    return id
  }
  function cancelInterval(id) {
    const t = intervals.get(id)
    if (t) t.canceled = true
  }
  function advance(ms) {
    const target = clock.now + Math.max(0, Number(ms) || 0)
    const thrown = []
    for (let guard = 0; guard < 50000; guard++) {
      let due = null
      let dueKind = ''
      for (const [id, t] of timeouts) {
        if (!t.canceled && t.at <= target && (!due || t.at < due.at)) { due = t; dueKind = 'timeout'; due._id = id }
      }
      for (const [id, t] of intervals) {
        if (!t.canceled && t.at <= target && (!due || t.at < due.at)) { due = t; dueKind = 'interval'; due._id = id }
      }
      if (!due) break
      clock.now = due.at
      if (dueKind === 'timeout') timeouts.get(due._id).canceled = true
      else intervals.get(due._id).at = due.at + intervals.get(due._id).period
      try { due.fn() } catch (err) { thrown.push(err) }
    }
    clock.now = Math.max(clock.now, target)
    if (thrown.length) throw thrown[0]
  }

  /* 日志捕获 */
  const logs = { warn: [], error: [], log: [], info: [] }
  const consoleMock = {
    warn: (...a) => logs.warn.push(a.map(String).join(' ')),
    error: (...a) => logs.error.push(a.map(String).join(' ')),
    log: (...a) => logs.log.push(a.map(String).join(' ')),
    info: (...a) => logs.info.push(a.map(String).join(' ')),
    debug: () => {},
  }

  /* DOM 树 */
  const head = new Elem('head')
  const body = new Elem('body')
  const html = new Elem('html')
  html.classList.add('dsh-root')
  head.isConnected = true
  body.isConnected = true
  html.appendChild(head)
  html.appendChild(body)

  function walk(node, fn) {
    if (!node) return null
    const hit = fn(node)
    if (hit) return hit
    for (const child of node.children) {
      const found = walk(child, fn)
      if (found) return found
    }
    return null
  }

  const docListeners = {}
  const document = {
    head,
    body,
    documentElement: html,
    title: '',
    hidden: false,
    readyState: 'complete',
    createElement: (tag) => new Elem(tag),
    createTextNode: (text) => ({ nodeType: 3, textContent: String(text) }),
    getElementById: (id) => walk(html, (n) => (n.id === String(id) ? n : null)),
    getElementsByClassName: (name) => {
      const out = []
      walk(html, (n) => { if (n.classList.contains(name)) out.push(n); return null })
      return out
    },
    querySelector: (selector) => {
      const sel = String(selector || '').trim()
      if (sel.startsWith('#')) return document.getElementById(sel.slice(1))
      const attr = /^style\[data-plugin-css="([^"]*)"\]$/.exec(sel)
      if (attr) {
        return walk(html, (n) => (n.tagName === 'STYLE' && n.dataset.pluginCss === attr[1] ? n : null))
      }
      const cls = /^\.([\w-]+)$/.exec(sel)
      if (cls) return walk(html, (n) => (n.classList.contains(cls[1]) ? n : null))
      return null
    },
    querySelectorAll: () => [],
    addEventListener: (type, fn) => { (docListeners[type] || (docListeners[type] = [])).push(fn) },
    removeEventListener: (type, fn) => {
      const list = docListeners[type]
      if (!list) return
      const i = list.indexOf(fn)
      if (i >= 0) list.splice(i, 1)
    },
    dispatchEvent: (event) => {
      for (const fn of (docListeners[event.type] || []).slice()) fn(event)
      return true
    },
    fonts: { ready: Promise.resolve() },
  }

  /* 音频元素 */
  const audios = []
  const audioPolicy = opts.audioPolicy || { block: false }
  function AudioCtor(url) {
    const el = new MockAudio(url, { audioPolicy })
    audios.push(el)
    return el
  }

  /* window 级事件 / 消息 */
  const winListeners = {}
  const dispatched = []
  const messages = []
  const win = {
    document,
    innerWidth: opts.innerWidth || 1600,
    innerHeight: opts.innerHeight || 900,
    devicePixelRatio: 1,
    location: { search: opts.search || '', href: 'http://127.0.0.1/index.html' + (opts.search || '') },
    navigator: { hardwareConcurrency: opts.cores === undefined ? 8 : opts.cores, userAgent: 'node-smoke' },
    performance: { now: () => clock.now },
    setTimeout: scheduleTimeout,
    clearTimeout: cancelTimeout,
    setInterval: scheduleInterval,
    clearInterval: cancelInterval,
    requestAnimationFrame: (fn) => scheduleTimeout(() => fn(clock.now), 16),
    cancelAnimationFrame: cancelTimeout,
    addEventListener: (type, fn) => { (winListeners[type] || (winListeners[type] = [])).push(fn) },
    removeEventListener: (type, fn) => {
      const list = winListeners[type]
      if (!list) return
      const i = list.indexOf(fn)
      if (i >= 0) list.splice(i, 1)
    },
    dispatchEvent: (event) => {
      dispatched.push(event)
      for (const fn of (winListeners[event.type] || []).slice()) fn(event)
      return true
    },
    postMessage: (data, origin) => messages.push({ data, origin }),
    matchMedia: (query) => ({
      matches: /prefers-reduced-motion/.test(String(query)) ? !!opts.prefersReducedMotion : false,
      media: String(query),
      addEventListener() {},
      removeEventListener() {},
    }),
    fetch: opts.fetch || ((url) => Promise.resolve({ ok: false, status: 404, url: String(url), json: async () => ({}) })),
    Audio: opts.noAudio ? undefined : AudioCtor,
    CSS: opts.cssSupports === undefined
      ? { supports: () => true }
      : { supports: (prop) => !!(opts.cssSupports[prop] || opts.cssSupports === true) },
    URLSearchParams: globalThis.URLSearchParams,
    __DSH_VYRON__: opts.config === undefined ? null : opts.config,
    __DSH_VYRON_FACTS__: opts.facts || {},
    __DSH_VYRON_VERSION__: opts.version,
    __DSH_VYRON_BOOT__: opts.boot,
    __DSH_VYRON_SKIP__: opts.skipFlag ? true : undefined,
  }
  win.window = win

  const sandboxExtras = {
    window: win,
    document,
    console: consoleMock,
    setTimeout: scheduleTimeout,
    clearTimeout: cancelTimeout,
    setInterval: scheduleInterval,
    clearInterval: cancelInterval,
    requestAnimationFrame: win.requestAnimationFrame,
    cancelAnimationFrame: cancelTimeout,
    fetch: win.fetch,
    navigator: win.navigator,
    CSS: win.CSS,
    performance: win.performance,
    matchMedia: win.matchMedia,
    URLSearchParams: globalThis.URLSearchParams,
    URL: globalThis.URL,
    Event: MockEvent,
    Audio: win.Audio,
    location: win.location,
    __DSH_VYRON__: win.__DSH_VYRON__,
    __DSH_VYRON_FACTS__: win.__DSH_VYRON_FACTS__,
    __DSH_VYRON_VERSION__: win.__DSH_VYRON_VERSION__,
    __DSH_VYRON_BOOT__: win.__DSH_VYRON_BOOT__,
    isFinite,
    isNaN,
    parseInt,
    parseFloat,
    encodeURIComponent,
    decodeURIComponent,
    encodeURI,
    decodeURI,
  }

  function sandbox(extra) {
    return Object.assign({}, sandboxExtras, extra || {})
  }

  function fireWindowEvent(type, payload) {
    const event = Object.assign(new MockEvent(type), payload || {})
    for (const fn of (winListeners[type] || []).slice()) fn(event)
    return event
  }

  function flush() {
    return new Promise((resolve) => setTimeout(resolve, 0))
  }

  function walkAll(node, fn, out) {
    for (const child of node.children) {
      fn(child, out)
      walkAll(child, fn, out)
    }
    return out
  }

  return {
    clock,
    advance,
    head,
    CSS: win.CSS,
    navigator: win.navigator,
    body,
    html,
    document,
    window: win,
    logs,
    console: consoleMock,
    audios,
    audioPolicy,
    messages,
    dispatched,
    timers: { timeouts, intervals },
    sandbox,
    fireWindowEvent,
    flush,
    walkAll,
  }
}
