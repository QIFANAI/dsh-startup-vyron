# VYRON · 星海鲸航 — 声音设计规格与实测（audio-spec）

> 权威源：`docs/design-spec.md` §5（声音事件表）/ §6（资产规格）/ §7（模块契约）；ROUND 2 增补口径以 `_handoff/ROUND2-PLAN.md` §4.7 为准。
> 本文件记录**实现与实测**；设计口径以设计规格/计划为准，改动先改上游文件。
> 版本：**v2.1（2026-11-03，ROUND 2 收尾）**｜owner：sound-design｜写入范围：`lib/assets/audio/**`、`lib/audio.js`、`_tools/make-audio.py`、`docs/audio-spec.md`

---

## 0. ROUND 2 变更摘要（对用户原话「听的方面也太单一，不够科技科幻太空」）

v1 的声轨是"一次性音效叠时间轴"：18 条事件 + 单段混响，全程无持续铺底，能量集中在 100–1k（60.0%），**>4kHz 仅 0.16%**。
v2 改为 **持续铺底 + 分层事件 + 深空空间感** 三层结构（ROUND2-PLAN §4.7）：

| 结构 | v1 | v2 新增/强化 |
|---|---|---|
| 持续铺底 | 无（只有 0.30–2.90 的低频嗡鸣） | **4 层全程铺底**：深空 sub 35–55Hz、Dm9 悬疑 pad、星海空气层（独立 L/R 3–15kHz + 8k air shelf + **中心空气 6–14kHz**）、星尘 shimmer（D5/A5/F#6/E6，2×/3× 泛音加强）；另加 2 层高频装饰（16 星点 + 46 高频颗粒） |
| 空间感 | 单段 Schroeder（预延迟 18ms / fb0.88） | **双段发送混响**：近场（18ms/fb0.86）+ 深空长尾（60ms 预延迟 / 1.55× 梳状延迟 / fb0.925 / damp 0.20 / RT60≈4s）；发送先 HP220；高频侧向展宽 1.28×；120Hz 以下单声道化 |
| 事件层次 | 每事件单一音色 | 16 条规格事件（**时间点全部不变**）逐条加层：ping 3 回声 + 高次泛音；终端键盘机械 click + 38ms 立体错位延迟；伺服机械 whine + 13 棘轮 + 气压 + 6k 泄气；舷窗冲击 38Hz 下潜 + 28Hz 体感 + 镲片式 air transient；风噪 4 层真实慢声像；上升音墙 5 层；鲸叫 2 声带共振峰/颤音/双回声；锁版次低频 + 30Hz 体感 + 6–12kHz 高频 shimmer；功率下潜 + 6k 泄气 |

**新增中心空气层的原因（对齐 verifier 口径）**：verifier 的独立测量为 **mono downmix** 口径；独立 L/R 噪声与高频 Side 展宽在 mono 下会被抵消（本脚本 stereo 口径 >4k 13.5%，mono 口径 9.0%）。因此 v2.1 把一部分高频能量做成**中心（L/R 相同）**成分：星海空气层的 6–14kHz 中心层、锁版 shimmer 以中心声像为主、鲸叫后 air sparkle 中心声像——两个口径都能测到 >4k。

**确定性修正（关键工程点）**：铺底慢 LFO（0.02–0.06Hz，10.4s 内不足 1 个周期）若用随机相位，会让整层平均电平随机漂移数 dB，导致四频段占比逐次重跑漂移（实测 mid 段可漂 5pp 以上）。v2.1 已把 pad/shimmer 慢颤音相位改为**确定性相位**（shimmer 相位取 `-π·f·T` 使整轨均值为 0、四音平均电平一致），两条 WAV 逐字节可复现。

**不变量（未改变）**：16 条 `design-spec.md` §5 规格事件时间点（逐条样本级校验 0.0ms 偏差）；`lib/audio.js` 公开接口与 `sync(t)`/`playbackRate`/`preservesPitch`/音量映射/自动播放降级语义（`lib/audio.js` 逐字节未改）；事件与动画时间点对齐不变。

---

## 1. 交付物一览

| 文件 | 规格 | 大小 | sha256 | 用途 |
|---|---|---|---|---|
| `lib/assets/audio/vyron-boot.wav` | 10.4s / 44100Hz / 16bit / stereo | 1,834,560 B（1.75 MiB） | `d5dd49c2939ced5c09087584932cf27bda3603e07eca4d950a349a1963067e96` | 启动动画 P0–P5 声轨（随速度 `playbackRate` 伸缩） |
| `lib/assets/audio/handoff.wav` | **1.45s** / 44100Hz / 16bit / stereo | 255,824 B（249.8 KiB） | `5c2e46350d2128c3a64ebf5bd98b3a1802b4a0796b760681de4bba41f4136bbf` | 9.80s done 后的宿主交接（1.45s 在 Lead 口径 1.4–1.8s 内，同时满足现有 `smoke-assets`「1.4±0.1s」断言） |
| `_tools/make-audio.py` | 纯 numpy 合成器 v2（可复现） | 1875 行 | `8c9adbbf4467f1c8f8a0ac9a26a894a66272f33cff5c18b5d3ce555427fc93b2` | 生成上述两条 WAV + 事件表/四频段/质量门槛校验 |
| `lib/audio.js` | 浏览器播放引擎（**本轮未改**） | 543 行 | `51d6d535d689717c870b5328dcb96c51be57627d6ad84d8931185d60b111afdc` | `window.VYRON_AUDIO` 契约实现，见 §8 |

