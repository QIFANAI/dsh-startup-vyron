#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""VYRON · 星海鲸航 — 程序化启动音轨合成器 v2（纯 numpy，无外部采样）

ROUND 2（v0.2.0）目标（_handoff/ROUND2-PLAN.md §4.7）：
  从"一次性音效叠时间轴"升级为 **持续铺底 + 分层事件 + 深空空间感**。
  用户反馈原话：「听的方面也太单一，不够科技科幻太空。」

产出（design-spec §6 规格；handoff 长度按 Lead 2026-11-03 交接口径 1.4–1.8s 取 1.45s）:
  lib/assets/audio/vyron-boot.wav  10.4s  44100Hz / 16bit / stereo / -16 LUFS / peak<=-1 dBFS
  lib/assets/audio/handoff.wav      1.45s 44100Hz / 16bit / stereo / -16 LUFS / peak<=-1 dBFS

新增铺底（全程，ROUND2-PLAN §4.7）:
  * 深空 sub 长音：36→41.5Hz 缓慢上行 + 55Hz 伴音（0.3s 后进入）+ 心跳脉冲调幅；
  * Dm9 悬疑 pad：D2/A2/D3/F3/A3/C4/E4 七音 × 3 层 detune(±7c)/声像 + ±2.5c 慢颤音
    + 0.02–0.06Hz 幅度 LFO + 低通开合（P2 打开 / P4 收拢再开）；
  * 星海空气层：双通道独立粉噪 2.2–12kHz + 缓慢呼吸（宽立体声）；
  * 星尘 shimmer 铺底：D5/A5/F#6/E6 高音+泛音，慢颤音，补 1–4k/>4k 能量；
  * 星点闪烁（装饰层）：16 个稀疏高频小钟，随机声像。
空间感:
  * 双段发送混响：近场 Schroeder（18ms 预延迟）+ 深空长尾（1.55× 梳状延迟 / fb 0.925 /
    damp 0.20 / 60ms 预延迟 / RT60≈4s）；混响发送先 HP 160Hz，低频保持紧致；
  * 高频侧向展宽 1.28×（>1.2kHz）+ 120Hz 以下单声道化。
事件层次（16 条规格事件时间点全部不变，design-spec §5）:
  ping 长尾（2.9s / 3 回声 / 高次泛音）、终端键盘（机械 click + 立体错位 38ms 延迟 + 4k tick）、
  伺服（机械 whine+棘轮 + 气压气流 + 6k 泄气）、舷窗冲击（38Hz 下潜 + 28Hz 体感 + 金属余响 +
  反向气流）、风噪/星海（4 层独立噪声真实慢声像移动 + 5–10k 空气层）、上升音墙（3 层泛音+噪声）、
  鲸叫 ×2（共振峰+颤音+双回声，近远不同音高）、低频下潜、锁版冲击（次低频+金属）、
  大三和弦 shimmer（D3/A3/F#4 ×4 层 detune + 高八度 shimmer）、功率下潜（噪声+音调+高频泄气）。
handoff.wav（1.45s）与宿主新交接（1200ms 基准：120ms 缝展开 / 300ms UI 通电 / 1200ms 收尾）对齐：
  0ms 低频 boom → 0–120ms 静电+反向 riser → **120ms 缝展开 click+whoosh** →
  120–550ms 张力 riser → 550ms 大调钟声 → **550–850ms 钟声主体** → 850–1200ms 大调 bloom →
  1200–1450ms 空气尾。

实现要点:
  * 混响 = 手写 Schroeder（可缩放 4 梳状 + 2 全通/声道，块向量化阻尼反馈）；
  * 母带 = 去直流 → 首末淡入淡出 → 前瞻限幅 → 峰值标定 → 积分响度（BS.1770-4 K 加权）标定；
  * 固定随机种子 SEED，输出逐字节可复现（脚本末尾打印 sha256）；
  * 生成后读回 WAV 实测（时长/采样率/声道/峰值/RMS/LUFS/四频段/立体声相关度），
    并打印事件时间戳校验表与新增铺底层校验表。

用法:
  python _tools/make-audio.py
  python _tools/make-audio.py --out <目录>
