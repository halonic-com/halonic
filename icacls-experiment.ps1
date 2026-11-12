# HAL-7431 experiment, never merged: how long `icacls <folder> /grant` takes,
# and whether the folder's own list has the entry before the walk under it
# ends (so a stopped icacls has granted it or not).
$ErrorActionPreference = "Continue"
$icacls = "$env:SystemRoot\System32\icacls.exe"
$saved = Join-Path $env:RUNNER_TEMP "acl.txt"

# Local accounts, so each trial has a SID that SDDL writes in full.
$sids = 1..8 | ForEach-Object {
  $name = "halexp$_"
  New-LocalUser -Name $name -NoPassword | Out-Null
  (Get-LocalUser -Name $name).SID.Value
}

function Has-Entry([string]$folder, [string]$sid) {
  & $icacls $folder /save $saved | Out-Null
  $text = [System.IO.File]::ReadAllText($saved, [System.Text.Encoding]::Unicode)
  return $text.Contains(";;;$sid)")
}

function Trial([string]$name, [string]$folder, [string]$sid, [int]$killAfterMs) {
  $clock = [System.Diagnostics.Stopwatch]::StartNew()
  $p = Start-Process -FilePath $icacls -ArgumentList @($folder, "/grant", "*${sid}:(RA)") -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $env:RUNNER_TEMP "$name.out")
  $seen = "never"
  $killed = $false
  while (-not $p.HasExited) {
    if ($seen -eq "never" -and (Has-Entry $folder $sid)) { $seen = "$($clock.ElapsedMilliseconds) ms" }
    if ($killAfterMs -gt 0 -and $clock.ElapsedMilliseconds -ge $killAfterMs -and -not $p.HasExited) {
      Stop-Process -Id $p.Id -Force
      $killed = $true
      break
    }
    Start-Sleep -Milliseconds 100
  }
  $p.WaitForExit()
  $ended = $clock.ElapsedMilliseconds
  $after = Has-Entry $folder $sid
  Write-Output ("{0}: ended {1} ms, killed {2}, exit {3}, entry seen while running {4}, entry after {5}" -f $name, $ended, $killed, $p.ExitCode, $seen, $after)
}

$appData = Split-Path $env:APPDATA -Parent
$count = (Get-ChildItem $appData -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object).Count
Write-Output "AppData holds $count items"
Trial "appdata-full" $appData $sids[0] 0
Trial "appdata-full-again" $appData $sids[1] 0

# A folder with a long walk: 200 folders of 200 files.
$big = Join-Path $env:RUNNER_TEMP "big"
1..200 | ForEach-Object {
  $dir = New-Item -ItemType Directory -Force (Join-Path $big "d$_")
  1..200 | ForEach-Object { [System.IO.File]::WriteAllText((Join-Path $dir "f$_.txt"), "x") }
}
Write-Output "big holds $((Get-ChildItem $big -Recurse -Force | Measure-Object).Count) items"
Trial "big-full" $big $sids[2] 0
Trial "big-kill-1s" $big $sids[3] 1000
Trial "big-kill-3s" $big $sids[4] 3000

# A busy machine: writers in the temp folder and CPU load, as when the other
# fence tests run beside this one.
$busy = 1..6 | ForEach-Object {
  Start-Job -ArgumentList $env:TEMP, $_ -ScriptBlock {
    param($temp, $n)
    $dir = Join-Path $temp "busy-$n"
    $stop = (Get-Date).AddMinutes(4)
    while ((Get-Date) -lt $stop) {
      New-Item -ItemType Directory -Force $dir | Out-Null
      1..200 | ForEach-Object { [System.IO.File]::WriteAllText((Join-Path $dir "f$_.txt"), "x") }
      Remove-Item -Recurse -Force $dir -ErrorAction SilentlyContinue
    }
  }
}
Start-Sleep -Seconds 5
Trial "busy-appdata-full" $appData $sids[5] 0
Trial "busy-big-full" $big $sids[6] 0
Trial "busy-big-kill-2s" $big $sids[7] 2000
$busy | Stop-Job
$busy | Remove-Job -Force
