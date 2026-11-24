# A reinstall as a standard user takes back the access a removal with
# administrator rights kept on that user's folders (HAL-16084):
#   1. a standard local user installs Halonic, the runner (an administrator)
#      sets the sandbox up, and the user gets a kept write grant on a folder;
#   2. the runner removes the sandbox with administrator rights, as an
#      uninstaller run as administrator does: srt keeps the user's grant and
#      its sandbox account is gone;
#   3. the user installs Halonic again, without the sandbox box: the installer's
#      take-back runs as that user, so srt keeps no grants for them and the
#      folder's entry for the old sandbox account is gone.
# The runner is an administrator, so the user's commands run with
# Start-Process -Credential. The user and its password exist only in this job.
param(
  [Parameter(Mandatory)][string]$Setup
)
$ErrorActionPreference = 'Stop'

$userName = 'halonic-takeback'
# A throwaway password for a throwaway account, never printed.
$password = 'Hx1!' + [guid]::NewGuid().ToString('N')
$secure = ConvertTo-SecureString $password -AsPlainText -Force
New-LocalUser -Name $userName -Password $secure -AccountNeverExpires -UserMayNotChangePassword | Out-Null
Add-LocalGroupMember -Group 'Users' -Member $userName
$credential = New-Object System.Management.Automation.PSCredential ($userName, $secure)
# Start-Process -Credential goes through the Secondary Logon service.
Start-Service seclogon

# A folder the user can read and write, for its commands' output.
$shared = Join-Path $env:RUNNER_TEMP 'take-back'
New-Item -ItemType Directory -Force $shared | Out-Null
& icacls.exe $shared /grant "${userName}:(OI)(CI)M" | Out-Null
$setupCopy = Join-Path $shared (Split-Path $Setup -Leaf)
Copy-Item $Setup $setupCopy