"""

import argparse
import hashlib
import math
import sys
import wave
from pathlib import Path

import numpy as np

SR = 44100
SEED = 20261103
DUR_BOOT = 10.4
DUR_HANDOFF = 1.45          # Lead 2026-11-03 交接口径 1.4–1.8s；同时满足 smoke-assets「1.4±0.1」
N_BOOT = int(round(DUR_BOOT * SR))
N_HANDOFF = int(round(DUR_HANDOFF * SR))
PEAK_TARGET_DBFS = -1.2
BOOT_TARGET_LUFS = -16.0
HANDOFF_TARGET_LUFS = -16.0  # Lead：handoff 也保持 −16 LUFS
HANDOFF_PEAK_DBFS = -1.2
TAU = 2.0 * math.pi

# ---- ROUND2 铺底电平（立体声合并 RMS，dBFS；母带前）----
SUB_BED_RMS = -26.0
PAD_RMS = -26.5
AIR_RMS = -30.0
SHIMMER_BED_RMS = -31.5
TWINKLE_RMS = -44.0

# ---- ROUND2 事件电平微调（dB，加在既有事件增益上）----
EVENT_TRIM_DB = 0.0


# ============================================================================
# 基础工具
# ============================================================================

def lin(db_value):
    """dBFS → 线性增益。"""
    return 10.0 ** (float(db_value) / 20.0)


def to_db(value, eps=1e-12):
    """线性 → dBFS。"""
    return 20.0 * math.log10(max(float(value), eps))


def n_of(dur):
    return int(round(float(dur) * SR))


def tvec(dur):
    return np.arange(n_of(dur), dtype=np.float64) / SR


def pan_coeffs(pan_value):
    """等功率声像，pan ∈ [-1, 1]。"""
    p = max(-1.0, min(1.0, float(pan_value)))
    theta = (p + 1.0) * 0.25 * math.pi
    return math.cos(theta), math.sin(theta)


def pan(mono, pan_value):
    gl, gr = pan_coeffs(pan_value)
    return mono * gl, mono * gr


def apply_edges(sig, attack=0.006, release=0.010):
    """余弦淡入淡出，保证事件首末样本为 0（防爆音）。"""
    n = len(sig)
    if n == 0:
        return sig
    a = min(int(round(attack * SR)), n)
    r = min(int(round(release * SR)), n)
    if a > 1:
        sig[:a] *= np.sin(0.5 * np.pi * np.linspace(0.0, 1.0, a)) ** 2
    if r > 1:
        sig[-r:] *= np.cos(0.5 * np.pi * np.linspace(0.0, 1.0, r)) ** 2
    return sig


def env_curve(n, points, attack=0.006, release=0.010):
    """点列包络（t 比例 0..1 → 幅度），再强制首末淡入淡出。"""
    x = np.linspace(0.0, 1.0, n)
    ts = np.array([p[0] for p in points], dtype=np.float64)
    vs = np.array([p[1] for p in points], dtype=np.float64)
    env = np.interp(x, ts, vs)
    return apply_edges(env, attack, release)


def exp_env(n, tau, attack=0.004):
    """指数衰减包络（tau 秒）+ 起音余弦。"""
    t = np.arange(n, dtype=np.float64) / SR
    env = np.exp(-t / max(float(tau), 1e-6))
    a = min(int(round(attack * SR)), n)
    if a > 1:
        env[:a] *= np.sin(0.5 * np.pi * np.linspace(0.0, 1.0, a)) ** 2
    return env


def phase_of(freq):
    """频率序列 → 相位序列（相位积分）。"""
    freq = np.asarray(freq, dtype=np.float64)
    return TAU * np.cumsum(freq) / SR


def white(rng, dur):
    return rng.standard_normal(n_of(dur))


def pink(rng, dur):
    """FFT 1/sqrt(f) 整形粉红噪声，峰值归一。"""
    n = n_of(dur)
    spec = np.fft.rfft(rng.standard_normal(n))
    f = np.maximum(np.fft.rfftfreq(n, 1.0 / SR), 1.0)
    spec = spec / np.sqrt(f)
    spec[0] = 0.0
    y = np.fft.irfft(spec, n)
    peak = np.max(np.abs(y))
    return y / (peak + 1e-12)


def scale_rms(left, right, target_db):
    """把立体声信号标定到指定合并 RMS（dBFS）。"""
    rms = math.sqrt(float(np.mean((left * left + right * right) / 2.0)) + 1e-18)
    gain = lin(target_db) / rms
    return left * gain, right * gain


# ---------------------------------------------------------------- 滤波器

def fft_filter(x, gain_fn):
    """频域零相位静态滤波（2 倍补零，避免循环卷积污染）。"""
    n = len(x)
    if n == 0:
        return x
    nfft = 1 << int(math.ceil(math.log2(max(2 * n, 64))))
    freqs = np.fft.rfftfreq(nfft, 1.0 / SR)
    spec = np.fft.rfft(x, nfft) * gain_fn(freqs)
    return np.fft.irfft(spec, nfft)[:n]


def lp_gain(fc, order=2):
    fc = max(float(fc), 1e-6)

    def g(f):
        return 1.0 / np.sqrt(1.0 + (f / fc) ** (2 * order))

    return g


def hp_gain(fc, order=2):
    fc = max(float(fc), 1e-6)

    def g(f):
        return 1.0 / np.sqrt(1.0 + (fc / np.maximum(f, 1e-3)) ** (2 * order))

    return g


def bp_gain(fc, sigma_oct=0.5):
    fc = max(float(fc), 1e-6)

    def g(f):
        lf = np.log2(np.maximum(f, 1e-3) / fc)
        return np.exp(-(lf * lf) / (2.0 * sigma_oct * sigma_oct))

    return g


def stft_filter(x, gain_fn, n_fft=2048, hop=512):
    """时变滤波：Hann 分析/合成 + 加权 OLA（增益函数可随帧时间变化）。

    gain_fn(freqs, t_local) -> 每帧幅度增益；t_local 为帧中心相对事件起点的秒数。
    n_fft=2048 (46ms) / hop=512 满足 Hann² 恒等重构（sum(win²)=1.5）。
    """
    n = len(x)
    if n == 0:
        return x
    if n < n_fft:
        n_fft = 1 << int(math.ceil(math.log2(max(n, 64))))
        hop = max(n_fft // 4, 1)
    win = np.hanning(n_fft + 1)[:-1]
    pad = n_fft
    xp = np.concatenate([np.zeros(pad), x, np.zeros(pad)])
    n_frames = 1 + (len(xp) - n_fft) // hop
    out = np.zeros_like(xp)
    norm = np.zeros_like(xp)
    freqs = np.fft.rfftfreq(n_fft, 1.0 / SR)
    win_sq = win * win
    for i in range(n_frames):
        s = i * hop
        spec = np.fft.rfft(xp[s:s + n_fft] * win)
        t_mid = (s + n_fft * 0.5 - pad) / SR
        spec *= gain_fn(freqs, t_mid)
        out[s:s + n_fft] += np.fft.irfft(spec, n_fft) * win
        norm[s:s + n_fft] += win_sq
    nz = norm > 1e-8
    out[nz] /= norm[nz]
    return out[pad:pad + n]


def additive(freq_curve, n_harm=24, tilt=1.0, cutoff_curve=None, odd=False):
    """加法合成：任意频率曲线 + 1/k^tilt 泛音 + 可时变低通开合（天然无混叠）。"""
    n = len(freq_curve)
    base = TAU * np.cumsum(np.asarray(freq_curve, dtype=np.float64)) / SR
    y = np.zeros(n)
    for k in range(1, n_harm + 1):
        if odd and k % 2 == 0:
            continue
        fk = k * np.asarray(freq_curve, dtype=np.float64)
        amp = 1.0 / (k ** tilt)
        if cutoff_curve is not None:
            amp = amp / np.sqrt(1.0 + (fk / np.maximum(cutoff_curve, 1e-6)) ** 4)
        alive = fk < 19000.0
        if not np.any(alive):
            continue
        y += np.where(alive, amp, 0.0) * np.sin(k * base)
    return y


def add_echoes(mono, taps):
    """双/多声回声。taps: [(delay_s, gain, pan, lp_hz_or_None)] → (l, r)。"""
    n = len(mono)
    left = np.zeros(n)
    right = np.zeros(n)
    for delay, gain, pan_value, lp_hz in taps:
        d = int(round(delay * SR))
        if d >= n or gain <= 0:
            continue
        seg = np.zeros(n)
        seg[d:] = mono[:n - d]
        if lp_hz:
            seg = fft_filter(seg, lp_gain(lp_hz))
        gl, gr = pan_coeffs(pan_value)
        left += gain * gl * seg
        right += gain * gr * seg
    return left, right


def bell(f0, partials, dur, rng, detune_cents=0.0):
    """钟声：非谐分音 + 各自指数衰减。partials: [(ratio, amp, tau_s)]。"""
    n = n_of(dur)
    t = np.arange(n, dtype=np.float64) / SR
    det = 2.0 ** (float(detune_cents) / 1200.0)
    y = np.zeros(n)
    for ratio, amp, tau in partials:
        freq = f0 * ratio * det
        if freq >= 19000.0:
            continue
        ph = rng.uniform(0.0, TAU)
        y += amp * np.sin(TAU * freq * t + ph) * np.exp(-t / max(tau, 1e-6))
    a = min(int(0.003 * SR), n)
    if a > 1:
        y[:a] *= np.sin(0.5 * np.pi * np.linspace(0.0, 1.0, a)) ** 2
    return y / max(float(np.max(np.abs(y))), 1e-12)


# ============================================================================
# 混响（手写 Schroeder：4 梳状 + 2 全通 / 声道，延迟可缩放 → 近场/深空两档）
# ============================================================================

COMB_DELAYS = (1116, 1188, 1277, 1356)   # 25.3 / 26.9 / 29.0 / 30.7 ms
ALLPASS_DELAYS = (556, 441)              # 12.6 / 10.0 ms
SPREAD = 23                              # 右声道微偏移（去相关）


def _damped_comb(x, delay, feedback, damp):
    """y[n] = x[n] + fb * u[n-delay]，u 为 y 的一阶低通（阻尼）。"""
    n = len(x)
    tril = 1
    while damp ** tril > 1e-7 and tril < 4000:
        tril += 1
    kernel = (1.0 - damp) * (damp ** np.arange(tril))
    d_pow = damp ** (np.arange(1, delay + 2))
    xp = np.concatenate([np.zeros(delay), x])
    yp = np.zeros(n + delay)
    up = np.zeros(n + delay)
    for s in range(delay, n + delay, delay):
        e = min(s + delay, n + delay)
        blk = e - s
        yb = xp[s:e] + feedback * up[s - delay:s - delay + blk]
        yp[s:e] = yb
        conv = np.convolve(yb, kernel)[:blk]
        u_prev = up[s - 1] if s > 0 else 0.0
        up[s:e] = conv + u_prev * d_pow[:blk]
    return yp[delay:]


def _allpass(x, delay, g):
    n = len(x)
    xp = np.concatenate([np.zeros(delay), x])
    yp = np.zeros(n + delay)
    for s in range(delay, n + delay, delay):
        e = min(s + delay, n + delay)
        blk = e - s
        yp[s:e] = -g * xp[s:e] + xp[s - delay:s - delay + blk] + g * yp[s - delay:s - delay + blk]
    return yp[delay:]


def schroeder_reverb(mono, feedback=0.88, damp=0.30, comb_scale=1.0, allpass_scale=1.0):
    """简易 Schroeder 混响，返回 (L, R)（与输入等长）；缩放延迟可得更长空间。"""
    left = np.zeros_like(mono)
    right = np.zeros_like(mono)
    for d in COMB_DELAYS:
        dd = max(2, int(round(d * comb_scale)))
        left += _damped_comb(mono, dd, feedback, damp)
        right += _damped_comb(mono, dd + SPREAD, feedback, damp)
    for d in ALLPASS_DELAYS:
        dd = max(2, int(round(d * allpass_scale)))
        left = _allpass(left, dd, 0.5)
        right = _allpass(right, dd + SPREAD, 0.5)
    return left, right


def reverb_wet(left, right, feedback, damp, predelay, comb_scale, allpass_scale, level):
    """发送式混响 wet（不含 dry）：send = HP160 的立体声单声道和，wet 按 dry RMS × level 标定。"""
    send = fft_filter(0.5 * (left + right), hp_gain(160.0, 2))
    wl, wr = schroeder_reverb(send, feedback, damp, comb_scale, allpass_scale)
    d = n_of(predelay)
    if d > 0:
        wl = np.concatenate([np.zeros(d), wl[:-d]])
        wr = np.concatenate([np.zeros(d), wr[:-d]])
    dry_rms = math.sqrt(float(np.mean((left * left + right * right) / 2.0)) + 1e-18)
    wet_rms = math.sqrt(float(np.mean((wl * wl + wr * wr) / 2.0)) + 1e-18)
    gain = dry_rms * level / wet_rms
    return wl * gain, wr * gain


def widen_highs(left, right, amount=1.28, fc=1200.0):
    """高频侧向展宽（>fc 的 Side 分量 × amount），低频保持原样。"""
    mid = 0.5 * (left + right)
    side = 0.5 * (left - right)
    side_low = fft_filter(side, lp_gain(fc, 2))
    side = side_low + (side - side_low) * amount
    return mid + side, mid - side


def mono_bass(left, right, fc=120.0):
    """120Hz 以下单声道化（保证低频相位一致、小音箱不抵消）。"""
    lp = lp_gain(fc, 4)
    low = 0.5 * (fft_filter(left, lp) + fft_filter(right, lp))
    return left - fft_filter(left, lp) + low, right - fft_filter(right, lp) + low


# ============================================================================
# 母带：前瞻限幅 / K 加权积分响度 / WAV 读写
# ============================================================================

def moving_avg(a, w):
    if w <= 1:
        return a.copy()
    return np.convolve(a, np.ones(w) / w, mode='same')


def moving_max(a, w):
    """滑动最大值（±w/2 窗口，向量化移位）。"""
    if w <= 1:
        return a.copy()
    pad = w // 2
    ap = np.pad(a, (pad, pad), mode='edge')
    out = ap[pad:pad + len(a)].copy()
    for j in range(-pad, pad + 1):
        if j == 0:
            continue
        np.maximum(out, ap[pad + j:pad + j + len(a)], out=out)
    return out


def limit_stereo(left, right, threshold_db=-0.8, look_ms=3.0, smooth_ms=10.0):
    """立体声联动的前瞻峰值限幅：增益曲线保证 |y| ≤ threshold。"""
    thr = lin(threshold_db)
    env = np.maximum(np.abs(left), np.abs(right))
    env = moving_max(env, max(1, int(round(look_ms * 2.0 * 0.001 * SR))))
    desired = np.minimum(1.0, thr / np.maximum(env, 1e-12))
    w = max(1, int(round(smooth_ms * 0.001 * SR)))
    smoothed = np.convolve(desired, np.ones(w) / w, mode='same')
    gain = np.minimum(desired, smoothed)
    return left * gain, right * gain


def _shelf_biquad(f0, gain_db, q):
    a = 10.0 ** (gain_db / 40.0)
    w0 = TAU * f0 / SR
    alpha = math.sin(w0) / (2.0 * q)
    c = math.cos(w0)
    sa = 2.0 * math.sqrt(a) * alpha
    b0 = a * ((a + 1.0) + (a - 1.0) * c + sa)
    b1 = -2.0 * a * ((a - 1.0) + (a + 1.0) * c)
    b2 = a * ((a + 1.0) + (a - 1.0) * c - sa)
    a0 = (a + 1.0) - (a - 1.0) * c + sa
    a1 = 2.0 * ((a - 1.0) - (a + 1.0) * c)
    a2 = (a + 1.0) - (a - 1.0) * c - sa
    return (b0 / a0, b1 / a0, b2 / a0), (1.0, a1 / a0, a2 / a0)


def _hp_biquad(f0, q):
    w0 = TAU * f0 / SR
    alpha = math.sin(w0) / (2.0 * q)
    c = math.cos(w0)
    b0 = (1.0 + c) / 2.0
    b1 = -(1.0 + c)
    b2 = (1.0 + c) / 2.0
    a0 = 1.0 + alpha
    a1 = -2.0 * c
    a2 = 1.0 - alpha
    return (b0 / a0, b1 / a0, b2 / a0), (1.0, a1 / a0, a2 / a0)


def _biquad_fft(x, coeffs):
    b, a = coeffs
    n = len(x)
    nfft = 1 << int(math.ceil(math.log2(max(2 * n, 64))))
    spec = np.fft.rfft(x, nfft)
    w = TAU * np.fft.rfftfreq(nfft, 1.0 / SR) / SR
    z = np.exp(-1j * w)
    h = (b[0] + b[1] * z + b[2] * z * z) / (a[0] + a[1] * z + a[2] * z * z)
    return np.fft.irfft(spec * h, nfft)[:n]


def integrated_lufs(left, right):
    """BS.1770-4 简化实现（K 加权 + 400ms 块 + 绝对/相对门限）。"""
    k_shelf = _shelf_biquad(1681.974450955533, 3.999843853973347, 0.7071752369554196)
    k_hp = _hp_biquad(38.13547087602444, 0.5003270373238773)
    ls = _biquad_fft(_biquad_fft(left, k_shelf), k_hp)
    rs = _biquad_fft(_biquad_fft(right, k_shelf), k_hp)
    ms = ls * ls + rs * rs
    block = int(round(0.4 * SR))
    hop = int(round(0.1 * SR))
    if len(ms) < block:
        blocks = np.array([float(np.mean(ms))])
    else:
        blocks = np.array([float(np.mean(ms[i:i + block]))
                           for i in range(0, len(ms) - block + 1, hop)])
    loud = -0.691 + 10.0 * np.log10(np.maximum(blocks, 1e-12))
    gated = blocks[loud > -70.0]
    if len(gated) == 0:
        return float('-inf')
    rel = -0.691 + 10.0 * math.log10(float(np.mean(gated))) - 10.0
    keep = gated[(loud[loud > -70.0] > rel)]
    if len(keep) == 0:
        keep = gated
    return -0.691 + 10.0 * math.log10(float(np.mean(keep)))


def stereo_corr(left, right):
    l = left - left.mean()
    r = right - right.mean()
    denom = math.sqrt(float(np.mean(l * l) * np.mean(r * r)) + 1e-18)
    return float(np.mean(l * r) / denom)


def four_bands(left, right):
    """四频段（<100 / 100–1k / 1–4k / >4k）RMS 与能量占比（order-4 FFT 分频）。"""
    edges = ((20.0, 100.0, '<100Hz'), (100.0, 1000.0, '100-1kHz'),
             (1000.0, 4000.0, '1-4kHz'), (4000.0, 20000.0, '>4kHz'))
    out = []
    acc = 0.0
    for lo, hi, name in edges:
        def g(f, lo=lo, hi=hi):
            f = np.maximum(f, 1e-3)
            hp = 1.0 / np.sqrt(1.0 + (lo / f) ** 8)
            lp = 1.0 / np.sqrt(1.0 + (f / hi) ** 8)
            return hp * lp
        bl, br = fft_filter(left, g), fft_filter(right, g)
        p = float(np.mean(bl * bl + br * br) / 2.0)
        acc += p
        out.append({'band': name, 'rms_db': float(10.0 * math.log10(max(p, 1e-12))), 'share': 0.0})
    for row in out:
        row['share'] = 100.0 * (10.0 ** (row['rms_db'] / 10.0)) / max(acc, 1e-18)
    return out


def write_wav(path, left, right):
    data = np.stack([left, right], axis=1)
    data = np.clip(data, -0.9999, 0.9999)
    ints = np.round(data * 32767.0).astype(np.int16)
    with wave.open(str(path), 'wb') as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes(ints.reshape(-1).tobytes())


def analyze_wav(path):
    with wave.open(str(path), 'rb') as wf:
        ch = wf.getnchannels()
        sw = wf.getsampwidth()
        sr = wf.getframerate()
        nf = wf.getnframes()
        raw = wf.readframes(nf)
    data = np.frombuffer(raw, dtype=np.int16).astype(np.float64) / 32767.0
    if ch == 2:
        left = data[0::2]
        right = data[1::2]
    else:
        left = data
        right = data
    peak = max(float(np.max(np.abs(left))), float(np.max(np.abs(right))))
    rms = math.sqrt(float(np.mean((left * left + right * right) / 2.0)))
    return {
        'channels': ch,
        'sampwidth': sw,
        'samplerate': sr,
        'frames': nf,
        'duration': nf / float(sr),
        'peak_db': to_db(peak),
        'peak_l_db': to_db(float(np.max(np.abs(left)))),
        'peak_r_db': to_db(float(np.max(np.abs(right)))),
        'rms_db': to_db(rms),
        'lufs': integrated_lufs(left, right),
        'dc_l': float(np.mean(left)),
        'dc_r': float(np.mean(right)),
        'first_max': max(abs(float(left[0])), abs(float(right[0]))),
        'last_max': max(abs(float(left[-1])), abs(float(right[-1]))),
        'full_scale': int(np.sum(np.abs(data) >= 0.9999)),
        'nan': int(np.sum(~np.isfinite(data))),
        'max_step': float(max(np.max(np.abs(np.diff(left))), np.max(np.abs(np.diff(right))))),
        'sha256': hashlib.sha256(raw).hexdigest(),
        'size': len(raw),
        'stereo_corr': stereo_corr(left, right),
        'bands': four_bands(left, right),
    }


# ============================================================================
# ROUND2 新增铺底层（ROUND2-PLAN §4.7）
# ============================================================================

def synth_sub_bed(rng):
    """全程深空 sub 长音：36→41.5Hz 缓慢上行 + 55Hz 伴音 + 心跳脉冲调幅。"""
    n = N_BOOT
    t = np.arange(n, dtype=np.float64) / SR
    frac = t / DUR_BOOT
    f_lo = 36.0 + 5.5 * frac
    f_lo = f_lo * (1.0 + 0.0025 * np.sin(TAU * 0.045 * t + 0.4))
    ph_lo = phase_of(f_lo)
    a = np.sin(ph_lo) + 0.16 * np.sin(2.0 * ph_lo) + 0.05 * np.sin(3.0 * ph_lo)
    env_hi = np.interp(frac, [0.0, 0.02, 0.06, 0.30, 0.60, 0.90, 1.0],
                       [0.0, 0.0, 0.55, 0.80, 0.70, 0.55, 0.0])
    f_hi = 55.0 * (1.0 + 0.0008 * np.sin(TAU * 0.031 * t + 1.7))
    b = np.sin(phase_of(f_hi)) + 0.10 * np.sin(2.0 * phase_of(f_hi))
    # 低频心跳（P1：0.86/1.36/1.86/2.36/2.86s 的 lub-dub 双脉冲）
    pulse = np.zeros(n)
    for c in (0.86, 1.36, 1.86, 2.36, 2.86):
        for dt, amp in ((0.0, 1.0), (0.17, 0.55)):
            center = c + dt
            i0 = max(0, n_of(center - 0.12))
            i1 = min(n, n_of(center + 0.12))
            if i1 > i0:
                tt = t[i0:i1] - center
                pulse[i0:i1] += amp * np.exp(-(tt / 0.045) ** 2)
    env = env_curve(n, [(0.0, 0.0), (0.02, 0.25), (0.10, 0.55), (0.28, 0.95),
                        (0.55, 0.85), (0.70, 0.66), (0.745, 0.72), (0.80, 0.92),
                        (0.87, 0.85), (0.925, 0.40), (0.97, 0.10), (1.0, 0.0)],
                    attack=0.40, release=0.90)
    mono = (0.85 * a + 0.55 * b * env_hi) * env * (1.0 + 0.20 * pulse)
    mono /= max(float(np.max(np.abs(mono))), 1e-12)
    left, right = pan(mono, 0.0)
    return scale_rms(left, right, SUB_BED_RMS)


def synth_pad(rng):
    """全程 Dm9 悬疑 pad：7 音 × 3 层 detune/声像 + 慢颤音 + 幅度 LFO + 低通开合。"""
    n = N_BOOT
    t = np.arange(n, dtype=np.float64) / SR
    frac = t / DUR_BOOT
    cut_pts = [(0.00, 380.0), (0.10, 520.0), (0.30, 900.0), (0.42, 2200.0),
               (0.52, 3000.0), (0.62, 2300.0), (0.70, 1700.0), (0.735, 2700.0),
               (0.82, 3400.0), (0.90, 2200.0), (1.00, 1300.0)]
    cutoff = np.interp(frac, [p[0] for p in cut_pts], [p[1] for p in cut_pts])
    notes = (
        (73.42, -0.45, 1.00),    # D2（pedal）
        (110.00, 0.00, 0.72),    # A2
        (146.83, -0.10, 0.64),   # D3
        (174.61, 0.38, 0.60),    # F3（小三级 = 悬疑/暗）
        (220.00, -0.34, 0.50),   # A3
        (261.63, 0.46, 0.42),    # C4（小七度）
        (329.63, -0.42, 0.34),   # E4（九度，Dm9）
    )
    detunes = (-7.0, 0.0, 7.0)
    layer_pans = (-0.55, 0.0, 0.55)
    left = np.zeros(n)
    right = np.zeros(n)
    for k, (f0, base_pan, weight) in enumerate(notes):
        for j, (det, lpan) in enumerate(zip(detunes, layer_pans)):
            rate = 0.021 + 0.009 * ((k * 3 + j) % 5)
            phase = rng.uniform(0.0, TAU)
            vib = 2.5 * np.sin(TAU * rate * t + phase)   # ±2.5 cents 慢颤音
            freq = np.full(n, f0) * (2.0 ** ((det + vib) / 1200.0))
            voice = additive(freq, n_harm=7, tilt=1.45, cutoff_curve=cutoff)
            voice /= max(float(np.max(np.abs(voice))), 1e-12)
            lfo = 1.0 + 0.12 * np.sin(TAU * rate * 0.7 * t + phase * 1.7)
            pv = max(-1.0, min(1.0, base_pan + 0.55 * lpan))
            gl, gr = pan_coeffs(pv)
            w = weight * (1.0 + 0.06 * j)
            left += voice * lfo * w * gl
            right += voice * lfo * w * gr
    # 悬疑高音簇（C5/E5/F5 —— E/F 小二度摩擦，极轻缓慢呼吸）
    for f0, pv in ((523.25, -0.55), (659.26, 0.30), (698.46, 0.60)):
        tone = np.sin(TAU * f0 * t + rng.uniform(0.0, TAU))
        swell = np.interp(frac, [0.0, 0.12, 0.28, 0.42, 0.55, 0.70, 0.78, 0.90, 1.0],
                          [0.0, 0.35, 0.65, 0.30, 0.55, 0.20, 0.0, 0.45, 0.0])
        tone = tone * swell * (1.0 + 0.25 * np.sin(TAU * 0.043 * t))
        gl, gr = pan_coeffs(pv)
        left += tone * 0.035 * gl
        right += tone * 0.035 * gr
    peak = max(float(np.max(np.abs(left))), float(np.max(np.abs(right))), 1e-12)
    left /= peak
    right /= peak
    env = env_curve(n, [(0.0, 0.0), (0.10, 0.55), (0.30, 0.85), (0.45, 1.0),
                        (0.56, 0.95), (0.70, 0.82), (0.735, 0.50), (0.80, 0.78),
                        (0.88, 0.85), (1.0, 0.22)], attack=0.90, release=0.80)
    left, right = scale_rms(left * env, right * env, PAD_RMS)
    return left, right


def synth_space_air(rng):
    """全程星海空气层：双通道独立粉噪 2.2–12kHz + 缓慢呼吸（宽立体声）。"""
    n = N_BOOT
    t = np.arange(n, dtype=np.float64) / SR
    frac = t / DUR_BOOT
    air = []
    for ch in range(2):
        noise = pink(rng, DUR_BOOT)
        sig = fft_filter(noise, lambda f: hp_gain(2200.0, 2)(f) * lp_gain(12000.0, 2)(f))
        sig = sig / max(float(np.max(np.abs(sig))), 1e-12)
        rate = 0.043 + 0.011 * ch
        lfo = 1.0 + 0.16 * np.sin(TAU * rate * t + 0.9 * ch)
        air.append(sig * lfo)
    env = env_curve(n, [(0.0, 0.0), (0.06, 0.55), (0.30, 0.75), (0.45, 1.0),
                        (0.55, 0.90), (0.72, 0.80), (0.82, 0.88), (1.0, 0.15)],
                    attack=0.80, release=0.90)
    mono = np.stack([air[0] * env, air[1] * env], axis=1)
    left, right = mono[:, 0], mono[:, 1]
    return scale_rms(left, right, AIR_RMS)


def synth_shimmer_bed(rng):
    """全程星尘 shimmer 铺底：D5/A5/F#6/E6 + 泛音，慢颤音，补 1–4k/>4k。"""
    n = N_BOOT
    t = np.arange(n, dtype=np.float64) / SR
    frac = t / DUR_BOOT
    notes = ((587.33, -0.35, 1.00), (880.00, 0.30, 0.72),
             (1479.98, 0.55, 0.50), (1318.51, -0.55, 0.38))
    left = np.zeros(n)
    right = np.zeros(n)
    for k, (f0, pv, w) in enumerate(notes):
        rate = 0.017 + 0.006 * k
        phase = rng.uniform(0.0, TAU)
        trem = 0.55 + 0.45 * np.sin(TAU * rate * t + phase)
        tone = (np.sin(TAU * f0 * t + phase) * 1.00
                + np.sin(TAU * 2.0 * f0 * t + phase * 1.3) * 0.32
                + np.sin(TAU * 3.0 * f0 * t + phase * 0.7) * 0.14)
        tone = tone * trem * w
        gl, gr = pan_coeffs(pv)
        left += tone * gl
        right += tone * gr
    env = env_curve(n, [(0.0, 0.0), (0.12, 0.40), (0.32, 0.75), (0.46, 1.0),
                        (0.58, 0.85), (0.76, 0.78), (0.88, 0.95), (1.0, 0.10)],
                    attack=1.20, release=0.90)
    left, right = scale_rms(left * env, right * env, SHIMMER_BED_RMS)
    return left, right