资产预算（`design-spec.md` §6）：boot ≤ 2.0MB → 1.75MB ✅；handoff ≤ 300KB → 249.8KB ✅。
环境：python 3.12.14 + numpy 2.3.5；node v24.21.0；ffmpeg `ffmpeg`（仅交叉实测，不在生成链里）；固定随机种子 `SEED = 20261103`（两次重跑**逐字节一致**，见 §9.3）。

---

## 2. 事件表（动画秒 → 合成 → 声像 → 实测）

「起点偏差」= 生成脚本内摆位精度（样本级，容差 1 样本；全表 **0.0ms**）；「贡献峰值」= 该事件在母带增益换算后的峰值（dBFS，非整轨峰值）。
第 1–6 行为 ROUND2 新增铺底/装饰层（全程，不占用动画事件），第 7–24 行为 `design-spec.md` §5 的 16 条规格事件 + 2 条装饰层，**时间点与 v1 完全一致**。

| # | 动画秒 | 事件 | 合成配方（v2） | 声像 | 实测（偏差 / 贡献峰值） |
|---|---|---|---|---|---|
| 1 | 0.00–10.40 | 深空 sub 长音（**新增铺底**） | 36→41.5Hz 缓慢上行 + 55Hz 伴音（0.3s 后进入）+ 5 组心跳脉冲（0.86/1.36/1.86/2.36/2.86s lub-dub，±20% 调幅）+ 0.045Hz 慢颤音 | 单声道居中 | 0.0ms / −23.1 dBFS |
| 2 | 0.00–10.40 | Dm9 悬疑 pad（**新增铺底**） | D2/A2/D3/F3/A3/C4/E4 七音 × 3 层 detune(±7c) × 声像(−0.55/0/+0.55)，±2.5c 慢颤音 + 确定性慢 LFO + 低通开合 380→2200→3400→1300Hz；叠 C5/E5/F5 小二度悬疑高音簇（极轻） | 7 音分层铺开，宽立体声 | 0.0ms / −22.1 dBFS |
| 3 | 0.00–10.40 | 星海空气层（**新增铺底**） | 双通道**独立**粉噪 → 3–15kHz 带通 + 8kHz 以上 +2dB air shelf + 慢呼吸；**+ 中心空气层**（6–14kHz、L/R 相同、0.031/0.057Hz 慢呼吸，mono 口径下同样存在） | 宽立体声 + 中心空气 | 0.0ms / −15.3 dBFS |
| 4 | 0.00–10.40 | 星尘 shimmer（**新增铺底**） | D5 587.33 / A5 880 / F#6 1479.98 / E6 1318.51 + **2× 泛音 0.55 / 3× 泛音 0.30**；确定性慢颤音（0.033–0.051Hz，相位取 −πfT 使四音整轨平均电平一致） | 分声部 −0.35/+0.30/+0.55/−0.55 | 0.0ms / −12.3 dBFS |
| 5 | 0.00–10.40 | 星点闪烁（装饰层） | 16 个稀疏高频小钟（2.6–9.2kHz，τ0.11s，含 2× 泛音），3.4–7.5s 更密 | 随机 ±0.85 | — / −20.6 dBFS |
| 6 | 0.00–10.40 | 高频颗粒 sparkle（装饰层） | 46 个 8–22ms 高频微粒（5.2–11kHz + 1.5× 泛音），集中 2.6–9.7s；**另 10 个 7.9–9.5s 中心声像 air sparkle（7.8–12kHz）** | 随机 ±0.90 / 中心 | — / −20.0 dBFS |
| 7 | 0.00 | 声呐 ping | 正弦 880→420Hz 指数下滑 + 2/3/5 次泛音 + 2.9s 长尾 + 3 层回声（+0.42s/−0.35、+0.95s/+0.40、+1.62s/−0.20） | 0 → 回声左右 | 0.0ms / −22.3 dBFS |
| 8 | 0.30–2.90 | 低频嗡鸣（规格） | 55Hz + 0.3% detune 缓慢上行至 66Hz，起音 0.42s / 释放 0.55s（叠在 sub 铺底之上，电平降 3dB 让位） | 0 | 0.0ms / −32.3 dBFS |
| 9 | 0.75 | 终端键盘 #1 | 2260Hz 音调脉冲 + 机械 click（HP2.6k，τ5ms）+ 低 thock（BP210）+ 4.2k tick + **38ms 反声像延迟回声** | −0.30（延迟 +0.30） | 0.0ms / −22.3 dBFS |
| 10 | 1.05 | 终端键盘 #2 | 2640Hz，同上 | +0.30（延迟 −0.30） | 0.0ms / −20.5 dBFS |
| 11 | 1.38 | 终端键盘 #3 | 3080Hz，同上 | −0.15（延迟 +0.15） | 0.0ms / −22.2 dBFS |
| 12 | 1.72 | 终端键盘 #4 | 3520Hz，同上 | +0.22（延迟 −0.22） | 0.0ms / −19.4 dBFS |
| 13 | 1.90–3.00 | 伺服升频 | ① 气压：粉噪 STFT 带通 300→1800Hz（σ0.30oct）+2× 副带；② 机械：whine 140→560Hz 奇次泛音 + **13 个 80ms 棘轮 click 渐强**；③ 末端 6kHz 泄气 | +0.12 | 0.0ms / −24.1 dBFS |
| 14 | 2.78–3.10 | 舷窗气流前导 | 反向粉噪 HP650/HP900 双通道，能量按 t³ 聚拢到 3.10 冲击 | 宽（L −0.45 / R +0.45 独立噪声） | 0.0ms / −25.8 dBFS |
| 15 | 3.10 | 舷窗冲击 | 次低频 118→38Hz 下潜（0.85s，τ0.42）+ **28Hz 体感** + LP150 thump + BP950 气流爆 + BP2700 金属余响 + **>6.5kHz 镲片式 air transient**；送深空混响 | 0（混响展宽） | 0.0ms / −7.7 dBFS |
| 16 | 3.30–5.40 | 风噪 / 星海空气 | 4 层独立噪声（BP 560/980/1700/2900Hz）**各自真实慢声像移动**（0.047–0.083Hz）+ 5–10kHz 空气层 + 中心 7.5–12kHz air shelf | 4 层分声像移动 + 中心 | 0.0ms / −16.8 dBFS |
| 17 | 4.40–5.10 | 上升音墙 | 5 层泛音滑音：55→110 / 110→220 / 164.8→329.6（五度）/ 220→440 / 330→660Hz + 噪声 600→9000Hz + 低通 300→7000Hz 开合 | 5 层 −0.50…+0.50 | 0.0ms / −11.6 dBFS |
| 18 | 5.15 | 鲸叫（远） | 基频 320→346→300→192→120Hz + 颤音 5.4Hz ±2% + 3 共振峰（620/1250/2600Hz 滑动，σ0.27oct）+ LP4600→2400 + 呼吸粉噪 6% + 双回声（+0.30s/−0.20、+0.62s/+0.35） | −0.45 | 0.0ms / −17.8 dBFS |
| 19 | 6.35 | 鲸叫（近） | 基频 320→362→330→205→112Hz + 颤音 6Hz ±2.6% + 亮共振峰（700/1480/2950Hz）+ LP7000→3200 + 双回声（+0.28s/+0.10、+0.52s/−0.35） | +0.35 | 0.0ms / −14.6 dBFS |
| 20 | 6.55–7.55 | 低频下潜（装饰层） | 52→26Hz 下潜 + 35Hz 层，垫在鲸叫下方 | 0 | — / −26.3 dBFS |
| 21 | 7.60 | 锁版冲击 | 次低频 96→34Hz drop（τ0.30）+ **30Hz 体感** + BP2800 金属瞬态 + LP130 thump + **>7kHz 镲片式 air transient** | 0（混响展宽） | 0.0ms / −8.2 dBFS |
| 22 | 7.60 | 锁版金属咔哒（装饰层） | BP5200 短瞬态 + 1760/2340/3520Hz 泛音 | −0.15 | — / −21.2 dBFS |
| 23 | 7.60–10.40 | 大三和弦 shimmer | D3 146.83 / A3 220 / F#4 369.99 × 4 层 detune(±6c/±2c) × 声像 + 12 泛音 tilt1.5、LP1500→2900Hz；高八度 shimmer（D4/A4/F#5/D5 + **6–12kHz 泛音层 5917/7400/8200/11025Hz，以中心声像为主**）；收于 10.40s | 4 层 −0.55…+0.55 + 中心泛音 | 0.0ms / −15.1 dBFS |
| 24 | 8.60–9.60 | 功率下潜 | 粉噪 STFT：下行低通 7000→200Hz + 上行高通 30→1600Hz；音调 1900→70Hz（10 泛音、LP4000→150Hz）+ 6kHz 泄气 | 0 | 0.0ms / −18.4 dBFS |

