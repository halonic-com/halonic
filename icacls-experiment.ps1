# HAL-7431 experiment, never merged: how long `icacls AppData /grant` takes on
# a runner, and when the folder's own list gets the entry (before or after the
# walk under it), with and without a busy temp folder.
$ErrorActionPreference = "Continue"
$appData = Split-Path $env:APPDATA -Parent
$icacls = "$env:SystemRoot\System32\icacls.exe"
$saved = Join-Path $env:RUNNER_TEMP "acl.txt"

function Has-Entry([string]$sid) {
  & $icacls $appData /save $saved | Out-Null
  $text = [System.IO.File]::ReadAllText($saved, [System.Text.Encoding]::Unicode)
  return $text.Contains(";;;$sid)")
}

function Trial([string]$name, [string]$sid, [int]$killAfterMs) {
  $clock = [System.Diagnostics.Stopwatch]::StartNew()
  $p = Start-Process -FilePath $icacls -ArgumentList @($appData, "/grant", "*${sid}:(RA)") -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $env:RUNNER_TEMP "$name.out")
  $seen = $null
  $killed = $false
  while (-not $p.HasExited) {
    if ($null -eq $seen -and (Has-Entry $sid)) { $seen = $clock.ElapsedMilliseconds }
    if ($killAfterMs -gt 0 -and $clock.ElapsedMilliseconds -ge $killAfterMs) {
      Stop-Process -Id $p.Id -Force
      $killed = $true
      break
    }
    Start-Sleep -Milliseconds 200
  }
  $p.WaitForExit()
  $ended = $clock.ElapsedMilliseconds
  $after = Has-Entry $sid
  Write-Output ("{0}: ended {1} ms, killed {2}, exit {3}, entry first seen {4} ms, entry after {5}" -f $name, $ended, $killed, $p.ExitCode, $seen, $after)
}

$count = (Get-ChildItem $appData -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object).Count
Write-Output "AppData holds $count items"

Trial "quiet-full" "S-1-5-4" 0
Trial "quiet-kill-1s" "S-1-5-6" 1000
Trial "quiet-kill-3s" "S-1-5-14" 3000

# A busy temp folder, as when the other fence tests run beside this one.
$busy = 1..4 | ForEach-Object {
  Start-Job -ArgumentList $env:TEMP, $_ -ScriptBlock {
    param($temp, $n)
    $dir = Join-Path $temp "busy-$n"
    $stop = (Get-Date).AddMinutes(4)
    while ((Get-Date) -lt $stop) {
      New-Item -ItemType Directory -Force $dir | Out-Null
      1..200 | ForEach-Object { Set-Content -Path (Join-Path $dir "f$_.txt") -Value $_ }
      Remove-Item -Recurse -Force $dir -ErrorAction SilentlyContinue
    }
  }
}
Start-Sleep -Seconds 3
Trial "busy-full" "S-1-5-13" 0
Trial "busy-kill-1s" "S-1-5-2" 1000
$busy | Stop-Job
$busy | Remove-Job -Force