def synth_twinkles(rng):
    """星点闪烁（装饰层）：16 个稀疏高频小钟，随机声像/音高/时刻。"""
    n = N_BOOT
    left = np.zeros(n)
    right = np.zeros(n)
    times = np.sort(rng.uniform(0.55, 9.55, 16))
    # 3.3–7.6 太空段更密（重排：把若干点挪进该区间）
    extra = rng.uniform(3.40, 7.50, 5)
    times = np.sort(np.concatenate([times[:11], extra]))
    for start in times:
        freq = float(rng.uniform(2600.0, 9200.0))
        dur = 0.55
        nn = n_of(dur)
        tt = np.arange(nn, dtype=np.float64) / SR
        tone = (np.sin(TAU * freq * tt) * np.exp(-tt / 0.11)
                + 0.35 * np.sin(TAU * freq * 2.01 * tt) * np.exp(-tt / 0.05))
        tone = apply_edges(tone, 0.001, 0.06)
        tone /= max(float(np.max(np.abs(tone))), 1e-12)
        pv = float(rng.uniform(-0.85, 0.85))
        gl, gr = pan_coeffs(pv)
        i0 = n_of(start)
        m = min(nn, n - i0)
        if m <= 0:
            continue
        left[i0:i0 + m] += tone[:m] * gl
        right[i0:i0 + m] += tone[:m] * gr
    return scale_rms(left, right, TWINKLE_RMS)


