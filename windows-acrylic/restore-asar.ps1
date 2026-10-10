<#
.SYNOPSIS
  把 DSH 桌面版的 app.asar 还原为原始版本（撤销窗口材质补丁）。

.DESCRIPTION
  从 backups\app.asar.original-backup 还原。该备份由 apply-acrylic.ps1 在打补丁
  之前建立，始终对应最近一次打补丁时的原始文件。

.PARAMETER AppRoot
  DSH 桌面版安装目录（含 "DeepSeek Harness.exe"）。缺省时自动探测。

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\restore-asar.ps1
#>
[CmdletBinding()]
param(
    [string]$AppRoot
)

$ErrorActionPreference = 'Stop'

$repoRoot  = Split-Path $PSScriptRoot -Parent
$backupDir = Join-Path $repoRoot 'backups'
$bakAsar   = Join-Path $backupDir 'app.asar.original-backup'
$exeName   = 'DeepSeek Harness.exe'
$procName  = 'DeepSeek Harness'

function Stop-Script([string]$message) {
    Write-Host ''
    Write-Host ("错误: {0}" -f $message) -ForegroundColor Red
    Read-Host '按回车键关闭'
    exit 1
}

function Resolve-AppRoot([string]$explicit) {
    if ($explicit) {
        $full = (Resolve-Path $explicit).Path
        if (Test-Path (Join-Path $full $exeName)) { return $full }
        throw "指定目录下找不到 $exeName : $full"
    }
    $proc = Get-Process -Name $procName -ErrorAction SilentlyContinue |
        Where-Object { $_.Path } | Select-Object -First 1
    if ($proc) { return (Split-Path $proc.Path -Parent) }

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
Write-Host ' DSH 桌面版 - 还原原始 app.asar' -ForegroundColor Cyan
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host ''

if (-not (Test-Path $bakAsar)) { Stop-Script "找不到原始备份: $bakAsar" }

$appRoot = Resolve-AppRoot $AppRoot
$exe = Join-Path $appRoot $exeName
$asar = Join-Path $appRoot 'resources\app.asar'
if (-not (Test-Path $asar)) { Stop-Script "找不到 app.asar: $asar" }

Write-Host ("备份     : {0}" -f $bakAsar)
Write-Host ("安装目录 : {0}" -f $appRoot)
Write-Host ''

Write-Host '正在等待 DSH 桌面版退出（请在托盘图标上右键 -> 退出）...' -ForegroundColor Yellow
while (@(Get-Process -Name $procName -ErrorAction SilentlyContinue).Count -gt 0) { Start-Sleep -Seconds 3 }
Start-Sleep -Seconds 2

Copy-Item $bakAsar $asar -Force
Write-Host '✅ 已还原原始 app.asar' -ForegroundColor Green

Start-Process -FilePath $exe
Write-Host '✅ 已重新启动 DSH 桌面版' -ForegroundColor Green
Read-Host '按回车键关闭'
