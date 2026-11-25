# First sign-in of the image build (FirstLogonCommands), from the answer ISO. Turns on SSH for the
# host's key only, turns off automatic updates, enables the two Windows features WSL 2 needs and
# restarts. sshd is set to start automatically but isn't started here, so the host's first SSH
# login lands after the restart, with the features on.
param([Parameter(Mandatory)][string]$Drive)
$ErrorActionPreference = 'Stop'
$state = Join-Path $env:SystemDrive 'halonic-win'
New-Item $state -ItemType Directory -Force | Out-Null
Start-Transcript -Path "$state\setup-1.log" -Force | Out-Null

# The one auto sign-in left the password in Winlogon; remove it.
$winlogon = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon'
Set-ItemProperty $winlogon -Name AutoAdminLogon -Value '0'
Remove-ItemProperty $winlogon -Name DefaultPassword -ErrorAction SilentlyContinue
# Setup keeps a copy of the answer file under Panther, and every job VM would start with it: delete
# it, so no cached copy can hold the admin password (Liam, HAL-18572; the README's build checks it).
Get-ChildItem "$env:SystemRoot\Panther" -Recurse -File -Filter 'unattend*.xml' |
  Remove-Item -Force

# A throwaway VM shouldn't spend each job downloading patches: the base image is rebuilt monthly
# instead (README). Defender and its signature updates stay on.
$au = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU'
New-Item $au -Force | Out-Null
Set-ItemProperty $au -Name NoAutoUpdate -Type DWord -Value 1

# OpenSSH server, key only. An administrator's key lives in administrators_authorized_keys,
# readable only by Administrators and SYSTEM, or sshd ignores it.
Add-WindowsCapability -Online -Name 'OpenSSH.Server~~~~0.0.1.0' | Out-Null
$sshDir = "$env:ProgramData\ssh"
New-Item $sshDir -ItemType Directory -Force | Out-Null
Copy-Item "$Drive\authorized_keys" "$sshDir\administrators_authorized_keys" -Force
icacls.exe "$sshDir\administrators_authorized_keys" /inheritance:r /grant 'Administrators:F' /grant 'SYSTEM:F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw "icacls failed with $LASTEXITCODE" }
Copy-Item "$Drive\sshd_config" "$sshDir\sshd_config" -Force
New-Item 'HKLM:\SOFTWARE\OpenSSH' -Force | Out-Null
Set-ItemProperty 'HKLM:\SOFTWARE\OpenSSH' -Name DefaultShell -Value "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
# Only the host (the bridge address) may connect.
Get-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -DisplayName 'OpenSSH from the host' -Direction Inbound `
  -Protocol TCP -LocalPort 22 -RemoteAddress 10.79.0.1 -Action Allow | Out-Null
Set-Service sshd -StartupType Automatic

foreach ($feature in 'Microsoft-Windows-Subsystem-Linux', 'VirtualMachinePlatform') {
  dism.exe /online /enable-feature /featurename:$feature /all /norestart | Out-Null
  # 3010: done, restart needed.
  if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 3010) { throw "dism $feature failed with $LASTEXITCODE" }
}

Set-Content "$state\setup-1.done" (Get-Date -Format o)
Stop-Transcript | Out-Null
Restart-Computer -Force