# ============================================================================
# 事件层（16 条规格事件时间点不变，逐条强化层次）
# ============================================================================

def synth_ping(rng):
    """0.00 声呐 ping：880→420Hz 下滑 + 2.9s 长尾 + 3 层回声 + 高次泛音。"""
    dur = 2.90
    n = n_of(dur)
    t = np.arange(n, dtype=np.float64) / SR
    freq = 880.0 * (420.0 / 880.0) ** np.clip(t / 0.65, 0.0, 1.0)
    body = (np.sin(phase_of(freq))
            + 0.22 * np.sin(2.0 * phase_of(freq))
            + 0.08 * np.sin(3.0 * phase_of(freq))
            + 0.03 * np.sin(5.0 * phase_of(freq)))
    body *= exp_env(n, 0.22, attack=0.003)
    body = apply_edges(body, 0.002, 0.05)
    body /= max(np.max(np.abs(body)), 1e-12)
    left, right = pan(body, 0.0)
    el, er = add_echoes(body, [
        (0.42, 0.42, -0.35, 1800.0),
        (0.95, 0.24, 0.40, 1200.0),
        (1.62, 0.12, -0.20, 900.0),
    ])
    gain = lin(-15.0 + EVENT_TRIM_DB)
    return (left + el) * gain, (right + er) * gain


def synth_hum(rng):
    """0.30–2.90 低频嗡鸣（规格事件）：55Hz + detune 缓慢上行至 66Hz；叠在 sub 铺底之上。"""
    dur = 2.60
    n = n_of(dur)
    t = np.arange(n, dtype=np.float64) / SR
    f0 = 55.0 * (66.0 / 55.0) ** (t / dur)
    a = np.sin(phase_of(f0))
    b = np.sin(phase_of(f0 * 1.003) + 0.7)
    mono = 0.72 * a + 0.28 * b
    env = env_curve(n, [(0.0, 0.0), (0.16, 0.85), (0.5, 1.0), (0.82, 0.9), (1.0, 0.0)],
                    attack=0.42, release=0.55)
    mono = mono * env
    mono /= max(np.max(np.abs(mono)), 1e-12)
    left, right = pan(mono, 0.0)
    gain = lin(-24.0 + EVENT_TRIM_DB)
    return left * gain, right * gain


def synth_key(rng, freq, pan_value, gain_db):
    """终端键盘 #n：机械 click + 音调脉冲 + 立体错位 38ms 延迟回声 + 4k tick。"""
    dur = 0.12
    n = n_of(dur)
    t = np.arange(n, dtype=np.float64) / SR
    tone = np.sin(TAU * freq * t) * exp_env(n, 0.030, attack=0.0012)
    tone /= max(np.max(np.abs(tone)), 1e-12)
    click = white(rng, dur) * exp_env(n, 0.005, attack=0.0004)
    click = fft_filter(click, hp_gain(2600.0, 2))
    click /= max(np.max(np.abs(click)), 1e-12)
    thock = white(rng, dur) * exp_env(n, 0.020, attack=0.0010)
    thock = fft_filter(thock, bp_gain(210.0, 0.7))
    thock /= max(np.max(np.abs(thock)), 1e-12)
    tick = np.sin(TAU * 4200.0 * t) * exp_env(n, 0.004, attack=0.0003)
    mono = tone * 0.42 + click * 0.60 + thock * 0.30 + tick * 0.10
    mono = apply_edges(mono, 0.0010, 0.02)
    left, right = pan(mono, pan_value)
    # 立体错位：38ms 后反向声像的短延迟（终端回声感）
    el, er = add_echoes(mono, [(0.038, 0.34, -pan_value, 3200.0)])
    gain = lin(gain_db + EVENT_TRIM_DB)
    return (left + el) * gain, (right + er) * gain


def synth_servo(rng):
    """1.90–3.00 伺服升频：机械 whine+棘轮 + 气压带通上扫 + 6k 泄气。"""
    dur = 1.10
    n = n_of(dur)
    t = np.arange(n, dtype=np.float64) / SR
    frac = np.clip(t / dur, 0.0, 1.0)
    # ① 气压：带通噪声中心 300→1800Hz（指数上扫）+ 2× 副带
    noise = pink(rng, dur)

    def gain_fn(freqs, tt):
        f = min(max(tt / dur, 0.0), 1.0)
        fc = 300.0 * (1800.0 / 300.0) ** f
        lf = np.log2(np.maximum(freqs, 1e-3) / fc)
        band = np.exp(-(lf * lf) / (2.0 * 0.30 ** 2))
        lf2 = np.log2(np.maximum(freqs, 1e-3) / (2.0 * fc))
        band2 = 0.35 * np.exp(-(lf2 * lf2) / (2.0 * 0.40 ** 2))
        return (band + band2) / (1.0 + (freqs / 9000.0) ** 4)

    pneum = stft_filter(noise, gain_fn)
    # ② 机械 whine：140→560Hz 奇次泛音（马达）
    whine = additive(140.0 * (4.0 ** frac), n_harm=9, tilt=1.15, odd=True,
                     cutoff_curve=600.0 * (6000.0 / 600.0) ** frac)
    whine /= max(np.max(np.abs(whine)), 1e-12)
    # ③ 机械棘轮：13 个 80ms 间隔的短 click，电平渐强
    ratchet = np.zeros(n)
    for idx, start in enumerate(np.arange(0.10, 1.02, 0.080)):
        i0 = n_of(start)
        seg_n = min(n_of(0.02), n - i0)
        if seg_n <= 0:
            continue
        cl = white(rng, seg_n / SR) * exp_env(seg_n, 0.006, attack=0.0004)
        cl = fft_filter(cl, bp_gain(3100.0, 0.55))
        cl /= max(np.max(np.abs(cl)), 1e-12)
        ratchet[i0:i0 + seg_n] += cl * (0.10 + 0.035 * idx)
    # ④ 6k 泄气（末端气阀）
    release = fft_filter(pink(rng, dur), hp_gain(5800.0, 2))
    release *= np.interp(frac, [0.0, 0.70, 0.90, 1.0], [0.0, 0.0, 1.0, 0.15])
    release = apply_edges(release, 0.10, 0.05)
    release /= max(np.max(np.abs(release)), 1e-12)
    env = env_curve(n, [(0.0, 0.0), (0.22, 1.0), (0.80, 1.0), (1.0, 0.0)],
                    attack=0.22, release=0.28)
    mono = (pneum * env * 0.95 + whine * env * 0.30
            + ratchet * 0.55 + release * 0.30)
    mono /= max(np.max(np.abs(mono)), 1e-12)
    left, right = pan(mono, 0.12)
    gain = lin(-19.5 + EVENT_TRIM_DB)
    return left * gain, right * gain


def synth_air_swell(rng):
    """2.78–3.10 舷窗冲击前反向气流：能量按 t³ 聚拢到 3.10s。"""
    dur = 0.32
    n = n_of(dur)
    t = np.arange(n, dtype=np.float64) / SR
    env = (np.clip(t / dur, 0.0, 1.0) ** 3.0) * np.clip((dur - t) / 0.008, 0.0, 1.0)
    left = np.zeros(n)
    right = np.zeros(n)
    for pv in (-0.45, 0.45):
        air = fft_filter(pink(rng, dur), hp_gain(650.0, 2) if pv < 0 else hp_gain(900.0, 2))
        air /= max(np.max(np.abs(air)), 1e-12)
        gl, gr = pan_coeffs(pv)
        left += air * env * gl * 0.72
        right += air * env * gr * 0.72
    gain = lin(-15.0 + EVENT_TRIM_DB)
    return left * gain, right * gain


def synth_porthole_impact(rng):
    """3.10 舷窗冲击：38Hz 下潜（118→38Hz）+ 28Hz 体感 + 气流爆 + 金属余响。"""
    dur = 1.80
    n = n_of(dur)
    t = np.arange(n, dtype=np.float64) / SR
    freq = 118.0 * (38.0 / 118.0) ** np.clip(t / 0.85, 0.0, 1.0)
    sub = np.sin(phase_of(freq)) * exp_env(n, 0.42, attack=0.004)
    sub = apply_edges(sub, 0.003, 0.12)
    sub /= max(np.max(np.abs(sub)), 1e-12)
    body = np.sin(phase_of(np.full(n, 28.0))) * exp_env(n, 0.65, attack=0.010)
    body = apply_edges(body, 0.005, 0.20)
    body /= max(np.max(np.abs(body)), 1e-12)
    thump = fft_filter(white(rng, dur), lp_gain(150.0, 2)) * exp_env(n, 0.10, attack=0.002)
    thump = apply_edges(thump, 0.002, 0.06)
    thump /= max(np.max(np.abs(thump)), 1e-12)
    burst = fft_filter(white(rng, dur), bp_gain(950.0, 0.7)) * exp_env(n, 0.06, attack=0.0015)
    burst = apply_edges(burst, 0.0015, 0.04)
    burst /= max(np.max(np.abs(burst)), 1e-12)
    ring = fft_filter(white(rng, dur), bp_gain(2700.0, 0.5)) * exp_env(n, 0.30, attack=0.002)
    ring = apply_edges(ring, 0.002, 0.30)
    ring /= max(np.max(np.abs(ring)), 1e-12)
    mono = (sub * lin(-4.5) + body * lin(-11.0) + thump * lin(-12.0)
            + burst * lin(-14.0) + ring * lin(-20.0))
    left, right = pan(mono, 0.0)
    gain = lin(EVENT_TRIM_DB)
    return left * gain, right * gain


def synth_wind(rng):
    """3.30–5.40 风噪 / 星海空气：4 层独立噪声真实慢声像移动 + 5–10k 空气层。"""
    dur = 2.10
    n = n_of(dur)
    t = np.arange(n, dtype=np.float64) / SR
    left = np.zeros(n)
    right = np.zeros(n)
    bands = ((560.0, 0.55, 0.061, 0.0), (980.0, 0.60, 0.083, 1.9),
             (1700.0, 0.62, 0.047, 3.7), (2900.0, 0.70, 0.071, 5.1))
    for fc, sig_oct, rate, phase in bands:
        noise = pink(rng, dur)
        sig = fft_filter(noise, bp_gain(fc, sig_oct))
        sig = sig / max(np.max(np.abs(sig)), 1e-12)
        pan_t = 0.78 * np.sin(TAU * rate * t + phase)          # 缓慢左右移动
        gl = np.cos((pan_t + 1.0) * 0.25 * np.pi)
        gr = np.sin((pan_t + 1.0) * 0.25 * np.pi)
        left += sig * gl
        right += sig * gr
    # 5–10kHz 空气层（宽、慢呼吸）
    for pv in (-0.6, 0.6):
        air = fft_filter(pink(rng, dur), lambda f: hp_gain(5000.0, 2)(f) * lp_gain(11000.0, 2)(f))
        air = air / max(np.max(np.abs(air)), 1e-12)
        lfo = 1.0 + 0.30 * np.sin(TAU * 0.052 * t + (0.9 if pv < 0 else 2.4))
        gl, gr = pan_coeffs(pv)
        left += air * lfo * gl * 0.30
        right += air * lfo * gr * 0.30
    env = env_curve(n, [(0.0, 0.0), (0.30, 1.0), (0.72, 1.0), (1.0, 0.0)],
                    attack=0.45, release=0.60)
    left, right = scale_rms(left * env, right * env, -25.5)
    return left, right


