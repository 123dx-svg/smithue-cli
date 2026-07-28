<#
smithue.ps1 — 纯 Windows / 零 node 的 SmithUE 调用（用 PowerShell 自带 Invoke-RestMethod）

为什么存在：smithue-cli 是 node 写的客户端；但你的插件只是个本地 HTTP 服务端
（127.0.0.1:<port>/api/v1/execute）。任何 HTTP 客户端都能调它——本脚本用
Windows 自带的 PowerShell，不需要装 node / npm。

用法：
  .\smithue.ps1 <command> <params.json>    # 从文件读参数（UTF-8，最稳，中文也不坏）
  .\smithue.ps1 <command> '{"k":"v"}'      # inline JSON（ASCII 安全时）
  .\smithue.ps1 <command>                  # 无参数 = {}

环境变量：
  $env:SMITHUE_PORT      跳过端口发现，直连
  $env:SMITHUE_PROJECT   多实例时按 project_name 子串过滤

说明：<command> 是 exec 工具名（ping / list_assets / get_job_status / move_folder …），
等价于 `smithue-cli exec <command>`。
#>
param(
  [Parameter(Mandatory = $true)][string]$Command,
  [string]$Params = '{}'
)
$ErrorActionPreference = 'Stop'

# ---- 端口发现：读 %LOCALAPPDATA%\.smithue\<pid>.port（选最近启动的）----
if ($env:SMITHUE_PORT) {
  $port = [int]$env:SMITHUE_PORT
}
else {
  $dir = Join-Path $env:LOCALAPPDATA '.smithue'
  $files = Get-ChildItem $dir -Filter *.port -ErrorAction SilentlyContinue
  $entries = foreach ($f in $files) {
    try {
      $j = Get-Content -LiteralPath $f.FullName -Raw | ConvertFrom-Json
      $j | Add-Member -NotePropertyName _mtime -NotePropertyValue $f.LastWriteTime -Force
      $j
    } catch {}
  }
  if ($env:SMITHUE_PROJECT) {
    $entries = $entries | Where-Object { "$($_.project_name)" -like "*$($env:SMITHUE_PROJECT)*" }
  }
  if (-not $entries) {
    Write-Error "No running SmithUE editor found (port dir: $dir). Start UE with the SmithUE plugin, or set `$env:SMITHUE_PORT."
    exit 1
  }
  $port = ($entries | Sort-Object { $_.started_at }, _mtime -Descending | Select-Object -First 1).port
}

# ---- 参数来源：文件路径（UTF-8）或 inline JSON ----
if ($Params -and (Test-Path -LiteralPath $Params)) {
  $paramsJson = Get-Content -LiteralPath $Params -Raw -Encoding UTF8
}
else {
  $paramsJson = $Params
}
if (-not "$paramsJson".Trim()) { $paramsJson = '{}' }
$paramsJson = "$paramsJson".TrimStart([char]0xFEFF)  # strip BOM

# ---- 拼 body（params 原样嵌入，不二次序列化）→ UTF-8 字节发送 ----
$full = '{"command":"' + $Command + '","params":' + $paramsJson + '}'
$bytes = [System.Text.Encoding]::UTF8.GetBytes($full)

$resp = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/v1/execute" `
  -Method Post -ContentType 'application/json; charset=utf-8' -Body $bytes
$resp | ConvertTo-Json -Depth 30 -Compress
