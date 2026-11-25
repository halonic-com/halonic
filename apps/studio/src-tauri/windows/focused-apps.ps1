# The Start menu shortcuts of Halonic Inbox and Halonic Messenger (HAL-17903),
# for the install tests to dot-source. Every way in (a fresh install, an
# install over an older version, Repair on the run-again page and an update)
# must leave both, so each test takes them away first and checks they came
# back (HAL-18322).

$FocusedApps = [ordered]@{ 'Halonic Inbox' = 'inbox'; 'Halonic Messenger' = 'messenger' }
$FocusedAppFolder = Join-Path ([Environment]::GetFolderPath('Programs')) 'Halonic'

# Deletes both shortcuts, as an install of a version without them would leave
# the Start menu.
function Remove-FocusedAppShortcuts {
  foreach ($name in $FocusedApps.Keys) {
    Remove-Item (Join-Path $FocusedAppFolder "$name.lnk") -ErrorAction SilentlyContinue
  }
}

# Throws unless both shortcuts start $InstallFolder's Halonic.exe with
# `--app <name>` and carry the app's own ID, so the Start menu lists each as
# its own app. $When says which install it checks.
function Assert-FocusedAppShortcuts([string]$InstallFolder, [string]$When) {
  $halonicExe = [IO.Path]::GetFullPath((Join-Path $InstallFolder 'Halonic.exe'))
  $links = New-Object -ComObject WScript.Shell
  $folder = (New-Object -ComObject Shell.Application).Namespace($FocusedAppFolder)
  foreach ($name in $FocusedApps.Keys) {
    $app = $FocusedApps[$name]
    $path = Join-Path $FocusedAppFolder "$name.lnk"
    if (-not (Test-Path $path)) {
      Get-ChildItem $FocusedAppFolder -ErrorAction SilentlyContinue | ForEach-Object { "Start menu folder: $($_.Name)" } | Write-Output
      throw "The Start menu has no $name after $When"
    }
    $link = $links.CreateShortcut($path)
    if ([IO.Path]::GetFullPath($link.TargetPath) -ne $halonicExe) { throw "$name starts $($link.TargetPath) after $When, not $halonicExe" }
    if ($link.Arguments -ne "--app $app") { throw "$name starts Halonic with '$($link.Arguments)' after $When, not '--app $app'" }
    $id = $folder.ParseName("$name.lnk").ExtendedProperty('System.AppUserModel.ID')
    if (-not "$id".EndsWith(".$app")) { throw "$name carries the app ID '$id' after $When, not the $app app's own" }
  }
  Write-Output "focused apps: both Start menu shortcuts are there after $When"
}
