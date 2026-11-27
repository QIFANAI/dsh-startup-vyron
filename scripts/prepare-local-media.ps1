#requires -Version 5.1
<#
.SYNOPSIS
  兼容保留：完整素材随仓库发布（v0.2.2 起）后，本脚本不再必需。

.DESCRIPTION
  自 dsh-startup-vyron v0.2.2 起，以下 4 个第三方素材随仓库与官方 Release 完整发布，
  正常克隆即可获得完整观感，无需运行本脚本：
    - lib/assets/hero-4k.webp   (3840x2160, 554,658 B)
    - lib/assets/hero-2k.webp   (1920x1080, 267,042 B)
    - lib/assets/poster.webp    (1280x720,  138,676 B)
    - lib/assets/fonts/Anurati-Regular.otf  (8,176 B)

  本脚本仅为兼容保留：当你使用的分发包裁掉了这 4 个文件、且你本机合法持有原素材时，
  可从本机素材目录逐文件 SHA256 校验后复制进仓库，并生成 `lib/assets/manifest.local.json`
  （仅本地使用，Git 已忽略）。素材权利归各自权利人，代码 MIT 不覆盖素材；再分发前请自行确认授权。

.PARAMETER SourceDir
  含上述 4 个文件的目录（文件名需一致）。

.PARAMETER Force
  已存在同名文件时覆盖。

.PARAMETER SkipManifest
  跳过 manifest.local.json 生成（之后可手动运行 python scripts/build-manifest.py --local）。

.EXAMPLE
  pwsh -File scripts/prepare-local-media.ps1 -SourceDir "<你的素材目录>"
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$SourceDir,
  [switch]$Force,
  [switch]$SkipManifest
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
$Assets = Join-Path $RepoRoot 'lib\assets'
$Fonts = Join-Path $Assets 'fonts'

$Expected = @(
  @{ Rel = 'hero-4k.webp'; Size = 554658; Sha256 = '86c51c85f44599919c2cf84d3a4f23d675a11e2228e46d222c2eeb5a6491cb6e'; Dest = (Join-Path $Assets 'hero-4k.webp') },
  @{ Rel = 'hero-2k.webp'; Size = 267042; Sha256 = '5f06b1533dbc0048b8a89bede6c79dec4a4a68f98ed654f8b5349aa34bc2fef6'; Dest = (Join-Path $Assets 'hero-2k.webp') },
  @{ Rel = 'poster.webp'; Size = 138676; Sha256 = '4e6c2104d72e128d81a398d8fed1372b8a0f43c4f492b4c0cb4ac13d06424e4a'; Dest = (Join-Path $Assets 'poster.webp') },
  @{ Rel = 'Anurati-Regular.otf'; Size = 8176; Sha256 = '9b6c41cb089ea9f682f177d2a5dc21e1828c39e6f20b9a4c11d999de912e00c3'; Dest = (Join-Path $Fonts 'Anurati-Regular.otf') }
)

if (-not (Test-Path -LiteralPath $SourceDir -PathType Container)) {
  throw "SourceDir 不存在或不是目录：$SourceDir"
}

Write-Host "仓库：$RepoRoot"
Write-Host "素材源：$SourceDir"
Write-Host ''

$summary = @()
foreach ($item in $Expected) {
  $src = Join-Path $SourceDir $item.Rel
  if (-not (Test-Path -LiteralPath $src -PathType Leaf)) {
    throw "缺少源文件：$src"
  }
  $size = (Get-Item -LiteralPath $src).Length
  if ($size -ne $item.Size) {
    throw "$($item.Rel) 字节数不符：$size != $($item.Size)（拒绝写入）"
  }
  $hash = (Get-FileHash -LiteralPath $src -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($hash -ne $item.Sha256) {
    throw "$($item.Rel) SHA256 不符：$hash != $($item.Sha256)（拒绝写入）"
  }
  if ((Test-Path -LiteralPath $item.Dest) -and -not $Force) {
    throw "目标已存在：$($item.Dest)（加 -Force 覆盖）"
  }
  Copy-Item -LiteralPath $src -Destination $item.Dest -Force
  $summary += [pscustomobject]@{ File = $item.Rel; Bytes = $size; SHA256 = $hash; Dest = $item.Dest.Substring($RepoRoot.Length + 1) }
  Write-Host "  OK  $($item.Rel)  $size B  $hash"
}

Write-Host ''
Write-Host '已从本机素材目录恢复 4 个文件（完整开源版正常克隆无需此步）：'
$summary | Format-Table -AutoSize

if (-not $SkipManifest) {
  $py = Get-Command python -ErrorAction SilentlyContinue
  if ($py) {
    Write-Host '生成 lib/assets/manifest.local.json（仅本地，Git 已忽略）...'
    Push-Location $RepoRoot
    try { & python 'scripts/build-manifest.py' '--local' } finally { Pop-Location }
  } else {
    Write-Warning '未找到 python，跳过 manifest.local.json；可稍后手动运行：python scripts/build-manifest.py --local'
  }
}

Write-Host ''
Write-Host '下一步：'
Write-Host '  npm test                       # 19 个资产（15 个自有/OFL + 4 个第三方）全部纳入校验'
Write-Host '  npm run check:public           # 公开门禁：断言 4 个素材随仓库发布且 manifest 覆盖'
Write-Host ''
Write-Warning '本脚本为兼容保留：素材自 v0.2.2 起随仓库与 Release 发布；权利归各自权利人，再分发前请自行确认授权。'