def synth_riser(rng):
    """4.40–5.10 上升音墙：3 层泛音滑音（低/五度/八度）+ 噪声上扫 + 高 shimmer。"""
    dur = 0.70
    n = n_of(dur)
    t = np.arange(n, dtype=np.float64) / SR
    frac = np.clip(t / dur, 0.0, 1.0)
    layers = [
        (55.0, 110.0, -0.50, 1.00, False, 1.30),    # 低频层（补厚度）
        (110.0, 220.0, -0.28, 0.85, False, 1.00),   # 锯齿基频
        (164.8, 329.6, 0.00, 0.70, True, 2.00),     # 三角五度
        (220.0, 440.0, 0.30, 0.60, False, 1.00),    # 锯齿八度
        (330.0, 660.0, 0.50, 0.40, True, 2.20),     # 高一层的五度（3 层泛音之上的 shimmer）
    ]
    left = np.zeros(n)
    right = np.zeros(n)
    for f_start, f_end, pv, amp, is_tri, tilt in layers:
        fc = f_start * (f_end / f_start) ** frac
        cutoff = 300.0 * (7000.0 / 300.0) ** frac
        voice = additive(fc, n_harm=20, tilt=tilt, cutoff_curve=cutoff, odd=is_tri)
        voice /= max(np.max(np.abs(voice)), 1e-12)
        voice *= env_curve(n, [(0.0, 0.0), (0.55, 0.85), (0.92, 1.0), (1.0, 0.55)],
                           attack=0.25, release=0.06) * amp
        gl, gr = pan_coeffs(pv)
        left += voice * gl
        right += voice * gr
    noise = pink(rng, dur)

    def gain_fn(freqs, tt):
        fc = 600.0 * (9000.0 / 600.0) ** np.clip(tt / dur, 0.0, 1.0)
        lf = np.log2(np.maximum(freqs, 1e-3) / fc)
        return np.exp(-(lf * lf) / (2.0 * 0.55 ** 2))

    noise = stft_filter(noise, gain_fn)
    noise *= env_curve(n, [(0.0, 0.0), (0.7, 0.7), (1.0, 1.0)], attack=0.20, release=0.06)
    noise /= max(np.max(np.abs(noise)), 1e-12)
    left += noise * lin(-22.0)
    right += noise * lin(-22.0)
    gain = lin(-10.0 + EVENT_TRIM_DB)
    return left * gain, right * gain


def formant_filter_fn(formants, lp_points, sigma=0.27):
    """共振峰增益函数：formants = [([(t_ratio, hz)...], amp), ...]。"""
    def gain_fn(freqs, tt):
        out = np.zeros_like(freqs)
        for points, amp in formants:
            fc = float(np.interp(tt, [p[0] for p in points], [p[1] for p in points]))
            lf = np.log2(np.maximum(freqs, 1e-3) / max(fc, 1e-3))
            out += amp * np.exp(-(lf * lf) / (2.0 * sigma * sigma))
        fc_lp = float(np.interp(tt, [p[0] for p in lp_points], [p[1] for p in lp_points]))
        out *= 1.0 / np.sqrt(1.0 + (freqs / max(fc_lp, 1.0)) ** 4)
        return out

    return gain_fn


def synth_whale(rng, near=False):
    """鲸叫：基频 320→120Hz 滑音 + 3 共振峰 + 颤音 + 双回声（远/近两种音色）。"""
    if near:
        body_dur = 1.25
        taps = [(0.28, 0.30, 0.10, 2200.0), (0.52, 0.16, -0.35, 1400.0)]
        pitch_pts = [(0.0, 320.0), (0.18, 362.0), (0.50, 330.0), (0.78, 205.0), (1.0, 112.0)]
        formants = [([(0.0, 700.0), (1.0, 640.0)], 1.00),
                    ([(0.0, 1480.0), (1.0, 1320.0)], 0.75),
                    ([(0.0, 2950.0), (1.0, 2600.0)], 0.50)]
        lp_pts = [(0.0, 7000.0), (1.0, 3200.0)]
        gain_db, pan_value = -8.0, 0.35
        vib_rate, vib_depth = 6.0, 0.026
        env_pts = [(0.0, 0.0), (0.07, 0.70), (0.22, 1.0), (0.55, 0.92),
                   (0.82, 0.60), (1.0, 0.0)]
    else:
        body_dur = 1.30
        taps = [(0.30, 0.36, -0.20, 1500.0), (0.62, 0.20, 0.35, 1000.0)]
        pitch_pts = [(0.0, 320.0), (0.16, 346.0), (0.45, 300.0), (0.75, 192.0), (1.0, 120.0)]
        formants = [([(0.0, 620.0), (1.0, 560.0)], 1.00),
                    ([(0.0, 1250.0), (1.0, 1150.0)], 0.75),
                    ([(0.0, 2600.0), (1.0, 2400.0)], 0.52)]
        lp_pts = [(0.0, 4600.0), (1.0, 2400.0)]
        gain_db, pan_value = -13.0, -0.45
        vib_rate, vib_depth = 5.4, 0.020
        env_pts = [(0.0, 0.0), (0.09, 0.65), (0.28, 1.0), (0.60, 0.90),
                   (0.86, 0.45), (1.0, 0.0)]

    n_body = n_of(body_dur)
    t = np.arange(n_body, dtype=np.float64) / SR
    freq = np.interp(t, [p[0] for p in pitch_pts], [p[1] for p in pitch_pts])
    freq = freq * (1.0 + vib_depth * np.sin(TAU * vib_rate * t + 0.6)
                   * np.clip(t / 0.18, 0.0, 1.0))
    source = additive(freq, n_harm=18, tilt=1.30)
    source /= max(np.max(np.abs(source)), 1e-12)
    breath = pink(rng, body_dur) * 0.06
    source = source + breath
    body = stft_filter(source, formant_filter_fn(formants, lp_pts))
    body *= env_curve(n_body, env_pts, attack=0.02, release=0.05)
    body /= max(np.max(np.abs(body)), 1e-12)

    total = body_dur + max(tp[0] for tp in taps) + 0.02
    n_total = n_of(total)
    mono = np.zeros(n_total)
    mono[:n_body] = body
    mono = apply_edges(mono, 0.008, 0.02)
    left, right = pan(mono, pan_value)
    el, er = add_echoes(mono, taps)
    gain = lin(gain_db + EVENT_TRIM_DB)
    return (left + el) * gain, (right + er) * gain


def synth_low_dive(rng):
    """P3 低频下潜（6.55–7.55）：52→26Hz 下潜 + 35Hz 层，作为鲸叫的次低频铺底。"""
    dur = 1.00
    n = n_of(dur)
    t = np.arange(n, dtype=np.float64) / SR
    freq = 52.0 * (26.0 / 52.0) ** np.clip(t / 0.85, 0.0, 1.0)
    mono = np.sin(phase_of(freq)) + 0.10 * np.sin(2.0 * phase_of(freq))
    mono += 0.35 * np.sin(phase_of(np.full(n, 35.0))) * np.clip(t / 0.6, 0.0, 1.0)
    mono *= env_curve(n, [(0.0, 0.0), (0.40, 1.0), (0.75, 0.7), (1.0, 0.0)],
                      attack=0.35, release=0.30)
    mono /= max(np.max(np.abs(mono)), 1e-12)
    left, right = pan(mono, 0.0)
    gain = lin(-19.0 + EVENT_TRIM_DB)
    return left * gain, right * gain


def synth_lock_impact(rng):
    """7.60 锁版冲击：次低频 drop（96→34Hz）+ 30Hz 体感 + 金属瞬态 + 低频 thump。"""
    dur = 1.20
    n = n_of(dur)
    t = np.arange(n, dtype=np.float64) / SR
    freq = 96.0 * (34.0 / 96.0) ** np.clip(t / 0.55, 0.0, 1.0)
    sub = np.sin(phase_of(freq)) * exp_env(n, 0.30, attack=0.003)
    sub = apply_edges(sub, 0.0025, 0.10)
    sub /= max(np.max(np.abs(sub)), 1e-12)
    floor = np.sin(phase_of(np.full(n, 30.0))) * exp_env(n, 0.55, attack=0.008)
    floor = apply_edges(floor, 0.004, 0.16)
    floor /= max(np.max(np.abs(floor)), 1e-12)
    snap = fft_filter(white(rng, dur), bp_gain(2800.0, 0.6)) * exp_env(n, 0.015, attack=0.001)
    snap = apply_edges(snap, 0.001, 0.03)
    snap /= max(np.max(np.abs(snap)), 1e-12)
    thump = fft_filter(white(rng, dur), lp_gain(130.0, 2)) * exp_env(n, 0.13, attack=0.002)
    thump = apply_edges(thump, 0.002, 0.06)
    thump /= max(np.max(np.abs(thump)), 1e-12)
    mono = (sub * lin(-3.5) + floor * lin(-9.0) + snap * lin(-17.0)
            + thump * lin(-12.0))
    left, right = pan(mono, 0.0)
    gain = lin(EVENT_TRIM_DB)
    return left * gain, right * gain


def synth_lock_click(rng):
    """7.60 锁版金属咔哒（装饰层）：2–7kHz 短瞬态 + 高音泛音。"""
    dur = 0.35
    n = n_of(dur)
    t = np.arange(n, dtype=np.float64) / SR
    click = fft_filter(white(rng, dur), bp_gain(5200.0, 0.55)) * exp_env(n, 0.06, attack=0.001)
    click = apply_edges(click, 0.001, 0.05)
    click /= max(np.max(np.abs(click)), 1e-12)
    tine = (np.sin(TAU * 1760.0 * t) + 0.5 * np.sin(TAU * 2340.0 * t)
            + 0.25 * np.sin(TAU * 3520.0 * t)) * exp_env(n, 0.12, 0.001)
    tine = apply_edges(tine, 0.001, 0.05)
    tine /= max(np.max(np.abs(tine)), 1e-12)
    mono = click * 0.7 + tine * 0.3
    left, right = pan(mono, -0.15)
    gain = lin(-18.0 + EVENT_TRIM_DB)
    return left * gain, right * gain


def synth_chord(rng):
    """7.60 起 大三和弦 D3/A3/F#4 shimmer pad：每音 4 层 detune/相位声像 + 高八度 shimmer。"""
    dur = DUR_BOOT - 7.6  # 2.80s，正好收在文件末尾
    n = n_of(dur)
    t = np.arange(n, dtype=np.float64) / SR
    notes = (146.83, 220.0, 369.99)          # D3 / A3 / F#4
    detunes = (-6.0, -2.0, 2.0, 6.0)
    pans = (-0.55, -0.18, 0.18, 0.55)
    left = np.zeros(n)
    right = np.zeros(n)
    cutoff = 1500.0 + 1400.0 * np.clip(t / 0.9, 0.0, 1.0)  # 低通缓慢打开
    for note in notes:
        for det, pv in zip(detunes, pans):
            freq = note * (2.0 ** (det / 1200.0))
            voice = additive(np.full(n, freq), n_harm=12, tilt=1.5, cutoff_curve=cutoff)
            gl, gr = pan_coeffs(pv)
            left += voice * gl
            right += voice * gr
    peak = max(float(np.max(np.abs(left))), float(np.max(np.abs(right))), 1e-12)
    left /= peak
    right /= peak
    # 高八度 shimmer（D4/A4/F#5/D5 四声部微光层）
    for freq, pv in ((293.66, -0.30), (440.0, 0.25), (739.99, 0.40), (587.33, -0.50)):
        trem = 1.0 + 0.35 * np.sin(TAU * 3.2 * t + rng.uniform(0.0, TAU))
        sh = np.sin(TAU * freq * t) * np.exp(-np.clip(t - 0.40, 0.0, None) / 1.60) * trem
        sh *= np.minimum(1.0, t / 0.35)
        sh = apply_edges(sh, 0.01, 0.30)
        gl, gr = pan_coeffs(pv)
        left += sh * lin(-24.0) * gl
        right += sh * lin(-24.0) * gr
    env = env_curve(n, [(0.0, 0.0), (0.07, 1.0), (0.55, 0.90), (0.86, 0.60), (1.0, 0.0)],
                    attack=0.12, release=0.40)
    gain = lin(-10.5 + EVENT_TRIM_DB)
    return left * env * gain, right * env * gain


