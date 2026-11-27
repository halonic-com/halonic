# Halonic's Start menu shortcuts, for the install tests to dot-source. Every
# way in (a fresh install, an install over an older version, an update, Repair
# and run again without Repair) removes the shortcuts an earlier Halonic made
# and leaves exactly Halonic, Halonic Inbox and Halonic Messenger in Halonic's
# folder (HAL-18322, studio.installer-start-menu-refresh). Each test gives the
# Start menu an older version's shortcuts first and checks what the install
# left. Each shortcut, and Messenger pinned to the taskbar, must also have
# this version's copy of its icon (HAL-20463, studio.installer-icon-refresh).

$FocusedApps = [ordered]@{ 'Halonic Inbox' = 'inbox'; 'Halonic Messenger' = 'messenger' }
$Programs = [Environment]::GetFolderPath('Programs')
$StartMenuFolder = Join-Path $Programs 'Halonic'
$PinnedFolder = Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar'

# Makes the Start menu look as an older Halonic in $InstallFolder left it: no
# focused apps' shortcuts, one this version no longer makes in Halonic's
# folder, and Halonic's at the top of the Start menu, where Tauri put it
# before the folder.
function Set-OlderStartMenu([string]$InstallFolder) {
  foreach ($name in $FocusedApps.Keys) {
    Remove-Item (Join-Path $StartMenuFolder "$name.lnk") -ErrorAction SilentlyContinue
  }
  New-Item -ItemType Directory -Force $StartMenuFolder | Out-Null
  $links = New-Object -ComObject WScript.Shell
  foreach ($path in @((Join-Path $StartMenuFolder 'Halonic Studio.lnk'), (Join-Path $Programs 'Halonic.lnk'))) {
    $link = $links.CreateShortcut($path)
    $link.TargetPath = Join-Path $InstallFolder 'Halonic.exe'
    $link.Save()
  }
  # HAL-20463: Messenger pinned to the taskbar on the icon path an older
  # version used, and another program's pin, which the install leaves alone.
  New-Item -ItemType Directory -Force $PinnedFolder | Out-Null
  $pinned = $links.CreateShortcut((Join-Path $PinnedFolder 'Halonic Messenger.lnk'))
  $pinned.TargetPath = Join-Path $InstallFolder 'Halonic.exe'
  $pinned.Arguments = '--app messenger'
  $pinned.IconLocation = "$(Join-Path $InstallFolder 'icons\messenger.ico'),0"
  $pinned.Save()
  $other = $links.CreateShortcut((Join-Path $PinnedFolder 'Acme Notes.lnk'))
  $other.TargetPath = Join-Path $env:WINDIR 'notepad.exe'
  $other.IconLocation = "$(Join-Path $env:WINDIR 'notepad.exe'),0"
  $other.Save()
}

# Throws unless the shortcut $Path has this install's copy of $App's icon,
# `icons\<app>-<version>.ico`, and that file is there (HAL-20463,
# studio.installer-icon-refresh).
function Assert-VersionedIcon([string]$InstallFolder, [string]$Path, [string]$App, [string]$When) {
  $location = (New-Object -ComObject WScript.Shell).CreateShortcut($Path).IconLocation
  $icons = [regex]::Escape([IO.Path]::GetFullPath((Join-Path $InstallFolder 'icons')))
  if ($location -notmatch "^$icons\\$App-[^\\]+\.ico,0$") { throw "$Path has the icon '$location' after $When, not this version's $App icon" }
  if (-not (Test-Path ($location -replace ',0$', ''))) { throw "$Path's icon $location is missing after $When" }
  $copies = @(Get-ChildItem (Join-Path $InstallFolder 'icons') -Filter "$App-*.ico")
  if ($copies.Count -ne 1) { throw "the icons folder holds $($copies.Count) copies of $App's icon after $When, not 1" }
}

# Throws unless the pins Set-OlderStartMenu made point at their icons:
# Messenger's at this version's copy, the other program's as it was.
function Assert-PinnedIcons([string]$InstallFolder, [string]$When) {
  $messenger = Join-Path $PinnedFolder 'Halonic Messenger.lnk'
  if (-not (Test-Path $messenger)) { return }
  Assert-VersionedIcon $InstallFolder $messenger 'messenger' $When
  $other = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $PinnedFolder 'Acme Notes.lnk')).IconLocation
  if ($other -ne "$(Join-Path $env:WINDIR 'notepad.exe'),0") { throw "another program's pin has the icon '$other' after $When" }
  Write-Output "taskbar pins: Messenger's on this version's icon, another program's as it was, after $When"
}

# Throws unless Halonic's Start menu folder holds exactly Halonic, Halonic
# Inbox and Halonic Messenger, each starting $InstallFolder's Halonic.exe
# (the focused apps with `--app <name>`) with its own app ID, so the Start
# menu lists each as its own app, and nothing is left at the top of the Start
# menu. $When says which install it checks.
function Assert-StartMenu([string]$InstallFolder, [string]$When) {
  $halonicExe = [IO.Path]::GetFullPath((Join-Path $InstallFolder 'Halonic.exe'))
  $expected = @{ 'Halonic' = '' }
  foreach ($name in $FocusedApps.Keys) { $expected[$name] = $FocusedApps[$name] }
  $found = @(Get-ChildItem $StartMenuFolder -Filter '*.lnk' -ErrorAction SilentlyContinue | ForEach-Object { $_.BaseName } | Sort-Object)
  $wanted = @($expected.Keys | Sort-Object)
  if (($found -join ', ') -ne ($wanted -join ', ')) {
    throw "The Start menu folder holds [$($found -join ', ')] after $When, not [$($wanted -join ', ')]"
  }
  if (Test-Path (Join-Path $Programs 'Halonic.lnk')) { throw "Halonic's old shortcut at the top of the Start menu is still there after $When" }
  $links = New-Object -ComObject WScript.Shell
  $folder = (New-Object -ComObject Shell.Application).Namespace($StartMenuFolder)
  foreach ($name in $expected.Keys) {
    $app = $expected[$name]
    $link = $links.CreateShortcut((Join-Path $StartMenuFolder "$name.lnk"))
    if ([IO.Path]::GetFullPath($link.TargetPath) -ne $halonicExe) { throw "$name starts $($link.TargetPath) after $When, not $halonicExe" }
    $arguments = if ($app) { "--app $app" } else { '' }
    if ($link.Arguments -ne $arguments) { throw "$name starts Halonic with '$($link.Arguments)' after $When, not '$arguments'" }
    $id = "$($folder.ParseName("$name.lnk").ExtendedProperty('System.AppUserModel.ID'))"
    $own = if ($app) { $id.EndsWith(".$app") } else { $id -and -not $id.EndsWith('.inbox') -and -not $id.EndsWith('.messenger') }
    if (-not $own) { throw "$name carries the app ID '$id' after $When, not its own" }
    $iconApp = if ($app) { $app } else { 'halonic' }
    Assert-VersionedIcon $InstallFolder (Join-Path $StartMenuFolder "$name.lnk") $iconApp $When
  }
  Write-Output "start menu: exactly Halonic, Halonic Inbox and Halonic Messenger, each on this version's icon, after $When"
  Assert-PinnedIcons $InstallFolder $When
}