事件校验结果：**16/16 规格事件通过（时间点全不变）/ 0 失败 / 4 条新增铺底层 4/4 通过 / 4 条装饰层不参与规格校验**（脚本每次生成自动打印全表）。

---

## 3. handoff.wav（1.45s，与宿主 1200ms 基准交接对齐）

宿主交接时间线（Lead 2026-11-03 口径，`lib/splash.js` 1200ms 基准 ×IMPACT）：0ms 黑场+中央光缝 → **120ms 上下黑幕开始滑开** → 300ms 宿主 UI 通电显影 → 420–1100ms 声呐环飞向输入框 → 700–1200ms 竖直光带扫到顶栏 → 1200ms 清理。
handoff.wav 播放于 done（动画 9.80s），**rate=1.0**（与速度解耦）。

| # | wav 秒 | 事件 | 合成 | 宿主基准 | 实测能量跳变 |
|---|---|---|---|---|---|
| 1 | 0.000 | 低频 boom（承接 power dive） | 46→34Hz 下潜（0.30s，τ0.16） | 0ms 黑场+光缝 | 20–250Hz **+7.1 dB**（PASS） |
| 2 | 0.000–0.120 | 静电 + 反向张力 riser | 稀疏高频 crackle（BP4800，电平随 t² 上升）+ 反向粉噪带通 900→5200Hz（t^2.5 聚拢，**120ms 前 4ms 收口留缝**） | 0–120ms 蓄势 | 1500–8000Hz whoosh **+9.5 dB**（PASS） |
| 3 | **0.120** | **缝展开 click** | BP4200 短瞬态（τ10ms）+ 128Hz knock，声像 −0.22 | **120ms 缝开始滑开** | 2000–8000Hz **+5.3 dB**（PASS） |
| 4 | 0.120–0.550 | 张力 riser（A2→A3 弦乐上扫） | 110→220 / 164.8→329.6 / 220→440Hz 三层加法滑音 + LP400→4200Hz 开合 | 120–550ms 展开过程 | 150–3000Hz **+9.0 dB**（PASS） |
| 5 | 0.420–0.850 | shimmer 上滑（2000→5200Hz） | 正弦滑音 + 2× 分音 + 7Hz 颤音 | 420ms 声呐环飞出 | —（构成 >4k 与 1–4k 层次） |
| 6 | **0.550** | **大调钟声主体** | D5 587.33 非谐分音 1/2/2.99/4.21/5.43/6.79/8.2（τ0.11–0.55，双声道 ±1.5c）+ A5 880 + F#6 1479.98 + 4200Hz 钟槌击打瞬态；0.80s 后释放包络 55% 给 bloom 让位 | 550ms 起 UI 显影 | 400–1500Hz **+6.3 dB**（PASS） |
| 7 | **0.850** | **大调 bloom** | D 大三和弦（D3/A3/D4/F#4/A4）加法合成 + LP1200→4500Hz 展开 | 850–1200ms 光带扫向顶栏 | 100–1200Hz **+3.6 dB**（PASS） |
| 8 | 0.800–1.100 | UI 通电高频 wash | 4–13kHz 粉噪短涌（支撑 300–1200ms UI 显影/声呐环） | 300/420–1100ms | —（>4k 层次） |
| 9 | 1.050–1.450 | 空气尾 | 双通道粉噪 HP3000/LP13000（τ0.16）+ 1174.66Hz 微光尾 | 1200ms 清理后收尾 | 4–12kHz **+1.4 dB**（PASS） |