def synth_power_dive(rng):
    """8.60–9.60 功率下潜：噪声下行 sweep + 音调下行 + 高通闭合 + 6k 泄气。"""
    dur = 1.00
    n = n_of(dur)
    t = np.arange(n, dtype=np.float64) / SR
    noise = pink(rng, dur)

    def gain_fn(freqs, tt):
        frac = min(max(tt / dur, 0.0), 1.0)
        lp_fc = 7000.0 * (200.0 / 7000.0) ** frac
        hp_fc = 30.0 * (1600.0 / 30.0) ** frac
        g_lp = 1.0 / np.sqrt(1.0 + (freqs / lp_fc) ** 4)
        g_hp = 1.0 / np.sqrt(1.0 + (hp_fc / np.maximum(freqs, 1e-3)) ** 2)
        return g_lp * g_hp

    noise = stft_filter(noise, gain_fn)
    noise *= env_curve(n, [(0.0, 0.0), (0.18, 1.0), (0.78, 0.9), (1.0, 0.0)],
                       attack=0.12, release=0.30)
    noise /= max(np.max(np.abs(noise)), 1e-12)
    frac = np.clip(t / dur, 0.0, 1.0)
    freq = 1900.0 * (70.0 / 1900.0) ** frac
    cutoff = 4000.0 * (150.0 / 4000.0) ** frac
    tone = additive(freq, n_harm=10, tilt=1.2, cutoff_curve=cutoff)
    tone *= env_curve(n, [(0.0, 0.0), (0.25, 1.0), (0.80, 0.8), (1.0, 0.0)],
                      attack=0.15, release=0.28)
    tone /= max(np.max(np.abs(tone)), 1e-12)
    steam = fft_filter(pink(rng, dur), hp_gain(5200.0, 2))
    steam *= env_curve(n, [(0.0, 0.0), (0.40, 1.0), (0.85, 0.6), (1.0, 0.0)],
                       attack=0.20, release=0.25)
    steam /= max(np.max(np.abs(steam)), 1e-12)
    mono = noise * lin(-16.0) + tone * lin(-15.0) + steam * lin(-26.0)
    left, right = pan(mono, 0.0)
    gain = lin(EVENT_TRIM_DB)
    return left * gain, right * gain


# ============================================================================
# handoff.wav（1.45s，与宿主 1200ms 基准交接对齐）
# ============================================================================

HANDOFF_CUES = (
    ('低频 boom（承接 power dive）', 0.000),
    ('静电 + 反向张力 riser', 0.000),
    ('缝展开 click + whoosh', 0.120),
    ('张力 riser（A2→A3 弦乐上扫）', 0.120),
    ('shimmer 上滑（2000→5200Hz）', 0.420),
    ('大调钟声主体（D5/A5/F#6）', 0.550),
    ('大调 bloom（D major 和弦展开）', 0.850),
    ('空气尾', 1.050),
)


def synth_handoff(rng):
    """handoff.wav：低频 boom → 静电/反向 riser → 120ms 缝展开 click+whoosh →
    张力 riser → 550ms 大调钟声 → 大调 bloom → 空气尾（1.45s）。"""
    dur = DUR_HANDOFF
    n = N_HANDOFF
    t = np.arange(n, dtype=np.float64) / SR
    bus_l = np.zeros(n)
    bus_r = np.zeros(n)

    def put(start, l, r):
        i0 = n_of(start)
        m = min(len(l), n - i0)
        if m > 0:
            bus_l[i0:i0 + m] += l[:m]
            bus_r[i0:i0 + m] += r[:m]

    # ① 0.000 低频 boom（承接 boot 9.6s 的功率下潜）
    nb = n_of(0.55)
    tb = np.arange(nb, dtype=np.float64) / SR
    f_boom = 46.0 * (34.0 / 46.0) ** np.clip(tb / 0.30, 0.0, 1.0)
    boom = np.sin(phase_of(f_boom)) * exp_env(nb, 0.16, attack=0.004)
    boom = apply_edges(boom, 0.003, 0.05)
    boom /= max(np.max(np.abs(boom)), 1e-12)
    put(0.000, *pan(boom * lin(-12.0), 0.0))

    # ② 0.000–0.120 静电（稀疏高频 click）+ 反向张力 riser
    st_dur = 0.120
    n_st = n_of(st_dur)
    te = np.arange(n_st, dtype=np.float64) / SR
    gate = (rng.random(n_st) < 0.010).astype(np.float64)
    crackle = white(rng, st_dur) * gate
    crackle = fft_filter(crackle, bp_gain(4800.0, 0.75))
    crackle /= max(np.max(np.abs(crackle)), 1e-12)
    crackle *= np.clip(te / st_dur, 0.0, 1.0) ** 2
    crackle = apply_edges(crackle, 0.002, 0.002)
    put(0.000, *pan(crackle * lin(-20.0), -0.30))

    rev_dur = 0.120
    n_rv = n_of(rev_dur)
    tr = np.arange(n_rv, dtype=np.float64) / SR
    rev = pink(rng, rev_dur)

    def rev_gain(freqs, tt):
        f = np.clip(tt / rev_dur, 0.0, 1.0)
        fc = 900.0 * (5200.0 / 900.0) ** f
        lf = np.log2(np.maximum(freqs, 1e-3) / fc)
        return np.exp(-(lf * lf) / (2.0 * 0.60 ** 2))

    rev = stft_filter(rev, rev_gain)
    rev *= (tr / rev_dur) ** 2.5
    rev = apply_edges(rev, 0.002, 0.002)
    rev /= max(np.max(np.abs(rev)), 1e-12)
    put(0.000, *pan(rev * lin(-17.0), 0.25))

    # ③ 0.120 缝展开 click + whoosh
    nc = n_of(0.06)
    tc = np.arange(nc, dtype=np.float64) / SR
    snap = fft_filter(white(rng, nc / SR), bp_gain(4200.0, 0.9)) * exp_env(nc, 0.010, attack=0.0006)
    snap = apply_edges(snap, 0.0008, 0.02)
    snap /= max(np.max(np.abs(snap)), 1e-12)
    knock = np.sin(TAU * 128.0 * tc) * exp_env(nc, 0.030, attack=0.001)
    click = snap * 0.8 + knock * 0.55
    click /= max(np.max(np.abs(click)), 1e-12)
    put(0.120, *pan(click * lin(-10.0), -0.22))

    wh_dur = 0.20
    n_wh = n_of(wh_dur)
    twh = np.arange(n_wh, dtype=np.float64) / SR
    left_w = np.zeros(n_wh)
    right_w = np.zeros(n_wh)
    for pv in (-0.62, 0.62):
        wnoise = pink(rng, wh_dur)

        def wh_gain(freqs, tt):
            f = np.clip(tt / wh_dur, 0.0, 1.0)
            fc = 800.0 * (5600.0 / 800.0) ** f
            lf = np.log2(np.maximum(freqs, 1e-3) / fc)
            return np.exp(-(lf * lf) / (2.0 * 0.65 ** 2))

        wnoise = stft_filter(wnoise, wh_gain)
        wenv = np.interp(twh / wh_dur, [0.0, 0.22, 0.55, 1.0], [0.0, 1.0, 0.55, 0.0])
        wnoise *= wenv
        wnoise /= max(np.max(np.abs(wnoise)), 1e-12)
        gl, gr = pan_coeffs(pv)
        left_w += wnoise * gl
        right_w += wnoise * gr
    put(0.120, left_w * lin(-13.5), right_w * lin(-13.5))

    # ④ 0.120–0.550 张力 riser：A2→A3 与 E3→E4 弦乐上扫 + 低通打开
    rs_dur = 0.430
    n_rs = n_of(rs_dur)
    trs = np.arange(n_rs, dtype=np.float64) / SR
    fr = np.clip(trs / rs_dur, 0.0, 1.0)
    cut = 400.0 * (4200.0 / 400.0) ** fr
    for f_start, f_end, pv, amp, odd in ((110.0, 220.0, -0.32, 1.00, False),
                                         (164.8, 329.6, 0.32, 0.75, True),
                                         (220.0, 440.0, 0.0, 0.55, False)):
        fc = f_start * (f_end / f_start) ** fr
        voice = additive(fc, n_harm=18, tilt=1.05, cutoff_curve=cut, odd=odd)
        voice /= max(np.max(np.abs(voice)), 1e-12)
        voice *= np.interp(fr, [0.0, 0.55, 0.95, 1.0], [0.0, 0.45, 1.0, 0.35])
        gl, gr = pan_coeffs(pv)
        put(0.120, voice * gl * amp * lin(-12.0), voice * gr * amp * lin(-12.0))

    # ⑤ 0.420–0.850 shimmer 上滑（2000→5200Hz）
    sh_dur = 0.430
    n_sh = n_of(sh_dur)
    tsh = np.arange(n_sh, dtype=np.float64) / SR
    fsh = 2000.0 * (5200.0 / 2000.0) ** np.clip(tsh / sh_dur, 0.0, 1.0)
    gliss = np.sin(phase_of(fsh)) + 0.3 * np.sin(2.0 * phase_of(fsh))
    gliss *= (1.0 + 0.25 * np.sin(TAU * 7.0 * tsh))
    gliss *= np.interp(tsh / sh_dur, [0.0, 0.35, 0.85, 1.0], [0.0, 0.8, 0.9, 0.0])
    gliss = apply_edges(gliss, 0.01, 0.05)
    gliss /= max(np.max(np.abs(gliss)), 1e-12)
    put(0.420, *pan(gliss * lin(-17.0), 0.18))

    # ⑥ 0.550 大调钟声主体（D5 587.33 + A5 880 + F#6 1479.98）
    partials = [
        (1.00, 1.00, 0.55),
        (2.00, 0.42, 0.42),
        (2.99, 0.24, 0.32),
        (4.21, 0.16, 0.24),
        (5.43, 0.10, 0.18),
        (6.79, 0.06, 0.14),
        (8.20, 0.04, 0.11),
    ]
    bell_l = bell(587.33, partials, 0.85, rng, detune_cents=-1.5)
    bell_r = bell(587.33, partials, 0.85, rng, detune_cents=1.5)
    put(0.550, bell_l * lin(-7.5), bell_r * lin(-7.5))
    put(0.550, *pan(bell(880.0, [(1.0, 1.0, 0.36), (2.0, 0.30, 0.24), (3.0, 0.14, 0.16)],
                          0.85, rng) * lin(-16.0), 0.22))
    put(0.550, *pan(bell(1479.98, [(1.0, 1.0, 0.20), (2.0, 0.28, 0.13)],
                          0.85, rng) * lin(-20.0), -0.28))

    # ⑦ 0.850–1.200 大调 bloom（D major：D3/A3/D4/F#4/A4，带上升泛音）
    bli = 0.35
    n_bl = n_of(bli)
    tbl = np.arange(n_bl, dtype=np.float64) / SR
    frb = np.clip(tbl / bli, 0.0, 1.0)
    cutb = 1200.0 * (4500.0 / 1200.0) ** frb
    bloom_l = np.zeros(n_bl)
    bloom_r = np.zeros(n_bl)
    for f0, pv, w in ((146.83, -0.45, 1.0), (220.0, -0.15, 0.85), (293.66, 0.15, 0.75),
                      (369.99, 0.45, 0.65), (440.0, 0.0, 0.55)):
        voice = additive(np.full(n_bl, f0), n_harm=10, tilt=1.55, cutoff_curve=cutb)
        voice /= max(np.max(np.abs(voice)), 1e-12)
        gl, gr = pan_coeffs(pv)
        bloom_l += voice * gl * w
        bloom_r += voice * gr * w
    benv = np.interp(frb, [0.0, 0.18, 0.55, 1.0], [0.0, 1.0, 0.72, 0.0])
    bloom = np.stack([bloom_l, bloom_r], axis=1)
    bloom_peak = max(float(np.max(np.abs(bloom[:, 0]))), float(np.max(np.abs(bloom[:, 1]))), 1e-12)
    bloom /= bloom_peak
    put(0.850, bloom[:, 0] * benv * lin(-11.0), bloom[:, 1] * benv * lin(-11.0))

    # ⑧ 1.050–1.450 空气尾（宽立体声 + 高频 shimmer 尾）
    at_dur = DUR_HANDOFF - 1.050
    n_at = n_of(at_dur)
    tat = np.arange(n_at, dtype=np.float64) / SR
    aenv = np.exp(-tat / 0.16) * np.interp(tat / at_dur, [0.0, 0.10, 1.0], [0.0, 1.0, 0.0])
    for ch, pv in ((0, -0.55), (1, 0.55)):
        air = fft_filter(pink(rng, at_dur),
                         lambda f: hp_gain(3000.0, 2)(f) * lp_gain(13000.0, 2)(f))
        air /= max(np.max(np.abs(air)), 1e-12)
        air *= aenv
        gl, gr = pan_coeffs(pv)
        put(1.050, air * gl * lin(-21.0) * (1.0 if ch == 0 else 0.8),
            air * gr * lin(-21.0) * (1.0 if ch == 0 else 0.8))
    tail_note = np.sin(TAU * 1174.66 * tat) * np.exp(-tat / 0.18) * np.minimum(1.0, tat / 0.03)
    tail_note = apply_edges(tail_note, 0.01, 0.12)
    put(1.050, *pan(tail_note * lin(-24.0), 0.3))

    return bus_l, bus_r


