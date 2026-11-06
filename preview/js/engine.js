/*!
 * VYRON · 星海鲸航 — 星海动效引擎（Canvas 2D / 零依赖 / headless SwiftShader 可跑）
 * 文件 owner：cloud-motion ｜ 契约见 docs/design-spec.md §7 ｜ 运动口径见 docs/motion-spec.md
 *
 * 职责：
 *   4K 底板 cover 绘制 + 镜头推近（1.00→1.08→1.12→P5 微爆）
 *   鼠标微视差（±8px、低频阻尼）、星点双层闪烁（固定种子）、云层右→左漂移
 *   平台金属反射微光/扫描、大气边缘光呼吸、P5 bloom、资源缺失→程序化深空兜底、reduced→静态首帧
 *
 * ROUND2（v0.2.0，用户反馈「让地球动起来」）：
 *   A) 云层/地表相对视差：4K 底板按离线云遮罩（plate-derived 192×108 4bit，构建期从
 *      hero-4k.webp 的亮度/饱和度/色温提取，运行期不读像素、file:// 下不触发 taint）
 *      拆成「地表层」（平移 ≤2px/s）+「云层」（screen 叠加、相对地表反向漂移 6–14px/s）；
 *      地表再叠加相机 0.45% 屏宽横移。
 *   B) 大气 limb 呼吸 8.4s（0.75→1.0）+ 色温偏移；星点跟随相机推近的 2–4px 视差。
 *   C) 两段大气光扫 4.0–5.0 / 6.4–7.4（斜向白带，opacity ≤0.10，0.6 屏宽/s）。
 *   D) 平台反射亮度↑ + 横向微颤；`?t=` 定格逐帧可复现（所有运动量只依赖 t，不依赖墙钟）。
 *
 * 用法（main.js）：
 *   const eng = window.VYRON_ENGINE.create({ canvas, hiSrc, midSrc, posterSrc, reduced, quality });
 *   await eng.ready;  eng.resize(w, h);  eng.render(t, { phase, speed, pointer:{x,y}, w, h, reveal });
 *   eng.dispose();  eng.stats();
 *
 * 约束：不依赖 WebGL / 第三方库 / 外部字体；不使用 fetch/XHR（file:// 离线可跑）；
 *       不读取底图像素（file:// 下 canvas 会被 taint），云/星/光晕全部程序化离线生成 sprite。
 * 时间：render(t) 的 t 为动画秒（0..9.8，已按 SPEED 缩放）；循环氛围动效按 t/speed 走 1x 墙钟。
 */