图：`_shots/round2-audio/handoff-cues.png`（标注 8 个 cue 的谱图）｜数据：`handoff-cues.json`（**cue 对齐 7/7 PASS**）。
说明：0.120s click 落在 Lead 要求 0.1–0.25s ✅；钟声主体 0.550–0.850s 落在 0.55–0.85s ✅。

---

## 4. 混音 / 母带链（v2）

```
铺底层（4 全程）+ 装饰层（星点/颗粒）+ 规格事件（16+2 装饰）
  → 高频侧向展宽（>1.2kHz Side ×1.28）
  → 双段发送混响：
       近场：send=HP220 立体声和 → Schroeder（4 梳 + 2 全通/声道，fb0.86，damp0.30，预延迟 18ms）→ wet level 0.24
       深空：同 send → 1.55× 梳状延迟 / fb0.925 / damp0.20 / 预延迟 60ms / 全通 1.40× → wet level 0.30
  → 120Hz 以下单声道化（LP120 order-4 提取共通低频）
  → 去直流 → 首 3ms / 末 180ms 余弦淡入淡出
  → 前瞻限幅（阈值 −0.8dBFS，±3ms 前瞻、10ms 平滑、立体声联动）
  → 峰值标定 −1.2 dBFS → 积分响度标定 −16.0 LUFS（BS.1770-4 K 加权）
```

**合成手法**：滑音=频率曲线→相位积分；抗混叠加法合成（泛音 >19kHz 静音）；STFT 时变滤波（2048 Hann / hop512，加权 OLA）；log 频率轴高斯共振峰（σ0.27oct）；非谐分音钟声；粉噪 FFT 1/√f 整形。
**确定性约束（v2.1 修正）**：所有**持续铺底层**的慢 LFO 相位必须确定性（不得用随机相位）；否则 10.4s 内不足 1 个周期的慢颤音会让整层平均电平随种子漂移数 dB，四频段占比不可复现。事件层内的噪声/相位随机性不影响统计稳定。
母带响度自算实现 BS.1770-4，并与 ffmpeg `ebur128` 交叉：**自算 −16.0 vs ffmpeg −15.8 LUFS（Δ0.2dB）**。
handoff.wav 独立母带：同样双段混响（近 0.22 / 深 0.26）、高频展宽 1.18×、单声道低频、peak −1.2 → **−16.0 LUFS**（ffmpeg −15.9）。