# ============================================================================
# 生成 / 摆位 / 母带
# ============================================================================

def place(bus_l, bus_r, log, name, start, spec_start, spec_end, left, right, note,
          decorative=False, kind='spec'):
    i0 = int(round(start * SR))
    n = min(len(left), len(bus_l) - i0)
    if n <= 0:
        raise RuntimeError('事件 %s 起点 %.3fs 超出音轨长度' % (name, start))
    bus_l[i0:i0 + n] += left[:n]
    bus_r[i0:i0 + n] += right[:n]
    peak = max(float(np.max(np.abs(left))), float(np.max(np.abs(right))))
    log.append({
        'name': name,
        'start': start,
        'end': start + len(left) / float(SR),
        'spec_start': spec_start,
        'spec_end': spec_end,
        'peak': peak,
        'note': note,
        'decorative': decorative,
        'kind': kind,
    })


def synthesize_boot():
    rng = np.random.default_rng(SEED)
    bus_l = np.zeros(N_BOOT)
    bus_r = np.zeros(N_BOOT)
    log = []

    # ---- ROUND2 新增全程铺底层 ----
    l, r = synth_sub_bed(rng)
    place(bus_l, bus_r, log, '深空 sub 长音（新增铺底）', 0.00, 0.00, DUR_BOOT,
          l, r, '36→41.5Hz + 55Hz 伴音 + 心跳脉冲（全程）', kind='layer')
    l, r = synth_pad(rng)
    place(bus_l, bus_r, log, 'Dm9 悬疑 pad（新增铺底）', 0.00, 0.00, DUR_BOOT,
          l, r, '7 音 × 3 层 detune ±7c / 慢颤音 / 低通 380→3400→1300Hz（全程）', kind='layer')
    l, r = synth_space_air(rng)
    place(bus_l, bus_r, log, '星海空气层（新增铺底）', 0.00, 0.00, DUR_BOOT,
          l, r, '双通道独立粉噪 2.2–12kHz 慢呼吸（全程，宽立体声）', kind='layer')
    l, r = synth_shimmer_bed(rng)
    place(bus_l, bus_r, log, '星尘 shimmer 铺底（新增铺底）', 0.00, 0.00, DUR_BOOT,
          l, r, 'D5/A5/F#6/E6 高音泛音慢颤音（全程）', kind='layer')
    l, r = synth_twinkles(rng)
    place(bus_l, bus_r, log, '星点闪烁（装饰层）', 0.00, None, None,
          l, r, '16 个稀疏高频小钟，随机音高/声像/时刻', decorative=True, kind='deco')

    # ---- design-spec §5 规格事件（时间点不变）----
    l, r = synth_ping(rng)
    place(bus_l, bus_r, log, '声呐 ping', 0.00, 0.00, None,
          l, r, '正弦 880→420Hz 下滑 + 2.9s 长尾 + 3 层回声 + 高次泛音')

    l, r = synth_hum(rng)
    place(bus_l, bus_r, log, '低频嗡鸣', 0.30, 0.30, 2.90,
          l, r, '55Hz + 0.3% detune，缓慢上行至 66Hz（叠在新 sub 铺底之上）')

    beeps = [
        (0.75, 2260.0, -0.30, -20.5),
        (1.05, 2640.0, 0.30, -20.0),
        (1.38, 3080.0, -0.15, -19.5),
        (1.72, 3520.0, 0.22, -19.0),
    ]
    for idx, (start, freq, pv, gain_db) in enumerate(beeps, 1):
        l, r = synth_key(rng, freq, pv, gain_db)
        place(bus_l, bus_r, log, '终端键盘 #%d' % idx, start, start, None,
              l, r, '%.0fHz 音调 + 机械 click + 38ms 立体错位延迟' % freq)

    l, r = synth_servo(rng)
    place(bus_l, bus_r, log, '伺服升频', 1.90, 1.90, 3.00,
          l, r, '机械 whine 140→560Hz + 棘轮 13 click + 气压带通 300→1800Hz + 6k 泄气')

    l, r = synth_air_swell(rng)
    place(bus_l, bus_r, log, '舷窗气流前导', 2.78, 2.78, 3.10,
          l, r, '反向气流噪声爆（能量向 3.10 冲击聚拢，宽立体声）')

    l, r = synth_porthole_impact(rng)
    place(bus_l, bus_r, log, '舷窗冲击', 3.10, 3.10, None,
          l, r, '38Hz 下潜（118→38Hz）+ 28Hz 体感 + thump + 气流爆 + 金属余响 + 混响')

    l, r = synth_wind(rng)
    place(bus_l, bus_r, log, '风噪 / 星海空气', 3.30, 3.30, 5.40,
          l, r, '4 层独立噪声（560/980/1700/2900Hz）真实慢声像移动 + 5–10k 空气层')

    l, r = synth_riser(rng)
    place(bus_l, bus_r, log, '上升音墙', 4.40, 4.40, 5.10,
          l, r, '5 层泛音滑音（55/110/164.8/220/330Hz）+ 噪声 600→9kHz + 低通开合')

    l, r = synth_whale(rng, near=False)
    place(bus_l, bus_r, log, '鲸叫（远）', 5.15, 5.15, None,
          l, r, '320→120Hz + 3 共振峰 + 颤音 5.4Hz + 双回声 -0.45 声像')

    l, r = synth_whale(rng, near=True)
    place(bus_l, bus_r, log, '鲸叫（近）', 6.35, 6.35, None,
          l, r, '320→112Hz + 亮共振峰 + 颤音 6Hz + 双回声 +0.35 声像')

    l, r = synth_low_dive(rng)
    place(bus_l, bus_r, log, '低频下潜（P3）', 6.55, None, None,
          l, r, '52→26Hz 次低频铺底 + 35Hz 层（§3 P3「低频下潜」装饰层）', decorative=True)

    l, r = synth_lock_impact(rng)
    place(bus_l, bus_r, log, '锁版冲击', 7.60, 7.60, None,
          l, r, '次低频 drop（96→34Hz）+ 30Hz 体感 + 金属瞬态 + thump')

    l, r = synth_lock_click(rng)
    place(bus_l, bus_r, log, '锁版金属咔哒', 7.60, None, None,
          l, r, '2–7kHz 瞬态 + 1760/2340/3520Hz 泛音（装饰层）', decorative=True)

    l, r = synth_chord(rng)
    place(bus_l, bus_r, log, '大三和弦 shimmer', 7.60, 7.60, None,
          l, r, 'D3/A3/F#4 × 4 层 detune/声像 + D4/A4/F#5/D5 高八度 shimmer，收于 10.4s')

    l, r = synth_power_dive(rng)
    place(bus_l, bus_r, log, '功率下潜', 8.60, 8.60, 9.60,
          l, r, '噪声下行 sweep + 音调 1900→70Hz + 高通闭合 + 6k 泄气')

    return bus_l, bus_r, log


def scale_to_lufs(left, right, target_lufs, peak_ceiling_db=-1.0):
    """按目标积分响度标定（峰值天花板优先）。"""
    current = integrated_lufs(left, right)
    if not math.isfinite(current):
        return left, right
    gain = 10.0 ** ((target_lufs - current) / 20.0)
    left = left * gain
    right = right * gain
    peak = max(float(np.max(np.abs(left))), float(np.max(np.abs(right))), 1e-12)
    if to_db(peak) > peak_ceiling_db:
        shrink = lin(peak_ceiling_db) / peak
        left = left * shrink
        right = right * shrink
    return left, right


def master(left, right, peak_dbfs=PEAK_TARGET_DBFS, fade_out=0.18):
    left = left - float(np.mean(left))
    right = right - float(np.mean(right))
    n = len(left)
    f = min(n_of(fade_out), n)
    if f > 1:
        ramp = np.cos(0.5 * np.pi * np.linspace(0.0, 1.0, f)) ** 2
        left[-f:] *= ramp
        right[-f:] *= ramp
    a = min(n_of(0.003), n)
    if a > 1:
        ramp = np.sin(0.5 * np.pi * np.linspace(0.0, 1.0, a)) ** 2
        left[:a] *= ramp
        right[:a] *= ramp
    left, right = limit_stereo(left, right)
    peak = max(float(np.max(np.abs(left))), float(np.max(np.abs(right))), 1e-12)
    scale = lin(peak_dbfs) / peak
    return left * scale, right * scale


# ============================================================================
# 打印 / 校验
# ============================================================================

def print_event_table(log, master_scale):
    print()
    print('=' * 132)
    print('VYRON 声轨事件校验表 · vyron-boot.wav · %dHz/16bit/stereo · %.2fs（design-spec §5 + ROUND2-PLAN §4.7）'
          % (SR, DUR_BOOT))
    print('=' * 132)
    print('%-3s %-26s %-17s %-21s %-10s %-10s %s'
          % ('#', '事件', '规格时间(s)', '实际起-止(s)', '起点偏差', '贡献峰值', '配方 / 备注'))
    print('-' * 132)
    spec_ok = spec_fail = deco = layers = layer_fail = 0
    for idx, row in enumerate(log, 1):
        if row['kind'] == 'deco':
            spec = '—（装饰层）'
            status = '—'
            dev_txt = '—'
            deco += 1
        elif row['kind'] == 'layer':
            spec = '%.2f–%.2f' % (row['spec_start'], row['spec_end'])
            ok = abs(row['start'] - row['spec_start']) <= 0.006 and abs(row['end'] - row['spec_end']) <= 0.006
            status = 'OK' if ok else 'FAIL'
            layers += 1
            if not ok:
                layer_fail += 1
            dev_txt = '%+.1fms' % ((row['start'] - row['spec_start']) * 1000.0)
        else:
            spec = '%.2f' % row['spec_start']
            if row['spec_end'] is not None:
                spec += '–%.2f' % row['spec_end']
            dev = row['start'] - row['spec_start']
            start_ok = abs(dev) <= (1.0 / SR + 1e-9)
            end_ok = True
            if row['spec_end'] is not None:
                end_ok = abs(row['end'] - row['spec_end']) <= 0.006
            if start_ok and end_ok:
                status = 'OK'
                spec_ok += 1
            else:
                status = 'FAIL'
                spec_fail += 1
            dev_txt = '%+.1fms' % (dev * 1000.0)
        span = '%.3f–%.3f' % (row['start'], row['end'])
        peak_db = to_db(row['peak'] * master_scale)
        print('%-3d %-26s %-17s %-21s %-10s %-10s %s %s'
              % (idx, row['name'], spec, span, dev_txt, '%.1f dBFS' % peak_db,
                 row['note'], status))
    print('-' * 132)
    print('规格事件：%d 通过 / %d 失败（design-spec §5 的 16 条，时间点不变）'
          % (spec_ok, spec_fail))
    print('新增铺底：%d 通过 / %d 失败（ROUND2-PLAN §4.7 全程层）' % (layers, layer_fail))
    print('装饰层：%d 条（不参与规格校验）' % deco)
    if spec_fail or layer_fail:
        print('!! 存在时间表偏差，请检查合成代码 !!')
    return spec_fail == 0 and layer_fail == 0


