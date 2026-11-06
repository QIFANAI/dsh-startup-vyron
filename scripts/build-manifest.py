"""Generate lib/assets/manifest.json: size / sha256 / dimensions / duration for every
shipped asset. Pure stdlib (RIFF/WebP header parsing) so it runs on the bundled python
without Pillow being required.

Usage:
  python scripts/build-manifest.py            # write public lib/assets/manifest.json
  python scripts/build-manifest.py --check    # verify public manifest, exit 1 on drift
  python scripts/build-manifest.py --local    # write lib/assets/manifest.local.json (local-only,
                                              #   includes the restored 4 third-party assets)
"""
import hashlib
import json
import os
import struct
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSET_ROOT = os.path.join(ROOT, 'lib', 'assets')
PUBLIC_OUT = os.path.join(ASSET_ROOT, 'manifest.json')
LOCAL_OUT = os.path.join(ASSET_ROOT, 'manifest.local.json')
EXTRA = os.path.join(ROOT, '_build', 'assets-b.json')
SKIP_NAMES = ('manifest.json', 'manifest.local.json')


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def webp_size(path):
    """RIFF....WEBP; VP8 / VP8L / VP8X chunk carries dimensions."""
    with open(path, 'rb') as fh:
        head = fh.read(32)
    if head[:4] != b'RIFF' or head[8:12] != b'WEBP':
        return None
    fourcc = head[12:16]
    if fourcc == b'VP8X':
        width = 1 + int.from_bytes(head[24:27], 'little')
        height = 1 + int.from_bytes(head[27:30], 'little')
        return [width, height]
    if fourcc == b'VP8 ':
        width = int.from_bytes(head[26:28], 'little') & 0x3FFF
        height = int.from_bytes(head[28:30], 'little') & 0x3FFF
        return [width, height]
    if fourcc == b'VP8L':
        b0, b1, b2, b3 = head[21], head[22], head[23], head[24]
        width = 1 + (((b1 & 0x3F) << 8) | b0)
        height = 1 + (((b3 & 0x0F) << 10) | (b2 << 2) | ((b1 & 0xC0) >> 6))
        return [width, height]
    return None


def wav_info(path):
    with open(path, 'rb') as fh:
        head = fh.read(44)
    if head[:4] != b'RIFF' or head[8:12] != b'WAVE':
        return None
    channels = struct.unpack('<H', head[22:24])[0]
    rate = struct.unpack('<I', head[24:28])[0]
    bits = struct.unpack('<H', head[34:36])[0]
    # walk chunks for data size (handles non-canonical headers)
    with open(path, 'rb') as fh:
        fh.seek(12)
        data_size = 0
        while True:
            chunk = fh.read(8)
            if len(chunk) < 8:
                break
            cid, size = chunk[:4], struct.unpack('<I', chunk[4:8])[0]
            if cid == b'data':
                data_size = size
                break
            fh.seek(size + (size & 1), os.SEEK_CUR)
    seconds = round(data_size / max(1, rate * channels * (bits // 8)), 3)
    return {'channels': channels, 'sampleRate': rate, 'bits': bits, 'seconds': seconds}


def kind(path):
    ext = os.path.splitext(path)[1].lower()
    return {
        '.webp': 'image', '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.gif': 'image',
        '.svg': 'vector', '.wav': 'audio', '.mp3': 'audio', '.otf': 'font', '.ttf': 'font',
        '.woff': 'font', '.woff2': 'font', '.json': 'json',
    }.get(ext, 'other')


def collect():
    files = []
    for dirpath, dirnames, filenames in os.walk(ASSET_ROOT):
        dirnames.sort()
        for name in sorted(filenames):
            full = os.path.join(dirpath, name)
            rel = os.path.relpath(full, ASSET_ROOT).replace(os.sep, '/')
            if rel in SKIP_NAMES or rel.endswith('.tmp'):
                continue
            entry = {
                'path': rel,
                'kind': kind(rel),
                'bytes': os.path.getsize(full),
                'sha256': sha256_file(full),
            }
            if entry['kind'] == 'image' and rel.endswith('.webp'):
                size = webp_size(full)
                if size:
                    entry['width'], entry['height'] = size
            if entry['kind'] == 'audio' and rel.endswith('.wav'):
                info = wav_info(full)
                if info:
                    entry.update(info)
            files.append(entry)
    return files


def main():
    check = '--check' in sys.argv
    local = '--local' in sys.argv
    out = LOCAL_OUT if local else PUBLIC_OUT
    files = collect()
    total = sum(f['bytes'] for f in files)
    doc = {
        'name': 'dsh-startup-vyron',
        'generatedAt': time.strftime('%Y-%m-%dT%H:%M:%S%z'),
        'root': 'lib/assets',
        'fileCount': len(files),
        'totalBytes': total,
        'files': files,
    }
    if os.path.exists(EXTRA):
        try:
            extra = json.load(open(EXTRA, encoding='utf-8'))
            if isinstance(extra, dict):
                doc['materialB'] = extra
        except Exception as err:  # noqa: BLE001 - report, do not fail the build
            print('[manifest] assets-b.json unreadable: %s' % err)
    text = json.dumps(doc, ensure_ascii=False, indent=2) + '\n'
    if check:
        previous = open(out, encoding='utf-8').read() if os.path.exists(out) else ''
        if previous != text:
            # generatedAt 每次运行都会变；比较时忽略该字段
            try:
                prev_doc = json.loads(previous)
                cur_doc = json.loads(text)
                prev_doc.pop('generatedAt', None)
                cur_doc.pop('generatedAt', None)
                same = prev_doc == cur_doc
            except Exception:
                same = False
            if not same:
                print('[manifest] DRIFT: %s is stale, rerun without --check' % os.path.relpath(out, ROOT))
                return 1
        print('[manifest] OK %d files, %.2f MB' % (len(files), total / 1048576))
        return 0
    with open(out, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(text)
    print('[manifest] wrote %s: %d files, %.2f MB' % (os.path.relpath(out, ROOT), len(files), total / 1048576))
    for f in files:
        detail = ''
        if 'width' in f:
            detail = ' %dx%d' % (f['width'], f['height'])
        if 'seconds' in f:
            detail = ' %.2fs %dHz %dch' % (f['seconds'], f['sampleRate'], f['channels'])
        print('  %-46s %9d B%s' % (f['path'], f['bytes'], detail))
    return 0


if __name__ == '__main__':
    sys.exit(main())