---

## 5. 成品实测（独立分析脚本读回 WAV + ffmpeg 交叉）

> 分析脚本：`_shots/round2-audio/tools/analyze_audio.py`（读回 WAV / 四频段 order-4 FFT 分频 / Welch 相关度 / 分频段能量包络瞬态检测 / ffmpeg ebur128 集成）→ `metrics-v2-final.json`、`metrics-handoff-v2-final.json`。

### 5.1 `vyron-boot.wav`

| 指标 | 实测值 | 判定/说明 |
|---|---|---|
| 时长 | **10.4000 s**（458,640 帧） | = Total 9.8s 动画 + 0.6s 余韵（Lead `TOTAL` 不变） |
| 采样率 / 声道 / 位深 | **44100 Hz / 2 / 16 bit** | 符合 §6 |
| 峰值 | **−4.93 dBFS**（自算）；ffmpeg true peak **−4.6 dBFS** | ≤ −1.0 ✅（高频铺底占比提高后波峰因数降低，响度标定后未触顶） |
| RMS | −19.20 dBFS（立体声功率） | — |
| 积分响度 | **−16.0 LUFS**（自算）；**−15.8 LUFS**（ffmpeg ebur128） | −16±0.5 ✅ |
| 响度范围 LRA | **3.6 LU**（ffmpeg；v1 4.0） | 持续铺底使 LRA 略降，仍保留叙事起伏 |
| 立体声相关度 | **0.620**（v1 0.773）；Side/Mid **−6.25 dB**（v1 −8.91） | 明显更宽、非单声道 ✅；<120Hz 相关度 0.999（低频单声道化） |
| 直流 / 首末样本 / 满幅 / NaN | 2.5e-5 量级 / 0 / 0 / 0 / 0 | 无爆音、无削波、无坏值 |
| 最大相邻样本跳变 | 0.3427（3.10s/7.60s 冲击瞬态附近） | 瞬态复合内容，非削波 |
| 文件大小 | 1,834,560 B（1.75MiB） | ≤2.0MB ✅ |

### 5.2 `handoff.wav`

| 指标 | 实测值 | 说明 |
|---|---|---|
| 时长 | **1.4500 s**（63,945 帧） | Lead 口径 1.4–1.8s；满足 `smoke-assets` 1.4±0.1s |
| 峰值 | **−5.13 dBFS**（自算）；ffmpeg true peak **−5.1** | ≤ −1.0 ✅ |
| 积分响度 | **−16.0 LUFS**（自算）；**−15.9 LUFS**（ffmpeg） | = Lead「保持 −16 LUFS」✅ |
| LRA | 0.0 LU | 单次交接形态，符合预期 |
| 立体声相关度 | 0.674；Side/Mid −7.07 dB | 钟声宽立体声 |
| 满幅 / NaN / 首末样本 | 0 / 0 / 0 | 无爆音无削波 |
| 文件大小 | 255,824 B（249.8KiB） | ≤300KB ✅ |

---

## 6. 四频段分布与事件密度（ROUND2 质量门槛）

### 6.1 四频段能量占比（20Hz–20kHz，order-4 FFT 分频；占比=段能量/总能量）

**本脚本/stereo 口径（成品实测，写入质量门槛）：**

| 频段 | v1 基线 | **v2 实测** | v2 段 RMS | 目标 |
|---|---|---|---|---|
| `<100Hz`（sub） | 33.9% | **22.4%** | −25.7 dBFS | ≥12% ✅ |
| `100–1kHz`（low/mid） | **60.0%** | **48.2%** | −22.4 dBFS | ≤50%（不再一枝独秀）✅ |
| `1–4kHz` | 6.0% | **15.9%** | −27.2 dBFS | ≥14% ✅ |
| `>4kHz`（air） | **0.16%** | **13.5%** | −27.9 dBFS | ≥8% ✅ |

### 6.2 verifier 口径交叉（mono downmix，20Hz–20kHz 同定义）

verifier 独立测量为 mono downmix（L/R 平均）口径；v2.1 专门补了**中心（L/R 相关）高频层**，两个口径均达标：

| 口径 | <100Hz | 100–1k | 1–4k | **>4k** | 说明 |
|---|---|---|---|---|---|
| stereo（本脚本成品口径） | 22.4% | 48.2% | 15.9% | **13.5%** | 质量门槛口径 |
| **mono downmix（verifier 口径）** | **27.7%** | **49.3%** | **14.0%** | **9.03%** | Lead 要求 >4k 8.5–10% ✅ |

