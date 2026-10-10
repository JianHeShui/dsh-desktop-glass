<#
.SYNOPSIS
  给 DSH 桌面版主窗口启用 Windows 毛玻璃材质（acrylic / mica）。

.DESCRIPTION
  DSH 桌面版 0.2.0 之后移除了主窗口的 backgroundMaterial / backgroundColor，
  主窗口变成不透明，Windows 材质透不出来。本脚本针对**当前安装版本**现场生成
  补丁版 app.asar 并替换。

  为什么必须改 app.asar：窗口材质是 Electron 主进程的 BrowserWindow 构造参数，
  运行在 app.asar 里的 main.js 中，任何客户端插件都无法设置它 —— 插件只能让
  页面变透明，改不了窗口本身是否透出桌面。

  安全保证：先全部校验、后替换。
    · 生成阶段任何不匹配（锚点不唯一、找不到配平注释、大小对不上）→ 直接报错退出；
    · 补丁后的 main.js 会先过一遍 node --check 语法校验；
    · 校验全部通过后才覆盖已安装文件，覆盖后还会复核一次。

  等字节修补：补丁保持 app.asar 每个条目的 offset / size 不变，只更新 main.js
  自身的 integrity 哈希，因此不会破坏 asar 结构。

.PARAMETER AppRoot
  DSH 桌面版安装目录（含 "DeepSeek Harness.exe"）。缺省时自动探测。

.PARAMETER NodePath
  node.exe 路径。缺省时依次尝试 PATH 与 DSH 自带运行时。

.PARAMETER Material
  窗口材质。acrylic（默认，最透）或 mica（更含蓄，失焦降级不明显）。

.PARAMETER DryRun
  只做检测与生成，不备份、不替换、不重启，也不等待 DSH 退出。
  用于先确认当前版本能否打补丁。

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\apply-acrylic.ps1
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\apply-acrylic.ps1 -Material mica
#>
[CmdletBinding()]
param(
    [string]$AppRoot,
    [string]$NodePath,
    [ValidateSet('acrylic', 'mica', 'tabbed', 'auto', 'none')]
    [string]$Material = 'acrylic',

    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$repoRoot    = Split-Path $PSScriptRoot -Parent
$genScript   = Join-Path $PSScriptRoot 'make-acrylic.mjs'
$stateScript = Join-Path $PSScriptRoot 'asar-state.mjs'
$backupDir   = Join-Path $repoRoot 'backups'
$buildDir    = Join-Path $repoRoot 'build'
$exeName     = 'DeepSeek Harness.exe'
$procName    = 'DeepSeek Harness'

function Wait-Close {
    # 非交互式调用（管道 / CI）下不阻塞
    try {
        if (-not [Console]::IsInputRedirected) { Read-Host '按回车键关闭' }
    } catch {
        Read-Host '按回车键关闭'
    }
}

function Stop-Script([string]$message) {
    Write-Host ''
    Write-Host ("错误: {0}" -f $message) -ForegroundColor Red
    Wait-Close
    exit 1
}

function Resolve-NodePath([string]$explicit) {
    if ($explicit) {
        if (Test-Path $explicit) { return (Resolve-Path $explicit).Path }
        throw "指定的 node 不存在: $explicit"
    }
    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }

    $runtimeRoot = Join-Path $env:USERPROFILE '.dsh\dsh-runtimes'
    if (Test-Path $runtimeRoot) {
        $hit = Get-ChildItem $runtimeRoot -Filter 'node.exe' -Recurse -ErrorAction SilentlyContinue |
            Where-Object { $_.FullName -match 'dependencies\\node\\bin\\node\.exe$' } |
            Select-Object -First 1
        if ($hit) { return $hit.FullName }
    }
    throw '找不到 node。请安装 Node.js，或用 -NodePath 指定路径。'
}