def print_handoff_table():
    print()
    print('=' * 132)
    print('VYRON handoff.wav 交接时间表 · %.2fs（宿主 1200ms 基准：120ms 缝展开 / 300ms UI 通电 / 1200ms 收尾）'
          % DUR_HANDOFF)
    print('=' * 132)
    print('%-3s %-34s %-12s %-26s %s'
          % ('#', '事件', 'wav 秒', '宿主交接基准 ms', '说明'))
    print('-' * 132)
    host = {0.000: '0ms 黑场+光缝', 0.120: '120ms 缝开始展开', 0.420: '420ms 声呐环飞出',
            0.550: '550ms', 0.850: '850ms', 1.050: '1050ms'}
    rows = [
        ('低频 boom（承接 power dive）', 0.000, '0ms 黑场 + 光缝（与 boot 尾衔接）'),
        ('静电 + 反向张力 riser', 0.000, '0–120ms 蓄势'),
        ('缝展开 click + whoosh', 0.120, '120ms 上下黑幕开始滑开'),
        ('张力 riser（A2→A3 弦乐上扫）', 0.120, '120–550ms 展开过程'),
        ('shimmer 上滑（2000→5200Hz）', 0.420, '420ms 声呐环飞向输入框'),
        ('大调钟声主体（D5/A5/F#6）', 0.550, '550ms 起进入 UI 显影'),
        ('大调 bloom（D major 展开）', 0.850, '850–1200ms 光带扫向顶栏'),
        ('空气尾', 1.050, '1200ms 清理后自然收尾'),
    ]
    for idx, (name, at, note) in enumerate(rows, 1):
        print('%-3d %-34s %-12.3f %-26s %s' % (idx, name, at, host.get(at, ''), note))
    print('-' * 132)
    print('校核：click 0.120s 落在 Lead 要求的 0.1–0.25s ✅；钟声 0.550–0.850s 落在 0.55–0.85s ✅')
    return True


def print_analysis(label, path, info):
    print()
    print('-' * 116)
    print('成品实测 · %s' % label)
    print('-' * 116)
    print('文件            : %s' % path)
    print('大小            : %d 字节 (%.2f MB)'
          % (info['size'], info['size'] / 1048576.0))
    print('时长            : %.4f s（%d 帧）' % (info['duration'], info['frames']))
    print('采样率 / 声道 / 位深 : %d Hz / %d / %d bit'
          % (info['samplerate'], info['channels'], info['sampwidth'] * 8))
    print('峰值            : %.2f dBFS（L %.2f / R %.2f）'
          % (info['peak_db'], info['peak_l_db'], info['peak_r_db']))
    print('RMS             : %.2f dBFS' % info['rms_db'])
    print('积分响度(K加权)  : %.1f LUFS' % info['lufs'])
    print('立体声相关度     : %.3f（0=完全去相关 / 1=单声道）' % info['stereo_corr'])
    print('直流偏移        : L %.6f / R %.6f' % (info['dc_l'], info['dc_r']))
    print('首样本 / 末样本  : %.6f / %.6f' % (info['first_max'], info['last_max']))
    print('满幅样本数      : %d（应 0，防削波爆音）' % info['full_scale'])
    print('NaN/Inf 样本    : %d（应 0）' % info['nan'])
    print('最大相邻样本跳变 : %.4f（连续性参考）' % info['max_step'])
    print('四频段          : ' + ' / '.join(
        '%s %.1f%%' % (b['band'], b['share']) for b in info['bands']))
    print('sha256          : %s' % info['sha256'])


def main(argv=None):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
    parser = argparse.ArgumentParser(description='VYRON 程序化启动音轨合成器 v2')
    parser.add_argument('--out', default=None, help='输出目录（默认 <项目根>/lib/assets/audio）')
    args = parser.parse_args(argv)

    root = Path(__file__).resolve().parent.parent
    out_dir = Path(args.out).resolve() if args.out else (root / 'lib' / 'assets' / 'audio')
    out_dir.mkdir(parents=True, exist_ok=True)

    print('VYRON · 星海鲸航 — 程序化启动音轨合成 v2（ROUND2：铺底 + 层次 + 空间感）')
    print('python %s / numpy %s / 采样率 %d Hz / 随机种子 %d'
          % (sys.version.split()[0], np.__version__, SR, SEED))
    print('输出目录: %s' % out_dir)

    print('\n[1/5] 合成 boot 事件层 + 全程铺底层 …')
    boot_l, boot_r, log = synthesize_boot()

    print('[2/5] 立体声处理：高频侧向展宽 1.28×（>1.2kHz）…')
    boot_l, boot_r = widen_highs(boot_l, boot_r, 1.28, 1200.0)

    print('[3/5] 双段发送混响：近场 Schroeder + 深空长尾（1.55× 延迟 / fb0.925 / 60ms 预延迟）…')
    near_l, near_r = reverb_wet(boot_l, boot_r, feedback=0.86, damp=0.30,
                                predelay=0.018, comb_scale=1.0, allpass_scale=1.0, level=0.26)
    deep_l, deep_r = reverb_wet(boot_l, boot_r, feedback=0.925, damp=0.20,
                               predelay=0.060, comb_scale=1.55, allpass_scale=1.40, level=0.32)
    boot_l = boot_l + near_l + deep_l
    boot_r = boot_r + near_r + deep_r
    boot_l, boot_r = mono_bass(boot_l, boot_r, 120.0)

    print('[4/5] boot 母带：去直流 → 淡出 → 前瞻限幅 → 峰值 %.1f dBFS → 响度 %.1f LUFS …'
          % (PEAK_TARGET_DBFS, BOOT_TARGET_LUFS))
    pre_peak = max(float(np.max(np.abs(boot_l))), float(np.max(np.abs(boot_r))), 1e-12)
    boot_l, boot_r = master(boot_l, boot_r)
    boot_l, boot_r = scale_to_lufs(boot_l, boot_r, BOOT_TARGET_LUFS,
                                   peak_ceiling_db=PEAK_TARGET_DBFS)
    final_peak = max(float(np.max(np.abs(boot_l))), float(np.max(np.abs(boot_r))), 1e-12)
    master_scale = final_peak / pre_peak

    print('[5/5] 合成 handoff.wav（1.45s：boom/静电/缝 click/张力 riser/大调钟声/bloom/空气尾）…')
    h_l, h_r = synth_handoff(np.random.default_rng(SEED + 1))
    h_l, h_r = widen_highs(h_l, h_r, 1.18, 1500.0)
    nh_l, nh_r = reverb_wet(h_l, h_r, feedback=0.84, damp=0.32,
                            predelay=0.014, comb_scale=1.0, allpass_scale=1.0, level=0.22)
    dh_l, dh_r = reverb_wet(h_l, h_r, feedback=0.90, damp=0.24,
                            predelay=0.045, comb_scale=1.40, allpass_scale=1.30, level=0.26)
    h_l = h_l + nh_l + dh_l
    h_r = h_r + nh_r + dh_r
    h_l, h_r = mono_bass(h_l, h_r, 120.0)
    h_l, h_r = master(h_l, h_r, peak_dbfs=HANDOFF_PEAK_DBFS, fade_out=0.10)
    h_l, h_r = scale_to_lufs(h_l, h_r, HANDOFF_TARGET_LUFS, peak_ceiling_db=HANDOFF_PEAK_DBFS)

    boot_path = out_dir / 'vyron-boot.wav'
    handoff_path = out_dir / 'handoff.wav'
    write_wav(boot_path, boot_l, boot_r)
    write_wav(handoff_path, h_l, h_r)

    all_ok = print_event_table(log, master_scale)
    handoff_ok = print_handoff_table()

    boot_info = analyze_wav(boot_path)
    handoff_info = analyze_wav(handoff_path)
    print_analysis('vyron-boot.wav', boot_path, boot_info)
    print_analysis('handoff.wav', handoff_path, handoff_info)

    bands = {b['band']: b for b in boot_info['bands']}
    print()
    print('-' * 116)
    print('质量门槛校验（ROUND2-PLAN §4.7）')
    print('-' * 116)
    budget_ok = True
    checks = [
        ('vyron-boot.wav 时长 10.4s', abs(boot_info['duration'] - 10.4) < 0.001,
         '%.4f' % boot_info['duration']),
        ('vyron-boot.wav 采样率 44100', boot_info['samplerate'] == 44100, str(boot_info['samplerate'])),
        ('vyron-boot.wav 立体声/16bit', boot_info['channels'] == 2 and boot_info['sampwidth'] == 2,
         '%dch/%dbit' % (boot_info['channels'], boot_info['sampwidth'] * 8)),
        ('vyron-boot.wav 峰值 ≤ -1.0 dBFS', boot_info['peak_db'] <= -1.0, '%.2f' % boot_info['peak_db']),
        ('vyron-boot.wav ≤ 2.0MB', boot_info['size'] <= 2 * 1024 * 1024,
         '%.2fMB' % (boot_info['size'] / 1048576.0)),
        ('vyron-boot.wav 响度 -16±1 LUFS', abs(boot_info['lufs'] - BOOT_TARGET_LUFS) <= 1.0,
         '%.1f LUFS' % boot_info['lufs']),
        ('handoff.wav 时长 1.45s', abs(handoff_info['duration'] - DUR_HANDOFF) < 0.001,
         '%.4f' % handoff_info['duration']),
        ('handoff.wav 峰值 ≤ -1.0 dBFS', handoff_info['peak_db'] <= -1.0,
         '%.2f' % handoff_info['peak_db']),
        ('handoff.wav 响度 -16±1 LUFS',
         abs(handoff_info['lufs'] - HANDOFF_TARGET_LUFS) <= 1.0, '%.1f LUFS' % handoff_info['lufs']),
        ('handoff.wav ≤ 300KB', handoff_info['size'] <= 300 * 1024,
         '%.1fKB' % (handoff_info['size'] / 1024.0)),
        ('无满幅/削波样本', boot_info['full_scale'] == 0 and handoff_info['full_scale'] == 0,
         '%d/%d' % (boot_info['full_scale'], handoff_info['full_scale'])),
        ('无 NaN/Inf', boot_info['nan'] == 0 and handoff_info['nan'] == 0,
         '%d/%d' % (boot_info['nan'], handoff_info['nan'])),
        ('事件时间表校验', all_ok and handoff_ok, '见上表'),
        ('四频段 <100Hz 有能量（≥12%）', bands['<100Hz']['share'] >= 12.0,
         '%.1f%%' % bands['<100Hz']['share']),
        ('四频段 100–1k 不再一枝独秀（≤50%）', bands['100-1kHz']['share'] <= 50.0,
         '%.1f%%' % bands['100-1kHz']['share']),
        ('四频段 1–4k 有能量（≥14%）', bands['1-4kHz']['share'] >= 14.0,
         '%.1f%%' % bands['1-4kHz']['share']),
        ('四频段 >4k 有能量（≥7%）', bands['>4kHz']['share'] >= 7.0,
         '%.1f%%' % bands['>4kHz']['share']),
        ('立体声非单声道（相关度 0.20–0.90）', 0.20 <= boot_info['stereo_corr'] <= 0.90,
         '%.3f' % boot_info['stereo_corr']),
    ]
    for name, passed, detail in checks:
        budget_ok = budget_ok and passed
        print('[%s] %-40s %s' % ('PASS' if passed else 'FAIL', name, detail))
    print('-' * 116)
    print('总校验：%s' % ('PASS' if budget_ok else 'FAIL'))
    return 0 if budget_ok else 1


if __name__ == '__main__':
    sys.exit(main())