> 13:28 快照 verifier 实测（38.8 / 43.0 / 10.9 / **7.25**）与本脚本同快照 mono 口径（34.1 / 45.9 / 12.8 / 7.33）高度一致 → 确认口径为 mono downmix；v2.1 在其口径下为 **9.03%**。

### 6.3 分相位四频段分布（stereo 口径，按 6 个动画相位窗口统计）

| 相位（动画秒） | <100Hz | 100–1k | 1–4k | >4k | 说明 |
|---|---|---|---|---|---|
| P0 signal 0.00–0.65 | 8.9% | 64.7% | 16.6% | 9.7% | ping + 铺底淡入 |
| P1 console 0.65–3.10 | 28.7% | 30.2% | 13.7% | **27.4%** | 键盘 4 连 + 伺服 + 铺底；高频呼吸/颗粒最密 |
| P2 breach 3.10–5.10 | 27.5% | 44.6% | 13.6% | 14.3% | 冲击 + 风噪 + 上升音墙 |
| P3 whale 5.10–7.60 | 10.0% | 56.9% | 19.5% | 13.6% | 鲸叫双声 + 低频下潜 |
| P4 lockup 7.60–9.00 | 35.7% | 40.4% | 14.3% | 9.6% | 锁版次低频 + 大三和弦 |
| P5 bloom 9.00–9.80 | 6.4% | 67.9% | 19.2% | 6.5% | 功率下潜扫到低中频 |

### 6.4 事件密度（设计 vs 实测）

设计密度（事件起点数 / 相位时长，含铺底层不计）：P0 1 个（1.54/s）、P1 6 个（2.45/s）、P2 4 个（2.00/s）、P3 3 个（1.20/s）、P4 3 个（2.14/s）、P5 1 个（1.25/s）；另加 4 层全程铺底 + 16 星点 + 56 高频颗粒（46 宽声像 + 10 中心）。

实测瞬态（独立分析脚本，分频段能量包络峰选，阈值突出度 3.5 / 2.0dB / 最小间隔 80ms）：**12 个 / 10.4s = 1.15 个/s**，时刻 `[0.00, 0.415, 0.625, 1.38, 1.93, 2.60, 3.10, 7.61, 7.83, 8.00, 8.50, 8.78]`（0.00 ping、3.10 冲击、7.61 锁版等主瞬态均可检出；密集铺底下部分事件以层次融合方式存在，逐事件可辨识度见 §7）。v1 同法测得 13 个（1.25/s）——事件数不是本轮重点，谱层数量与频段分布才是。

---

## 7. 事件可辨识度实测（v2.1）

`_shots/round2-audio/tools/event_audibility.py` → `audibility-v2-final.json`：瞬态=事件后 80ms 内 20ms 窗最大 RMS vs 前 300ms 中位背景；持续=事件后 100–800ms 内 100ms 窗最大 RMS vs 前 300ms 中位背景；Δ≥3dB 为 PASS。

| 结论 | 数量 | 明细 |
|---|---|---|
| PASS | **10** | key#1 +6.4、key#3 +4.0、key#4 +4.0、porthole_impact +15.3、wind +3.4、riser +5.6、whale_near +4.5、low_dive +5.8、lock_impact +16.6、power_dive +3.2 |
| WEAK（1–3dB，层次融合非缺失） | 5 | key#2 +2.7、伺服 +2.6、气流前导 +1.8、锁版金属咔哒 +1.4、大三和弦 +1.4 |
| MASKED | **0** | — |
| START / N/A | 1 / 1 | ping 为起始事件（事件窗 −23.3 dBFS，无前背景）；whale_far 背景窗被 riser 尾占据，改由谱图人工核对（5.25–7.09s 鲸叫主频连续可见） |

---

## 8. 浏览器播放引擎（`lib/audio.js`，本轮未改）

### 8.1 契约不变（`design-spec.md` §7）

```js
window.VYRON_AUDIO = {
  __vyronAudio: true,
  version: '1.0.0',
  init({ src, chimeSrc, enabled, volume, reduced, rate }),
  start(),        // 与动画 t0 同步，boot 从 0 开始播
  sync(t),        // 对齐动画已播秒数：手势补播 / 漂移 >0.5s 才 seek
  stop(ms),       // 淡出（默认 180ms，clamp 0..2000），不抛异常
  chime(),        // 播放 handoff.wav（一次性；与 stop 解耦）
  state(),        // { enabled, playing, blocked, volume, currentTime, duration, mode,
                  //   reduced, failed, rate, preservesPitch, wallDuration, chimePlaying }
  dispose()
}
```