(function (global) {
  'use strict';

  var VERSION = '0.2.0';
  var TAU = Math.PI * 2;
  var TOTAL = 9.8;

  /* ------------------------------------------------------------------ *
   * 规格常量（与 design-spec.md §3 一致）
   * ------------------------------------------------------------------ */
  var PHASES = [
    { key: 'signal', from: 0.00, to: 0.65 },
    { key: 'console', from: 0.65, to: 3.10 },
    { key: 'breach', from: 3.10, to: 5.10 },
    { key: 'whale', from: 5.10, to: 7.60 },
    { key: 'lockup', from: 7.60, to: 9.00 },
    { key: 'bloom', from: 9.00, to: 9.80 }
  ];

  // 从 4K 底板（3840×2160）取样的几何（归一化 uv）
  var PLATE = {
    horizonApexV: 0.145,   // 中心处大气边缘 v
    horizonCurve: 0.52,    // 边缘处 horizonV(0)=0.275
    platformTopV: 0.778,   // 金属平台水平线
    strips: [              // 平台竖向反光柱（u, 宽度u, 基准强度, 闪烁频率, 相位）
      { u: 0.036, w: 0.030, a: 0.085, f: 0.42, ph: 0.0 },
      { u: 0.283, w: 0.024, a: 0.070, f: 0.31, ph: 1.7 },
      { u: 0.716, w: 0.030, a: 0.095, f: 0.37, ph: 3.1 },
      { u: 0.905, w: 0.110, a: 0.045, f: 0.23, ph: 4.2 }
    ],
    sunGlint: { u: 0.72, v: 0.20, a: 0.055 },   // 地球右侧太阳闪光（呼吸）
    sunWarm: { u: 0.86, v: 0.50, a: 0.035 },
    nebula: { u: 0.13, v: 0.05, a: 0.030 },     // 左上紫色星云（呼吸）
    operatorU: 0.50                              // 操作员剪影位置（避免高光堆叠，仅文档用）
  };

  var CAM = {
    z0: 1.0, zBreach: 1.08, zLockup: 1.12, zBloom: 1.138,
    focusU: 0.5, focusV: 0.52,      // 推近焦点（略低于画面中心，地球/平台一起压向观众）
    parallaxMax: 8,                 // 鼠标微视差 ±8px（design-spec 任务口径）
    parallaxDamp: 0.34,             // 低频阻尼时间常数（秒）
    microDriftX: 0.55, microDriftY: 0.35
  };

  var COLORS = {
    space: '#04070f',
    space2: '#0a1424',
    rim: [87, 168, 255],
    rimHi: [191, 226, 255],
    cloud: [238, 242, 246],
    ocean: [29, 79, 140],
    steel: [139, 154, 171],
    violet: [118, 96, 208],
    cream: [241, 230, 210],
    white: [255, 252, 246]
  };

  // 质量档：数字=档位（3 高 / 2 平衡 / 1 低 / 0 极简）
  var LEVELS = [
    { name: 'minimal',  clouds: 3, starsFar: 110, starsNear: 26, dprCap: 1.0, maxPixels: 0.90e6, cacheScale: 1.00, budgetMs: 10.0 },
    { name: 'low',      clouds: 5, starsFar: 170, starsNear: 40, dprCap: 1.0, maxPixels: 1.60e6, cacheScale: 1.00, budgetMs: 9.0 },
    { name: 'balanced', clouds: 7, starsFar: 240, starsNear: 60, dprCap: 1.5, maxPixels: 2.60e6, cacheScale: 1.10, budgetMs: 8.0 },
    { name: 'high',     clouds: 9, starsFar: 320, starsNear: 80, dprCap: 2.0, maxPixels: 3.90e6, cacheScale: 1.14, budgetMs: 7.0 }
  ];

  /* ------------------------------------------------------------------ *
   * ROUND2 运动规格（数值表见 docs/motion-spec.md §14；单位：CSS px / 秒）
   * 所有量只依赖动画秒 t（或 ambientT = t/speed），不读墙钟 → ?t= 定格可复现。
   * ------------------------------------------------------------------ */
  var MOTION = {
    revealT: 3.10,               // 底板可见起点（= PHASES[2].from，P2）
    // A) 云层 / 地表相对视差
    plateScrollPxS: 0.85,        // 地表层平移速度（≤2px/s）
    cloudDriftPxS: 9.5,          // 云层相对地表漂移（6–14 区间内）；方向：向左
    cloudDriftMinPxS: 6,         // 规格下限（用于验收/文档）
    cloudDriftMaxPxS: 14,        // 规格上限
    cloudGustAmp: 0.16,          // 阵风调制 ±16% → 瞬时 7.98–11.02px/s，仍在 6–14 内
    cloudGustPeriodS: 11.0,
    cloudYBiasPxS: 0.10,         // 云层相对地表极缓纵向漂移
    cloudDeckMix: 1.00,          // 云层替换强度：1.0 = 云区整块替换为「位移后的真实云纹」（无重影双曝）
    cloudDeckBreathe: 0.00,      // 预留：替换模式下不做 alpha 呼吸（alpha<1 会把原云透出来 → 双曝）
    camPanW: 0.0045,             // 相机横移：0.45% 屏宽（3.20→9.60s 完成 → 0.3–0.6% 区间内）
    camPanFrom: 3.20,
    camPanTo: 9.60,
    // B) 大气 limb 呼吸 + 星点相机视差
    limbPeriodS: 8.4,
    limbMin: 0.75,
    limbMax: 1.00,
    limbWarmRgb: 14,             // 色温偏移幅度（R↑ B↓，≤±14 级，肉眼"轻微"）
    starCamK: 0.08,              // 星点相机视差：scale = 1 + (zoom-1)·K → P2 约 2px / P5 约 4px
    starRefPx: 420,              // 焦点→画面顶部星点的参考距离（px 指标换算用）
    // C) 两段大气光扫（斜向极淡白带，opacity ≤0.10，0.6 屏宽/秒）
    sweeps: [
      { from: 4.0, to: 5.0 },
      { from: 6.4, to: 7.4 }
    ],
    sweepSpeedW: 0.60,           // 屏宽/秒
    sweepWidthW: 0.22,           // 白带宽度（屏宽占比）
    sweepPeakAlpha: 0.085,       // 峰值 opacity（≤0.10）
    sweepSlope: -0.38,           // 斜向角度（rad，向右上→左下）
    sweepCenterY: 0.46,          // 白带中心 y（屏高占比）
    // D) 平台反射
    platformGain: 1.22,          // 反光柱亮度增益
    platformWobblePx: 2.6,       // 横向微颤幅度
    platformWobbleFreq: 1.15,    // 横向微颤频率（rad/s）
    platformLineBreathe: 0.08    // 平台线高光呼吸增量
  };

  /* 云层遮罩：构建期（Python/Pillow）从 lib/assets/hero-4k.webp 提取的「云区 alpha」，
   * 192×108、4bit 量化、nibble 打包、base64。运行期只解码成一张小 canvas 当软遮罩，
   * 不从 4K 图读像素（file:// 下 canvas 会被 taint，getImageData 会抛 SecurityError）。
   * 遮罩几何 = 4K 底板图像坐标系；cover 绘制时按 plateCache 的 ox/oy/uw/vh 对齐。 */
  var CLOUD_MASK_W = 192, CLOUD_MASK_H = 108;
  var CLOUD_MASK_B64 =
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAARERERERERERERERERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAARERERESIiIiIjMzMzMzMzMzMzIiIiEREREQAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAREREiIiMzMzM0RDMzRFVVZmZmZmZmVVVVVVVEQzMyIhEREQAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAARERIjMzREVWVERDRVQyIiNVVFVURFVVVVZlZmZmZmdmZVVVRDMi' +
    'IRERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAARESIjNERVVVaIiHVERERlQiEREiIiIiEjRVZ3h3ZnZlVVVm' +
    'Z3iYh3dmZUMyIRERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABESI0RVVFVEV4iavLmGRFaJq7l1QzMiIRERElisze7u' +
    '3d3KqXVVebzLu6q7upmHZUMyEREQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAREiNEVomHZmdVebze7IZXms3v///IZmUyIRER' +
    'I3vv/////////+t1WM7//+7u7czcy6mHZDMhERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAARIzRWZmery5mZl3ic7u3JiazN////2m' +
    'VEMiERIiNGi97//////////YVGi+///////+zM3cy5h1QyIREAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAESIzRWeHdove3Lu6qZrf//7Ll3' +
    'ec7//qdDIRIiI0VWeJre///////////+pkRpve//////2qvN3uy6qYZTIhEQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAESIzMzRHmYic7+zMqZh3' +
    'rv//yFMjWM3u7IQhEREjNYvN7u//////////////65dUVpvf/////rh4mszM7u3KhkMhERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABEiIzIiIiNHrN7v' +
    '/9uoVEQ1is7acxERJGd4iHRDIiI1ec7v/////////////////+24ZEV63////+p1V4rN7///7Ll1QiERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABEjQzIRES' +
    'NFaM7//+y6lkIRE1d4h1MhAAERI0VmaHVmVomZqr3v/////////////////+yWVFjP////yoiZmZve////7bqGQyERAAAAAAAAAAAAAAAAAAAAAAAAAAABEi' +
    'MzIhEREliave7t25iHUxEREkVlRDMhAAABElZkWKmrupdmVWjP/////////v////3v//7dp3rv////7duauYeK3////u7cuWQyERAAAAAAAAAAAAAAAAAAAA' +
    'AAAAERIyERESMzRomZq7vJdlV3QhERERIzIzMyAAAAESMyNXmph2M0Q0Wt7///////2qq+//7O/+zf7c3////////LzMqIq83e///u3cuWQyERAAAAAAAAAA' +
    'AAAAAAAAABEREREQARI0d3eZZneIh1MjNDIRIhERERESIhAAAAERERIjRDMiETVEas3////////cqM///+7KvN///////////+7v7dy7uqz//+7u7tqGQyER' +
    'AAAAAAAAAAAAAAABEiEREQAAASRXmYiHVWZnZCERERESIREAAAARERAAAREREAESNDIhEjVove//////////7e////2WeZz////////////////u7Km8ur3e' +
    '/+3LqGQyEQAAAAAAAAAAAAASIiEREQAAASRpqodmVWVnZCEQAAABEAAAAAAAAREQAAAAAAESRUQzIjau//////////////////+1M0ab3f//////////////' +
    '/+yqlmeJvO7tzMqGQhEAAAAAAAAAAAASIREAAAAAESN6uXd2RERmQhAAAAAAAAAAAAAAAAEQAAAAAAESM0dkIjbP////////////////7tqEIRI0Vq3L3///' +
    '///////////cp1ZUV7ze7u3Mp0IRAAAAAAAAEAESMhAAAAABEjaIdleGQzNDIQAAAAAAAAAREQEQAAAAAAAAABIzNIqWMja+////////////////yoUyEQER' +
    'EkZ3m93////////////8l2VDNpu9///su5dTIQAAABEQERIiIQAAAAESJGd1REVUMiIhEAAAAAAAAAEREREAAAAAAAAAASRVad7JYiR63v//////////////' +
    '63UyEREAERIjRpvO///////////shUMiJGrO///+3KmHZCEAABEAESIhAAAAARIjV3UzMzMiEREQAAAAAAAAABEREQAAAAAQAAAAESNYvv/ZUhE1Z5rO////' +
    '/////////9llMhEREBERJHve///////////qZEVCIiWM7////9qIhlMhAAESEREQAAAAEiNGZTIiIRERAAAAAAAAAAAAEQEAAAAAAAEiEREREkaL3duFIRES' +
    'NGnP//////////////63VDMyERERE1irze/////////bl4mGQhJIzd7///2odUREAAEiEQAAESERIzM0QyIiERAAAAAAAAABERABEAAAAAABEBETMiMiNpu6' +
    'hmUxEREjWM7////////////////rh4d3VDIRESRVi93Mze7v/u7dzLmXQhEkes7u7uy6hkNFAAEhEQABEjIREiIiIiERAAAAAAERERERERAAAAAAAAASIRAR' +
    'IiM0eYiGMiERERJZzv//////////////7u7My7q7qYQhESRnrcl2aJrMzMzN3bqFRDISNpvMzcmHiGVEABEREBEREREAABEREREAAAAAAAERERIREREAAAAA' +
    'ABEjIhAAEjVFZkRVMREREja//////////////d/9mKuomqrNzLdDERNoq7lSIzV4dnd5vLqXZVQzRFabmYVEaYdlABEQABIiEQAAAAAAAAAAAAAAAAERIiIi' +
    'IiEAAAABESNWUhEAI0VDQyIzIRESR63////////////sl53rZFioZ5ib3duXMhEjVndSEREjIiI0aJqYZWd3h2ebmHZDNWd2ABERABEREQAAAAAAAAAAABEA' +
    'AAEiREREUyIREQESRmi7dCEAEjRDRUNDM0RXvv/////////////YQ1iqZEWId3doq7y6hBEREkVCEAAREREiNGd4dmeYiZqqq6mHVEVmABIhAAAREAAAAAAA' +
    'AAAAAAEAAAEjZlVEMiERERI1i97+tyEAEUeImYiZmbze/////////////+22IjRYl1VnZURWeJqphSEQERIhAAAAAAEiM0RFZUVmZ4iImqmZh2UzABEQARER' +
    'AAAAAAAAAAAAABEREREliqqWQyEBERIkat//xzERE3vN3M3v////////////////2XdjERIkeGVmUzI0VWeIZCIQARERAAAAEREiIiIiMyJFZmZlZ3h2Z3Uy' +
    'AAAAABAAAAAAAAAAAAABERIzMzRZzv/spzEREREjV63/2WMRI3rO///////////////////rYyMhEBEjVlVEMyIiI0VmZCEQARARERABIhEiIiIzMiIkRURm' +
    'ZUQyNEMzAAAAAAAAAAAAAAAAAAABI1ZkREWL7///2DIiIjRoq9//7rdURXnP//////////////////6oQhERERMzNEMyIRIiIiM0QiERARESIiESIiESIiIz' +
    'QyIiNFVndUMyI1VEARAAAAEQAAAAAAAAAAATaJhkRWis7///pTNVNGeL3v/+7ty6q7zv//////////////////6nQhERETVURDMiEREiIiMiIiIhEiMzMzIi' +
    'IiERESIkVSIiI0VVVVZTIjZ1EAAAARERAAAAAAAAAAE3q6mGaIm83v/9hVaGRERXmZmpmZrLqYir3u7v/////////////+yWMRIRIjRERUMyERESIiMiERIy' +
    'IzRUQ0MyIRERERI0VTIRIzMiI0ZlQyNXERAAASRCAAAAAAAAABJZzKhlZlVni83bh4mXZCIiM0MzMzVlQzNGiYic3v///////////7dmQiMiIzM0VUMhERER' +
    'ERIhESIzIjVlQzMiIhERERNEVTIRESIRESM1ZlQ0QxAAASRCAAAAAAAAASNXh1Q0VCI0abupdlVUQhERERERERIhEREiMzNGi+///////////6QzMiMjMzM0' +
    'VDMhERERERERESIjIjRUQyIRIhEREiIzNEMiERERESIzRndlQxAAABIhAAAAAAAAATM0MiIiQzNFnO23QiIREQAAAAAAAAAAAAARERIkes7v/////////pQh' +
    'ERIiIjMzMzMiEREREBERERIjMiMzMyERERERIyIiIzMiESEQASMzNHiYEQAAABEAAAAAAAAAABERERESNXmrzduFMREAAAAAAAAREQAAERERESI1eZmZmt//' +
    '////63QhEREzM0VCIiIiIRERERERESIiIRIiIiERAAABEiIiESIREREQARI1VWeIAAAAABAAAAAAAAAAAAAAABEkes7+uXVEIQEAAAAAAREjIRERIiIiI1Zo' +
    'mYVDRZ3////+pkMzIRI0RFVDIiEiESEREREREiIiERERIhEQAAABEjMyIRIREREQAAE1ZmdVAAAAABEAAAAAAAAAAAAAASR6ze/qZCIiEAEAABEQESIjIiMz' +
    'RmVURmeId2QhJZ3////8dEVlMiNFVVQyIiIiIiERERERESIREREREREQAAABEiIiIhEREREQAAAjRnhkAAAAABEAAAAAAAAAAAAREki97/6mMREAAAAAARER' +
    'ERIhE1eIrMuFRVVkMzIRJJ3///7aYyRUMyNWZUMiIiIjMyIhERERERERERERABEAAAAAERERIhEREQAQAAARJYmXAAAAAAAAAAAAAAAAAREiNGre/+lTEQAA' +
    'AAAAEREAABERI2rM7//YVDMyEREAE3zv7duYUxEiIiJEMzMzIiIjRDIRERESIRARERERAAAAAAAAAREREiIRIRAAAAABE2iZAAAAAAAAAAAQAAAAESRVaKzv' +
    '/rdCEAAAAAAAAAABEBEjRq3////+pCERAAAAElrLqph1VDIRERIiEiIiNEMzRDEREREREQABEREAAAAAAAAAABERERIiIhAAAAAAEkeHAAAAAAAAESERAAAB' +
    'JGiqvN///blSEAAAAAAAAAABERE1nP//////6EIQAAAAElZnioZWZTIQAAARERI0VTIiJDEQAREBEAAAABEQAAAAAAAAABERERIiIiEBAAAAATREAAAAAAER' +
    'IyEQAAARNorM3v/+3LlREAABEAAAAAABERNZ7////////IMQAAAAAjM0Z3VWUxEAAAARESRDMhEREREQARERAAAREREAAAAAAAAAABERESIiIiEQAAAAARER' +
    'AAAAARNDIhEAAAESRnm7zd3Ll2UhEREREAAAAAABE1e+/////////JUhEAAAAREiI0QzIRAAAAATVTIhEAAAAAEAAREBERESERAAAAAAAAABERERIiMiIhEA' +
    'AAAAEhEAAAABEkVUIRERERIiRWeJmal1QiESIzMiEQAAAAESR63//////+///ahkIREAARERERIREREQAAAldjERAAAAAAAAAAABESIhERAAAAAAAAABERER' +
    'IzMyIiEAAAAAIyEAAAABIzMyEREjMzMiM0RFVWZCERERNnZmQgAAABEknN//////7Kvf/9yXVDIQEhAAAAEQEkQgAAASMxEAAAAAAAAAAAABIREiEQAAABEA' +
    'AAAAARESI0REMyEQAAAAEiEAAAABERERESNXd3UyERERIiIhAAARJWeHQhAAESNYzv//7ty5dlae//2WZCEQERAAAAAAEjMgABAAEQAAAAAAAAAAAAABIQAS' +
    'EAABEREAAAAAAAESM0REMyERAAAAARIQAAAAARERESRoqYYxEAAAERERAAARR4h3UhERI2nN7//+yoZDIjWe/+tkQhAAAAAAAAAAAREAABEAAAAAAAAAAAAA' +
    'AAAAEREREQAREREAAAAAAAESI0RDMzIREREAABIQAAABEhERERM1ZUMhAAAAAAAAAAAjaqZYhTNFec////66dDIREkad7tuGUyAAAAAAEREQAAAQAAAAAAAA' +
    'AAAAAAAAAAAAAREjMxERERAAAAAAAAASIzNDIiMyIiIQABAAAAABIhEQABESMhEAAAAAAAAAAAE0V3Vquoms3v///9lkMREREkV5mamHZCEAAAERIzMhAAEQ' +
    'AAAAEQAAAAAAAAAAAAAAARJFRCERABAAAAAAAAASM0RUMzRCI0QxAAAAAAAAEAAAAAABEQAAAAAAAAABERIzRmes3u7/////64UxEREREjVUM0VVQyERERIk' +
    'eqhTIQEAAAAAEREQAAAAAAAAABEAAAEiMiIRASEAAAAAAAEjREVmVFQyIjRDEQAAAAAAAAAAABAAAAAAAAAAAAATQyNWirzv/v/////+uGMhABEAETMhERIz' +
    'NEM0VWZnrNyHUhAAAAAAABEREAAAAAAAASIQAAAAEREQEjMQAAAAABIzRFVWZDIRERJFQQAAAAAAAAAAARERAAAAAAAAAAE1ZlaK3v//7N7u26qph1MhAAAA' +
    'AREAERERI1ZpvN2VV4hkQgAAAAAAAAABIQAAAAARIzMQAAAAAAAAEiMxAAAAERIjNFVVQyEREhEkUxAAAAAAAAABIzIiAAAAAAAAABJHm6ms3d7svMy5dUNE' +
    'RDIgAAAAAAAAAAERIleJrO6DIiIhEQAAAAAAAAABIhEAEREzMyEQAAAAAAAAARNCERESIzREVVQzIiIRERARMxAAAAAAAAATV3QhAAAAAAAAASNHq7u7qqqr' +
    'u6dUMhERERAAAAAAAAAAARE0VmZVV7tSEREAAAAAAAAAAAAAAREREjRDIRAAAAAAAAAAAAEzIjNERVVmZUMyIiIhEQAREQAAAAAAAAI1eGQhAAAAAAAAASI1' +
    'Z4h3ZmaKmGMhEQAAAAAAAAAAAAABEjV5l2REM1YxAAAAAAAAAAAAAAAAAAEQEkQxEAAAAAAAAAABEAEjNFVURFVWVEMzIjIREAASEAAAAAAAABI0ZUMhAAAA' +
    'AAAAARESIzMzNEZ3UyEREAAAAAAAAAAAAAATRomZh3ZTIREQAAAAAAAAAAAAAAAAAAABESIRAAAAAAAAAAAREAEjRFVDIiI0RVQzMiIREAABIQAAAAAAAAEj' +
    'REQxEAAAAAAAAAAAERERI1VTIRABAAAAAAAAAAAAABFGd3ZVVnZCEAAAAAAAAAAAAAAAAAAAAAASMiEQAAAAAAAAAAASEQEjQ0QxEBERJFVDIREREAAAEQAA' +
    'AAAAAAATMzMhEAAAAAAAAAAAAAABIzMhEAABEAAAAAAAAAAAABNGVCIREjMRAAAAAAAAAAAAAAAAAAAAAAASMyIQAAAAAAAAAAEREQEjMzIQAAAAESMzIRER' +
    'EAAAAAAAAAAAAAESIiIRAAAAAAAAAAAAAAABEREQAAAAAAAAABAAAAAAASMzMhEAABEAAAAAAAAQAAAAAAAAAAAAAAAREREQAAAAAAAAAAAAEQEiIiEAAAAA' +
    'ABIiERAAAAAAAAAAAAAAAAEREREQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAERIREQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAS' +
    'IRAAAAAAAAEREQAAAAAAAAAAAAAAAAARERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEREQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAABEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAA';

  /* ------------------------------------------------------------------ *
   * 数学 / 小工具
   * ------------------------------------------------------------------ */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, u) { return a + (b - a) * u; }
  function mod(a, n) { a = a % n; return a < 0 ? a + n : a; }
  function smoothstep(a, b, v) { var u = clamp((v - a) / (b - a || 1e-6), 0, 1); return u * u * (3 - 2 * u); }
  function easeInOutSine(u) { return 0.5 - 0.5 * Math.cos(Math.PI * clamp(u, 0, 1)); }
  function easeOutCubic(u) { u = clamp(u, 0, 1); return 1 - Math.pow(1 - u, 3); }
  function easeInCubic(u) { u = clamp(u, 0, 1); return u * u * u; }
  function bell(u) { u = clamp(u, 0, 1); return Math.sin(Math.PI * u); }
  function now() {
    if (global.performance && typeof global.performance.now === 'function') return global.performance.now();
    return Date.now ? Date.now() : 0;
  }
  function mulberry32(a) {
    a = a >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function ihash(x, y, s) {
    var h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise(x, y, s) {
    var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    var a = ihash(xi, yi, s), b = ihash(xi + 1, yi, s);
    var c = ihash(xi, yi + 1, s), d = ihash(xi + 1, yi + 1, s);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  }
  function fbm(x, y, s, oct) {
    var sum = 0, amp = 0.5, freq = 1, norm = 0;
    for (var i = 0; i < oct; i++) {
      sum += amp * vnoise(x * freq, y * freq, s + i * 101);
      norm += amp;
      amp *= 0.5; freq *= 2.03;
    }
    return sum / (norm || 1);
  }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function pct(samples, p) {
    if (!samples.length) return 0;
    var arr = samples.slice().sort(function (a, b) { return a - b; });
    var idx = clamp(Math.round((arr.length - 1) * p), 0, arr.length - 1);
    return arr[idx];
  }

  /* ------------------------------------------------------------------ *
   * 离屏 sprite 工厂（只在 init/resize 生成一次，逐帧只做 drawImage 合成）
   * ------------------------------------------------------------------ */
  function makeCanvas(w, h) {
    if (typeof global.document === 'undefined' || !global.document.createElement) return null;
    var c = null;
    try { c = global.document.createElement('canvas'); } catch (e) { return null; }
    if (!c) return null;
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  function makeStarSprite() {
    var size = 32, c = makeCanvas(size, size);
    if (!c) return null;
    var g = c.getContext('2d');
    if (!g) return null;
    var grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grd.addColorStop(0.00, 'rgba(255,255,255,1)');
    grd.addColorStop(0.16, 'rgba(255,255,255,0.92)');
    grd.addColorStop(0.42, 'rgba(255,255,255,0.28)');
    grd.addColorStop(1.00, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    return c;
  }

  function makeGlowSprite(inner, outer, stops) {
    var size = 128, c = makeCanvas(size, size);
    if (!c) return null;
    var g = c.getContext('2d');
    if (!g) return null;
    var grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (var i = 0; i < stops.length; i++) grd.addColorStop(stops[i][0], rgba(stops[i][1], stops[i][2]));
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    return c;
  }

  // 云 sprite：多倍频 value noise + 椭圆径向衰减 + 横向拉伸（近似 blobsSM40/Gusts_of_wind 的风成团絮）
  function makeCloudSprite(seed, w, h) {
    var c = makeCanvas(w, h);
    if (!c) return null;
    var g = c.getContext('2d');
    if (!g) return null;
    var img;
    try { img = g.createImageData(w, h); } catch (e) { return null; }
    if (!img || !img.data) return null;
    var d = img.data;
    for (var y = 0; y < h; y++) {
      var ny = (y / h - 0.5) * 2;
      for (var x = 0; x < w; x++) {
        var nx = (x / w - 0.5) * 2;
        var ell = Math.sqrt(nx * nx * 1.0 + ny * ny * 2.6);      // 横向扁椭圆
        var fall = clamp(1 - ell, 0, 1);
        if (fall <= 0.001) continue;
        var base = fbm(x * 0.016, y * 0.050, seed, 5);
        var det = fbm(x * 0.055, y * 0.150, seed + 37, 3);
        var n = base * 0.68 + det * 0.32;
        var a = Math.pow(fall, 1.35) * smoothstep(0.36, 0.80, n);
        if (a <= 0.004) continue;
        // 冷白偏蓝（贴地球云海），越靠外越偏蓝
        var idx = (y * w + x) * 4;
        var blue = 1 - 0.35 * fall;
        d[idx] = 236 + 10 * (1 - fall);
        d[idx + 1] = 242 + 8 * (1 - fall);
        d[idx + 2] = Math.round(248 + 7 * blue);
        d[idx + 3] = Math.round(a * 255);
      }
    }
    try { g.putImageData(img, 0, 0); } catch (e) { return null; }
    return c;
  }

  // 竖向反光条 sprite：横向 gaussian、纵向轻衰减（平台金属反射）
  function makeStripSprite() {
    var w = 64, h = 128, c = makeCanvas(w, h);
    if (!c) return null;
    var g = c.getContext('2d');
    if (!g) return null;
    var img;
    try { img = g.createImageData(w, h); } catch (e) { return null; }
    if (!img || !img.data) return null;
    var d = img.data;
    for (var y = 0; y < h; y++) {
      var vy = 1 - 0.55 * (y / h);
      for (var x = 0; x < w; x++) {
        var nx = (x / w - 0.5) * 2;
        var a = Math.exp(-nx * nx * 4.2) * vy;
        var idx = (y * w + x) * 4;
        d[idx] = 205; d[idx + 1] = 226; d[idx + 2] = 250;
        d[idx + 3] = Math.round(a * 255);
      }
    }
    try { g.putImageData(img, 0, 0); } catch (e) { return null; }
    return c;
  }

  // 云层遮罩解码：base64（4bit nibble 打包，每字节 2 像素，高 nibble 在前）→ 小 canvas 软遮罩。
  // 只依赖 atob（浏览器/Worker 均有；无 atob 的宿主返回 null 并降级为"无云层视差"）。
  function decodeCloudMask() {
    if (typeof global.atob !== 'function' || !CLOUD_MASK_B64 || CLOUD_MASK_B64.indexOf('__') === 0) return null;
    var bin;
    try { bin = global.atob(CLOUD_MASK_B64); } catch (e) { return null; }
    var need = (CLOUD_MASK_W * CLOUD_MASK_H) / 2;
    if (!bin || bin.length < need) return null;
    var bytes = new Uint8Array(need);
    for (var i = 0; i < need; i++) bytes[i] = bin.charCodeAt(i) & 255;
    var c = makeCanvas(CLOUD_MASK_W, CLOUD_MASK_H);
    if (!c) return null;
    var g = c.getContext('2d');
    if (!g) return null;
    var img;
    try { img = g.createImageData(CLOUD_MASK_W, CLOUD_MASK_H); } catch (e) { return null; }
    if (!img || !img.data) return null;
    var d = img.data, half = CLOUD_MASK_W >> 1;
    var bx0 = CLOUD_MASK_W, by0 = CLOUD_MASK_H, bx1 = -1, by1 = -1;
    for (var y = 0; y < CLOUD_MASK_H; y++) {
      for (var x = 0; x < CLOUD_MASK_W; x++) {
        var b = bytes[y * half + (x >> 1)];
        var nib = (x & 1) ? (b & 15) : ((b >> 4) & 15);
        var idx = (y * CLOUD_MASK_W + x) * 4;
        d[idx] = 255; d[idx + 1] = 255; d[idx + 2] = 255;
        d[idx + 3] = nib * 17;                      // 0..255（16 级）
        if (nib > 0) {                              // 非零掩膜包围盒（逐帧只画这块，省合成面积）
          if (x < bx0) bx0 = x;
          if (x > bx1) bx1 = x;
          if (y < by0) by0 = y;
          if (y > by1) by1 = y;
        }
      }
    }
    try { g.putImageData(img, 0, 0); } catch (e) { return null; }
    return {
      canvas: c,
      box: (bx1 >= bx0 && by1 >= by0) ? { x0: bx0, y0: by0, x1: bx1 + 1, y1: by1 + 1 } : null
    };
  }

  /* ------------------------------------------------------------------ *
   * 引擎工厂
   * ------------------------------------------------------------------ */
  function create(options) {
    options = options || {};
    var canvas = options.canvas || null;
    var ctx = null;
    try { if (canvas && typeof canvas.getContext === 'function') ctx = canvas.getContext('2d'); } catch (e) { ctx = null; }

    var reduced = !!options.reduced;
    var qualityOpt = options.quality;
    var manualLevel = null;
    if (typeof qualityOpt === 'number') manualLevel = clamp(Math.round(qualityOpt), 0, 3);
    else if (typeof qualityOpt === 'string' && qualityOpt !== 'auto') {
      for (var li = 0; li < LEVELS.length; li++) if (LEVELS[li].name === qualityOpt) manualLevel = li;
    }
    var autoLevel = manualLevel;         // null = 自适应
    var level = autoLevel == null ? 3 : autoLevel;
    var autoDegraded = false;
    var disposed = false;

    // QA 调试开关：只读全局 __VYRON_ENGINE_DEBUG__（不影响正式契约）。
    // 用途：动效自证时分层截图（关掉某一层 → 差值得该层贡献）。
    // 支持字段：noClouds / noStars / noNebula / noGlint / noRim / noPlatform / noBloom
    //           noCloudDeck（v0.2 云层视差层）/ noSweep（v0.2 大气光扫）/ noLimb（v0.2 limb 呼吸+色温）
    var DBG = (global.__VYRON_ENGINE_DEBUG__ && typeof global.__VYRON_ENGINE_DEBUG__ === 'object')
      ? global.__VYRON_ENGINE_DEBUG__ : {};

    // 尺寸/画布
    var cssW = 0, cssH = 0, W = 0, H = 0, backingScale = 1;
    var cacheScale = 1;

    // 时间/状态
    var lastT = null, lastWall = null, lastAmbient = null, frameNo = 0;
    var pointerSm = { x: 0, y: 0 };
    var firstFrame = true;
    var staticDrawn = false;
    var drawSamples = [], intervalSamples = [];
    var warnOnce = {};

    // 资源
    var plateImg = null, plateMode = 'none', plateSrc = '';
    var plateTried = false;
    var plateCache = null;      // { canvas, s, ox, oy, uw, vh }
    var cloudDeck = null;       // 云层缓存（底板 × 云遮罩，screen 叠加；新增合成层 1 张）
    var cloudMask = null;       // 云遮罩小 canvas（192×108，构建期 payload 解码）
    var cloudMaskTried = false;
    var sprites = null;         // 星点/光晕/云/条
    var stars = null;
    var cloudDefs = null;
    var readyResolve = null;
    var ready = new Promise(function (res) { readyResolve = res; });

    function warn(msg) {
      if (warnOnce[msg]) return;
      warnOnce[msg] = 1;
      if (global.console && typeof global.console.warn === 'function') global.console.warn('[vyron-engine] ' + msg);
    }

    /* ---------------- 资源加载：hi → mid → poster → 程序化兜底 ---------------- */
    function loadImage(src, timeoutMs) {
      return new Promise(function (resolve) {
        if (!src || typeof global.Image === 'undefined') { resolve(null); return; }
        var img, settled = false, timer = null;
        function done(v) {
          if (settled) return;
          settled = true;
          if (timer && global.clearTimeout) global.clearTimeout(timer);
          resolve(v);
        }
        try { img = new global.Image(); } catch (e) { resolve(null); return; }
        img.onload = function () {
          // 注意：不依赖 img.decode() 的 Promise（headless / 虚拟时间下可能不 settle）。
          // onload 已足够 drawImage；真正的解码由浏览器在首次绘制时同步完成。
          done(img);
        };
        img.onerror = function () { done(null); };
        timer = global.setTimeout ? global.setTimeout(function () { done(null); }, timeoutMs || 4000) : null;
        try { img.src = src; } catch (e) { done(null); }
      });
    }

    function startPlateLoad() {
      if (plateTried) return;
      plateTried = true;
      var chain = [];
      if (options.hiSrc) chain.push({ src: options.hiSrc, ms: 4200, tag: 'hi' });
      if (options.midSrc) chain.push({ src: options.midSrc, ms: 2600, tag: 'mid' });
      if (options.posterSrc) chain.push({ src: options.posterSrc, ms: 1800, tag: 'poster' });
      var idx = 0;
      function next() {
        if (disposed) { readyResolve && readyResolve(); return; }
        if (idx >= chain.length) {
          plateMode = 'fallback';
          warn('底板素材不可用，已降级为程序化深空渐变');
          invalidateCache();
          readyResolve && readyResolve();
          return;
        }
        var item = chain[idx++];
        loadImage(item.src, item.ms).then(function (img) {
          if (disposed) { readyResolve && readyResolve(); return; }
          if (img) {
            plateImg = img;
            plateMode = 'plate';
            plateSrc = item.tag;
            invalidateCache();
            readyResolve && readyResolve();
          } else {
            next();
          }
        });
      }
      next();
    }

    /* ---------------- 尺寸 / 缓存 ---------------- */
    function invalidateCache() { plateCache = null; cloudDeck = null; staticDrawn = false; }

    function ensureSprites() {
      if (sprites) return;
      sprites = {
        star: makeStarSprite(),
        glowCold: makeGlowSprite(0, 128, [[0, [140, 200, 255], 1], [0.35, [110, 170, 255], 0.45], [1, [80, 140, 240], 0]]),
        glowWarm: makeGlowSprite(0, 128, [[0, [255, 244, 222], 1], [0.4, [255, 222, 170], 0.4], [1, [255, 190, 120], 0]]),
        glowViolet: makeGlowSprite(0, 128, [[0, [150, 120, 230], 1], [0.5, [100, 80, 190], 0.35], [1, [60, 40, 130], 0]]),
        glowRim: makeGlowSprite(0, 128, [[0, [210, 240, 255], 1], [0.4, [120, 190, 255], 0.5], [1, [60, 130, 230], 0]]),
        strip: makeStripSprite(),
        clouds: [makeCloudSprite(11, 256, 112), makeCloudSprite(29, 256, 112), makeCloudSprite(57, 256, 112)]
      };
      stars = buildStarField();
      cloudDefs = buildCloudDefs();
    }

    function buildStarField() {
      var cfg = LEVELS[level];
      var out = [];
      var rnd = mulberry32(0x53544152);          // 固定种子 "STAR"，跨帧/跨平台稳定
      var i, count = cfg.starsFar + cfg.starsNear;
      for (i = 0; i < count; i++) {
        var near = i >= cfg.starsFar;
        var n = rnd();
        // size = 星点半径 / 画面高（far 0.9‰–1.6‰、near 2.2‰–3.9‰，避免大光斑）
        var sizeK = near ? (0.0022 + 0.0017 * n) : (0.0009 + 0.0007 * n);
        out.push({
          x: rnd(), y: rnd(),                    // 屏幕归一化坐标
          layer: near ? 1 : 0,
          size: sizeK,
          base: near ? (0.30 + 0.50 * rnd()) : (0.14 + 0.36 * rnd()),
          freq: near ? (0.20 + 0.55 * rnd()) : (0.055 + 0.16 * rnd()),
          phase: rnd() * TAU,
          warm: rnd() < (near ? 0.22 : 0.10)
        });
      }
      return out;
    }

    function buildCloudDefs() {
      var cfg = LEVELS[level];
      var rnd = mulberry32(0x57494E44);          // "WIND"
      var out = [];
      for (var i = 0; i < 12; i++) {
        out.push({
          sprite: i % 3,
          u: rnd() * 1.3 - 0.15,
          v: 0.20 + rnd() * 0.52,
          w: 0.24 + rnd() * 0.44,               // 相对底板宽度
          ratio: 0.16 + rnd() * 0.12,           // 压扁比（风成层云）
          alpha: 0.050 + rnd() * 0.095,
          drift: 0.004 + rnd() * 0.004,         // u/秒，右→左（≈6.8–13.6px/s @1600，与云层视差 6–14 口径对齐）
          breathe: 0.045 + rnd() * 0.075,
          phase: rnd() * TAU
        });
      }
      // 大云在后、小云在前（叠画顺序不影响 additive，但便于将来做 z）
      out.sort(function (a, b) { return b.w - a.w; });
      return out.slice(0, cfg.clouds);
    }

    function applySize() {
      if (!ctx || !cssW || !cssH) return;
      var cfg = LEVELS[level];
      var dpr = (global.devicePixelRatio || 1) || 1;
      var areaCap = Math.sqrt(cfg.maxPixels / Math.max(cssW * cssH, 1));
      backingScale = clamp(Math.min(dpr, cfg.dprCap, areaCap), 0.35, 2.5);
      W = Math.max(2, Math.round(cssW * backingScale));
      H = Math.max(2, Math.round(cssH * backingScale));
      if (canvas.width !== W) canvas.width = W;
      if (canvas.height !== H) canvas.height = H;
      if (canvas.style) {
        // canvas 按 CSS 像素布局；若宿主 CSS 已设 100% 则同值覆盖，无副作用
        canvas.style.width = cssW + 'px';
        canvas.style.height = cssH + 'px';
      }
      cacheScale = cfg.cacheScale;
      invalidateCache();
      staticDrawn = false;
    }

    function setSize(w, h) {
      if (!ctx) return;
      w = Math.round(w || 0); h = Math.round(h || 0);
      if (w <= 0 || h <= 0) return;
      if (w === cssW && h === cssH && plateCache) return;
      cssW = w; cssH = h;
      applySize();
    }

    // 生成底板缓存：cache 空间 = 底板 cover 到 (W*s)×(H*s) 画布
    function buildPlateCache() {
      if (!ctx) return;
      var cfg = LEVELS[level];
      var s = cfg.cacheScale;
      // 缓存像素预算（避免 4K 屏爆内存）
      var maxCachePx = 4.6e6;
      var sCap = Math.sqrt(maxCachePx / Math.max(W * H, 1));
      s = clamp(Math.min(s, sCap), 1.0, 1.6);
      cacheScale = s;
      var CW = Math.max(2, Math.round(W * s)), CH = Math.max(2, Math.round(H * s));
      var c = makeCanvas(CW, CH);
      if (!c) { plateCache = null; return; }
      var g = c.getContext('2d');
      if (!g) { plateCache = null; return; }
      g.imageSmoothingEnabled = true;
      if ('imageSmoothingQuality' in g) { try { g.imageSmoothingQuality = 'high'; } catch (e) { /* noop */ } }

      var meta = { canvas: c, s: s, ox: 0, oy: 0, uw: CW, vh: CH, mode: plateMode };

      if (plateMode === 'plate' && plateImg) {
        var iw = plateImg.naturalWidth || plateImg.width || CW;
        var ih = plateImg.naturalHeight || plateImg.height || CH;
        var scale0 = Math.max(CW / iw, CH / ih) * 1.0;
        var dw = iw * scale0, dh = ih * scale0;
        meta.ox = (CW - dw) * 0.5;
        meta.oy = (CH - dh) * 0.5;
        meta.uw = dw;
        meta.vh = dh;
        try { g.drawImage(plateImg, meta.ox, meta.oy, dw, dh); } catch (e) { warn('底板绘制失败：' + e); paintFallback(g, CW, CH); meta.mode = 'fallback'; }
      } else {
        paintFallback(g, CW, CH);
        meta.mode = 'fallback';
      }
      plateCache = meta;
    }

    /* ---------------- 云层视差缓存（新增合成层，仅 1 张） ----------------
     * 做法：把底板缓存再画一份，用构建期提取的「云区 alpha」软遮罩 destination-in 裁出云层。
     * 运行期逐帧把这张云层用 source-over 替换叠回底板，并叠加一个相对位移 → 云与地表产生视差。
     * 为什么用替换而不是 screen：screen 只增亮 → 云整体洗白 + 与原云双曝重影；替换模式在位移 0 时
     * 像素与原图一致（完全不改美术），位移增大时只有云纹平移，遮罩边缘是 192×108 双线性羽化 → 无硬接缝。
     * 性能：只保留「非零遮罩包围盒」这一块（约 63% 画高），逐帧 drawImage 只合成该子矩形。
     * fallback（底板缺失）模式不建云层，避免拿程序化兜底图冒充真实云纹。 */
    function ensureCloudMask() {
      if (cloudMaskTried) return cloudMask;
      cloudMaskTried = true;
      cloudMask = decodeCloudMask();
      if (!cloudMask) warn('云层遮罩不可用（无 atob 或 payload 缺失），已跳过云层视差层');
      return cloudMask;
    }

    function buildCloudDeck() {
      cloudDeck = null;
      if (!plateCache || !plateCache.canvas) return;
      if (plateCache.mode === 'fallback') return;         // 兜底图不做云层位移
      var mask = ensureCloudMask();
      if (!mask || !mask.canvas) return;
      var CW = plateCache.canvas.width, CH = plateCache.canvas.height;
      // 云层缓存宽度上限 2046：headless SwiftShader 下 >2048 宽的带 alpha 画布做 canvas→canvas
      // 合成会掉进极慢路径（1440p 实测 22–26ms/帧 vs ≤2046 时 1–2ms/帧，见 motion-spec §14）。
      // 0.85–1.0 的缩放对低频云纹肉眼不可辨；QA 可用 __VYRON_ENGINE_DEBUG__.cloudDeckScale 覆盖。
      var deckScale = DBG.cloudDeckScale
        ? clamp(+DBG.cloudDeckScale, 0.3, 1)
        : clamp(2046 / CW, 0.5, 1);
      var c = makeCanvas(CW * deckScale, CH * deckScale);
      if (!c) return;
      var g = c.getContext('2d');
      if (!g) return;
      try {
        g.imageSmoothingEnabled = true;
        if ('imageSmoothingQuality' in g) { try { g.imageSmoothingQuality = 'high'; } catch (e) { /* noop */ } }
        g.drawImage(plateCache.canvas, 0, 0, CW * deckScale, CH * deckScale);
        // 云区 = 遮罩 alpha；destination-in 保留遮罩覆盖处的底板像素，并把 alpha 乘上遮罩 alpha
        g.globalCompositeOperation = 'destination-in';
        g.drawImage(mask.canvas, plateCache.ox * deckScale, plateCache.oy * deckScale,
          plateCache.uw * deckScale, plateCache.vh * deckScale);
        g.globalCompositeOperation = 'source-over';
      } catch (e) {
        warn('云层遮罩合成失败，已跳过云层视差层：' + e);
        cloudDeck = null;
        return;
      }
      // 遮罩包围盒 → 缓存像素子矩形（含 2px 羽化余量）；逐帧只合成这一块
      var box = mask.box;
      var sx0 = 0, sy0 = 0, sx1 = CW * deckScale, sy1 = CH * deckScale;
      if (box) {
        var ux = plateCache.uw / CLOUD_MASK_W * deckScale, uy = plateCache.vh / CLOUD_MASK_H * deckScale;
        var pad = 4;
        sx0 = clamp(plateCache.ox * deckScale + (box.x0 - pad) * ux, 0, CW * deckScale);
        sy0 = clamp(plateCache.oy * deckScale + (box.y0 - pad) * uy, 0, CH * deckScale);
        sx1 = clamp(plateCache.ox * deckScale + (box.x1 + pad) * ux, 0, CW * deckScale);
        sy1 = clamp(plateCache.oy * deckScale + (box.y1 + pad) * uy, 0, CH * deckScale);
        if (sx1 - sx0 < 4 || sy1 - sy0 < 4) { cloudDeck = { canvas: c, w: CW * deckScale, h: CH * deckScale, area: 1 }; return; }
      }
      cloudDeck = { canvas: c, w: CW * deckScale, h: CH * deckScale, sx0: sx0, sy0: sy0, sx1: sx1, sy1: sy1, area: ((sx1 - sx0) * (sy1 - sy0)) / (CW * deckScale * CH * deckScale) };
    }

    // 程序化深空兜底：深空渐变 + 星云 + 地球弧 + 大气边缘 + 平台
    function paintFallback(g, w, h) {
      var grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, '#04070f');
      grd.addColorStop(0.55, '#081226');
      grd.addColorStop(1, '#0a1424');
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
      // 左上紫色星云
      var neb = g.createRadialGradient(w * 0.14, h * 0.05, 0, w * 0.14, h * 0.05, w * 0.42);
      neb.addColorStop(0, 'rgba(96,80,170,0.30)');
      neb.addColorStop(0.45, 'rgba(70,58,140,0.14)');
      neb.addColorStop(1, 'rgba(20,20,50,0)');
      g.fillStyle = neb;
      g.fillRect(0, 0, w, h * 0.6);
      // 地球：巨大圆弧 + 海蓝径向渐变
      var cx = w * 0.5, cy = h * 3.16, R = h * 3.0;
      var earth = g.createRadialGradient(cx, cy, R * 0.90, cx, cy, R);
      earth.addColorStop(0, 'rgba(100,170,230,1)');
      earth.addColorStop(0.02, 'rgba(56,120,190,1)');
      earth.addColorStop(0.10, 'rgba(29,79,140,1)');
      earth.addColorStop(0.55, 'rgba(22,58,105,1)');
      earth.addColorStop(1, 'rgba(12,32,62,1)');
      g.fillStyle = earth;
      g.beginPath();
      g.arc(cx, cy, R, 0, TAU);
      g.fill();
      // 大气边缘（青蓝）
      var rimY = cy - R;
      var rim = g.createLinearGradient(0, rimY - h * 0.05, 0, rimY + h * 0.05);
      rim.addColorStop(0, 'rgba(40,90,170,0)');
      rim.addColorStop(0.45, 'rgba(87,168,255,0.55)');
      rim.addColorStop(0.55, 'rgba(191,226,255,0.85)');
      rim.addColorStop(0.70, 'rgba(87,168,255,0.25)');
      rim.addColorStop(1, 'rgba(40,90,170,0)');
      g.fillStyle = rim;
      g.fillRect(0, rimY - h * 0.06, w, h * 0.12);
      // 平台
      var pTop = Math.round(h * (PLATE.platformTopV - 0.02));
      var pg = g.createLinearGradient(0, pTop, 0, h);
      pg.addColorStop(0, 'rgba(46,58,74,1)');
      pg.addColorStop(0.25, 'rgba(34,44,58,1)');
      pg.addColorStop(1, 'rgba(10,16,26,1)');
      g.fillStyle = pg;
      g.fillRect(0, pTop, w, h - pTop);
      g.fillStyle = 'rgba(160,190,225,0.10)';
      g.fillRect(0, pTop, w, Math.max(1, h * 0.0015));
    }

    /* ---------------- 相位 / 镜头 ---------------- */
    function phaseIndexAt(t) {
      for (var i = PHASES.length - 1; i >= 0; i--) {
        if (t >= PHASES[i].from) return i;
      }
      return 0;
    }
    function phaseKeyAt(t) {
      var key = (options && options.phase) || null;
      return PHASES[phaseIndexAt(t)].key;
    }

    function cameraZoomAt(t) {
      var z;
      if (t <= PHASES[2].from) z = CAM.z0;
      else if (t < PHASES[2].to) z = lerp(CAM.z0, CAM.zBreach, easeInOutSine((t - PHASES[2].from) / (PHASES[2].to - PHASES[2].from)));
      else if (t < PHASES[4].to) z = lerp(CAM.zBreach, CAM.zLockup, smoothstep(PHASES[2].to, PHASES[4].to, t));
      else z = lerp(CAM.zLockup, CAM.zBloom, easeOutCubic((t - PHASES[4].to) / (PHASES[5].to - PHASES[4].to)));
      return z;
    }

    function horizonV(u) {
      var d = u - 0.5;
      return PLATE.horizonApexV + PLATE.horizonCurve * d * d;
    }

    /* ---------------- ROUND2 运动量（纯 t / ambientT 函数 → ?t= 定格逐帧可复现） ---------------- */
    // 大气 limb 呼吸：8.4s 周期 0.75→1.0；色温与亮度错相 0.9rad，只做 ±14 级 RGB 轻微偏移
    function limbPulseAt(ambientT) {
      var ph = (ambientT || 0) * TAU / MOTION.limbPeriodS;
      var pulse = MOTION.limbMin + (MOTION.limbMax - MOTION.limbMin) * (0.5 - 0.5 * Math.cos(ph));
      var warm = 0.5 - 0.5 * Math.cos(ph + 0.9);
      var kk = MOTION.limbWarmRgb * warm;
      return {
        pulse: pulse,
        warm: warm,
        rim: [Math.round(COLORS.rim[0] + kk), Math.round(COLORS.rim[1] + kk * 0.45), Math.round(COLORS.rim[2] - kk * 0.70)],
        rimHi: [Math.round(COLORS.rimHi[0] + kk * 0.70), Math.round(COLORS.rimHi[1] + kk * 0.30), Math.round(COLORS.rimHi[2] - kk * 0.45)]
      };
    }

    // 云层相对地表漂移：位移 = ∫ v0(1+amp·sin(ωt)) dt → 瞬时速度恒在 6–14px/s 规格内；方向向左
    function cloudMotionAt(t) {
      var u = Math.max(0, t - MOTION.revealT);
      var w = TAU / MOTION.cloudGustPeriodS;
      var v0 = MOTION.cloudDriftPxS, amp = MOTION.cloudGustAmp;
      var disp = v0 * u + v0 * amp * (1 - Math.cos(w * u)) / w;
      return { x: -disp, y: -MOTION.cloudYBiasPxS * u, vx: v0 * (1 + amp * Math.sin(w * u)) };
    }

    // 地表层平移（≤2px/s）+ 相机横移（0.45% 屏宽，3.2→9.6s）
    function groundMotionAt(t) {
      var u = Math.max(0, t - MOTION.revealT);
      var plateX = MOTION.plateScrollPxS * u;
      var panX = cssW * MOTION.camPanW * smoothstep(MOTION.camPanFrom, MOTION.camPanTo, t);
      return { plateX: plateX, panX: panX, x: plateX + panX };
    }

    // 两段大气光扫：斜向极淡白带，从左侧扫向中右（0.6 屏宽/秒），两端淡入淡出
    function sweepAt(t) {
      for (var i = 0; i < MOTION.sweeps.length; i++) {
        var sw = MOTION.sweeps[i];
        if (t < sw.from || t > sw.to) continue;
        var u = clamp((t - sw.from) / (sw.to - sw.from), 0, 1);
        var cx = -0.10 + (MOTION.sweepSpeedW + 0.10) * u;   // 中心 -0.10W → 0.60W（速度 0.6 屏宽/s）
        var env = smoothstep(0, 0.12, u) * (1 - smoothstep(0.80, 1.0, u));
        return { index: i, u: u, cx: cx, env: env, alpha: MOTION.sweepPeakAlpha * env };
      }
      return null;
    }

    /* ---------------- 主渲染 ---------------- */
    function render(t, c) {
      if (disposed || !ctx) return;
      c = c || {};
      if (typeof t !== 'number' || isNaN(t)) t = 0;
      t = clamp(t, 0, TOTAL + 0.4);

      // 自动跟随宿主尺寸（main 可能只在 ctx 里给 w/h）
      if (typeof c.w === 'number' && typeof c.h === 'number' && c.w > 0 && c.h > 0) {
        if (Math.abs(c.w - cssW) > 0.5 || Math.abs(c.h - cssH) > 0.5 || !plateCache) setSize(c.w, c.h);
      }
      if (!cssW || !cssH) {
        // 仍尝试从 canvas 自身布局取尺寸
        var cw = (canvas && (canvas.clientWidth || canvas.width)) || 0;
        var ch = (canvas && (canvas.clientHeight || canvas.height)) || 0;
        if (cw > 0 && ch > 0) setSize(cw, ch);
        else return;
      }

      var frameStart = now();
      if (lastWall != null) {
        var wallDt = frameStart - lastWall;
        if (wallDt > 0 && wallDt < 5000) pushSample(intervalSamples, wallDt);
      }
      lastWall = frameStart;

      var dt = lastT == null ? 0.016 : clamp(t - lastT, 0, 0.12);
      if (Math.abs(t - (lastT == null ? t : lastT)) > 1.2) firstFrame = true;   // seek 后重置阻尼
      lastT = t;

      ensureSprites();
      if (!plateCache) buildPlateCache();
      if (!plateCache) return;
      if (!cloudDeck) buildCloudDeck();

      var speed = clamp(typeof c.speed === 'number' ? c.speed : 0.85, 0.5, 1.5);
      var ambientT = t / speed;
      lastAmbient = ambientT;

      // reduced：只画一帧静帧（终帧构图），之后直接返回
      if (reduced) {
        if (staticDrawn) { frameNo++; return; }
        try {
          paintFrame(ctx, makeView(t, ambientT, c, true));
          staticDrawn = true;
        } catch (e) { warn('reduced 首帧绘制异常：' + e); }
        frameNo++;
        return;
      }

      var view = makeView(t, ambientT, c, false);
      try {
        paintFrame(ctx, view);
      } catch (e) {
        warn('渲染异常，已降级为静态首帧：' + e);
        try { paintFrame(ctx, makeView(t, ambientT, c, true)); } catch (e2) { /* noop */ }
      }

      var cost = now() - frameStart;
      pushSample(drawSamples, cost);
      frameNo++;
      maybeDegrade();
    }

    function pushSample(arr, v) {
      arr.push(v);
      if (arr.length > 180) arr.splice(0, arr.length - 180);
    }

    function makeView(t, ambientT, c, frozen) {
      var phase = (typeof c.phase === 'string' && c.phase) || PHASES[phaseIndexAt(t)].key;
      var z = frozen ? 1.06 : cameraZoomAt(t);
      // 鼠标微视差：pointer 归一化 [-1,1]，低频阻尼
      var px = 0, py = 0;
      if (c.pointer && typeof c.pointer.x === 'number' && typeof c.pointer.y === 'number') {
        px = c.pointer.x; py = c.pointer.y;
        if (Math.abs(px) > 1.5) px = px / (W / 2);
        if (Math.abs(py) > 1.5) py = py / (H / 2);
        px = clamp(px, -1, 1); py = clamp(py, -1, 1);
      } else if (typeof c.pointerX === 'number' && typeof c.pointerY === 'number') {
        px = clamp(c.pointerX, -1, 1); py = clamp(c.pointerY, -1, 1);
      }
      if (frozen || firstFrame) { pointerSm.x = px; pointerSm.y = py; firstFrame = false; }
      else {
        var k = 1 - Math.exp(-0.016 / CAM.parallaxDamp);
        // 用 dt 近似：main 每帧调用，dt 由 t 推进量估计（不做 accum，避免 seek 抖动）
        pointerSm.x += (px - pointerSm.x) * Math.min(1, k * 3);
        pointerSm.y += (py - pointerSm.y) * Math.min(1, k * 3);
      }
      var infl = smoothstep(PHASES[2].from, PHASES[2].from + 0.55, t) * (1 - smoothstep(9.55, TOTAL, t));
      if (frozen) infl = 0.35;
      // 视差幅度受推近限制：z=1 时无位移，避免露边
      var room = clamp((z - 1) / (CAM.zBreach - 1), 0, 1);
      var shiftX = pointerSm.x * CAM.parallaxMax * infl * room;
      var shiftY = pointerSm.y * CAM.parallaxMax * 0.75 * infl * room;
      if (frozen) { shiftX = 0; shiftY = 0; }
      // 极轻微手持漂移
      var drift = frozen ? 0 : 1;
      shiftX += Math.sin(ambientT * 0.23 + 1.1) * CAM.microDriftX * drift * infl;
      shiftY += Math.cos(ambientT * 0.19 + 0.4) * CAM.microDriftY * drift * infl;
      var reveal = 1;
      if (!frozen && typeof c.reveal === 'number') reveal = clamp(c.reveal, 0, 1);
      // ROUND2 运动量：全部是 t / ambientT 的纯函数 → 同一 t 两次渲染逐像素一致
      var ground = groundMotionAt(t);
      var cloud = cloudMotionAt(t);
      var limb = limbPulseAt(ambientT);
      var starScale = 1 + Math.max(0, z - CAM.z0) * MOTION.starCamK;
      var sweep = DBG.noSweep ? null : sweepAt(t);
      if (DBG.noLimb) { limb.pulse = 1; limb.warm = 0; }
      return {
        t: t, ambientT: ambientT, phase: phase, zoom: z, shiftX: shiftX, shiftY: shiftY,
        reveal: frozen ? 1 : reveal, speed: c.speed, frozen: !!frozen,
        groundShiftX: ground.x, plateShiftX: ground.plateX, panShiftX: ground.panX,
        cloudShiftX: cloud.x, cloudShiftY: cloud.y, cloudVelPxS: cloud.vx,
        limbPulse: limb.pulse, limbWarm: limb.warm, limbRim: limb.rim, limbRimHi: limb.rimHi,
        starScale: starScale, starShiftPx: (starScale - 1) * MOTION.starRefPx,
        sweep: sweep
      };
    }

    function paintFrame(g, v) {
      var z = v.zoom, amb = v.ambientT, t = v.t, phase = v.phase;
      var s = plateCache.s;
      var k = z / s;
      // 地表层 = 底板 + 镜头推近 + 鼠标视差 + ROUND2 地表平移/相机横移
      var dx = W * CAM.focusU * (1 - z) + v.shiftX * backingScale + (v.groundShiftX || 0) * backingScale;
      var dy = H * CAM.focusV * (1 - z) + v.shiftY * backingScale;

      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';

      // 黑板期（P0/P1）：透明交给 CSS 黑场；避免抢 HUD 控制台
      if (t < PHASES[1].to - 0.02 && !v.frozen) {
        g.clearRect(0, 0, W, H);
        return;
      }
      if (!plateCache) return;

      g.fillStyle = COLORS.space;
      g.fillRect(0, 0, W, H);
      g.imageSmoothingEnabled = true;
      g.drawImage(plateCache.canvas, dx, dy, W * z, H * z);

      // 1.5) ROUND2 云层（云遮罩 × 底板，screen 叠加 + 相对地表反向漂移）
      if (!DBG.noCloudDeck) drawCloudDeck(g, v, dx, dy);

      // 底板 uv → 屏幕坐标
      var rect = {
        x: plateCache.ox * k + dx,
        y: plateCache.oy * k + dy,
        w: plateCache.uw * k,
        h: plateCache.vh * k
      };
      var X = function (u) { return rect.x + u * rect.w; };
      var Y = function (vv) { return rect.y + vv * rect.h; };
      var platTop = Y(PLATE.platformTopV);
      var horizonCenter = Y(horizonV(0.5));

      var rimBoost = phase === 'bloom' ? 1.5 : (phase === 'breach' ? 1.0 + 0.25 * (1 - smoothstep(3.10, 3.9, t)) : 1);

      // 1) 左上星云呼吸（空间层，成本低）
      if (!DBG.noNebula && level >= 2 && sprites.glowViolet) {
        g.globalCompositeOperation = 'lighter';
        var nebA = PLATE.nebula.a * (0.75 + 0.25 * Math.sin(amb * 0.21));
        g.globalAlpha = nebA;
        var nw = rect.w * 0.62;
        g.drawImage(sprites.glowViolet, X(PLATE.nebula.u) - nw / 2, Y(PLATE.nebula.v) - nw * 0.42, nw, nw * 0.85);
      }

      // 2) 星点（双层闪烁 + 视差；只画在太空区）
      if (!DBG.noStars) drawStars(g, v, X, Y);

      // 3) 太阳闪光 / 暖区呼吸
      if (!DBG.noGlint && level >= 2 && sprites.glowWarm) {
        g.globalCompositeOperation = 'lighter';
        var sg = PLATE.sunGlint, sw = rect.w * 0.20;
        g.globalAlpha = sg.a * (0.65 + 0.35 * Math.sin(amb * 0.33 + 0.7)) * (0.8 + 0.2 * Math.sin(amb * 0.11));
        g.drawImage(sprites.glowWarm, X(sg.u) - sw / 2, Y(sg.v) - sw / 2, sw, sw);
        var wg = PLATE.sunWarm, ww = rect.w * 0.34;
        g.globalAlpha = wg.a * (0.7 + 0.3 * Math.sin(amb * 0.17 + 2.0));
        g.drawImage(sprites.glowWarm, X(wg.u) - ww / 2, Y(wg.v) - ww / 2, ww, ww);
        // v0.2.0 修复：此处原来漏了状态复位，globalAlpha 会残留 ~0.027 把后面的
        // 大气边缘光 / 光扫 / 平台扫描带全部按 3% 强度画（v0.1.0 的隐形 bug）。
        g.globalAlpha = 1;
      }

      // 4) 云层漂移（剪到地球带：地平线以下、平台以上）
      if (!DBG.noClouds) drawClouds(g, v, X, Y, platTop);

      // 5) 大气边缘光（呼吸 + P2 扫过）
      if (!DBG.noRim) drawRim(g, v, X, Y, horizonCenter, rimBoost);

      // 6) 平台反射微光 / 扫描
      if (!DBG.noPlatform) drawPlatform(g, v, X, Y, platTop, rect);

      // 6.5) ROUND2 两段大气光扫（4.0–5.0 / 6.4–7.4；斜向极淡白带，additive）
      if (v.sweep && !DBG.noSweep) drawSweeps(g, v);

      // 7) P5 bloom / P2 舷窗冲击
      if (!DBG.noBloom) drawBloom(g, v, rect);

      // 注意：开场 iris 遮罩由 splash.css 的 .vy-iris（--vy-iris 变量）负责，
      // engine 只画底板（design-spec §7），这里不再叠第二层 iris，避免双重遮罩。
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
    }

    function drawStars(g, v, X, Y) {
      if (!stars || !sprites || !sprites.star) return;
      var rectW = X(1) - X(0), rectH = Y(1) - Y(0);
      var platTop = Y(PLATE.platformTopV);
      var fadePx = H * 0.02;
      var amb = v.ambientT;
      var pScale = backingScale;
      g.save();
      // 太空区多边形（地平线以上）
      g.beginPath();
      g.moveTo(-2, -2);
      g.lineTo(W + 2, -2);
      for (var i = 40; i >= 0; i--) {
        var u = i / 40;
        // 屏幕 x 反推底板 u（cover 后任意屏幕 x 都有解）
        var uu = clamp((X(u) - X(0)) / rectW, 0, 1);
        var hy = Y(horizonV(uu)) + fadePx * 0.5;
        g.lineTo(X(uu), hy);
        if (i === 0) break;
      }
      g.closePath();
      g.clip();
      g.globalCompositeOperation = 'lighter';
      var nearShift = { x: v.shiftX * pScale * 0.75, y: v.shiftY * pScale * 0.75 };
      var farShift = { x: v.shiftX * pScale * 0.22, y: v.shiftY * pScale * 0.22 };
      // ROUND2-B：星点跟随相机推近的视差（以焦点为中心极轻外扩，z=1.08 时顶部约 3px）
      var scx = W * CAM.focusU, scy = H * CAM.focusV;
      var starScale = typeof v.starScale === 'number' ? v.starScale : 1;
      for (var n = 0; n < stars.length; n++) {
        var st = stars[n];
        var sh = st.layer ? nearShift : farShift;
        var sx = st.x * W + sh.x;
        var sy = st.y * H + sh.y;
        if (starScale !== 1) {
          sx = scx + (sx - scx) * starScale;
          sy = scy + (sy - scy) * starScale;
        }
        var u = (sx - (X(0))) / rectW;
        u = clamp(u, -0.2, 1.2);
        var hy = Y(horizonV(clamp(u, 0, 1)));
        var edge = clamp((hy - sy) / fadePx, 0, 1);
        if (edge <= 0.01) continue;
        var tw = 0.5 + 0.5 * Math.sin(amb * st.freq * TAU + st.phase);
        var a = st.base * (0.30 + 0.70 * tw * tw) * edge;
        if (a <= 0.01) continue;
        // 近层带一点色温漂移
        var spr = st.warm ? (sprites.glowWarm || sprites.star) : sprites.star;
        var rad = Math.max(0.7, st.size * H * (st.layer ? 1.0 : 0.9));
        g.globalAlpha = Math.min(1, a);
        g.drawImage(spr, sx - rad, sy - rad, rad * 2, rad * 2);
      }
      g.restore();
    }

    function drawClouds(g, v, X, Y, platTop) {
      if (!sprites || !sprites.clouds || !cloudDefs) return;
      var rectTop = Y(horizonV(0.5)) + (Y(PLATE.platformTopV) - Y(horizonV(0.5))) * 0.035;
      var rectW = X(1) - X(0);
      g.save();
      g.beginPath();
      g.moveTo(-4, platTop + 2);
      g.lineTo(-4, Y(horizonV(0)) + 2);
      for (var i = 0; i <= 36; i++) {
        var u = i / 36;
        g.lineTo(X(u), Y(horizonV(u)) + 2);
      }
      g.lineTo(W + 4, platTop + 2);
      g.closePath();
      g.clip();
      g.globalCompositeOperation = 'lighter';
      for (var n = 0; n < cloudDefs.length; n++) {
        var c = cloudDefs[n];
        var spr = sprites.clouds[c.sprite % sprites.clouds.length];
        if (!spr) continue;
        var uu = mod(c.u - c.drift * v.ambientT, 1.30) - 0.15;
        var vv = c.v + 0.014 * Math.sin(v.ambientT * c.breathe * 6.0 + c.phase);
        var wpx = c.w * rectW;
        if (wpx < 4) continue;
        var hpx = wpx * c.ratio;
        var a = c.alpha * (0.72 + 0.28 * Math.sin(v.ambientT * c.breathe * 6.0 + c.phase + 1.1));
        if (a <= 0.002) continue;
        g.globalAlpha = Math.min(1, a);
        g.drawImage(spr, X(uu) - wpx / 2, Y(vv) - hpx / 2, wpx, hpx);
      }
      g.restore();
    }

    /* ROUND2-A：云层视差层。
     * 把「底板 × 云遮罩」的缓存按与底板相同的 zoom/dx/dy 绘制，再叠加相对位移 (cloudShiftX/Y)。
     * 混合用 source-over 替换（mask 控制覆盖范围）：云区显示的是"位移后的真实云纹"，
     * 相对位移对观感 = 云在漂移；遮罩边缘是 192×108 双线性放大后的软羽化，所以没有硬接缝。
     * 试过 screen 叠加（v0.2.0-rc1）：只增亮 → 云被整体洗白、且与原云形成双曝重影；
     * 替换模式在位移 0 时像素与原图完全一致（不改变美术），位移增大时只有云纹平移。
     * 相对速度 6–14px/s（cloudVelPxS 由 stats 暴露），与地表 +0.85px/s 形成反向视差。 */
    function drawCloudDeck(g, v, dx, dy) {
      if (!cloudDeck || !cloudDeck.canvas) return;
      if (cloudDeck.area !== undefined && cloudDeck.area <= 0) return;
      var z = v.zoom;
      var a = clamp(MOTION.cloudDeckMix, 0, 1);
      if (a <= 0.01) return;
      var cdx = dx + (v.cloudShiftX || 0) * backingScale;
      var cdy = dy + (v.cloudShiftY || 0) * backingScale;
      g.save();
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = a;
      // 云层合成 = 近似 1:1 的缩放覆盖（cacheScale≈1.10 / zoom≈1.0–1.14 → 比例 0.93–1.03）。
      // 软件光栅下双线性重采样这张带 alpha 的全屏层代价很高（1440p ≈ 26ms/帧），
      // 关掉平滑走最近邻拷贝路径（≈memcpy），云层是低频雾状纹理，近 1:1 时肉眼差异不可辨。
      var prevSmooth = g.imageSmoothingEnabled;
      g.imageSmoothingEnabled = false;
      if (cloudDeck.sx0 !== undefined) {
        // 只合成「非零遮罩包围盒」子矩形（面积 ≈ 全画布 60%，1440p 软件光栅下省 ~40% 合成成本）
        var CW = cloudDeck.w, CH = cloudDeck.h;
        var kx = (W * z) / CW, ky = (H * z) / CH;
        g.drawImage(cloudDeck.canvas,
          cloudDeck.sx0, cloudDeck.sy0, cloudDeck.sx1 - cloudDeck.sx0, cloudDeck.sy1 - cloudDeck.sy0,
          cdx + cloudDeck.sx0 * kx, cdy + cloudDeck.sy0 * ky,
          (cloudDeck.sx1 - cloudDeck.sx0) * kx, (cloudDeck.sy1 - cloudDeck.sy0) * ky);
      } else {
        g.drawImage(cloudDeck.canvas, cdx, cdy, W * z, H * z);
      }
      g.imageSmoothingEnabled = prevSmooth;
      g.globalAlpha = 1;
      g.restore();
    }

    /* ROUND2-C：大气光扫。4.0–5.0 / 6.4–7.4 各一次；斜向（-0.38rad）极淡白带，
     * 峰值 opacity = MOTION.sweepPeakAlpha（0.085 ≤ 0.10），0.6 屏宽/秒，两端淡入淡出。
     * 用「旋转后的渐变矩形」而不是全屏渐变：填充面积 ≈ 屏宽 0.22 × 对角长，逐帧成本可控。 */
    function drawSweeps(g, v) {
      var sw = v.sweep;
      if (!sw) return;
      var a = clamp(sw.alpha, 0, 0.10);
      if (a <= 0.002) return;
      var theta = MOTION.sweepSlope;
      var sinT = Math.abs(Math.sin(theta)), cosT = Math.abs(Math.cos(theta));
      var L = W * sinT + H * cosT + 48;                 // 覆盖整个画面所需的白带长度
      var bandW = Math.max(24, MOTION.sweepWidthW * W);
      var cx = sw.cx * W;
      var cy = MOTION.sweepCenterY * H;
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 1;                                 // 显式复位（不吃前面图层残留 alpha）
      g.translate(cx, cy);
      g.rotate(theta);
      var grd = g.createLinearGradient(-bandW / 2, 0, bandW / 2, 0);
      grd.addColorStop(0.00, 'rgba(206,232,255,0)');
      grd.addColorStop(0.34, 'rgba(224,242,255,' + (a * 0.30).toFixed(4) + ')');
      grd.addColorStop(0.50, 'rgba(255,252,246,' + a.toFixed(4) + ')');
      grd.addColorStop(0.66, 'rgba(224,242,255,' + (a * 0.30).toFixed(4) + ')');
      grd.addColorStop(1.00, 'rgba(206,232,255,0)');
      g.fillStyle = grd;
      g.fillRect(-bandW / 2, -L / 2, bandW, L);
      g.restore();
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
    }

    function drawRim(g, v, X, Y, horizonCenter, boost) {
      var rectW = X(1) - X(0);
      var amb = v.ambientT;
      // ROUND2-B：limb 呼吸 = 8.4s 单频 0.75→1.0（v.limbPulse）+ 色温轻微偏移（v.limbRim/limbRimHi）
      var limb = typeof v.limbPulse === 'number' ? v.limbPulse : 1;
      var rimC = v.limbRim || COLORS.rim;
      var rimHiC = v.limbRimHi || COLORS.rimHi;
      var baseA = 0.30 * limb * boost;
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 1;                 // v0.2.0：显式复位，不吃前面图层的残留 alpha
      g.lineCap = 'round';

      function strokeArc(fromU, toU, widthPx, color, alpha) {
        if (alpha <= 0.004) return;
        g.beginPath();
        var steps = Math.max(6, Math.round((toU - fromU) * 40));
        for (var i = 0; i <= steps; i++) {
          var u = fromU + (toU - fromU) * (i / steps);
          var px = X(u), py = Y(horizonV(u));
          if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
        }
        g.lineWidth = Math.max(0.8, widthPx * H);
        g.strokeStyle = rgba(color, clamp(alpha, 0, 1));
        g.stroke();
      }

      // 四层辉光：外扩柔光 / 主边缘 / 高光芯 / 极外圈（随 limb 呼吸的"大气厚度"）
      strokeArc(0, 1, 0.052, rimC, baseA * 0.040);
      strokeArc(0, 1, 0.020, rimC, baseA * 0.100);
      strokeArc(0, 1, 0.0075, rimC, baseA * 0.260);
      strokeArc(0, 1, 0.0022, rimHiC, baseA * 0.500);

      // P2 大气边缘光扫过（左→右，bell 包络）
      var sweepP = (v.t - PHASES[2].from) / (PHASES[2].to - PHASES[2].from);
      if (sweepP > -0.1 && sweepP < 1.15 && !v.frozen) {
        var env = bell(clamp(sweepP, 0, 1)) * 0.9;
        var c0 = -0.25 + sweepP * 1.5;
        var c1 = c0 + 0.20;
        strokeArc(clamp(c0, 0, 1), clamp(c1, 0, 1), 0.010, COLORS.rimHi, 0.32 * env);
        strokeArc(clamp(c0 + 0.02, 0, 1), clamp(c1, 0, 1), 0.0028, COLORS.white, 0.40 * env);
      }
      g.restore();
    }

    function drawPlatform(g, v, X, Y, platTop, rect) {
      var amb = v.ambientT;
      var platH = Math.max(1, H - platTop);
      g.save();
      g.beginPath();
      g.rect(0, platTop - 1, W, H - platTop + 2);
      g.clip();
      g.globalCompositeOperation = 'lighter';

      // 竖向反光柱（微颤 + 呼吸）：ROUND2 增强亮度 + 横向微颤（±2.6px，慢频错相），
      // 反光柱 u 全部避开中央操作员剪影（0.036/0.283/0.716/0.905），不干扰剪影轮廓。
      var nStrip = level >= 2 ? PLATE.strips.length : Math.min(2, PLATE.strips.length);
      for (var i = 0; i < nStrip; i++) {
        var st = PLATE.strips[i];
        var wpx = st.w * rect.w * (i === PLATE.strips.length - 1 ? 1.0 : 2.4);
        if (wpx < 2) continue;
        var flick = 0.72 + 0.28 * Math.sin(amb * st.f * 6.0 + st.ph);
        var jitter = Math.sin(amb * 0.8 + st.ph) * H * 0.0025;
        var wob = Math.sin(amb * MOTION.platformWobbleFreq + st.ph + i * 0.9) * MOTION.platformWobblePx;
        var hpx = platH * 1.35;
        g.globalAlpha = clamp(st.a * MOTION.platformGain * flick, 0, 1);
        if (sprites.strip) g.drawImage(sprites.strip, X(st.u) + wob - wpx / 2, platTop + jitter - platH * 0.06, wpx, hpx);
      }

      // 低透明度扫描带（上下缓慢游走，单次渐变填充，不重绘整图）
      if (level >= 3 || (level === 2 && platH > 40)) {
        var period = 7.5;
        var p = mod(amb / period + 0.17, 1);
        var bandY = platTop + p * platH - platH * 0.16;
        var bh = platH * 0.30;
        var grd = g.createLinearGradient(0, bandY, 0, bandY + bh);
        grd.addColorStop(0, 'rgba(120,180,255,0)');
        grd.addColorStop(0.45, 'rgba(150,200,255,0.10)');
        grd.addColorStop(0.55, 'rgba(190,225,255,0.13)');
        grd.addColorStop(1, 'rgba(120,180,255,0)');
        g.globalAlpha = 1;
        g.fillStyle = grd;
        g.fillRect(0, bandY, W, bh);
      }

      // 平台水平线高光（±1.5px 偏移 + 呼吸，ROUND2 呼吸幅度 +0.08）
      var lineA = 0.17 + MOTION.platformLineBreathe * Math.sin(amb * 0.61 + 1.4);
      var lineOff = Math.sin(amb * 0.47) * H * 0.0018;
      g.globalAlpha = 1;
      g.strokeStyle = rgba(COLORS.steel, lineA);
      g.lineWidth = Math.max(1, H * 0.0011);
      g.beginPath();
      g.moveTo(0, platTop + lineOff);
      g.lineTo(W, platTop + lineOff);
      g.stroke();
      g.globalAlpha = 1;
      g.restore();
    }

    function drawBloom(g, v, rect) {
      var t = v.t;
      var amb = v.ambientT;
      // P2 舷窗冲击：淡白径向（很快衰减）
      if (t >= PHASES[2].from && t < PHASES[2].from + 0.9 && !v.frozen) {
        var p = (t - PHASES[2].from) / 0.9;
        var a = 0.16 * Math.pow(1 - p, 2.2);
        if (a > 0.004) {
          var cx = W * 0.5, cy = H * 0.48;
          var r = Math.hypot(W, H) * 0.55;
          var grd = g.createRadialGradient(cx, cy, 0, cx, cy, r);
          grd.addColorStop(0, rgba(COLORS.white, a));
          grd.addColorStop(0.45, rgba(COLORS.rim, a * 0.35));
          grd.addColorStop(1, rgba(COLORS.rim, 0));
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = 1;
          g.fillStyle = grd;
          g.fillRect(0, 0, W, H);
        }
      }
      // P5 bloom：整幅亮部升白 + 向中心聚拢的辉光
      if (t > PHASES[4].to && !v.frozen) {
        var u = clamp((t - PHASES[4].to) / (PHASES[5].to - PHASES[4].to), 0, 1);
        var flash = easeInCubic(u) * 0.62;
        if (flash > 0.004) {
          var grd2 = g.createLinearGradient(0, H * 0.1, 0, H * 0.95);
          grd2.addColorStop(0, rgba(COLORS.white, flash * 0.9));
          grd2.addColorStop(0.5, rgba(COLORS.cream, flash * 0.55));
          grd2.addColorStop(1, rgba(COLORS.white, flash * 0.8));
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = 1;
          g.fillStyle = grd2;
          g.fillRect(0, 0, W, H);
          // 光缝方向：中央向上下拉开的白色亮带
          var seamW = W * (0.10 + 0.16 * easeInCubic(u));
          var gx = g.createLinearGradient(W * 0.5 - seamW, 0, W * 0.5 + seamW, 0);
          gx.addColorStop(0, rgba(COLORS.white, 0));
          gx.addColorStop(0.5, rgba(COLORS.white, 0.16 * easeInCubic(u)));
          gx.addColorStop(1, rgba(COLORS.white, 0));
          g.fillStyle = gx;
          g.fillRect(W * 0.5 - seamW, 0, seamW * 2, H);
        }
      }
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
    }

    /* ---------------- 自动降级 ----------------
     * 两条触发路径：
     *  A) quality='auto'：按引擎自身绘制提交耗时 drawP95 超预算降级（GPU 正常时不会触发）。
     *  B) safety net（任何 quality 都生效）：headless SwiftShader / 低端核显下 canvas 2D 的光栅化
     *     发生在合成器侧，engine 侧 performance.now 只测到"提交"（<1ms），真实代价体现在
     *     rAF 帧间隔上（1440p 软件光栅实测 p50≈50ms）。因此用 interval p95/mean 双阈值兜底，
     *     连续两轮超阈值才降一档，并重置采样，避免抖动。降级只降不升（避免振荡）。
     */
    var degradeCooldown = 0;
    var degradeStrikes = 0;
    var degradeCheckTick = 0;
    function maybeDegrade() {
      if (reduced) return;
      if (frameNo < 60) return;
      // 每 30 帧评估一次；连续 2 次评估都超阈值才降档（≈ 30fps 下 1s、20fps 下 1.5s 确认窗口）
      degradeCheckTick++;
      if (degradeCheckTick % 30 !== 0) return;
      if (degradeCooldown > 0) { degradeCooldown--; return; }
      if (intervalSamples.length < 45) return;
      var ip50 = pct(intervalSamples, 0.5);
      var ip95 = pct(intervalSamples, 0.95);
      var imean = arrAvg(intervalSamples);
      var drawP95 = pct(drawSamples, 0.95);
      var budget = LEVELS[level].budgetMs;
      var autoTrigger = (autoLevel == null) && (drawP95 > budget);
      var safetyTrigger = (ip95 > 30 && imean > 22);
      if (!autoTrigger && !safetyTrigger) { degradeStrikes = 0; return; }
      if (level <= 0) return;
      degradeStrikes++;
      if (degradeStrikes < 2) return;            // 连续两轮确认
      var reason = autoTrigger ? ('drawP95=' + drawP95.toFixed(2) + 'ms>' + budget + 'ms')
                               : ('rAF interval p95=' + ip95.toFixed(1) + 'ms mean=' + imean.toFixed(1) + 'ms');
      level -= 1;
      autoDegraded = true;
      degradeStrikes = 0;
      degradeCooldown = 6;                       // 降档后先跳过 6 次评估（≈6s@20fps）再继续观察
      warn('性能降级 ' + reason + ' → ' + LEVELS[level].name + '（backing 上限 ' +
        Math.round(Math.sqrt(LEVELS[level].maxPixels / Math.max(cssW * cssH, 1)) * 100) + '%）');
      stars = buildStarField();
      cloudDefs = buildCloudDefs();
      if (level >= 2) ensureSprites();
      applySize();                               // 重新按新档位算 backing 分辨率
      drawSamples.length = 0;
      intervalSamples.length = 0;
    }

    /* ---------------- resize / dispose / stats ---------------- */
    function resize(w, h) {
      if (disposed) return;
      var cw = Math.round(w || 0), ch = Math.round(h || 0);
      if (cw <= 0 || ch <= 0) {
        cw = (canvas && (canvas.clientWidth || canvas.width)) || 0;
        ch = (canvas && (canvas.clientHeight || canvas.height)) || 0;
      }
      setSize(cw, ch);
    }

    function dispose() {
      disposed = true;
      plateImg = null;
      plateCache = null;
      cloudDeck = null;
      cloudMask = null;
      sprites = null;
      stars = null;
      cloudDefs = null;
      drawSamples.length = 0;
      intervalSamples.length = 0;
      if (ctx && canvas) { try { ctx.setTransform(1, 0, 0, 1, 0, 0); } catch (e) { /* noop */ } }
      ctx = null;
      canvas = null;
    }

    /* ---------------- ROUND2 运动量快照（verifier / QA 可量化读取） ---------------- */
    function round2(v) { return Math.round(v * 100) / 100; }
    function motionSnapshot() {
      var t = lastT == null ? 0 : lastT;
      var amb = lastAmbient == null ? t : lastAmbient;
      var cloud = cloudMotionAt(t);
      var ground = groundMotionAt(t);
      var limb = limbPulseAt(amb);
      var z = cameraZoomAt(t);
      var sw = sweepAt(t);
      return {
        t: Math.round(t * 1000) / 1000,
        ambientT: Math.round(amb * 1000) / 1000,
        cloudDeck: {
          enabled: !!(cloudDeck && cloudDeck.canvas),
          blend: 'source-over(replace)',
          mix: MOTION.cloudDeckMix,
          mask: CLOUD_MASK_W + 'x' + CLOUD_MASK_H + '-4bit',
          driftPxS: round2(cloud.vx),
          driftSpecPxS: [MOTION.cloudDriftMinPxS, MOTION.cloudDriftMaxPxS],
          offsetPx: { x: round2(cloud.x), y: round2(cloud.y) }
        },
        plate: {
          scrollPxS: MOTION.plateScrollPxS,
          scrollPx: round2(ground.plateX),
          camPanPx: round2(ground.panX),
          camPanFracW: MOTION.camPanW,
          shiftPx: round2(ground.x),
          shiftVelocityPxS: round2(MOTION.plateScrollPxS + (cssW * MOTION.camPanW) / (MOTION.camPanTo - MOTION.camPanFrom))
        },
        limb: {
          periodS: MOTION.limbPeriodS,
          pulse: Math.round(limb.pulse * 1000) / 1000,
          range: [MOTION.limbMin, MOTION.limbMax],
          warm: Math.round(limb.warm * 1000) / 1000,
          color: limb.rim,
          colorHi: limb.rimHi
        },
        star: {
          camScale: Math.round((1 + Math.max(0, z - CAM.z0) * MOTION.starCamK) * 10000) / 10000,
          camShiftPx: round2(Math.max(0, z - CAM.z0) * MOTION.starCamK * MOTION.starRefPx)
        },
        sweep: sw ? {
          window: sw.index,
          windowRange: [MOTION.sweeps[sw.index].from, MOTION.sweeps[sw.index].to],
          progress: Math.round(sw.u * 1000) / 1000,
          centerU: Math.round(sw.cx * 1000) / 1000,
          alpha: Math.round(sw.alpha * 10000) / 10000,
          peakAlpha: MOTION.sweepPeakAlpha,
          speedW: MOTION.sweepSpeedW
        } : { window: -1, progress: 0, alpha: 0, peakAlpha: MOTION.sweepPeakAlpha, speedW: MOTION.sweepSpeedW },
        platform: { stripGain: MOTION.platformGain, wobblePx: MOTION.platformWobblePx, lineBreathe: MOTION.platformLineBreathe }
      };
    }

    function stats() {
      return {
        version: VERSION,
        mode: plateMode,
        plateSrc: plateSrc,
        reduced: reduced,
        quality: LEVELS[level].name,
        level: level,
        autoQuality: autoLevel == null,
        autoDegraded: autoDegraded,
        degradePolicy: {
          autoQualityTrigger: 'drawP95 > budgetMs（仅 quality=auto）',
          safetyTrigger: 'rAF interval p95 > 30ms 且 mean > 22ms（任何 quality，连续两轮）',
          levels: LEVELS.map(function (L) { return { name: L.name, maxPixels: L.maxPixels, clouds: L.clouds, stars: L.starsFar + L.starsNear }; })
        },
        width: cssW,
        height: cssH,
        backingWidth: W,
        backingHeight: H,
        backingScale: backingScale,
        cacheScale: cacheScale,
        frames: frameNo,
        // ROUND2：地球运动量（云层视差 / 地表平移 / 相机横移 / limb 呼吸 / 星点视差 / 光扫）
        motion: motionSnapshot(),
        layers: {
          plate: !!plateCache,
          cloudDeck: !!(cloudDeck && cloudDeck.canvas),
          cloudDeckBlend: 'source-over(replace)',
          newCompositeLayers: (cloudDeck && cloudDeck.canvas) ? 1 : 0,
          cloudDeckAreaFrac: cloudDeck && typeof cloudDeck.area === 'number' ? Math.round(cloudDeck.area * 1000) / 1000 : 1,
          cloudMask: CLOUD_MASK_W + 'x' + CLOUD_MASK_H
        },
        draw: {
          last: drawSamples.length ? drawSamples[drawSamples.length - 1] : 0,
          avg: drawSamples.length ? arrAvg(drawSamples) : 0,
          p50: pct(drawSamples, 0.5),
          p95: pct(drawSamples, 0.95),
          max: drawSamples.length ? Math.max.apply(null, drawSamples) : 0,
          samples: drawSamples.length
        },
        interval: {
          last: intervalSamples.length ? intervalSamples[intervalSamples.length - 1] : 0,
          p50: pct(intervalSamples, 0.5),
          p95: pct(intervalSamples, 0.95),
          samples: intervalSamples.length
        },
        counts: {
          stars: stars ? stars.length : 0,
          clouds: cloudDefs ? cloudDefs.length : 0
        },
        debug: {
          noClouds: !!DBG.noClouds, noStars: !!DBG.noStars, noNebula: !!DBG.noNebula,
          noGlint: !!DBG.noGlint, noRim: !!DBG.noRim, noPlatform: !!DBG.noPlatform, noBloom: !!DBG.noBloom,
          noCloudDeck: !!DBG.noCloudDeck, noSweep: !!DBG.noSweep, noLimb: !!DBG.noLimb
        }
      };
    }
    function arrAvg(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s / (a.length || 1); }

    /* ---------------- 初始化 ---------------- */
    if (!ctx) warn('canvas 2d context 不可用，引擎空转（不抛错）');
    // 初始尺寸：优先宿主给的，其次 canvas 布局
    if (options.w && options.h) setSize(options.w, options.h);
    else if (canvas && (canvas.clientWidth || canvas.width)) {
      var iw = canvas.clientWidth || canvas.width;
      var ih = canvas.clientHeight || canvas.height;
      if (iw > 0 && ih > 0) setSize(iw, ih);
    }
    startPlateLoad();

    return {
      version: VERSION,
      ready: ready,
      render: render,
      resize: resize,
      dispose: dispose,
      stats: stats,
      // 便于调试/测试的只读引用
      __spec: { PLATE: PLATE, CAM: CAM, PHASES: PHASES, LEVELS: LEVELS, MOTION: MOTION, TOTAL: TOTAL }
    };
  }

  var API = {
    version: VERSION,
    create: create,
    TOTAL: TOTAL,
    PHASES: PHASES,
    CAM: CAM,
    PLATE: PLATE,
    LEVELS: LEVELS,
    MOTION: MOTION
  };

  if (global) global.VYRON_ENGINE = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