function Resolve-AppRoot([string]$explicit) {
    if ($explicit) {
        $full = (Resolve-Path $explicit).Path
        if (Test-Path (Join-Path $full $exeName)) { return $full }
        throw "指定目录下找不到 $exeName : $full"
    }

    # 1) 正在运行的进程（最可靠）
    $proc = Get-Process -Name $procName -ErrorAction SilentlyContinue |
        Where-Object { $_.Path } | Select-Object -First 1
    if ($proc) { return (Split-Path $proc.Path -Parent) }

    # 2) 卸载登记项
    $regRoots = @(
        'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
    )
    foreach ($r in $regRoots) {
        $entries = Get-ItemProperty $r -ErrorAction SilentlyContinue |
            Where-Object { $_.DisplayName -like '*DeepSeek Harness*' -or $_.DisplayName -like '*DSH desktop*' }
        foreach ($e in $entries) {
            if ($e.InstallLocation -and (Test-Path (Join-Path $e.InstallLocation $exeName))) {
                return $e.InstallLocation
            }
        }
    }

    # 3) 常见安装位置
    $guesses = @(
        (Join-Path $env:LOCALAPPDATA 'Programs\DSH desktop'),
        (Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness'),
        (Join-Path $env:LOCALAPPDATA 'DSH desktop'),
        (Join-Path $env:LOCALAPPDATA 'DeepSeek Harness'),
        (Join-Path $env:ProgramFiles 'DSH desktop'),
        (Join-Path $env:ProgramFiles 'DeepSeek Harness'),
        (Join-Path ${env:ProgramFiles(x86)} 'DSH desktop')
    )
    foreach ($g in $guesses) {
        if ($g -and (Test-Path (Join-Path $g $exeName))) { return $g }
    }

    throw "探测不到 DSH 桌面版安装目录，请用 -AppRoot 指定（需含 $exeName）。"
}

Write-Host '============================================================' -ForegroundColor Cyan
Write-Host ' DSH 桌面版 - 启用 Windows 毛玻璃材质' -ForegroundColor Cyan
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host ''

foreach ($f in @($genScript, $stateScript)) {
    if (-not (Test-Path $f)) { Stop-Script "缺少脚本文件: $f" }
}

$node = Resolve-NodePath $NodePath
$appRoot = Resolve-AppRoot $AppRoot
$exe = Join-Path $appRoot $exeName
$asar = Join-Path $appRoot 'resources\app.asar'

if (-not (Test-Path $asar)) { Stop-Script "找不到 app.asar: $asar" }

Write-Host ("node     : {0}" -f $node)
Write-Host ("安装目录 : {0}" -f $appRoot)
Write-Host ("材质     : {0}" -f $Material)
Write-Host ''

# ---------- 等待 DSH 退出 ----------
if ($DryRun) {
    Write-Host '（dry-run：跳过等待 DSH 退出）' -ForegroundColor DarkGray
} else {
    Write-Host '正在等待 DSH 桌面版退出（请在托盘图标上右键 -> 退出）...' -ForegroundColor Yellow
    $waited = 0
    while ($true) {
        $procs = @(Get-Process -Name $procName -ErrorAction SilentlyContinue)
        if ($procs.Count -eq 0) { break }
        if ($waited -eq 0) {
            Write-Host ("  检测到 {0} 个进程正在运行, 等待中..." -f $procs.Count)
        } elseif ($waited % 15 -eq 0) {
            Write-Host ("  仍在等待... 已等待 {0} 秒" -f $waited)
        }
        Start-Sleep -Seconds 3
        $waited += 3
    }
    Write-Host '✅ 桌面版已退出' -ForegroundColor Green
    Start-Sleep -Seconds 2
}

# ---------- 1. 读取当前状态 ----------
$stateJson = & $node $stateScript $asar
if ($LASTEXITCODE -ne 0) { Stop-Script '无法解析当前 app.asar（可能已损坏）' }
$state = ($stateJson -join '') | ConvertFrom-Json
$version = (Get-Item $exe).VersionInfo.FileVersion
Write-Host ("当前版本   : {0}" -f $version)
Write-Host ("主窗口材质 : {0}" -f $(if ($null -eq $state.mainMaterial) { '(未设置)' } else { $state.mainMaterial }))

if ($state.patched) {
    Write-Host ''
    Write-Host '✅ 主窗口已带窗口材质，无需重复处理。' -ForegroundColor Green
    if (-not $DryRun) {
        Start-Process -FilePath $exe
        Write-Host '已重新启动 DSH 桌面版' -ForegroundColor Green
    }
    Wait-Close
    exit 0
}

# ---------- 2. 备份当前版本原始 asar ----------
New-Item -ItemType Directory -Force -Path $buildDir | Out-Null
if ($DryRun) {
    Write-Host '（dry-run：跳过备份）' -ForegroundColor DarkGray
} else {
    New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
    $genericBak = Join-Path $backupDir 'app.asar.original-backup'
    $versionBak = Join-Path $backupDir ("app.asar.original-{0}" -f $version)
    if (-not (Test-Path $versionBak)) {
        Copy-Item $asar $versionBak -Force
        Write-Host ("已存档该版本原始备份: {0}" -f (Split-Path $versionBak -Leaf))
    }
    Copy-Item $asar $genericBak -Force
    Write-Host '已刷新通用原始备份 (backups\app.asar.original-backup)'
}

# ---------- 3. 现场生成 ----------
$newAsar = Join-Path $buildDir 'app.asar'
$checkMain = Join-Path $buildDir '_main-check.mjs'

Write-Host ''
Write-Host '正在生成补丁版 app.asar...' -ForegroundColor Yellow
& $node $genScript $asar $newAsar $checkMain ("--material={0}" -f $Material)
if ($LASTEXITCODE -ne 0) { Stop-Script '生成失败（锚点或配平不匹配），已安装文件未改动。' }

Write-Host '正在对补丁后的 main.js 做语法校验...' -ForegroundColor Yellow
& $node --check $checkMain
if ($LASTEXITCODE -ne 0) { Stop-Script '语法校验失败，已安装文件未改动。' }
Write-Host '✅ 生成与校验通过' -ForegroundColor Green

# ---------- 4. 替换并复核 ----------
if ($DryRun) {
    Write-Host ''
    Write-Host '✅ dry-run 完成：检测、生成与语法校验均通过，已安装文件未改动。' -ForegroundColor Green
    Write-Host ("   补丁版 asar: {0}" -f $newAsar) -ForegroundColor Gray
    Wait-Close
    exit 0
}

Copy-Item $newAsar $asar -Force
$afterJson = & $node $stateScript $asar
if ($LASTEXITCODE -ne 0) { Stop-Script '替换后无法复核，请运行 restore-asar.ps1 还原。' }
$after = ($afterJson -join '') | ConvertFrom-Json
if (-not $after.patched) { Stop-Script '替换后复核失败，请运行 restore-asar.ps1 还原。' }
Write-Host ("✅ 已替换 app.asar（主窗口材质: {0}）" -f $after.mainMaterial) -ForegroundColor Green

# ---------- 5. 重启 ----------
Start-Process -FilePath $exe
Write-Host '✅ 已重新启动 DSH 桌面版' -ForegroundColor Green

Write-Host ''
Write-Host '提示: DSH 自动更新会覆盖 app.asar，更新后重跑本脚本即可。' -ForegroundColor Gray
Write-Host '如需还原, 运行 restore-asar.ps1' -ForegroundColor Gray
Write-Host '若效果不明显, 请确认: 设置 -> 个性化 -> 颜色 -> 透明效果 = 开' -ForegroundColor Yellow
Wait-Close