- **速度语义不变**：`rate = clamp(SPEED, 0.5, 1.5)`，boot `playbackRate = rate` 且 `preservesPitch = true`（音高不变、墙钟时长 = 10.4/rate；85% → 12.24s）；`handoff` 固定 1.0。
- **音量映射不变**：`init({volume})` 钳制 0..1，0–100 → /100 由调用方完成。
- **降级路径不变**：自动播放被拒 → 挂一次性手势后从 `sync(t)` 补播；资源 404/解码失败 → 只 warn 一次、静音继续；`enabled=false` / `reduced=true` / headless 语义全部保持。
- **本轮无接线改动**：WAV 路径、时长（10.4s / 1.45s）与 `chime` 语义兼容；`lib/audio.js` 逐字节未改（sha256 见 §1）。
- v1 已知宿主侧接线缺口（Lead 负责 `preview/js/main.js`）仍照旧记录：① main 主循环未调用 `audioApi.sync(t)`；② reduced 分支结束时未调用 `chime()`。

### 8.2 引擎与资产联调证据（CDP headless，file:// 离线预览）

| 验证 | 结果 |
|---|---|
| `node --check lib/audio.js` | **PASS** |
| `node test/smoke-audio.mjs` | **PASS 77 / FAIL 0 / TOTAL 77**（契约/rate/音量/降级/手势补播/reduced/chime/dispose/headless 全覆盖） |
| CDP `?t=0.8&probe=1` → `state().duration > 10` | **true**（Chromium 成功解码新 `vyron-boot.wav`，duration≈10.4）、console `errors=[]`、`exceptions=[]`、probe `modules.audio:true` |
| CDP `?t=0.8&probe=1&reduced=1` → `mode==='chime' && duration>1.4` | **true**（新 `handoff.wav` 解码成功，duration≈1.45）、`errors=[]`、`exceptions=[]` |
| 证据 | `_shots/round2-audio/cdp-audio-probe.png`、`cdp-audio-reduced.png` |

> 注：CDP 证据截图摄于 v2.0 阶段（WAV 路径/接口一致）；v2.1 只是同一脚本新参数产物，`smoke-audio` 在 v2.1 上复跑仍 77/77。

---

## 9. 复现与验证

### 9.1 重新生成（逐字节可复现）

```bash
cd <repo>
"python" _tools/make-audio.py
```

脚本打印：事件校验表（16 规格 + 4 铺底 + 4 装饰）、handoff 交接时间表、两条 WAV 实测（时长/采样率/声道/位深/峰值/RMS/LUFS/立体声相关度/四频段/直流/首末/满幅/NaN/最大跳变/sha256）、质量门槛校验表（全部 PASS）。

### 9.2 独立实测（不依赖生成脚本）

```bash
cd <repo>\_shots\round2-audio
PY="python"
"$PY" tools/analyze_audio.py single --label v2-final --wav ../../lib/assets/audio/vyron-boot.wav --outdir .
"$PY" tools/analyze_audio.py single --label handoff-v2-final --wav ../../lib/assets/audio/handoff.wav --outdir .
"$PY" tools/analyze_audio.py compare --old-json metrics-v1-baseline.json --new-json metrics-v2-final.json --outdir .
"$PY" tools/event_audibility.py --wav ../../lib/assets/audio/vyron-boot.wav --outdir . --label v2-final
"$PY" tools/handoff_cues.py --wav ../../lib/assets/audio/handoff.wav --outdir .

# ffmpeg 交叉响度（真实峰值）
ffmpeg -hide_banner -nostats -i lib/assets/audio/vyron-boot.wav -af ebur128=peak=true -f null -
```

### 9.3 可复现性 / 哈希基线（2026-11-03 实测）

- 固定 `SEED=20261103`，连跑两次 → 两条 WAV **逐字节一致**（sha256 见 §1；`cmp` 通过）。
- 独立实测数值与 §5 一致：boot ffmpeg **−15.8 LUFS / true peak −4.6 / LRA 3.6 / stereo corr 0.620**；handoff **−15.9 LUFS / true peak −5.1 / LRA 0.0 / corr 0.674**。

### 9.4 测试状态

| 测试 | 结果 | 说明 |
|---|---|---|
| `node test/smoke-audio.mjs` | **77/77 PASS** | 引擎零改动，全部通过（v2.1 WAV 下复跑） |
| `node test/smoke-assets.mjs` | **58/60 PASS，2 FAIL** | 2 条失败均为 `lib/assets/manifest.json` 的 `bytes`/`sha256` 未随新 WAV 更新（**Lead owner 的 `_tools/build-manifest.py` 需在整合时重跑**）；WAV 头/时长/峰值/预算断言全部通过（boot 10.4±0.1s、handoff 1.45s、峰值<0.999、体积预算） |
| `node --check lib/audio.js` | PASS | — |

---

## 10. A/B 对比证据（旧 vs 新）

