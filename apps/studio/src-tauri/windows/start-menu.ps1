# Halonic's Start menu shortcuts, for the install tests to dot-source. Every
# way in (a fresh install, an install over an older version, an update, Repair
# and run again without Repair) removes the shortcuts an earlier Halonic made
# and leaves exactly Halonic, Halonic Inbox and Halonic Messenger in Halonic's
# folder (HAL-18322, studio.installer-start-menu-refresh). Each test gives the
# Start menu an older version's shortcuts first and checks what the install
# left.

$FocusedApps = [ordered]@{ 'Halonic Inbox' = 'inbox'; 'Halonic Messenger' = 'messenger' }
$Programs = [Environment]::GetFolderPath('Programs')
$StartMenuFolder = Join-Path $Programs 'Halonic'

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
  }
  Write-Output "start menu: exactly Halonic, Halonic Inbox and Halonic Messenger after $When"
}