# Start-Process -Credential hands the runner's own environment to the user's
# process, so its folder variables name the runner's folders. The user's script
# first sets them from the user's own profile, for itself and what it starts.
# The profile path comes from the profile list rather than GetFolderPath, which
# returns an empty string while a new profile's AppData folders don't exist yet.
$userEnvironment = @'
$ErrorActionPreference = 'Stop'
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$env:USERPROFILE = (Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\$sid").ProfileImagePath
if (-not $env:USERPROFILE) { throw "The profile list has no profile folder for $sid" }
$env:LOCALAPPDATA = Join-Path $env:USERPROFILE 'AppData\Local'
$env:APPDATA = Join-Path $env:USERPROFILE 'AppData\Roaming'
$env:TEMP = Join-Path $env:LOCALAPPDATA 'Temp'
New-Item -ItemType Directory -Force $env:LOCALAPPDATA, $env:APPDATA, $env:TEMP | Out-Null
$env:TMP = $env:TEMP
$env:USERNAME = [Environment]::UserName
'@

# Runs a PowerShell script as the user, without administrator rights, and
# returns what it printed. Throws when it exits with anything but 0.
function Invoke-AsUser([string]$script) {
  $id = [guid]::NewGuid().ToString('N')
  $out = Join-Path $shared "$id.out"
  $err = Join-Path $shared "$id.err"
  # Start-Process -Credential allows a command line of at most 1024 characters,
  # so the script goes in a file in the shared folder rather than on the line.
  $file = Join-Path $shared "$id.ps1"
  Set-Content -Path $file -Value "$userEnvironment`n$script" -Encoding utf8BOM
  $p = Start-Process powershell.exe -ArgumentList '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', "`"$file`"" `
    -Credential $credential -LoadUserProfile -WorkingDirectory $shared `
    -RedirectStandardOutput $out -RedirectStandardError $err -Wait -PassThru
  $printed = Get-Content $out -Raw -ErrorAction SilentlyContinue
  if ($p.ExitCode -ne 0) {
    throw "As $userName, exit $($p.ExitCode): $printed $(Get-Content $err -Raw -ErrorAction SilentlyContinue)"
  }
  return "$printed".Trim()
}

# The SIDs of the folder's explicit access entries. icacls shows an account's
# name while it exists, so the list is read as SIDs instead.
function Get-FolderSids([string]$folder) {
  $rules = (Get-Acl $folder).GetAccessRules($true, $false, [Security.Principal.SecurityIdentifier])
  return @($rules | ForEach-Object { $_.IdentityReference.Value } | Sort-Object -Unique)
}

# srt's status for the user, as srt-win in the user's install reports it.
function Get-UserStatus {
  return (Invoke-AsUser "& '$srtWin' user status") | ConvertFrom-Json
}

try {
  # The user isn't an administrator: the take-back refuses to run otherwise.
  $admin = Invoke-AsUser '([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)'
  if ($admin -ne 'False') { throw "$userName runs with administrator rights: $admin" }

  # 1. The user's install, the sandbox, and a kept write grant on the user's folder.
  $local = Invoke-AsUser '$env:LOCALAPPDATA'
  $dir = Join-Path $local 'Programs\Halonic'
  # /SANDBOX=1 copies Microsoft's runtime the sandbox needs (HAL-17810); without
  # administrator rights the installer skips the step itself.
  Invoke-AsUser "`$p = Start-Process '$setupCopy' -ArgumentList '/S', '/SANDBOX=1' -Wait -PassThru; exit `$p.ExitCode" | Out-Null
  $hostExe = Join-Path $dir 'halonic-agent-host.exe'
  $srtWin = Join-Path $dir 'srt-win.exe'
  if (-not (Test-Path $hostExe)) { throw "The user's install has no agent host in $dir" }
  Get-Process Halonic, halonic-agent-host -ErrorAction SilentlyContinue | Stop-Process -Force
  $profileFolder = Join-Path $env:RUNNER_TEMP 'take-back-profile'
  $out = & $hostExe --profile-folder $profileFolder --sandbox-setup
  if ($LASTEXITCODE -ne 0) { throw "The sandbox setup failed: $out" }
  $sid = (Get-UserStatus).user.sid
  if (-not $sid) { throw 'srt-win user status names no sandbox account' }
  $keptFolder = Join-Path $local 'take-back-kept'
  Invoke-AsUser "New-Item -ItemType Directory -Force '$keptFolder' | Out-Null" | Out-Null
  $baseline = Get-FolderSids $keptFolder
  Invoke-AsUser @"
@{ read = @(); write = @('$keptFolder'); denyRead = @(); denyWrite = @() } | ConvertTo-Json -Compress |
  & '$srtWin' acl grant --holder-pid `$PID --sandbox-user-sid '$sid' --persistent
exit `$LASTEXITCODE
"@ | Out-Null
  if ((Get-UserStatus).persistent_grants.state -eq 'none') { throw 'srt keeps no grant for the user after acl grant --persistent' }
  # The entries the grant added, whichever SID srt grants to.
  $added = @(Get-FolderSids $keptFolder | Where-Object { $_ -notin $baseline })
  Write-Output "the kept grant added entries for: $($added -join ', ') (sandbox account $sid)"
  if ($added.Count -eq 0) { throw "The kept grant added no entry to the folder: $((Get-Acl $keptFolder).Sddl)" }

  # 2. A removal with administrator rights: the user's grant stays, the account goes.
  $out = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $dir 'sandbox-remove.ps1') -HostExe $hostExe -ProfileFolder $profileFolder
  # 2 and 3 say the runner's own kept access stays, which isn't this test's.
  if ($LASTEXITCODE -notin 0, 2, 3) { throw "The removal as administrator failed (exit $LASTEXITCODE): $out" }
  $before = Get-UserStatus
  Write-Output "after the removal as administrator: account exists $($before.user.exists), grants $($before.persistent_grants.state)"
  if ($before.user.exists -ne $false -or $before.persistent_grants.state -eq 'none') {
    throw 'The removal as administrator left no orphaned grant, so this test proves nothing'
  }

  # 3. The user installs again, without the sandbox box.
  Invoke-AsUser "`$p = Start-Process '$setupCopy' -ArgumentList '/S', '/D=$dir' -Wait -PassThru; exit `$p.ExitCode" | Out-Null
  Get-Process Halonic -ErrorAction SilentlyContinue | Stop-Process -Force
  $after = Get-UserStatus
  if ($after.persistent_grants.state -ne 'none') {
    # Why the installer's step took nothing back: the same command run as the
    # user directly, and the user's integrity level. Windows PowerShell turns
    # a native command's stderr under 2>&1 into errors, so 'Stop' is lifted.
    $direct = Invoke-AsUser "`$ErrorActionPreference = 'Continue'; `$o = & '$hostExe' --profile-folder '$local\take-back-profile' --sandbox-take-back 2>&1 | Out-String; `"exit `${LASTEXITCODE}: `$o`"; exit 0"
    Write-Output "--sandbox-take-back run as $userName afterwards: $direct"
    Write-Output (Invoke-AsUser '& whoami.exe /groups /fo csv /nh | Select-String Mandatory | Out-String')
    throw "The reinstall left srt's grants for $userName`: $($after.persistent_grants | ConvertTo-Json -Compress)"
  }
  $left = @(Get-FolderSids $keptFolder | Where-Object { $_ -in $added })
  if ($left.Count -gt 0) { throw "The kept folder still has entries for $($left -join ', '): $((Get-Acl $keptFolder).Sddl)" }
  Write-Output 'take-back: a reinstall as a standard user took back what the removal as administrator kept'
} finally {
  Get-Process Halonic, halonic-agent-host -ErrorAction SilentlyContinue | Stop-Process -Force
  Remove-LocalUser -Name $userName -ErrorAction SilentlyContinue
}