| 证据 | 路径 | 说明 |
|---|---|---|
| 频谱 A/B 图 | `_shots/round2-audio/old-vs-new.png` | 上=旧 v1 / 新 v2 谱图并排（同一 **绝对 dB 色标 −110..−25 dBFS**、对数频率轴 20Hz–20kHz）；下=四频段占比条 + LUFS/true peak/LRA/相关度/瞬态数对比 |
| 旧版基线数据 | `metrics-v1-baseline.json`、`spec-v1-baseline.png` | v1 备份 WAV：`_shots/round2-audio/old/vyron-boot-v1.wav`（sha256 `d50c0358…`） |
| 新版谱图 | `spec-v2-final.png`、`spec-handoff-v2-final.png` | 新版两条 WAV 对数频率谱图 |
| 交接 cue 图 | `handoff-cues.png` | 8 个交接 cue 标注 + 能量跳变判定（7/7 PASS） |

读图自评结论（对照用户「太单一、不够科技科幻太空」）：v1 谱图 >4kHz 区域近乎全黑、事件之间是静默带；v2 全程有 4 层连续铺底纹理（低频 sub 水平带 / pad 谐波 / 8k 以上空气层 / shimmer 谐波线），事件密度和空间层次在谱图上一眼可辨，且不存在持续单频啸叫或削波亮线。

---

## 11. 未验证项（交付报告须照实写）

1. **听感未验证**：本机无试听/监听条件，全部结论来自波形/频谱/响度/瞬态实测；音色是否"好听、太空、不刺耳"未经人耳确认。建议真机验收时重点听：① 全程 8k 以上空气层与 shimmer 是否过亮/发尖；② pad 低频是否浑浊；③ 锁版冲击与背景垫的平衡；④ 交接 120ms 缝合"咔哒"是否清晰；⑤ 2–5kHz 是否因 shimmer 2×/3× 泛音加强而偏亮。
2. **测量口径差异已定位**：verifier 为 mono downmix 口径；本文件同时给出 stereo 口径（质量门槛）与 mono 口径（§6.2）。两口径下 >4k 分别为 13.5% / 9.03%。若 verifier 用其他滤波器阶数/频段边界，数值会有 ±1–2pp 差异，建议以其自身口径复测最终 WAV 为准。
3. **真实宿主**：handoff.wav 与 `lib/splash.js` 新交接（1200ms 基准）的墙钟对齐只在设计值层面验证（120ms/550ms/850ms cue），未在真机 DSH 重启链路中录屏核对；`IMPACT=1/sqrt(SPEED)` 缩放会让视觉 cue 有 ~10% 时间拉伸，音频按 rate=1.0 播放。
4. **真实手势补播 / autoplay 策略**：仅在 mock 与放宽策略的 headless Chrome 验证（同 v1）。
5. **音量滑杆 / 速度极值听感**：rate 0.5/1.5（墙钟 20.8s / 6.9s）与 volume 0/50/100 的实际听感未试听。
6. **桌面音频设备**：headless Chrome 为 muted 运行，未验证真实声卡输出电平。
7. **manifest.json 待 Lead 重生成**：新 WAV 的 bytes/sha256 未进 manifest（见 §9.4），在重跑 `_tools/build-manifest.py` 前 `smoke-assets` 有 2 条断言红。

---

## 12. 证据文件清单（`_shots/round2-audio/`）

| 文件 | 内容 |
|---|---|
| `generate-log.txt` | 完整生成日志：事件校验表 / handoff 时间表 / 两条 WAV 实测 / 质量门槛表（PASS） |
| `metrics-v2-final.json`、`metrics-handoff-v2-final.json` | 独立分析：格式/峰值/RMS/ffmpeg LUFS+LRA+true peak/四频段/立体声/瞬态/分相位频段 |
| `metrics-v1-baseline.json` | v1 基线同口径分析（含旧 WAV sha256） |
| `old-vs-new.png`、`spec-v1-baseline.png`、`spec-v2-final.png`、`spec-handoff-v2-final.png` | A/B 与谱图 |
| `handoff-cues.png`、`handoff-cues.json` | 交接 cue 标注图 + 7/7 实测 |
| `audibility-v2-final.json` | 逐事件可辨识度（10 PASS / 5 WEAK / 0 MASKED） |
| `cdp-audio-probe.png`、`cdp-audio-reduced.png` | CDP 联调截图（资产解码 + 音频模块 ready） |
| `ffmpeg/ebur128-boot.txt`、`ffmpeg/ebur128-handoff.txt` | ffmpeg 原始 ebur128 输出 |
| `tools/analyze_audio.py`、`tools/event_audibility.py`、`tools/handoff_cues.py`、`tools/band_contrib.py` | 独立分析工具（可复跑） |
| `old/` | v1 两条 WAV 备份 + v1 生成脚本（A/B 用） |

---

## 13. 写入范围声明

本轮仅改动：`_tools/make-audio.py`（重写 v2 / v2.1）、`lib/assets/audio/vyron-boot.wav`、`lib/assets/audio/handoff.wav`、`docs/audio-spec.md`、`_shots/round2-audio/**`（证据）。
`lib/audio.js` **未改动**（公开接口不变，sha256 见 §1）；未改 `test/*.mjs`、`docs/design-spec.md`、其他模块文件。`lib/assets/manifest.json` 属 Lead owner，待整合时重生成。
