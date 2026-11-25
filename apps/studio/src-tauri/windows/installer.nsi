; Halonic's NSIS installer template.
;
; Based on Tauri's own template (tauri-bundler 2.x, `nsis/installer.nsi`,
; MIT or Apache-2.0, (c) Tauri Programme within The Commons Conservancy).
; Every Halonic change is marked "Halonic change" with its task, so a Tauri
; upgrade can be merged by searching for it.
; Pinned to the template of tauri-bundler 2.12.x (see tauri in Cargo.toml).
;
Unicode true
ManifestDPIAware true
; Add in `dpiAwareness` `PerMonitorV2` to manifest for Windows 10 1607+ (note this should not affect lower versions since they should be able to ignore this and pick up `dpiAware` `true` set by `ManifestDPIAware true`)
; Currently undocumented on NSIS's website but is in the Docs folder of source tree, see
; https://github.com/kichik/nsis/blob/5fc0b87b819a9eec006df4967d08e522ddd651c9/Docs/src/attributes.but#L286-L300
; https://github.com/tauri-apps/tauri/pull/10106
ManifestDPIAwareness PerMonitorV2

!if "{{compression}}" == "none"
  SetCompress off
!else
  ; Set the compression algorithm. We default to LZMA.
  SetCompressor /SOLID "{{compression}}"
!endif

; Keep above !include to stay ahead of any plugin command
; see https://github.com/tauri-apps/tauri/pull/15422#discussion_r3289239624
{{#if signed_plugins_path}}
!addplugindir "{{signed_plugins_path}}"
{{/if}}

!include MUI2.nsh
!include FileFunc.nsh
!include x64.nsh
!include WordFunc.nsh
!include "utils.nsh"
!include "FileAssociation.nsh"
!include "Win\COM.nsh"
!include "Win\Propkey.nsh"
!include "Win\RestartManager.nsh"
!include "StrFunc.nsh"
${StrCase}
${StrLoc}

{{#if installer_hooks}}
!include "{{installer_hooks}}"
{{/if}}

!define WEBVIEW2APPGUID "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"

!define MANUFACTURER "{{manufacturer}}"
!define PRODUCTNAME "{{product_name}}"
!define VERSION "{{version}}"
!define VERSIONWITHBUILD "{{version_with_build}}"
!define HOMEPAGE "{{homepage}}"
!define INSTALLMODE "{{install_mode}}"
!define LICENSE "{{license}}"
!define INSTALLERICON "{{installer_icon}}"
!define SIDEBARIMAGE "{{sidebar_image}}"
!define HEADERIMAGE "{{header_image}}"
!define UNINSTALLERICON "{{uninstaller_icon}}"
!define UNINSTALLERHEADERIMAGE "{{uninstaller_header_image}}"
!define MAINBINARYNAME "{{main_binary_name}}"
!define MAINBINARYSRCPATH "{{main_binary_path}}"
!define BUNDLEID "{{bundle_id}}"
!define COPYRIGHT "{{copyright}}"
!define OUTFILE "{{out_file}}"
!define ARCH "{{arch}}"
!define ADDITIONALPLUGINSPATH "{{additional_plugins_path}}"
!define ALLOWDOWNGRADES "{{allow_downgrades}}"
!define DISPLAYLANGUAGESELECTOR "{{display_language_selector}}"
!define INSTALLWEBVIEW2MODE "{{install_webview2_mode}}"
!define WEBVIEW2INSTALLERARGS "{{webview2_installer_args}}"
!define WEBVIEW2BOOTSTRAPPERPATH "{{webview2_bootstrapper_path}}"
!define WEBVIEW2INSTALLERPATH "{{webview2_installer_path}}"
!define MINIMUMWEBVIEW2VERSION "{{minimum_webview2_version}}"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCTNAME}"
!define MANUKEY "Software\${MANUFACTURER}"
!define MANUPRODUCTKEY "${MANUKEY}\${PRODUCTNAME}"
!define UNINSTALLERSIGNCOMMAND "{{uninstaller_sign_cmd}}"
!define ESTIMATEDSIZE "{{estimated_size}}"
!define STARTMENUFOLDER "{{start_menu_folder}}"

Var PassiveMode
Var UpdateMode
Var NoShortcutMode
Var WixMode
Var OldMainBinaryName
; Halonic change (HAL-1206): the installed version before this install, read
; in .onInit, so an update can go back to it.
Var OldVersion
Var RollbackMode

; Halonic change (HAL-1202): the sandbox step and the one page.
; Remove the next line for a build without the Windows sandbox (flow 2.2, D44 (c)):
; the checkbox, its three lines, the step, the finish page's sandbox line and the
; uninstaller's sandbox removal go, and nothing else moves.
!define SANDBOX_STEP
; What the installer says it uses. CI fails when the real size is off by a quarter.
; It counts the WSL runtime and image a release ships (build-installer.ps1
; -Runtime and -Image, about 53 and 92 MB).
!define SIZE_MB 290
; Halonic change (HAL-5404 S3): the Windows setup version this installer's srt
; needs (packages/adapters/sandbox-srt/windows-setup-version.json), and the
; rollback guard that compares it with the computer's. build-installer.ps1
; sets both and refuses to pack without them.
!define SRTSETUPVERSION "$%HALONIC_SRT_SETUP_VERSION%"
!define SETUPGUARD "$%HALONIC_SETUP_GUARD%"
; Halonic change (HAL-17810, board decision on HAL-12716): the vcruntime140.dll
; srt-win needs, and Microsoft's own licence for it, the license.rtf of the
; same Visual C++ Redistributable (both pinned in windows/vcruntime.json,
; fetched by fetch-vcruntime.ps1). build-installer.ps1 sets both. Only an
; install that sets the sandbox up shows the licence and gets the file.
!define VCRUNTIME "$%HALONIC_VCRUNTIME%"
!define VCRUNTIMELICENCE "$%HALONIC_VCRUNTIME_LICENCE%"
; Halonic change (HAL-16342): a signed release's publisher, built in as for
; Studio and the helper (halonic-publisher's SIGNER). The installer starts the
; helper only when Windows trusts its signature and it names this publisher.
; build-installer.ps1 says whether there is one, as NSIS can't tell an unset
; variable from a name. Dev and CI builds and an unsigned release have none.
!if "$%HALONIC_HELPER_SIGNED%" == "yes"
  !define SANDBOXSIGNER "$%HALONIC_SANDBOX_SIGNER%"
!endif
; Halonic change (HAL-16947): 1 once the installer or uninstaller refused to
; start the helper because it isn't signed by SANDBOXSIGNER. A silent run then
; exits with HELPER_REFUSED_EXIT, so a script can tell the sandbox wasn't set
; up or removed. It follows the helper's own codes, which end at 40
; (crates/sandbox-elevate/README.md); the installer's other codes are 1
; (cancelled, or Halonic is open) and 2 (stopped before any page).
!ifdef SANDBOXSIGNER
  Var HelperRefused
  !define HELPER_REFUSED_EXIT 41
!endif
; .onInit unpacks the guard and nsExec. With /SOLID, anything not reserved
; here sits behind the app's files, and NSIS shows its "Unpacking data"
; window while it gets there, before any page or message.
ReserveFile "${SETUPGUARD}"
ReserveFile /plugin nsExec.dll
Var SandboxState
Var ShortcutState
Var SandboxOutcome
Var SandboxReason
; 1 when a silent install was given /SANDBOX=1, even where the step itself is
; skipped for want of administrator rights: Microsoft's runtime is copied
; then, so the sandbox can be set up later (HAL-17810).
Var SandboxAsked
Var LineCopy
Var LineSetup
Var LineCheck
Var StartAfterState
Var PathLabel
Var FolderErrorLabel
Var SandboxCheckbox
Var ShortcutCheckbox
Var StartCheckbox
; The run-again page (flow 2.5)
Var RunAgain
Var SkipCopy
Var SandboxReady
Var RepairCheckbox
; 1 when the installer or uninstaller runs with administrator rights. Then it
; starts nothing from $INSTDIR, which the user can write, except the helper,
; held open while Windows starts it (ElevateSandboxHelper).
Var Elevated

Name "${PRODUCTNAME}"
BrandingText "${COPYRIGHT}"
OutFile "${OUTFILE}"

; We don't actually use this value as default install path,
; it's just for nsis to append the product name folder in the directory selector
; https://nsis.sourceforge.io/Reference/InstallDir
!define PLACEHOLDER_INSTALL_DIR "placeholder\${PRODUCTNAME}"
InstallDir "${PLACEHOLDER_INSTALL_DIR}"

VIProductVersion "${VERSIONWITHBUILD}"
VIAddVersionKey "ProductName" "${PRODUCTNAME}"
VIAddVersionKey "FileDescription" "${PRODUCTNAME}"
VIAddVersionKey "LegalCopyright" "${COPYRIGHT}"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"

# additional plugins
!addplugindir "${ADDITIONALPLUGINSPATH}"

; Uninstaller signing command
!if "${UNINSTALLERSIGNCOMMAND}" != ""
  !uninstfinalize '${UNINSTALLERSIGNCOMMAND}'
!endif

; Handle install mode, `perUser`, `perMachine` or `both`
!if "${INSTALLMODE}" == "perMachine"
  RequestExecutionLevel admin
!endif

!if "${INSTALLMODE}" == "currentUser"
  RequestExecutionLevel user
!endif

!if "${INSTALLMODE}" == "both"
  !define MULTIUSER_MUI
  !define MULTIUSER_INSTALLMODE_INSTDIR "${PRODUCTNAME}"
  !define MULTIUSER_INSTALLMODE_COMMANDLINE
  !if "${ARCH}" == "x64"
    !define MULTIUSER_USE_PROGRAMFILES64
  !else if "${ARCH}" == "arm64"
    !define MULTIUSER_USE_PROGRAMFILES64
  !endif
  !define MULTIUSER_INSTALLMODE_DEFAULT_REGISTRY_KEY "${UNINSTKEY}"
  !define MULTIUSER_INSTALLMODE_DEFAULT_REGISTRY_VALUENAME "CurrentUser"
  !define MULTIUSER_INSTALLMODEPAGE_SHOWUSERNAME
  !define MULTIUSER_INSTALLMODE_FUNCTION RestorePreviousInstallLocation
  !define MULTIUSER_EXECUTIONLEVEL Highest
  !include MultiUser.nsh
!endif

; Installer icon
!if "${INSTALLERICON}" != ""
  !define MUI_ICON "${INSTALLERICON}"
!endif

; Installer sidebar image
!if "${SIDEBARIMAGE}" != ""
  !define MUI_WELCOMEFINISHPAGE_BITMAP "${SIDEBARIMAGE}"
!endif

; Enable header images for installer and uninstaller pages when either image is configured.
!if "${HEADERIMAGE}" != ""
  !define MUI_HEADERIMAGE
!else if "${UNINSTALLERHEADERIMAGE}" != ""
  !define MUI_HEADERIMAGE
!endif

; Installer header image
!if "${HEADERIMAGE}" != ""
  !define MUI_HEADERIMAGE_BITMAP "${HEADERIMAGE}"
!endif

; Uninstaller header image
!if "${UNINSTALLERHEADERIMAGE}" != ""
  !define MUI_HEADERIMAGE_UNBITMAP "${UNINSTALLERHEADERIMAGE}"
!endif

; Uninstaller icon
!if "${UNINSTALLERICON}" != ""
  !define MUI_UNICON "${UNINSTALLERICON}"
!endif

; Define registry key to store installer language
!define MUI_LANGDLL_REGISTRY_ROOT "HKCU"
!define MUI_LANGDLL_REGISTRY_KEY "${MANUPRODUCTKEY}"
!define MUI_LANGDLL_REGISTRY_VALUENAME "Installer Language"

; Halonic change (HAL-1202, flow 2.2): one page instead of Tauri's welcome,
; install mode, folder and Start menu pages. Microsoft's licence page follows
; it only when the sandbox box is ticked (HAL-17810). The Start menu entry is
; always added, in the "Halonic" folder. The reinstall page below is
; Tauri's for passive and update installs, and our run-again page otherwise.
!define MUI_ABORTWARNING
!define MUI_ABORTWARNING_TEXT "Cancel installing ${PRODUCTNAME}?"
!define MUI_ABORTWARNING_CANCEL_DEFAULT

; 4. Custom page to ask user if he wants to reinstall/uninstall
;    only if a previous installation was detected
Var ReinstallPageCheck
Page custom PageReinstall PageLeaveReinstall

; Find a previous WiX installation and set $R6 to its uninstall registry key, or to "" if none.
;
; A WiX installer stores the installation info in registry
; using a UUID and so we have to loop through all keys under
; `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall`
; and check if `DisplayName` and `Publisher` keys match ${PRODUCTNAME} and ${MANUFACTURER}
;
; This has a potential issue that there maybe another installation that matches
; our ${PRODUCTNAME} and ${MANUFACTURER} but wasn't installed by our WiX installer,
; however, this should be fine since the user will have to confirm the uninstallation
; and they can chose to abort it if doesn't make sense.
Function FindWixInstall
  StrCpy $R6 ""
  StrCpy $0 0
  wix_loop:
    EnumRegKey $1 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall" $0
    StrCmp $1 "" wix_loop_done ; Exit loop if there is no more keys to loop on
    IntOp $0 $0 + 1
    ReadRegStr $R0 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\$1" "DisplayName"
    ReadRegStr $R1 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\$1" "Publisher"
    StrCmp "$R0$R1" "${PRODUCTNAME}${MANUFACTURER}" 0 wix_loop
    ReadRegStr $R0 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\$1" "UninstallString"
    ${StrCase} $R1 $R0 "L"
    ${StrLoc} $R0 $R1 "msiexec" ">"
    StrCmp $R0 0 0 wix_loop_done
    StrCpy $R6 "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\$1"
  wix_loop_done:
FunctionEnd

Function PageReinstall
  ; Uninstall previous WiX installation if exists.
  Call FindWixInstall
  ${If} $R6 != ""
    StrCpy $WixMode 1
    Goto compare_version
  ${EndIf}

  ; Check if there is an existing installation, if not, abort the reinstall page
  ReadRegStr $R0 SHCTX "${UNINSTKEY}" ""
  ReadRegStr $R1 SHCTX "${UNINSTKEY}" "UninstallString"
  ${IfThen} "$R0$R1" == "" ${|} Abort ${|}

  ; Compare this installar version with the existing installation
  ; and modify the messages presented to the user accordingly
  compare_version:
  StrCpy $R4 "$(older)"
  ${If} $WixMode = 1
    ReadRegStr $R0 HKLM "$R6" "DisplayVersion"
  ${Else}
    ReadRegStr $R0 SHCTX "${UNINSTKEY}" "DisplayVersion"
  ${EndIf}
  ${IfThen} $R0 == "" ${|} StrCpy $R4 "$(unknown)" ${|}

  nsis_tauri_utils::SemverCompare "${VERSION}" $R0
  Pop $R0

  ; Read the install choice header through $R5 so a custom language file that only
  ; defines the misspelled `choowHowToInstall` still shows its own text
  ; TODO: remove the `choowHowToInstall` fallback in a future major version
  StrCpy $R5 "$(chooseHowToInstall)"
  ${IfThen} $R5 == "" ${|} StrCpy $R5 "$(choowHowToInstall)" ${|}

  ; Reinstalling the same version
  ${If} $R0 = 0
    StrCpy $R1 "$(alreadyInstalledLong)"
    StrCpy $R2 "$(addOrReinstall)"
    StrCpy $R3 "$(uninstallApp)"
    !insertmacro MUI_HEADER_TEXT "$(alreadyInstalled)" "$(chooseMaintenanceOption)"
  ; Upgrading
  ${ElseIf} $R0 = 1
    StrCpy $R1 "$(olderOrUnknownVersionInstalled)"
    StrCpy $R2 "$(uninstallBeforeInstalling)"
    StrCpy $R3 "$(dontUninstall)"
    !insertmacro MUI_HEADER_TEXT "$(alreadyInstalled)" "$R5"
  ; Downgrading
  ${ElseIf} $R0 = -1
    StrCpy $R1 "$(newerVersionInstalled)"
    StrCpy $R2 "$(uninstallBeforeInstalling)"
    !if "${ALLOWDOWNGRADES}" == "true"
      StrCpy $R3 "$(dontUninstall)"
    !else
      StrCpy $R3 "$(dontUninstallDowngrade)"
    !endif
    !insertmacro MUI_HEADER_TEXT "$(alreadyInstalled)" "$R5"
  ${Else}
    Abort
  ${EndIf}

  ; Halonic change (HAL-1202, flow 2.5): with pages, the same version gets our
  ; run-again page, and a newer one goes to page 1 and installs over the old
  ; one, as an update does. An older one never gets here (.onInit stops it).
  ${If} $PassiveMode <> 1
  ${AndIf} $UpdateMode <> 1
  ${AndIf} $WixMode <> 1
    ${If} $R0 = 0
      Call PageRunAgain
      Return
    ${EndIf}
    Abort
  ${EndIf}

  ; Skip showing the page if passive
  ;
  ; Note that we don't call this earlier at the beginning
  ; of this function because we need to populate some variables
  ; related to current installed version if detected and whether
  ; we are downgrading or not.
  ${If} $PassiveMode = 1
    Call PageLeaveReinstall
  ${Else}
    nsDialogs::Create 1018
    Pop $R4
    ${IfThen} $(^RTL) = 1 ${|} nsDialogs::SetRTL $(^RTL) ${|}

    ${NSD_CreateLabel} 0 0 100% 24u $R1
    Pop $R1

    ${NSD_CreateRadioButton} 30u 50u -30u 8u $R2
    Pop $R2
    ${NSD_OnClick} $R2 PageReinstallUpdateSelection

    ${NSD_CreateRadioButton} 30u 70u -30u 8u $R3
    Pop $R3
    ; Disable this radio button if downgrading and downgrades are disabled
    !if "${ALLOWDOWNGRADES}" == "false"
      ${IfThen} $R0 = -1 ${|} EnableWindow $R3 0 ${|}
    !endif
    ${NSD_OnClick} $R3 PageReinstallUpdateSelection

    ; Check the first radio button if this the first time
    ; we enter this page or if the second button wasn't
    ; selected the last time we were on this page
    ${If} $ReinstallPageCheck <> 2
      SendMessage $R2 ${BM_SETCHECK} ${BST_CHECKED} 0
    ${Else}
      SendMessage $R3 ${BM_SETCHECK} ${BST_CHECKED} 0
    ${EndIf}

    ${NSD_SetFocus} $R2
    nsDialogs::Show
  ${EndIf}
FunctionEnd
Function PageReinstallUpdateSelection
  ${NSD_GetState} $R2 $R1
  ${If} $R1 == ${BST_CHECKED}
    StrCpy $ReinstallPageCheck 1
  ${Else}
    StrCpy $ReinstallPageCheck 2
  ${EndIf}
FunctionEnd
Function PageLeaveReinstall
  ; Halonic change (HAL-1202, flow 2.5): our run-again page uninstalls nothing.
  ${If} $RunAgain = 1
    Call PageRunAgainLeave
    Return
  ${EndIf}

  ${NSD_GetState} $R2 $R1

  ; If migrating from Wix, always uninstall
  ${If} $WixMode = 1
    Goto reinst_uninstall
  ${EndIf}

  ; In update mode, always proceeds without uninstalling
  ${If} $UpdateMode = 1
    Goto reinst_done
  ${EndIf}

  ; $R0 holds whether same(0)/upgrading(1)/downgrading(-1) version
  ; $R1 holds the radio buttons state:
  ;   1 => first choice was selected
  ;   0 => second choice was selected
  ${If} $R0 = 0 ; Same version, proceed
    ${If} $R1 = 1              ; User chose to add/reinstall
      Goto reinst_done
    ${Else}                    ; User chose to uninstall
      Goto reinst_uninstall
    ${EndIf}
  ${ElseIf} $R0 = 1 ; Upgrading
    ${If} $R1 = 1              ; User chose to uninstall
      Goto reinst_uninstall
    ${Else}
      Goto reinst_done         ; User chose NOT to uninstall
    ${EndIf}
  ${ElseIf} $R0 = -1 ; Downgrading
    ${If} $R1 = 1              ; User chose to uninstall
      Goto reinst_uninstall
    ${Else}
      Goto reinst_done         ; User chose NOT to uninstall
    ${EndIf}
  ${EndIf}

  reinst_uninstall:
    HideWindow
    ClearErrors

    ${If} $WixMode = 1
      ReadRegStr $R1 HKLM "$R6" "UninstallString"
      ExecWait '$R1' $0
    ${Else}
      ReadRegStr $4 SHCTX "${MANUPRODUCTKEY}" ""
      ReadRegStr $R1 SHCTX "${UNINSTKEY}" "UninstallString"
      ${IfThen} $UpdateMode = 1 ${|} StrCpy $R1 "$R1 /UPDATE" ${|} ; append /UPDATE
      ${IfThen} $PassiveMode = 1 ${|} StrCpy $R1 "$R1 /P" ${|} ; append /P
      StrCpy $R1 "$R1 _?=$4" ; append uninstall directory
      ExecWait '$R1' $0
    ${EndIf}

    BringToFront

    ${IfThen} ${Errors} ${|} StrCpy $0 2 ${|} ; ExecWait failed, set fake exit code

    ${If} $0 <> 0
    ${OrIf} ${FileExists} "$INSTDIR\${MAINBINARYNAME}.exe"
      ; User cancelled wix uninstaller? return to select un/reinstall page
      ${If} $WixMode = 1
      ${AndIf} $0 = 1602
        Abort
      ${EndIf}

      ; User cancelled NSIS uninstaller? return to select un/reinstall page
      ${If} $0 = 1
        Abort
      ${EndIf}

      ; Other errors? show generic error message and return to select un/reinstall page
      MessageBox MB_ICONEXCLAMATION "$(unableToUninstall)"
      Abort
    ${EndIf}

    ; The NSIS uninstaller was run in place (`_?=`), so it cannot delete itself
    ; and the install directory, clean them up here once the uninstall succeeded
    ; https://nsis.sourceforge.io/Docs/Chapter3.html#:~:text=path%20contains%20spaces.-,3.2.3%20Examples,-installer.exe%20/NCRC
    ${If} $WixMode = 0
    ${AndIf} $4 != ""
      Delete "$4\uninstall.exe"
      RMDir "$4"
    ${EndIf}
  reinst_done:
FunctionEnd

; 5. Halonic's one page (flow 2.2)
Var AppStartMenuFolder
Page custom PageInstall PageInstallLeave

; Halonic change (HAL-17810, board decision on HAL-12716): the licence page
; shows Microsoft's own licence for vcruntime140.dll, unchanged, and only when
; the sandbox step is chosen, because only that step installs the file
; (SkipLicence). Back returns to the page with the box.
!ifdef SANDBOX_STEP
  !define MUI_PAGE_CUSTOMFUNCTION_PRE SkipLicence
  !define MUI_PAGE_HEADER_TEXT "Microsoft's licence terms"
  !define MUI_PAGE_HEADER_SUBTEXT ""
  !define MUI_LICENSEPAGE_TEXT_TOP "The agent sandbox needs vcruntime140.dll, a Microsoft file. Its terms:"
  !define MUI_LICENSEPAGE_TEXT_BOTTOM "Press I Agree to accept them and set up the agent sandbox. To install ${PRODUCTNAME} without the sandbox, press Back and clear its box."
  !insertmacro MUI_PAGE_LICENSE "${VCRUNTIMELICENCE}"
!endif

; 6. Installation page (flow 2.3): the step lines are the page, so they show
; at once, under the title
ShowInstDetails show
!define MUI_PAGE_HEADER_TEXT "Installing ${PRODUCTNAME} ${VERSION}"
!define MUI_PAGE_HEADER_SUBTEXT ""
!insertmacro MUI_PAGE_INSTFILES

; 7. Finished (flow 2.4), our own page
Page custom PageFinish PageFinishLeave

Function RunMainBinary
  nsis_tauri_utils::RunAsUser "$INSTDIR\${MAINBINARYNAME}.exe" ""
FunctionEnd

; Uninstaller Pages
; Halonic change (HAL-1202, flow 2.7): our own confirm page and last page.
; 1. Uninstall Halonic? (flow 2.7)
Var DeleteAppDataCheckbox
Var DeleteAppDataCheckboxState
UninstPage custom un.PageConfirm un.PageConfirmLeave

; 2. Uninstalling Page
!define MUI_PAGE_HEADER_TEXT "Uninstalling ${PRODUCTNAME}"
!define MUI_PAGE_HEADER_SUBTEXT ""
!insertmacro MUI_UNPAGE_INSTFILES

; 3. Halonic is uninstalled (flow 2.7), with the sandbox's leftovers when there are any
UninstPage custom un.PageDone

;Languages
; PageReinstall reads the misspelled `choowHowToInstall` as a fallback, and makensis warns
; about a language string that is read but never set, so default it to an empty string for
; every language. This runs before the language files are included, so a custom language
; file that only defines the old spelling overrides the default and the fallback shows its
; text. `0` as the language id means the language inserted right above.
; TODO: remove the `choowHowToInstall` fallback in a future major version
{{#each languages}}
!insertmacro MUI_LANGUAGE "{{this}}"
LangString choowHowToInstall 0 ""
{{/each}}
!insertmacro MUI_RESERVEFILE_LANGDLL
{{#each language_files}}
  !include "{{this}}"
{{/each}}

Function .onInit
  System::Call 'shell32::IsUserAnAdmin() i .s'
  Pop $Elevated

  ${GetOptions} $CMDLINE "/P" $PassiveMode
  ${IfNot} ${Errors}
    StrCpy $PassiveMode 1
  ${EndIf}

  ${GetOptions} $CMDLINE "/NS" $NoShortcutMode
  ${IfNot} ${Errors}
    StrCpy $NoShortcutMode 1
  ${EndIf}

  ${GetOptions} $CMDLINE "/UPDATE" $UpdateMode
  ${IfNot} ${Errors}
    StrCpy $UpdateMode 1
  ${EndIf}

  ; Halonic change (HAL-1206, failure path 2): `/ROLLBACK` is passed only to
  ; the installer kept for the version before an update, when the new
  ; version didn't start (WaitForStartOrGoBack). It may install an older
  ; version, which `allowDowngrades` refuses to every other install.
  StrCpy $RollbackMode 0
  ${GetOptions} $CMDLINE "/ROLLBACK" $R0
  ${IfNot} ${Errors}
    StrCpy $RollbackMode 1
  ${EndIf}

  ; Halonic change (HAL-1202, flow 2.6): the sandbox step is on by default on
  ; the page, off for silent and passive installs because they can't ask, and
  ; on for a silent install given `/SANDBOX=1` from an elevated prompt.
  StrCpy $SandboxState ${BST_CHECKED}
  StrCpy $ShortcutState ${BST_CHECKED}
  StrCpy $StartAfterState ${BST_CHECKED}
  StrCpy $SandboxOutcome ""
  StrCpy $AppStartMenuFolder "${STARTMENUFOLDER}"
  ${If} ${Silent}
  ${OrIf} $PassiveMode = 1
  ${OrIf} $UpdateMode = 1
    StrCpy $SandboxState ${BST_UNCHECKED}
    ${GetOptions} $CMDLINE "/SANDBOX=" $R0
    ${IfNot} ${Errors}
    ${AndIf} $R0 == "1"
      StrCpy $SandboxAsked 1
      ; Halonic change (HAL-7414): a silent install can't let anyone answer
      ; Windows' prompt, so it sets the sandbox up only from an elevated
      ; prompt, as a silent uninstall removes it (HAL-7385, S-8).
      System::Call 'shell32::IsUserAnAdmin() i .R1'
      ${If} ${Silent}
      ${AndIf} $R1 = 0
        StrCpy $SandboxOutcome "skipped"
      ${Else}
        StrCpy $SandboxState ${BST_CHECKED}
      ${EndIf}
    ${ElseIf} $R0 == "again"
    ${AndIf} $UpdateMode = 1
      ; Halonic change (HAL-5404): an update whose srt needs a higher setup
      ; version sets the sandbox up again, where it is set up.
      !ifdef SANDBOX_STEP
        Call SetUpAgain
      !endif
    ${EndIf}
  ${EndIf}

  !if "${DISPLAYLANGUAGESELECTOR}" == "true"
    !insertmacro MUI_LANGDLL_DISPLAY
  !endif

  !insertmacro SetContext

  ${If} $INSTDIR == "${PLACEHOLDER_INSTALL_DIR}"
    ; Set default install location
    !if "${INSTALLMODE}" == "perMachine"
      ${If} ${RunningX64}
        !if "${ARCH}" == "x64"
          StrCpy $INSTDIR "$PROGRAMFILES64\${PRODUCTNAME}"
        !else if "${ARCH}" == "arm64"
          StrCpy $INSTDIR "$PROGRAMFILES64\${PRODUCTNAME}"
        !else
          StrCpy $INSTDIR "$PROGRAMFILES\${PRODUCTNAME}"
        !endif
      ${Else}
        StrCpy $INSTDIR "$PROGRAMFILES\${PRODUCTNAME}"
      ${EndIf}
    !else if "${INSTALLMODE}" == "currentUser"
      ; Halonic change (HAL-1206, failure path 2): Tauri's default,
      ; $LOCALAPPDATA\Halonic, is the profile folder ($LOCALAPPDATA\halonic,
      ; Windows ignores the case). User data stays out of the folder an
      ; update replaces, so the app goes where Windows puts per-user apps.
      StrCpy $INSTDIR "$LOCALAPPDATA\Programs\${PRODUCTNAME}"
    !endif

    Call RestorePreviousInstallLocation
  ${EndIf}


  !if "${INSTALLMODE}" == "both"
    !insertmacro MULTIUSER_INIT
  !endif

  ; Abort downgrades if they are disabled, in the modes that skip the reinstall page choice:
  ; silent, passive and update
  !if "${ALLOWDOWNGRADES}" == "false"
  ${If} ${Silent}
  ${OrIf} $PassiveMode = 1
  ${OrIf} $UpdateMode = 1
    ; Compare with the same installation the reinstall page would: a WiX one first
    Call FindWixInstall
    ${If} $R6 != ""
      ReadRegStr $R0 HKLM "$R6" "DisplayVersion"
    ${Else}
      ReadRegStr $R0 SHCTX "${UNINSTKEY}" "DisplayVersion"
    ${EndIf}
    nsis_tauri_utils::SemverCompare "${VERSION}" $R0
    Pop $R0
    ; If downgrading
    ${If} $R0 = -1
    ${AndIf} $RollbackMode <> 1
      ${If} ${Silent}
        System::Call 'kernel32::AttachConsole(i -1)i.r0'
        ${If} $0 <> 0
          System::Call 'kernel32::GetStdHandle(i -11)i.r0'
          System::call 'kernel32::SetConsoleTextAttribute(i r0, i 0x0004)' ; set red color
          FileWrite $0 "$(silentDowngrades)"
        ${EndIf}
      ${Else}
        MessageBox MB_ICONSTOP "$(silentDowngrades)"
      ${EndIf}
      Abort
    ${EndIf}
  ${EndIf}
  !endif

  ; Halonic change (HAL-1206): the version this install replaces, if any.
  ReadRegStr $OldVersion SHCTX "${UNINSTKEY}" "DisplayVersion"

  !ifdef SANDBOX_STEP
    Call RefuseOlderSetupVersion
  !endif

  ; Halonic change (HAL-1202, flow 2.5): an older installer stops before any
  ; page, and so does an open Halonic until it is closed. Silent, passive and
  ; update installs keep Tauri's behaviour above and in the Install section.
  ${IfNot} ${Silent}
  ${AndIf} $PassiveMode <> 1
  ${AndIf} $UpdateMode <> 1
    Call RefuseOlderInstaller
    Call WaitUntilHalonicIsClosed
  ${EndIf}
FunctionEnd

; Step lines (flow 2.3): one line per step, and its mark changes in place
; (◌ running, ✓ done, ! stopped, ○ not started). NSIS can only add lines, so
; the page's list (control 1016) is edited directly. They talk through
; StepText and StepNo, and keep every register as they found it.
Var StepText
Var StepNo

Function PrintStep
  Push $R1
  Push $R2
  DetailPrint "$StepText"
  FindWindow $R1 "#32770" "" $HWNDPARENT
  GetDlgItem $R1 $R1 1016
  SendMessage $R1 0x1004 0 0 $R2
  IntOp $StepNo $R2 - 1
  Pop $R2
  Pop $R1
FunctionEnd

Function SetStep
  Push $R1
  Push $R2
  FindWindow $R1 "#32770" "" $HWNDPARENT
  GetDlgItem $R1 $R1 1016
  ; LVITEMW with LVIF_TEXT: mask, item, subitem, state, stateMask, text
  System::Call '*(i 1, i $StepNo, i 0, i 0, i 0, t "$StepText") p.R2'
  SendMessage $R1 0x1074 $StepNo $R2
  System::Free $R2
  Pop $R2
  Pop $R1
FunctionEnd

!macro PrintStep VAR TEXT
  StrCpy $StepText "${TEXT}"
  Call PrintStep
  StrCpy ${VAR} $StepNo
!macroend
!macro SetStep VAR TEXT
  StrCpy $StepNo ${VAR}
  StrCpy $StepText "${TEXT}"
  Call SetStep
!macroend

!ifdef SANDBOX_STEP
; Halonic change (HAL-14812): the installer asks Windows for administrator
; rights itself, with its own window as the prompt's owner, so the prompt comes
; to the front. Asked for by a hidden PowerShell three programs down, it didn't
; show on a tester's PC, and the step waited for ever. Starts the signed helper
; (its manifest asks for the rights) with the verb on the stack, `setup` or
; `remove`, and waits at most SANDBOX_HELPER_MS for it. Pushes "refused",
; "nostart", "timeout" or the helper's exit code. The uninstaller's copy runs
; the removal when it has administrator rights itself (un.RemoveSandbox).
; A signed release starts it only when HelperSigner names SANDBOXSIGNER, else
; pushes "nostart" with $SandboxReason set (HAL-16342), as Studio's shell
; checks it: with administrator rights Windows shows no prompt, so nobody
; would see whose program it is.
!define SANDBOX_HELPER_MS 300000
!macro ElevateSandboxHelper un
Function ${un}ElevateSandboxHelper
  Exch $5
  Push $0
  Push $1
  Push $2
  Push $3
  Push $4
  StrCpy $3 ""
  ; Held open, shared for reading only, until Windows has started it: until
  ; then nothing can write, rename or delete the helper (HAL-14958). Not
  ; held, it isn't started.
  System::Call 'kernel32::CreateFileW(w "$INSTDIR\halonic-sandbox-elevate.exe", i 0x80000000, i 1, p 0, i 3, i 0, p 0) p .r4'
  ${If} $4 = -1
    StrCpy $3 "nostart"
  !ifdef SANDBOXSIGNER
  ${Else}
    Push $4
    Call ${un}HelperSigner
    Pop $2
    ${If} $2 S!= "${SANDBOXSIGNER}"
      System::Call 'kernel32::CloseHandle(p r4)'
      StrCpy $SandboxReason "the sandbox helper isn't signed by ${SANDBOXSIGNER}"
      StrCpy $HelperRefused 1
      StrCpy $3 "nostart"
    ${EndIf}
  !endif
  ${EndIf}
  ${If} $3 == ""
    ; SHELLEXECUTEINFOW, laid out for the 32-bit installer: SEE_MASK_NOCLOSEPROCESS | SEE_MASK_NOASYNC, the
    ; installer's window, "runas", the helper, the verb, no window of its own.
    System::Call '*(&l4, i 0x140, p $HWNDPARENT, w "runas", w "$INSTDIR\halonic-sandbox-elevate.exe", w "$5", w "$INSTDIR", i 0, p 0, p 0, p 0, p 0, i 0, p 0, p 0) p .r0'
    System::Call 'shell32::ShellExecuteExW(p r0) i .r1 ?e'
    Pop $2
    System::Call 'kernel32::CloseHandle(p r4)'
    ${If} $1 = 0
      ; ERROR_CANCELLED: the prompt was turned down or closed.
      ${If} $2 = 1223
        StrCpy $3 "refused"
      ${Else}
        StrCpy $3 "nostart"
      ${EndIf}
    ${Else}
      System::Call '*$0(i, i, p, p, p, p, p, i, p, p, p, p, i, p, p .r1)'
      ${If} $1 = 0
        StrCpy $3 "nostart"
      ${Else}
        System::Call 'kernel32::WaitForSingleObject(p r1, i ${SANDBOX_HELPER_MS}) i .r2'
        ${If} $2 = 0
          System::Call 'kernel32::GetExitCodeProcess(p r1, *i .r3)'
        ${Else}
          ; Left running: a setup that finishes late still counts, and Studio
          ; finds it set up.
          StrCpy $3 "timeout"
        ${EndIf}
        System::Call 'kernel32::CloseHandle(p r1)'
      ${EndIf}
    ${EndIf}
    System::Free $0
  ${EndIf}
  Pop $4
  ; The result goes on top of the stack, each register back as it was.
  Exch $3
  Exch
  Pop $2
  Exch
  Pop $1
  Exch
  Pop $0
  Exch
  Pop $5
FunctionEnd
!macroend

!ifdef SANDBOXSIGNER
; The publisher Windows trusts the signature of the helper held open by the
; handle on the stack to name, or "" (HAL-16342). Windows reads the file
; through that handle, as Studio's shell does (halonic-publisher), so it is
; the file held open that is checked, and the name is read as the UAC prompt
; shows it. No revocation check: it would go online with administrator
; rights, and can hang without a network.
!macro HelperSigner un
Function ${un}HelperSigner
  Exch $0
  Push $1
  Push $2
  Push $3
  Push $4
  Push $5
  Push $6
  StrCpy $6 ""
  ; WINTRUST_FILE_INFO: its size, the helper's path, the handle, no subject.
  System::Call '*(i 16, w "$INSTDIR\halonic-sandbox-elevate.exe", p r0, p 0) p .r1'
  ; WINTRUST_DATA, laid out for the 32-bit installer: no UI, no revocation
  ; check, a file, verify, cached URLs only.
  System::Call '*(i 52, p 0, p 0, i 2, i 0, i 1, p r1, i 1, p 0, p 0, i 0x1000, i 0, p 0) p .r2'
  ; WINTRUST_ACTION_GENERIC_VERIFY_V2
  System::Call '*(g "{00AAC56B-CD44-11d0-8CC2-00C04FC295EE}") p .r3'
  System::Call 'wintrust::WinVerifyTrust(p 0, p r3, p r2) i .r4'
  ${If} $4 = 0
    System::Call '*$2(i, p, p, i, i, i, p, i, p .r4)'
    System::Call 'wintrust::WTHelperProvDataFromStateData(p r4) p .r4'
    ${If} $4 <> 0
      ; The primary signer, no countersigner.
      System::Call 'wintrust::WTHelperGetProvSignerFromChain(p r4, i 0, i 0, i 0) p .r4'
    ${EndIf}
    ${If} $4 <> 0
      ; CRYPT_PROVIDER_SGNR: its size, a FILETIME, then the chain's length
      ; and entries; the first entry's certificate is the signer's.
      System::Call '*$4(i, i, i, i .r5, p .r4)'
      ${If} $5 > 0
      ${AndIf} $4 <> 0
        System::Call '*$4(i, p .r4)'
        ${If} $4 <> 0
          ; CERT_NAME_SIMPLE_DISPLAY_TYPE; the length counts the NUL.
          System::Call 'crypt32::CertGetNameStringW(p r4, i 4, i 0, p 0, w .r5, i ${NSIS_MAX_STRLEN}) i .r4'
          ${If} $4 > 1
            StrCpy $6 $5
          ${EndIf}
        ${EndIf}
      ${EndIf}
    ${EndIf}
  ${EndIf}
  ; Closing frees the state the verify left: dwStateAction is at 28.
  IntOp $4 $2 + 28
  System::Call '*$4(i 2)'
  System::Call 'wintrust::WinVerifyTrust(p 0, p r3, p r2) i .r4'
  System::Free $3
  System::Free $2
  System::Free $1
  StrCpy $0 $6
  Pop $6
  Pop $5
  Pop $4
  Pop $3
  Pop $2
  Pop $1
  Exch $0
FunctionEnd
!macroend
!insertmacro HelperSigner ""
!insertmacro HelperSigner "un."
!endif

!insertmacro ElevateSandboxHelper ""
!insertmacro ElevateSandboxHelper "un."
!endif

Section WebView2
  ; Check if Webview2 is already installed and skip this section
  ${If} ${RunningX64}
    ReadRegStr $4 HKLM "SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\${WEBVIEW2APPGUID}" "pv"
  ${Else}
    ReadRegStr $4 HKLM "SOFTWARE\Microsoft\EdgeUpdate\Clients\${WEBVIEW2APPGUID}" "pv"
  ${EndIf}
  ${If} $4 == ""
    ReadRegStr $4 HKCU "SOFTWARE\Microsoft\EdgeUpdate\Clients\${WEBVIEW2APPGUID}" "pv"
  ${EndIf}

  ${If} $4 == ""
    ; Webview2 installation
    ;
    ; Skip if updating
    ${If} $UpdateMode <> 1
      !if "${INSTALLWEBVIEW2MODE}" == "downloadBootstrapper"
        Delete "$TEMP\MicrosoftEdgeWebview2Setup.exe"
        DetailPrint "$(webview2Downloading)"
        NSISdl::download "https://go.microsoft.com/fwlink/p/?LinkId=2124703" "$TEMP\MicrosoftEdgeWebview2Setup.exe"
        Pop $0
        ${If} $0 == "success"
          DetailPrint "$(webview2DownloadSuccess)"
        ${Else}
          DetailPrint "$(webview2DownloadError)"
          Abort "$(webview2AbortError)"
        ${EndIf}
        StrCpy $6 "$TEMP\MicrosoftEdgeWebview2Setup.exe"
        Goto install_webview2
      !endif

      !if "${INSTALLWEBVIEW2MODE}" == "embedBootstrapper"
        Delete "$TEMP\MicrosoftEdgeWebview2Setup.exe"
        File "/oname=$TEMP\MicrosoftEdgeWebview2Setup.exe" "${WEBVIEW2BOOTSTRAPPERPATH}"
        DetailPrint "$(installingWebview2)"
        StrCpy $6 "$TEMP\MicrosoftEdgeWebview2Setup.exe"
        Goto install_webview2
      !endif

      !if "${INSTALLWEBVIEW2MODE}" == "offlineInstaller"
        Delete "$TEMP\MicrosoftEdgeWebView2RuntimeInstaller.exe"
        File "/oname=$TEMP\MicrosoftEdgeWebView2RuntimeInstaller.exe" "${WEBVIEW2INSTALLERPATH}"
        DetailPrint "$(installingWebview2)"
        StrCpy $6 "$TEMP\MicrosoftEdgeWebView2RuntimeInstaller.exe"
        Goto install_webview2
      !endif

      Goto webview2_done

      install_webview2:
        DetailPrint "$(installingWebview2)"
        ; $6 holds the path to the webview2 installer
        ExecWait "$6 ${WEBVIEW2INSTALLERARGS} /install" $1
        ${If} $1 = 0
          DetailPrint "$(webview2InstallSuccess)"
        ${Else}
          DetailPrint "$(webview2InstallError)"
          Abort "$(webview2AbortError)"
        ${EndIf}
      webview2_done:
    ${EndIf}
  ${Else}
    !if "${MINIMUMWEBVIEW2VERSION}" != ""
      ${VersionCompare} "${MINIMUMWEBVIEW2VERSION}" "$4" $R0
      ${If} $R0 = 1
        update_webview:
          DetailPrint "$(installingWebview2)"
          ${If} ${RunningX64}
            ReadRegStr $R1 HKLM "SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate" "path"
          ${Else}
            ReadRegStr $R1 HKLM "SOFTWARE\Microsoft\EdgeUpdate" "path"
          ${EndIf}
          ${If} $R1 == ""
            ReadRegStr $R1 HKCU "SOFTWARE\Microsoft\EdgeUpdate" "path"
          ${EndIf}
          ${If} $R1 != ""
            ; Chromium updater docs: https://source.chromium.org/chromium/chromium/src/+/main:docs/updater/user_manual.md
            ; Modified from "HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Microsoft EdgeWebView\ModifyPath"
            ExecWait `"$R1" /install appguid=${WEBVIEW2APPGUID}&needsadmin=true` $1
            ${If} $1 = 0
              DetailPrint "$(webview2InstallSuccess)"
            ${Else}
              MessageBox MB_ICONEXCLAMATION|MB_ABORTRETRYIGNORE "$(webview2InstallError)" IDIGNORE ignore IDRETRY update_webview
              Quit
              ignore:
            ${EndIf}
          ${EndIf}
      ${EndIf}
    !endif
  ${EndIf}
SectionEnd

Section Install
  SetOutPath $INSTDIR
  ; The three lines are on the page at once (flow 2.3); the sandbox ones only
  ; when the box is ticked. Run again without Repair copies nothing, so it has
  ; no copy line (flow 2.5).
  ${If} $SkipCopy <> 1
    !insertmacro PrintStep $LineCopy "◌ Copying Halonic…"
  ${EndIf}
  !ifdef SANDBOX_STEP
    ${If} $SandboxState == ${BST_CHECKED}
      !insertmacro PrintStep $LineSetup "○ Setting up the agent sandbox"
      !insertmacro PrintStep $LineCheck "○ Checking the agent sandbox"
    ${EndIf}
  !endif
  ${If} $SkipCopy = 1
    Goto copy_done
  ${EndIf}

  !ifmacrodef NSIS_HOOK_PREINSTALL
    !insertmacro NSIS_HOOK_PREINSTALL
  !endif

  ; Halonic change (HAL-1202, flow 2.5): with pages, the installer never closes
  ; Halonic by itself, because a run might be going. Asked again here, as
  ; Halonic may have been opened while page 1 was showing.
  ${If} ${Silent}
  ${OrIf} $PassiveMode = 1
  ${OrIf} $UpdateMode = 1
    ; Halonic change (HAL-11982): "Restart to update" starts this installer
    ; and then quits, so Studio may still be closing here. Tauri's check below
    ; then fails to close it, and the install stops with "Failed to kill" on a
    ; page nobody sees, nothing copied. Let Studio and its helpers close first.
    ${IfThen} $UpdateMode = 1 ${|} Call WaitUntilHelpersAreClosed ${|}
    !insertmacro CheckIfAppIsRunning "$INSTDIR\${MAINBINARYNAME}.exe" "${PRODUCTNAME}"
  ${Else}
    Call WaitUntilHalonicIsClosed
  ${EndIf}

  ; Halonic change (HAL-11048): the helpers of the old version may still be
  ; closing when the installer starts.
  Call WaitUntilHelpersAreClosed

  ; Keep NSIS's own file lines (Extract, Create folder) out of the list so
  ; our step lines stay in view.
  SetDetailsPrint none

  ; Copy main executable
  File "${MAINBINARYSRCPATH}"

  ; Copy resources
  {{#each resources_dirs}}
    CreateDirectory "$INSTDIR\\{{this}}"
  {{/each}}
  {{#each resources}}
    File /a "/oname={{this.[1]}}" "{{no-escape @key}}"
  {{/each}}

  ; Copy external binaries
  {{#each binaries}}
    File /a "/oname={{this}}" "{{no-escape @key}}"
  {{/each}}

  ; Create file associations
  {{#each file_associations as |association| ~}}
    {{#each association.ext as |ext| ~}}
       !insertmacro APP_ASSOCIATE "{{ext}}" "{{or association.name ext}}" "{{association-description association.description ext}}" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\",0" "Open with ${PRODUCTNAME}" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"%1$\""
    {{/each}}
  {{/each}}

  ; Register deep links
  {{#each deep_link_protocols as |protocol| ~}}
    WriteRegStr SHCTX "Software\Classes\\{{protocol}}" "URL Protocol" ""
    WriteRegStr SHCTX "Software\Classes\\{{protocol}}" "" "URL:${BUNDLEID} protocol"
    WriteRegStr SHCTX "Software\Classes\\{{protocol}}\DefaultIcon" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\",0"
    WriteRegStr SHCTX "Software\Classes\\{{protocol}}\shell\open\command" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"%1$\""
  {{/each}}

  ; Create uninstaller
  WriteUninstaller "$INSTDIR\uninstall.exe"

  ; Save $INSTDIR in registry for future installations
  WriteRegStr SHCTX "${MANUPRODUCTKEY}" "" $INSTDIR

  !if "${INSTALLMODE}" == "both"
    ; Save install mode to be selected by default for the next installation such as updating
    ; or when uninstalling
    WriteRegStr SHCTX "${UNINSTKEY}" $MultiUser.InstallMode 1
  !endif

  ; Remove old main binary if it doesn't match new main binary name
  ReadRegStr $OldMainBinaryName SHCTX "${UNINSTKEY}" "MainBinaryName"
  ${If} $OldMainBinaryName != ""
  ${AndIf} $OldMainBinaryName != "${MAINBINARYNAME}.exe"
    Delete "$INSTDIR\$OldMainBinaryName"
  ${EndIf}

  ; Save current MAINBINARYNAME for future updates
  WriteRegStr SHCTX "${UNINSTKEY}" "MainBinaryName" "${MAINBINARYNAME}.exe"

  ; Registry information for add/remove programs
  WriteRegStr SHCTX "${UNINSTKEY}" "DisplayName" "${PRODUCTNAME}"
  WriteRegStr SHCTX "${UNINSTKEY}" "DisplayIcon" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\""
  WriteRegStr SHCTX "${UNINSTKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr SHCTX "${UNINSTKEY}" "Publisher" "${MANUFACTURER}"
  WriteRegStr SHCTX "${UNINSTKEY}" "InstallLocation" "$\"$INSTDIR$\""
  WriteRegStr SHCTX "${UNINSTKEY}" "UninstallString" "$\"$INSTDIR\uninstall.exe$\""
  WriteRegDWORD SHCTX "${UNINSTKEY}" "NoModify" "1"
  WriteRegDWORD SHCTX "${UNINSTKEY}" "NoRepair" "1"

  ${GetSize} "$INSTDIR" "/M=uninstall.exe /S=0K /G=0" $0 $1 $2
  IntOp $0 $0 + ${ESTIMATEDSIZE}
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD SHCTX "${UNINSTKEY}" "EstimatedSize" "$0"

  !if "${HOMEPAGE}" != ""
    WriteRegStr SHCTX "${UNINSTKEY}" "URLInfoAbout" "${HOMEPAGE}"
    WriteRegStr SHCTX "${UNINSTKEY}" "URLUpdateInfo" "${HOMEPAGE}"
    WriteRegStr SHCTX "${UNINSTKEY}" "HelpLink" "${HOMEPAGE}"
  !endif

  ; Halonic change (HAL-1202): the desktop shortcut is a box on our page; a
  ; silent or passive install keeps it, as before.
  ${If} $ShortcutState == ${BST_CHECKED}
    Call CreateOrUpdateDesktopShortcut
  ${EndIf}

  !ifmacrodef NSIS_HOOK_POSTINSTALL
    !insertmacro NSIS_HOOK_POSTINSTALL
  !endif

  SetDetailsPrint both
  !insertmacro SetStep $LineCopy "✓ Copied Halonic"
  copy_done:

  ; Halonic change (HAL-18322, board direction on HAL-10): every install, an
  ; update, Repair and run again without Repair too, takes away the Start menu
  ; shortcuts an earlier Halonic made and makes the current set: Halonic, in
  ; the "Halonic" folder, and the focused apps' shortcuts beside it (HAL-17903).
  Call RemoveOldStartMenuShortcuts
  Call CreateOrUpdateStartMenuShortcut
  Call CreateFocusedAppShortcuts

  ; Halonic change (HAL-17810): Microsoft's vcruntime140.dll, under a name
  ; nothing loads, only for the sandbox step, whose helper puts it beside
  ; srt-win (crates/sandbox-elevate). With pages, the box was ticked and
  ; Microsoft's licence accepted; silently, /SANDBOX=1 asked for the step. Run
  ; again without Repair needs it too, and so does /SANDBOX=1 without
  ; administrator rights, where the step is skipped but can run later. An
  ; install over one that has the file replaces it, so an update can set the
  ; sandbox up again.
  !ifdef SANDBOX_STEP
    ${If} $SandboxState == ${BST_CHECKED}
    ${OrIf} $SandboxAsked = 1
    ${OrIf} ${FileExists} "$INSTDIR\vcruntime140.dll.pinned"
      SetDetailsPrint none
      File /a "/oname=vcruntime140.dll.pinned" "${VCRUNTIME}"
      SetDetailsPrint both
    ${EndIf}
  !endif

  ; Auto close this page for passive mode
  ${If} $PassiveMode = 1
    SetAutoClose true
  ${EndIf}
SectionEnd

; The sandbox step (flow 2.3 steps 3 and 4). None of its outcomes stops the
; install: Halonic is already copied. The page after this one says what
; happened (flow 2.4).
Section SandboxStep
  !ifdef SANDBOX_STEP
    ; First, as the person installing and whatever the box says, take back the
    ; access a removal with administrator rights kept on their folders
    ; (HAL-16084). It must come before the helper: once srt's sandbox account
    ; is there again, srt no longer reports that access as left behind. With
    ; administrator rights it takes nothing back. No outcome stops the install
    ; or shows on the page: the host logs what it did. The executable needs the
    ; profile folder to unpack into, as for every host command. An installer
    ; with the rights doesn't start it at all: it would take nothing back, and
    ; the user can swap what's in $INSTDIR.
    ${IfThen} $Elevated <> 0 ${|} Goto take_back_done ${|}
    Call ProfileFolder
    Pop $1
    nsExec::ExecToStack /TIMEOUT=60000 '"$INSTDIR\halonic-agent-host.exe" --profile-folder "$1" --sandbox-take-back'
    Pop $2
    Pop $2
    take_back_done:
    ${If} $SandboxState == ${BST_CHECKED}
      !insertmacro SetStep $LineSetup "◌ Setting up the agent sandbox…"
      ${IfNot} ${Silent}
        DetailPrint "   Windows is asking for administrator rights."
      ${EndIf}
      ; The installer asks Windows itself and starts the signed helper from its
      ; own window (HAL-14812), then the agent host checks the sandbox as the
      ; person installing, without the rights. A silent install gets here only
      ; from an elevated prompt (/SANDBOX=1, checked in .onInit), where Windows
      ; doesn't ask.
      StrCpy $SandboxReason ""
      Push "setup"
      Call ElevateSandboxHelper
      Pop $2
      ${If} $2 == "0"
      ${AndIf} $Elevated <> 0
        ; With the rights, the check can't run as the person installing, and
        ; the agent host is in $INSTDIR. It is set up; Settings › Agent sandbox
        ; checks it.
        StrCpy $2 "unchecked"
      ${ElseIf} $2 == "0"
        Call ProfileFolder
        Pop $1
        nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\sandbox-step.ps1" -CheckOnly -HostExe "$INSTDIR\halonic-agent-host.exe" -ProfileFolder "$1"'
        Pop $2
        Pop $SandboxReason
        Push $SandboxReason
        Call TrimEol
        Pop $SandboxReason
      ${ElseIf} $2 == "refused"
        StrCpy $2 "10"
      ${ElseIf} $2 == "nostart"
        ${If} $SandboxReason == ""
          StrCpy $SandboxReason "Windows couldn't start the sandbox helper"
        ${EndIf}
        StrCpy $2 "11"
      ${ElseIf} $2 != "timeout"
        ; The helper's own codes, 12 to 40, aren't this step's codes.
        StrCpy $SandboxReason "the sandbox helper stopped with code $2"
        StrCpy $2 "11"
      ${EndIf}
      ${If} $2 == "0"
        StrCpy $SandboxOutcome "ready"
        !insertmacro SetStep $LineSetup "✓ Set up the agent sandbox"
        !insertmacro SetStep $LineCheck "✓ Checked the agent sandbox"
      ${ElseIf} $2 == "unchecked"
        StrCpy $SandboxOutcome "unchecked"
        !insertmacro SetStep $LineSetup "✓ Set up the agent sandbox"
        !insertmacro SetStep $LineCheck "○ Checking the agent sandbox, skipped"
      ${ElseIf} $2 == "10"
        StrCpy $SandboxOutcome "refused"
        !insertmacro SetStep $LineSetup "! The agent sandbox isn't set up: Windows didn't give administrator rights."
        !insertmacro SetStep $LineCheck "○ Checking the agent sandbox, skipped"
      ${ElseIf} $2 == "timeout"
        StrCpy $SandboxOutcome "timeout"
        !insertmacro SetStep $LineSetup "! The agent sandbox isn't set up yet: Windows didn't finish it within 5 minutes."
        !insertmacro SetStep $LineCheck "○ Checking the agent sandbox, skipped"
      ${ElseIf} $2 == "12"
        StrCpy $SandboxOutcome "checkfailed"
        !insertmacro SetStep $LineSetup "✓ Set up the agent sandbox"
        !insertmacro SetStep $LineCheck "! The agent sandbox didn't pass its check: $SandboxReason"
      ${Else}
        StrCpy $SandboxOutcome "failed"
        ${If} $SandboxReason == ""
          StrCpy $SandboxReason "the setup ended with code $2 and no reason"
        ${EndIf}
        !insertmacro SetStep $LineSetup "! The agent sandbox isn't set up: $SandboxReason"
        !insertmacro SetStep $LineCheck "○ Checking the agent sandbox, skipped"
      ${EndIf}
    ${ElseIf} $SandboxOutcome == "skipped"
      DetailPrint "○ The agent sandbox isn't set up: a silent install sets it up only from an elevated prompt."
    ${EndIf}
    !ifdef SANDBOXSIGNER
      ; Halonic is installed, but a silent install has no page to say why the
      ; sandbox isn't (HAL-16947).
      ${If} ${Silent}
      ${AndIf} $HelperRefused == 1
        SetErrorLevel ${HELPER_REFUSED_EXIT}
      ${EndIf}
    !endif
  !endif

  ; Go to the finish page by itself, as nothing on this page needs a click.
  ${If} ${Silent}
  ${OrIf} $PassiveMode = 1
    ; nothing to show
  ${Else}
    SetAutoClose true
  ${EndIf}
SectionEnd

Function .onInstSuccess
  Call KeepInstaller
  ; Halonic change (HAL-1202, HAL-1139): Tauri's template reopens the app after
  ; a passive or silent install when it gets `/R`. Ours reopens it only on
  ; `/RELAUNCH`, which Studio adds for "Restart to update". "Install at quit"
  ; and `/S` installs (winget) leave Halonic closed.
  ${If} $PassiveMode = 1
  ${OrIf} ${Silent}
    ${GetOptions} $CMDLINE "/RELAUNCH" $R0
    ${IfNot} ${Errors}
      nsis_tauri_utils::RunAsUser "$INSTDIR\${MAINBINARYNAME}.exe" ""
      ${If} $UpdateMode = 1
      ${AndIf} $RollbackMode <> 1
        Call WaitForStartOrGoBack
      ${EndIf}
    ${EndIf}
  ${EndIf}
FunctionEnd

; Halonic change (HAL-1206, failure path 2): keeps a copy of this installer in
; the profile, `updates\installers\Halonic-<version>-windows-x64-setup.exe`,
; so a later update can go back to this version. This version proves it
; starts again (the shell writes `updates\started-<version>` once the window
; is open and the agent host answers), and then removes the copies kept for
; other versions.
Function KeepInstaller
  Call ProfileFolder
  Pop $1
  Delete "$1\updates\started-${VERSION}"
  StrCpy $2 "$1\updates\installers\Halonic-${VERSION}-windows-x64-setup.exe"
  ${If} "$EXEPATH" != $2
    CreateDirectory "$1\updates\installers"
    CopyFiles /SILENT /FILESONLY "$EXEPATH" $2
  ${EndIf}
  ; Halonic change (HAL-5404 S3): beside it, the setup version its srt needs,
  ; for the guard before a later update goes back to it.
  CreateDirectory "$1\updates\installers"
  FileOpen $3 "$1\updates\installers\Halonic-${VERSION}.srt-setup" w
  ${If} $3 != ""
    FileWrite $3 "${SRTSETUPVERSION}"
    FileClose $3
  ${EndIf}
FunctionEnd

; Halonic change (HAL-1206, failure path 2; HAL-8156): after "Restart to
; update", waits up to 180 s for the new version to prove it starts. If it
; doesn't, the installer kept for the version before runs with `/ROLLBACK`,
; which closes the new one, installs the old one and reopens it. Nothing to
; go back to (a first install, or no kept installer) means nothing to wait for.
;
; The 180 s must stay well above the shell's own worst case: the marker is
; written only after the agent host answers, and the host alone may take
; START_WAIT (60 s, apps/studio/src-tauri/src/agent_host.rs) to unpack and
; serve, on top of the window opening and the page loading. 180 s is three
; times START_WAIT, so a slow or busy machine doesn't lose a working update.
; Keep it above START_WAIT plus a generous margin if either number changes.
; Where the sandbox choice is the host in the WSL distro, the proof is the
; host beside the shell (`host_answers`, apps/studio/src-tauri/src/
; agent_host_life.rs): the distro's own first start installs the runtime and
; security updates and can take minutes, so it never counts against the 180 s.
;
; If the user quits the new version before it proves it starts, the marker is
; never written and the installer goes back after the wait. That is on
; purpose: a version that quit before it proved itself can't be told from one
; that crashed, and the version before is the one known to work. Telling them
; apart would need a "quit cleanly" record from the shell for little gain.
Function WaitForStartOrGoBack
  ${If} $OldVersion == ""
  ${OrIf} $OldVersion == "${VERSION}"
    Return
  ${EndIf}
  Call ProfileFolder
  Pop $1
  StrCpy $2 "$1\updates\installers\Halonic-$OldVersion-windows-x64-setup.exe"
  ${IfNot} ${FileExists} $2
    Return
  ${EndIf}
  HideWindow
  StrCpy $3 0
  ${Do}
    ${If} ${FileExists} "$1\updates\started-${VERSION}"
      Return
    ${EndIf}
    Sleep 1000
    IntOp $3 $3 + 1
  ${LoopUntil} $3 >= 180
  ; Halonic change (HAL-16523): the kept installer is in the profile folder,
  ; which the user's programs without administrator rights can write. An
  ; installer Windows raised to those rights doesn't start it: the new version
  ; stays, and updates.log and a message say why (HAL-16570).
  Call RaisedFromLimitedRights
  Pop $4
  ${If} $4 = 1
    StrCpy $R3 "${PRODUCTNAME} ${VERSION} didn't start within 3 minutes, but it stays. The installer didn't go back to $OldVersion, because this update runs with administrator rights and the kept $OldVersion installer is in a folder that programs without those rights can change. To go back, install $OldVersion again without administrator rights."
    Call SayRollbackSkipped
    !ifdef SANDBOX_STEP
      Call LogUpdateLine
    !endif
    Return
  ${EndIf}
  ; Halonic change (HAL-5404 S3): not across a raise of srt's setup version,
  ; and not when the guard can't tell. The new version stays, and
  ; updates.log says why.
  !ifdef SANDBOX_STEP
    StrCpy $R0 '-RecordFile "$1\updates\installers\Halonic-$OldVersion.srt-setup"'
    Call CheckSetupVersion
    ${If} $R1 <> 0
      ; Not Settings: this version didn't start. An uninstall removes the
      ; sandbox, and the kept installers with it.
      StrCpy $R3 "${PRODUCTNAME} ${VERSION} didn't start within 3 minutes, but it stays. The installer can't go back to $OldVersion, because $R2. To go back, uninstall ${PRODUCTNAME}, which removes the agent sandbox too, then install $OldVersion again."
      Call SayRollbackSkipped
      Call LogUpdateLine
      Return
    ${EndIf}
  !endif
  Exec '"$2" /P /UPDATE /ROLLBACK /RELAUNCH'
FunctionEnd

; Halonic change (HAL-16570): shows $R3, the reason going back was skipped,
; and where updates.log is. The new version may not open at all, so this
; installer, hidden for the wait, is the only one left to say it. A silent
; update shows nothing; its line in updates.log stays.
Function SayRollbackSkipped
  ${If} ${Silent}
    Return
  ${EndIf}
  Push $0
  Call ProfileFolder
  Pop $0
  MessageBox MB_OK|MB_ICONEXCLAMATION|MB_TOPMOST "$R3$\r$\n$\r$\nThis is also written to $0\updates\updates.log."
  Pop $0
FunctionEnd

; Halonic change (HAL-16523): pushes 1 when Windows raised this installer to
; administrator rights from an account whose other programs run without them
; (the token's elevation type is "full"), else 0. Only then could a program
; with fewer rights have changed what the profile folder holds. With UAC off,
; or for the built-in Administrator, every program of the account has the
; rights already (type "default"). When the token can't be read, it counts
; any administrator as raised.
Function RaisedFromLimitedRights
  Push $0
  Push $1
  Push $2
  Push $3
  StrCpy $2 ""
  ; TOKEN_QUERY (8), then TokenElevationType (18): 1 default, 2 full, 3 limited.
  System::Call 'advapi32::OpenProcessToken(p -1, i 8, *p .r0) i .r1'
  ${If} $1 <> 0
    System::Call 'advapi32::GetTokenInformation(p r0, i 18, *i .r2, i 4, *i .r3) i .r1'
    ${If} $1 = 0
      StrCpy $2 ""
    ${EndIf}
    System::Call 'kernel32::CloseHandle(p r0)'
  ${EndIf}
  ${If} $2 == ""
    System::Call 'shell32::IsUserAnAdmin() i .r2'
    ${If} $2 <> 0
      StrCpy $2 2
    ${EndIf}
  ${EndIf}
  ${If} $2 = 2
    StrCpy $2 1
  ${Else}
    StrCpy $2 0
  ${EndIf}
  ; The stack holds $3, $2, $1, $0 from the top: restore them, leave the answer.
  Pop $3
  Exch $2
  Exch
  Pop $1
  Exch
  Pop $0
FunctionEnd

!ifdef SANDBOX_STEP
; Halonic change (HAL-5404 S3): runs the rollback guard (setup-guard.ps1, from
; this installer's own plugins folder) with the arguments in $R0. Sets $R1 to
; 0 (go on), 1 (refuse) or 2 (can't tell), and $R2 to the reason. The guard
; reads srt's marker from the registry and runs nothing from $INSTDIR, which
; the user can write, so it is safe with administrator rights too.
Function CheckSetupVersion
  InitPluginsDir
  File "/oname=$PLUGINSDIR\setup-guard.ps1" "${SETUPGUARD}"
  nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\setup-guard.ps1" $R0'
  Pop $R1
  Pop $R2
  Push $R2
  Call TrimEol
  Pop $R2
  ; nsExec gives "error" or "timeout" when PowerShell didn't run.
  ${If} $R1 != "0"
  ${AndIf} $R1 != "1"
    StrCpy $R1 2
  ${EndIf}
FunctionEnd

; Halonic change (HAL-5404 S3, flow 2.5): an installer whose srt needs an
; older setup version than the sandbox on this computer stops before any
; page, as RefuseOlderInstaller does. Silent and passive ones exit with 2 and
; no box. When the guard can't tell, it goes on and says so in updates.log.
Function RefuseOlderSetupVersion
  StrCpy $R0 "-SetupVersion ${SRTSETUPVERSION}"
  Call CheckSetupVersion
  ${If} $R1 = 2
    StrCpy $R3 "Installing ${VERSION}: the sandbox's setup version wasn't checked because $R2."
    Call LogUpdateLine
  ${ElseIf} $R1 = 1
    ${IfNot} ${Silent}
    ${AndIf} $PassiveMode <> 1
      MessageBox MB_OK|MB_ICONEXCLAMATION "The agent sandbox on this computer was set up by a newer version of ${PRODUCTNAME}. To install ${PRODUCTNAME} ${VERSION}, first remove the sandbox in the newer version (Settings › Agent sandbox › Remove the sandbox…). If it's no longer installed, install it again to remove the sandbox. Then run this installer again."
    ${EndIf}
    SetErrorLevel 2
    Quit
  ${EndIf}
FunctionEnd

; Halonic change (HAL-5404): `/SANDBOX=again`, which the updater passes when
; the update's latest.json says its srt needs a higher setup version. That
; number isn't signed, so the installer decides by itself: the sandbox step
; runs, with its one administrator prompt, only where srt's marker says the
; sandbox is set up for an older setup version than this installer's srt
; needs. A computer that never set it up, or one already set up for this
; version, gets no prompt. A silent update without administrator rights
; can't ask, as with `/SANDBOX=1`.
Function SetUpAgain
  System::Call 'shell32::IsUserAnAdmin() i .R1'
  ${If} ${Silent}
  ${AndIf} $R1 = 0
    ; As for /SANDBOX=1: a silent update can't let anyone answer the prompt.
    StrCpy $SandboxOutcome "skipped"
    Call LogSkippedSetUpAgain
    Return
  ${EndIf}
  StrCpy $R0 "-SetUpAgain -SetupVersion ${SRTSETUPVERSION}"
  Call CheckSetupVersion
  ${If} $R1 = 0
    StrCpy $SandboxState ${BST_CHECKED}
  ${EndIf}
FunctionEnd

; Halonic change (C634 #4, HAL-15808): a silent run shows no DetailPrint, so a
; skipped set-up-again goes to updates.log, but only where the guard says the
; sandbox is set up for an older setup version, the one case that would ask.
Function LogSkippedSetUpAgain
  StrCpy $R0 "-SetUpAgain -SetupVersion ${SRTSETUPVERSION}"
  Call CheckSetupVersion
  ${If} $R1 = 0
    StrCpy $R3 "Installing ${VERSION}: the agent sandbox wasn't set up again, because a silent update without administrator rights can't ask for them. Agents set to run in a sandbox don't start until it's set up again in Settings › Agent sandbox."
    Call LogUpdateLine
  ${EndIf}
FunctionEnd

; Appends $R3 as a line to updates.log in the profile (HAL-5404 S3).
Function LogUpdateLine
  Push $0
  Push $1
  Call ProfileFolder
  Pop $0
  CreateDirectory "$0\updates"
  FileOpen $1 "$0\updates\updates.log" a
  ${If} $1 != ""
    FileSeek $1 0 END
    FileWrite $1 "installer: $R3$\r$\n"
    FileClose $1
  ${EndIf}
  Pop $1
  Pop $0
FunctionEnd
!endif

Function un.onInit
  System::Call 'shell32::IsUserAnAdmin() i .s'
  Pop $Elevated

  !insertmacro SetContext

  !if "${INSTALLMODE}" == "both"
    !insertmacro MULTIUSER_UNINIT
  !endif

  !insertmacro MUI_UNGETLANGUAGE

  ${GetOptions} $CMDLINE "/P" $PassiveMode
  ${IfNot} ${Errors}
    StrCpy $PassiveMode 1
  ${EndIf}

  ${GetOptions} $CMDLINE "/UPDATE" $UpdateMode
  ${IfNot} ${Errors}
    StrCpy $UpdateMode 1
  ${EndIf}
FunctionEnd

Section Uninstall

  !ifmacrodef NSIS_HOOK_PREUNINSTALL
    !insertmacro NSIS_HOOK_PREUNINSTALL
  !endif

  !insertmacro CheckIfAppIsRunning "$INSTDIR\${MAINBINARYNAME}.exe" "${PRODUCTNAME}"

  ; Halonic change (HAL-6214): sessions let srt's sandbox account read the
  ; attributes of the folders above them in the user profile. Remove those
  ; entries while the agent host is still here. Not on an update, and its
  ; outcome never stops the uninstall. It needs srt's sandbox account, so it
  ; must run before anything that runs --sandbox-remove. An uninstaller with
  ; administrator rights doesn't start the agent host from $INSTDIR: the
  ; entries name srt's sandbox account, which the removal deletes, so they
  ; give nobody access.
  ; Halonic change (HAL-1202, flow 2.7): then remove the agent sandbox while
  ; the agent host is still here, and Halonic is closed (srt removes nothing
  ; while a sandboxed program runs). An update keeps it.
  !ifdef SANDBOX_STEP
    ${If} $UpdateMode <> 1
      ${If} ${FileExists} "$INSTDIR\halonic-agent-host.exe"
      ${AndIf} $Elevated = 0
        StrCpy $1 "$LOCALAPPDATA\halonic"
        ReadEnvStr $2 "HALONIC_HOME"
        ${If} $2 != ""
          StrCpy $1 $2
        ${EndIf}
        nsExec::Exec '"$INSTDIR\halonic-agent-host.exe" --profile-folder "$1" --sandbox-cleanup'
        Pop $0
      ${EndIf}
      Call un.RemoveSandbox
    ${EndIf}
  !endif

  ; Delete the app directory and its content from disk
  ; Copy main executable
  Delete "$INSTDIR\${MAINBINARYNAME}.exe"

  ; Delete resources
  {{#each resources}}
    Delete "$INSTDIR\\{{this.[1]}}"
  {{/each}}
  ; Halonic change (HAL-17810): not a resource, as only the sandbox step installs it.
  Delete "$INSTDIR\vcruntime140.dll.pinned"

  ; Delete external binaries
  {{#each binaries}}
    Delete "$INSTDIR\\{{this}}"
  {{/each}}

  ; Delete app associations
  {{#each file_associations as |association| ~}}
    {{#each association.ext as |ext| ~}}
      !insertmacro APP_UNASSOCIATE "{{ext}}" "{{or association.name ext}}"
    {{/each}}
  {{/each}}

  ; Delete deep links
  {{#each deep_link_protocols as |protocol| ~}}
    ReadRegStr $R7 SHCTX "Software\Classes\\{{protocol}}\shell\open\command" ""
    ${If} $R7 == "$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"%1$\""
      DeleteRegKey SHCTX "Software\Classes\\{{protocol}}"
    ${EndIf}
  {{/each}}


  ; Delete uninstaller
  Delete "$INSTDIR\uninstall.exe"

  {{#each resources_ancestors}}
  RMDir /REBOOTOK "$INSTDIR\\{{this}}"
  {{/each}}
  RMDir "$INSTDIR"

  ; Halonic change (HAL-1206): the installers kept for going back are the app's,
  ; not the user's, so an uninstall removes them. An update keeps them.
  ${If} $UpdateMode <> 1
    Call un.ProfileFolder
    Pop $R9
    RMDir /r "$R9\updates\installers"
  ${EndIf}

  ; Remove shortcuts if not updating
  ${If} $UpdateMode <> 1
    !insertmacro DeleteAppUserModelId

    ; Halonic change (HAL-14221): "Start Halonic when I log in" is this
    ; user's Run value (crates/login-item). An update keeps it.
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCTNAME}"

    ; Remove start menu shortcut
    StrCpy $AppStartMenuFolder "${STARTMENUFOLDER}"
    ; Halonic change (HAL-17903): the focused apps' shortcuts first, so the
    ; folder is empty when Halonic's own goes.
    Call un.RemoveFocusedAppShortcuts
    !insertmacro IsShortcutTarget "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    Pop $0
    ${If} $0 = 1
      !insertmacro UnpinShortcut "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk"
      Delete "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk"
      RMDir "$SMPROGRAMS\$AppStartMenuFolder"
    ${EndIf}
    !insertmacro IsShortcutTarget "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    Pop $0
    ${If} $0 = 1
      !insertmacro UnpinShortcut "$SMPROGRAMS\${PRODUCTNAME}.lnk"
      Delete "$SMPROGRAMS\${PRODUCTNAME}.lnk"
    ${EndIf}

    ; Remove desktop shortcuts
    !insertmacro IsShortcutTarget "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    Pop $0
    ${If} $0 = 1
      !insertmacro UnpinShortcut "$DESKTOP\${PRODUCTNAME}.lnk"
      Delete "$DESKTOP\${PRODUCTNAME}.lnk"
    ${EndIf}
  ${EndIf}

  ; Remove registry information for add/remove programs
  !if "${INSTALLMODE}" == "both"
    DeleteRegKey SHCTX "${UNINSTKEY}"
  !else if "${INSTALLMODE}" == "perMachine"
    DeleteRegKey HKLM "${UNINSTKEY}"
  !else
    DeleteRegKey HKCU "${UNINSTKEY}"
  !endif

  ; Removes the Autostart entry for ${PRODUCTNAME} from the HKCU Run key if it exists.
  ; This ensures the program does not launch automatically after uninstallation if it exists.
  ; If it doesn't exist, it does nothing.
  ; We do this when not updating (to preserve the registry value on updates)
  ${If} $UpdateMode <> 1
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCTNAME}"
  ${EndIf}

  ; Delete app data if the checkbox is selected
  ; and if not updating
  ${If} $DeleteAppDataCheckboxState = 1
  ${AndIf} $UpdateMode <> 1
    ; Clear the install location $INSTDIR from registry
    DeleteRegKey SHCTX "${MANUPRODUCTKEY}"
    DeleteRegKey /ifempty SHCTX "${MANUKEY}"

    ; Clear the install language from registry
    DeleteRegValue HKCU "${MANUPRODUCTKEY}" "Installer Language"
    DeleteRegKey /ifempty HKCU "${MANUPRODUCTKEY}"
    DeleteRegKey /ifempty HKCU "${MANUKEY}"

    SetShellVarContext current
    RmDir /r "$APPDATA\${BUNDLEID}"
    RmDir /r "$LOCALAPPDATA\${BUNDLEID}"
    ; Halonic change (HAL-1202, flow 2.7): what the box names, and no more.
    ; Recent and appearance are in the folders above (the webview's storage);
    ; trust records and each agent's harness settings are in the profile
    ; folder. Runs, records and the rest of the profile folder stay: the CLI
    ; shares it, and the page doesn't say they go.
    Call un.ProfileFolder
    Pop $1
    RmDir /r "$1\trust"
    FindFirst $2 $3 "$1\workspaces\*"
    ${DoWhile} $3 != ""
      ${If} $3 != "."
      ${AndIf} $3 != ".."
        RmDir /r "$1\workspaces\$3\harness-settings"
      ${EndIf}
      FindNext $2 $3
    ${Loop}
    FindClose $2
  ${EndIf}

  !ifmacrodef NSIS_HOOK_POSTUNINSTALL
    !insertmacro NSIS_HOOK_POSTUNINSTALL
  !endif

  ; Go on by itself: to the last page, or out when passive or updating.
  SetAutoClose true
SectionEnd

Function RestorePreviousInstallLocation
  ReadRegStr $4 SHCTX "${MANUPRODUCTKEY}" ""
  StrCmp $4 "" +2 0
    StrCpy $INSTDIR $4
FunctionEnd

Function Skip
  Abort
FunctionEnd

Function SkipIfPassive
  ${IfThen} $PassiveMode = 1  ${|} Abort ${|}
FunctionEnd

; Halonic change (HAL-17810): Microsoft's licence page only when the sandbox
; box is ticked, on the install page or the run-again page. Passive and update
; installs have no pages.
!ifdef SANDBOX_STEP
Function SkipLicence
  ${If} $PassiveMode = 1
  ${OrIf} $UpdateMode = 1
  ${OrIf} $SandboxState != ${BST_CHECKED}
    Abort
  ${EndIf}
FunctionEnd
!endif

; Halonic change (HAL-18322, board direction on HAL-10): every install takes
; away every Start menu shortcut an earlier Halonic made before it makes the
; current set, so a renamed or dropped one never stays: all of them in
; Halonic's own folder, whatever their name, and Halonic's at the top of the
; Start menu, where Tauri put it before the folder (HAL-1202). An install that
; makes no shortcuts (`/NS`) leaves them as they are.
Function RemoveOldStartMenuShortcuts
  ${If} $NoShortcutMode = 1
    Return
  ${EndIf}
  !if "${STARTMENUFOLDER}" != ""
    Delete "$SMPROGRAMS\$AppStartMenuFolder\*.lnk"
  !endif
  Delete "$SMPROGRAMS\${PRODUCTNAME}.lnk"
FunctionEnd

Function CreateOrUpdateStartMenuShortcut
  ; Halonic change (HAL-18322): RemoveOldStartMenuShortcuts took the old one
  ; away, whatever it started, so there is nothing to move to the new
  ; MAINBINARYNAME and it is made on an update too.
  ${If} $NoShortcutMode = 1
    Return
  ${EndIf}

  !if "${STARTMENUFOLDER}" != ""
    CreateDirectory "$SMPROGRAMS\$AppStartMenuFolder"
    CreateShortcut "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    !insertmacro SetLnkAppUserModelId "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk"
  !else
    CreateShortcut "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    !insertmacro SetLnkAppUserModelId "$SMPROGRAMS\${PRODUCTNAME}.lnk"
  !endif
FunctionEnd

Function CreateOrUpdateDesktopShortcut
  ; We used to use product name as MAINBINARYNAME
  ; migrate old shortcuts to target the new MAINBINARYNAME
  !insertmacro IsShortcutTarget "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\$OldMainBinaryName"
  Pop $0
  ${If} $0 = 1
    !insertmacro SetShortcutTarget "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    Return
  ${EndIf}

  ; Skip creating shortcut if in update mode or no shortcut mode
  ; but always create if migrating from wix
  ${If} $WixMode = 0
    ${If} $UpdateMode = 1
    ${OrIf} $NoShortcutMode = 1
      Return
    ${EndIf}
  ${EndIf}

  CreateShortcut "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
  !insertmacro SetLnkAppUserModelId "$DESKTOP\${PRODUCTNAME}.lnk"
FunctionEnd

; ---------------------------------------------------------------------------
; Halonic change (HAL-17903): Halonic Inbox and Halonic Messenger, the focused
; apps (board direction HAL-17358), each get a Start menu shortcut beside
; Halonic's, so Windows search finds them. Each starts the same exe with
; `--app <name>` and carries its own AppUserModelID, the one its window sets
; (src/focused_apps.rs), so each has its own taskbar entry, and its own icon
; (HAL-18693): the halo with the app's glyph, `icons\<app>.ico`, a resource
; tauri.installer.conf.json installs. Unlike Halonic's
; own shortcut they are made on an update too, so an update from a version
; without them adds them. src/studio/installer-focused-apps.test.ts checks them.
; ---------------------------------------------------------------------------

; Tauri's SetLnkAppUserModelId (utils.nsh) with the ID as an argument instead
; of ${BUNDLEID}.
!macro SetLnkAppUserModelIdTo shortcut appid
  !insertmacro ComHlpr_CreateInProcInstance ${CLSID_ShellLink} ${IID_IShellLink} r0 ""
  ${If} $0 P<> 0
    ${IUnknown::QueryInterface} $0 '("${IID_IPersistFile}",.r1)'
    ${If} $1 P<> 0
      ${IPersistFile::Load} $1 '("${shortcut}", ${STGM_READWRITE})'
      ${IUnknown::QueryInterface} $0 '("${IID_IPropertyStore}",.r2)'
      ${If} $2 P<> 0
        System::Call 'Oleaut32::SysAllocString(w "${appid}") i.r3'
        System::Call '*${SYSSTRUCT_PROPERTYKEY}(${PKEY_AppUserModel_ID})p.r4'
        System::Call '*${SYSSTRUCT_PROPVARIANT}(${VT_BSTR},,&i4 $3)p.r5'
        ${IPropertyStore::SetValue} $2 '($4,$5)'

        System::Call 'Oleaut32::SysFreeString($3)'
        System::Free $4
        System::Free $5
        ${IPropertyStore::Commit} $2 ""
        ${IUnknown::Release} $2 ""
        ${IPersistFile::Save} $1 '("${shortcut}",1)'
      ${EndIf}
      ${IUnknown::Release} $1 ""
    ${EndIf}
    ${IUnknown::Release} $0 ""
  ${EndIf}
!macroend

; Where the focused apps' shortcuts go: beside Halonic's.
!if "${STARTMENUFOLDER}" != ""
  !define FOCUSEDAPPFOLDER "$SMPROGRAMS\$AppStartMenuFolder"
!else
  !define FOCUSEDAPPFOLDER "$SMPROGRAMS"
!endif

; The shortcut `${title}.lnk` for the focused app `${app}`.
!macro FocusedAppShortcut title app
  CreateShortcut "${FOCUSEDAPPFOLDER}\${title}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe" "--app ${app}" "$INSTDIR\icons\${app}.ico" 0
  !insertmacro SetLnkAppUserModelIdTo "${FOCUSEDAPPFOLDER}\${title}.lnk" "${BUNDLEID}.${app}"
!macroend

; Removes the shortcut `${title}.lnk`, only when it still starts this install.
!macro RemoveFocusedAppShortcut title
  !insertmacro IsShortcutTarget "${FOCUSEDAPPFOLDER}\${title}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
  Pop $0
  ${If} $0 = 1
    !insertmacro UnpinShortcut "${FOCUSEDAPPFOLDER}\${title}.lnk"
    Delete "${FOCUSEDAPPFOLDER}\${title}.lnk"
  ${EndIf}
!macroend

Function CreateFocusedAppShortcuts
  ${If} $NoShortcutMode = 1
    Return
  ${EndIf}
  CreateDirectory "${FOCUSEDAPPFOLDER}"
  !insertmacro FocusedAppShortcut "${PRODUCTNAME} Inbox" "inbox"
  !insertmacro FocusedAppShortcut "${PRODUCTNAME} Messenger" "messenger"
FunctionEnd

Function un.RemoveFocusedAppShortcuts
  !insertmacro RemoveFocusedAppShortcut "${PRODUCTNAME} Inbox"
  !insertmacro RemoveFocusedAppShortcut "${PRODUCTNAME} Messenger"
FunctionEnd

; ---------------------------------------------------------------------------
; Halonic's pages (HAL-1202, flows 2.2 and 2.4). Standard Win32 controls only,
; so the keyboard, Narrator and high contrast work as they do for any Windows
; installer (flow 7.1).
; ---------------------------------------------------------------------------

; Two helpers both the installer and the uninstaller use: NSIS wants an `un.`
; copy of a function for the uninstaller.
!macro HalonicHelpers un
; Takes a string from the stack and gives it back without the line end.
Function ${un}TrimEol
  Exch $R0
  Push $R1
  trim_loop:
    StrCpy $R1 $R0 1 -1
    ${If} $R1 == "$\r"
    ${OrIf} $R1 == "$\n"
      StrCpy $R0 $R0 -1
      Goto trim_loop
    ${EndIf}
  Pop $R1
  Exch $R0
FunctionEnd

; Halonic's profile folder, as the agent host finds it, on the stack.
Function ${un}ProfileFolder
  Push $0
  Push $1
  StrCpy $1 "$LOCALAPPDATA\halonic"
  ReadEnvStr $0 "HALONIC_HOME"
  ${IfThen} $0 != "" ${|} StrCpy $1 $0 ${|}
  Exch $1
  Exch
  Pop $0
FunctionEnd
!macroend
!insertmacro HalonicHelpers ""
!insertmacro HalonicHelpers "un."

; "A newer Halonic is already installed" (flow 2.5), then quits: no downgrade
; with pages. Silent ones stop in .onInit, as `allowDowngrades` is false.
; Windows' own OK button stands in for Close (mockup V1).
Function RefuseOlderInstaller
  Call FindWixInstall
  ${If} $R6 != ""
    ReadRegStr $R1 HKLM "$R6" "DisplayVersion"
  ${Else}
    ReadRegStr $R1 SHCTX "${UNINSTKEY}" "DisplayVersion"
  ${EndIf}
  ${IfThen} $R1 == "" ${|} Return ${|}
  nsis_tauri_utils::SemverCompare "${VERSION}" $R1
  Pop $R0
  ${If} $R0 = -1
    MessageBox MB_OK|MB_ICONEXCLAMATION "A newer ${PRODUCTNAME} ($R1) is already installed. To go back to ${VERSION}, uninstall ${PRODUCTNAME} first."
    SetErrorLevel 2
    Quit
  ${EndIf}
FunctionEnd

; Sets $0 to 1 when Halonic runs from $INSTDIR, else 0. Asks Windows' Restart
; Manager, as Tauri's CheckIfAppIsRunning does, so it finds only this install.
Function IsHalonicOpen
  Push $R0
  Push $1
  Push $2
  Push $3
  Push $4
  StrCpy $4 0
  !insertmacro RestartManager_StartSession $R0
  ${If} $R0 != ""
    !insertmacro RestartManager_RegisterFile $R0 "$INSTDIR\${MAINBINARYNAME}.exe"
    ${If} $0 = 0
      System::Call 'RSTRTMGR::RmGetList(p R0, *i .r1, *i .r2, p 0, *i .r3) i .r0'
      ${IfThen} $0 = ${ERROR_MORE_DATA} ${|} StrCpy $4 1 ${|}
    ${EndIf}
    !insertmacro RestartManager_EndSession $R0
  ${EndIf}
  StrCpy $0 $4
  Pop $4
  Pop $3
  Pop $2
  Pop $1
  Pop $R0
FunctionEnd

; "Halonic is open" (flow 2.5): asks until Halonic is closed, or quits on
; Cancel. Windows' Retry button stands in for Try again (mockup V1), so the
; sentence names the button the person sees.
Function WaitUntilHalonicIsClosed
  Push $0
  ${Do}
    Call IsHalonicOpen
    ${IfThen} $0 <> 1 ${|} ${Break} ${|}
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "${PRODUCTNAME} is open. Close it, then press Retry." IDRETRY +3
    SetErrorLevel 1
    Quit
  ${Loop}
  Pop $0
FunctionEnd

; Halonic change (HAL-11048): on an update, Studio quits and the installer
; starts at once, while the agent host and the other helpers of the old
; version may still be closing. A file still in use makes NSIS ask Abort,
; Retry or Ignore in a window nobody sees, so the installer waited for ever
; with the new version half copied and Halonic never reopened. Waits up to
; 30 s for each helper's file to be free; if one still isn't, goes on as before.
; Halonic.exe counts too (HAL-11982), for the update that starts while
; Studio itself is still closing.
Function WaitUntilHelpersAreClosed
  Push $0
  Push $1
  Push $2
  Push $R8
  Push $R9
  StrCpy $2 0
  ${Do}
    StrCpy $1 0
    ${ForEach} $0 1 4 + 1
      ${If} $0 = 1
        StrCpy $R9 "$INSTDIR\halonic-agent-host.exe"
      ${ElseIf} $0 = 2
        StrCpy $R9 "$INSTDIR\halonic-sandbox-elevate.exe"
      ${ElseIf} $0 = 3
        StrCpy $R9 "$INSTDIR\srt-win.exe"
      ${Else}
        StrCpy $R9 "$INSTDIR\${MAINBINARYNAME}.exe"
      ${EndIf}
      ${If} ${FileExists} $R9
        ClearErrors
        FileOpen $R8 $R9 a
        ${If} ${Errors}
          StrCpy $1 1
        ${Else}
          FileClose $R8
        ${EndIf}
      ${EndIf}
    ${Next}
    ${IfThen} $1 = 0 ${|} ${Break} ${|}
    ${IfThen} $2 >= 60 ${|} ${Break} ${|}
    Sleep 500
    IntOp $2 $2 + 1
  ${Loop}
  Pop $R9
  Pop $R8
  Pop $2
  Pop $1
  Pop $0
FunctionEnd

; Sets $SandboxReady to 1 when the installed Halonic's sandbox passes the
; check Settings uses, else 0. Asked when the run-again page opens. An
; installer with administrator rights doesn't start the agent host from
; $INSTDIR, so it offers the sandbox step, which asks no prompt then.
Function CheckInstalledSandbox
  StrCpy $SandboxReady 0
  !ifdef SANDBOX_STEP
    ${If} ${FileExists} "$INSTDIR\halonic-agent-host.exe"
    ${AndIf} $Elevated = 0
      Call ProfileFolder
      Pop $1
      nsExec::ExecToStack /TIMEOUT=60000 '"$INSTDIR\halonic-agent-host.exe" --profile-folder "$1" --sandbox-check'
      Pop $0
      Pop $1
      ${IfThen} $0 == "0" ${|} StrCpy $SandboxReady 1 ${|}
    ${EndIf}
  !endif
FunctionEnd

; The run-again page (flow 2.5): two boxes, never a lone radio button (V2).
; Called from PageReinstall, so it is that page's content.
Function PageRunAgain
  StrCpy $RunAgain 1
  StrCpy $SandboxCheckbox 0
  Call CheckInstalledSandbox
  !insertmacro MUI_HEADER_TEXT "${PRODUCTNAME} ${VERSION} is installed on this computer" ""
  nsDialogs::Create 1018
  Pop $0

  StrCpy $2 0
  !ifdef SANDBOX_STEP
    ${If} $SandboxReady = 1
      ${NSD_CreateLabel} 0 0 100% 10u "✓ The agent sandbox is set up."
      Pop $0
    ${Else}
      ${NSD_CreateCheckbox} 0 0 100% 10u "Set up the agent sandbox (recommended)"
      Pop $SandboxCheckbox
      ${NSD_Check} $SandboxCheckbox
      ${NSD_OnClick} $SandboxCheckbox PageRunAgainUpdate
      ${NSD_CreateLabel} 12u 12u 96% 10u "Windows asks for administrator rights once for this step."
      Pop $0
    ${EndIf}
    StrCpy $2 32
  !endif
  ${NSD_CreateCheckbox} 0 $2u 100% 10u "Repair ${PRODUCTNAME}"
  Pop $RepairCheckbox
  ${NSD_OnClick} $RepairCheckbox PageRunAgainUpdate
  IntOp $2 $2 + 12
  ${NSD_CreateLabel} 12u $2u 96% 20u "Copies ${PRODUCTNAME}'s files again. Your workspaces and settings stay."
  Pop $0

  GetDlgItem $0 $HWNDPARENT 1
  SendMessage $0 ${WM_SETTEXT} 0 "STR:&Continue"
  GetDlgItem $0 $HWNDPARENT 3
  ShowWindow $0 ${SW_HIDE}
  Push 0
  Call PageRunAgainUpdate
  nsDialogs::Show
FunctionEnd

; Continue only while a box is ticked.
Function PageRunAgainUpdate
  Pop $0 ; the clicked box, from NSD_OnClick, or the 0 PageRunAgain pushes
  StrCpy $1 ${BST_UNCHECKED}
  ${If} $SandboxCheckbox <> 0
    ${NSD_GetState} $SandboxCheckbox $1
  ${EndIf}
  ${NSD_GetState} $RepairCheckbox $0
  GetDlgItem $3 $HWNDPARENT 1
  ${If} $0 == ${BST_CHECKED}
  ${OrIf} $1 == ${BST_CHECKED}
    EnableWindow $3 1
  ${Else}
    EnableWindow $3 0
  ${EndIf}
FunctionEnd

Function PageRunAgainLeave
  StrCpy $SandboxState ${BST_UNCHECKED}
  ${If} $SandboxCheckbox <> 0
    ${NSD_GetState} $SandboxCheckbox $SandboxState
  ${EndIf}
  ${NSD_GetState} $RepairCheckbox $0
  ${IfThen} $0 <> ${BST_CHECKED} ${|} StrCpy $SkipCopy 1 ${|}
  ; Repair keeps the shortcuts as they are.
  StrCpy $ShortcutState ${BST_UNCHECKED}
FunctionEnd

Function PageInstall
  ; Silent and passive installs have no pages, and run again has its own.
  ${If} $PassiveMode = 1
  ${OrIf} $UpdateMode = 1
  ${OrIf} $RunAgain = 1
    Abort
  ${EndIf}
  !insertmacro MUI_HEADER_TEXT "Install ${PRODUCTNAME} ${VERSION}" ""
  nsDialogs::Create 1018
  Pop $0

  ${NSD_CreateLabel} 0 0 100% 10u "Install to"
  Pop $0
  ${NSD_CreateLabel} 0 12u 76% 10u "$INSTDIR"
  Pop $PathLabel
  ${NSD_CreateButton} 80% 9u 20% 14u "C&hange…"
  Pop $0
  ${NSD_OnClick} $0 PageInstallChange
  !ifdef SANDBOX_STEP
    ${NSD_CreateLabel} 0 26u 100% 10u "Installs for you only."
  !else
    ${NSD_CreateLabel} 0 26u 100% 10u "Installs for you only. No administrator rights needed."
  !endif
  Pop $0
  ${NSD_CreateLabel} 0 38u 100% 10u ""
  Pop $FolderErrorLabel

  !ifdef SANDBOX_STEP
    ${NSD_CreateCheckbox} 0 54u 100% 10u "Set up the agent sandbox (recommended)"
    Pop $SandboxCheckbox
    ; Halonic change (HAL-17872): both boxes show the person's choice, ticked
    ; at first (.onInit), as they left them when Back comes from the licence page.
    ${NSD_SetState} $SandboxCheckbox $SandboxState
    ${NSD_OnClick} $SandboxCheckbox PageInstallButton
    ${NSD_CreateLabel} 12u 66u 96% 32u "Agents then run in a fence: they can only change their own folder and can't reach the internet unless you allow a site. Windows asks for administrator rights once for this step."
    Pop $0
    ${NSD_CreateCheckbox} 0 102u 100% 10u "Add a desktop shortcut"
  !else
    ${NSD_CreateCheckbox} 0 54u 100% 10u "Add a desktop shortcut"
  !endif
  Pop $ShortcutCheckbox
  ${NSD_SetState} $ShortcutCheckbox $ShortcutState

  ${NSD_CreateLabel} 0 -12u 60% 10u "Uses about ${SIZE_MB} MB."
  Pop $0

  Push 0
  Call PageInstallButton
  ; Nothing comes before this page, so no Back button.
  GetDlgItem $0 $HWNDPARENT 3
  ShowWindow $0 ${SW_HIDE}
  Call PageInstallCheckFolder
  nsDialogs::Show
FunctionEnd

; The buttons say what they do: Install is the default button, and Next while
; the sandbox box is ticked, as Microsoft's licence page comes first then
; (HAL-17810).
Function PageInstallButton
  Pop $0 ; the clicked box, from NSD_OnClick, or the 0 PageInstall pushes
  StrCpy $1 "&Install"
  !ifdef SANDBOX_STEP
    ${NSD_GetState} $SandboxCheckbox $0
    ${IfThen} $0 == ${BST_CHECKED} ${|} StrCpy $1 "&Next >" ${|}
  !endif
  GetDlgItem $0 $HWNDPARENT 1
  SendMessage $0 ${WM_SETTEXT} 0 "STR:$1"
FunctionEnd

; "You can't install to this folder" and Install disabled until it can be written.
Function PageInstallCheckFolder
  CreateDirectory "$INSTDIR"
  ClearErrors
  FileOpen $0 "$INSTDIR\.halonic-write-test" w
  ${If} ${Errors}
    ${NSD_SetText} $FolderErrorLabel "You can't install to this folder. Pick a folder in your user profile."
    GetDlgItem $0 $HWNDPARENT 1
    EnableWindow $0 0
  ${Else}
    FileClose $0
    Delete "$INSTDIR\.halonic-write-test"
    ${NSD_SetText} $FolderErrorLabel ""
    GetDlgItem $0 $HWNDPARENT 1
    EnableWindow $0 1
  ${EndIf}
FunctionEnd

Function PageInstallChange
  nsDialogs::SelectFolderDialog "Install to" "$INSTDIR"
  Pop $0
  ${If} $0 != "error"
    ; Folders other than ...\Halonic get a Halonic folder inside, as Tauri's page does.
    StrCpy $1 $0 8 -8
    ${If} $1 != "\${PRODUCTNAME}"
      StrCpy $0 "$0\${PRODUCTNAME}"
    ${EndIf}
    StrCpy $INSTDIR $0
    ${NSD_SetText} $PathLabel "$INSTDIR"
    Call PageInstallCheckFolder
  ${EndIf}
FunctionEnd

Function PageInstallLeave
  !ifdef SANDBOX_STEP
    ${NSD_GetState} $SandboxCheckbox $SandboxState
  !else
    StrCpy $SandboxState ${BST_UNCHECKED}
  !endif
  ${NSD_GetState} $ShortcutCheckbox $ShortcutState
FunctionEnd

Function PageFinish
  ${If} $PassiveMode = 1
  ${OrIf} $UpdateMode = 1
    Abort
  ${EndIf}
  !insertmacro MUI_HEADER_TEXT "${PRODUCTNAME} is installed" ""
  nsDialogs::Create 1018
  Pop $0

  ${If} $SandboxOutcome == "ready"
    ${NSD_CreateLabel} 0 0 100% 10u "✓ The agent sandbox is set up and passed its check."
    Pop $0
  ${ElseIf} $SandboxOutcome == "unchecked"
    ; Set up by an installer with administrator rights, which runs no check.
    ; Two lines, so the way to check it isn't cut.
    ${NSD_CreateLabel} 0 0 100% 20u "✓ The agent sandbox is set up. To check it, open Settings › Agent sandbox."
    Pop $0
  ${ElseIf} $SandboxOutcome != ""
    ; The D44 fallback: the cause, then the same three sentences for every cause.
    ${NSD_CreateLabel} 0 0 100% 10u "! The agent sandbox isn't set up."
    Pop $0
    ${If} $SandboxOutcome == "refused"
      StrCpy $1 "Windows didn't give the installer administrator rights."
    ${ElseIf} $SandboxOutcome == "timeout"
      StrCpy $1 "Windows didn't finish setting it up within 5 minutes."
    ${ElseIf} $SandboxOutcome == "checkfailed"
      StrCpy $1 "It was set up, but didn't pass its check: $SandboxReason"
    ${Else}
      StrCpy $1 "The setup stopped: $SandboxReason"
    ${EndIf}
    ; Three lines for the cause, so a long reason isn't cut (checklist 2.4).
    ${NSD_CreateLabel} 10u 12u 96% 32u "$1"
    Pop $0
    ${NSD_CreateLabel} 10u 46u 96% 42u "Everything else works. Until the sandbox is set up, an agent can run on this computer only after a warning you confirm. To set it up later, run this installer again."
    Pop $0
  ${EndIf}

  ${NSD_CreateCheckbox} 0 100u 100% 10u "Start ${PRODUCTNAME}"
  Pop $StartCheckbox
  ${NSD_Check} $StartCheckbox

  GetDlgItem $0 $HWNDPARENT 1
  SendMessage $0 ${WM_SETTEXT} 0 "STR:&Finish"
  GetDlgItem $0 $HWNDPARENT 2
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 3
  ShowWindow $0 ${SW_HIDE}
  nsDialogs::Show
FunctionEnd

Function PageFinishLeave
  ${NSD_GetState} $StartCheckbox $StartAfterState
  ${If} $StartAfterState == ${BST_CHECKED}
    Call RunMainBinary
  ${EndIf}
FunctionEnd

; ---------------------------------------------------------------------------
; The uninstaller's pages (HAL-1202, flow 2.7)
; ---------------------------------------------------------------------------

!define /ifndef BS_PUSHBUTTON 0x0
!define /ifndef BS_DEFPUSHBUTTON 0x1
!define /ifndef BM_SETSTYLE 0x00F4
!define /ifndef DM_SETDEFID 0x0401
!define /ifndef WM_NEXTDLGCTL 0x0028

; "Uninstall Halonic?": workspaces first, because that's the fear; settings
; stay unless the box is ticked; Cancel is the default, because this page
; removes things (microcopy 1.2).
Function un.PageConfirm
  ${If} $PassiveMode = 1
  ${OrIf} $UpdateMode = 1
    Abort
  ${EndIf}
  !insertmacro MUI_HEADER_TEXT "Uninstall ${PRODUCTNAME}?" ""
  nsDialogs::Create 1018
  Pop $0

  ${NSD_CreateLabel} 0 0 100% 20u "Your workspaces are folders of plain files. ${PRODUCTNAME} doesn't touch them."
  Pop $0
  ${NSD_CreateCheckbox} 0 26u 100% 10u "Also remove ${PRODUCTNAME}'s settings on this computer"
  Pop $DeleteAppDataCheckbox
  ${NSD_CreateLabel} 12u 38u 96% 20u "Recent workspaces, appearance, trust records and agent settings."
  Pop $0
  ${NSD_CreateLabel} 12u 60u 96% 20u "API keys stay in Windows Credential Manager until you remove them there."
  Pop $0

  GetDlgItem $0 $HWNDPARENT 1
  SendMessage $0 ${WM_SETTEXT} 0 "STR:&Uninstall"
  SendMessage $0 ${BM_SETSTYLE} ${BS_PUSHBUTTON} 1
  GetDlgItem $0 $HWNDPARENT 3
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 2
  SendMessage $0 ${WM_SETTEXT} 0 "STR:&Cancel"
  SendMessage $0 ${BM_SETSTYLE} ${BS_DEFPUSHBUTTON} 1
  SendMessage $HWNDPARENT ${DM_SETDEFID} 2 0
  SendMessage $HWNDPARENT ${WM_NEXTDLGCTL} $0 1
  nsDialogs::Show
FunctionEnd

Function un.PageConfirmLeave
  ${NSD_GetState} $DeleteAppDataCheckbox $DeleteAppDataCheckboxState
FunctionEnd

; Removes the agent sandbox (flow 2.7, CHECK I9), and sets $SandboxOutcome to
; "removed", "removed_kept" (removed, but the access it kept on the user's
; folders stays until Halonic is installed again without administrator rights,
; whose take-back ends it whatever sandbox is chosen, HAL-16084),
; "removed_manual" (removed, but some access it kept stays until a removal
; without administrator rights, HAL-15836, ended by installing again with the
; sandbox step on and uninstalling normally), "none" (nothing was set up,
; nothing asked), "refused", "failed"
; (with $SandboxReason) or "skipped" (a silent uninstall without administrator
; rights, which can't ask).
Function un.RemoveSandbox
  StrCpy $SandboxOutcome "none"
  ${IfNot} ${FileExists} "$INSTDIR\halonic-agent-host.exe"
  ${OrIfNot} ${FileExists} "$INSTDIR\sandbox-remove.ps1"
    Return
  ${EndIf}
  ; A silent uninstall can't show Windows' prompt, so it removes the sandbox
  ; only from an elevated prompt, where Windows doesn't ask.
  ${If} ${Silent}
  ${AndIf} $Elevated = 0
    StrCpy $SandboxOutcome "skipped"
    Return
  ${EndIf}
  DetailPrint "Removing the agent sandbox…"
  DetailPrint "   If it was set up, Windows asks for administrator rights."
  StrCpy $SandboxReason ""
  ${If} $Elevated <> 0
    Call un.RemoveThroughHelper
    Pop $2
  ${Else}
    Call un.ProfileFolder
    Pop $1
    nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\sandbox-remove.ps1" -HostExe "$INSTDIR\halonic-agent-host.exe" -ProfileFolder "$1"'
    Pop $2
    Pop $SandboxReason
    Push $SandboxReason
    Call un.TrimEol
    Pop $SandboxReason
  ${EndIf}
  ${If} $2 == "0"
    StrCpy $SandboxOutcome "removed"
    DetailPrint "✓ Removed the agent sandbox"
  ${ElseIf} $2 == "2"
    ; With administrator rights the removal leaves the access the sandbox
    ; kept on the user's folders (HAL-5404 S2). A start of Halonic doesn't
    ; reliably take it back (HAL-16082), but installing again without
    ; administrator rights does, whatever sandbox is chosen (HAL-16084).
    StrCpy $SandboxOutcome "removed_kept"
    DetailPrint "✓ Removed the agent sandbox"
    DetailPrint "   It still has access to your project folders until you install ${PRODUCTNAME} again normally, not as administrator."
  ${ElseIf} $2 == "3"
    StrCpy $SandboxOutcome "removed_manual"
    DetailPrint "✓ Removed the agent sandbox"
    DetailPrint "   It may still have access to some of your project folders. To end that, install ${PRODUCTNAME} again with $\"Set up the agent sandbox$\" on, then uninstall it normally, not as administrator."
  ${ElseIf} $2 == "20"
    StrCpy $SandboxOutcome "none"
  ${ElseIf} $2 == "10"
    StrCpy $SandboxOutcome "refused"
    DetailPrint "! The agent sandbox is still set up: Windows didn't give administrator rights."
  ${Else}
    StrCpy $SandboxOutcome "failed"
    ${If} $SandboxReason == ""
      StrCpy $SandboxReason "the removal ended with code $2 and no reason"
    ${EndIf}
    DetailPrint "! The agent sandbox is still set up: $SandboxReason"
  ${EndIf}
  !ifdef SANDBOXSIGNER
    ; As for a silent install (HAL-16947): Halonic is uninstalled, the sandbox
    ; isn't, and nothing shows why.
    ${If} ${Silent}
    ${AndIf} $HelperRefused == 1
      SetErrorLevel ${HELPER_REFUSED_EXIT}
    ${EndIf}
  !endif
FunctionEnd

; The removal for an uninstaller with administrator rights: the user can swap
; sandbox-remove.ps1 and the agent host in $INSTDIR, so it starts only the
; helper, held open while Windows starts it. Pushes sandbox-remove.ps1's
; codes: 20 when srt's sandbox account and group aren't there (net.exe, from
; System32), 3 when removed, since a removal with the rights may keep access
; on the user's folders, 10 or 11 with $SandboxReason.
Function un.RemoveThroughHelper
  nsExec::Exec '"$SYSDIR\net.exe" user srt-sandbox'
  Pop $0
  nsExec::Exec '"$SYSDIR\net.exe" localgroup sandbox-runtime-users'
  Pop $1
  ${If} $0 != "0"
  ${AndIf} $1 != "0"
    Push "20"
    Return
  ${EndIf}
  Push "remove"
  Call un.ElevateSandboxHelper
  Pop $2
  ${If} $2 == "0"
    StrCpy $2 "3"
  ${ElseIf} $2 == "refused"
    StrCpy $2 "10"
  ${ElseIf} $2 == "nostart"
    ${If} $SandboxReason == ""
      StrCpy $SandboxReason "Windows couldn't start the sandbox helper"
    ${EndIf}
    StrCpy $2 "11"
  ${ElseIf} $2 == "timeout"
    StrCpy $SandboxReason "Windows didn't finish removing it within 5 minutes"
    StrCpy $2 "11"
  ${Else}
    StrCpy $SandboxReason "the sandbox helper stopped with code $2"
    StrCpy $2 "11"
  ${EndIf}
  Push $2
FunctionEnd

; "Halonic is uninstalled", and what the sandbox left when it couldn't be
; removed. The uninstaller is gone by now, so the way out is to install and
; uninstall again, not "run the uninstaller as administrator" (HAL-1202).
Function un.PageDone
  ${If} $PassiveMode = 1
  ${OrIf} $UpdateMode = 1
    Abort
  ${EndIf}
  !insertmacro MUI_HEADER_TEXT "${PRODUCTNAME} is uninstalled" ""
  nsDialogs::Create 1018
  Pop $0

  ${If} $SandboxOutcome == "removed"
  ${OrIf} $SandboxOutcome == "removed_kept"
  ${OrIf} $SandboxOutcome == "removed_manual"
    ${NSD_CreateLabel} 0 0 100% 10u "✓ The agent sandbox is removed."
    Pop $0
    ${If} $SandboxOutcome != "removed"
      ; Lined up under line 1's text, not its ✓: measured in pixels with the
      ; label's own font, so it holds at any display scaling (HAL-15004).
      SendMessage $0 ${WM_GETFONT} 0 0 $1
      System::Call 'user32::GetDC(p r0) p .r2'
      System::Call 'gdi32::SelectObject(p r2, p r1) p .r1'
      System::Call '*(i 0, i 0) p .r3'
      System::Call 'gdi32::GetTextExtentPoint32W(p r2, w "✓ ", i 2, p r3)'
      System::Call '*$3(i .r4)'
      System::Free $3
      System::Call 'gdi32::SelectObject(p r2, p r1)'
      System::Call 'user32::ReleaseDC(p r0, p r2)'
      System::Call '*(i 0, i 0, i 0, i 0) p .r3'
      System::Call 'user32::GetClientRect(p r0, p r3)'
      System::Call '*$3(i, i, i .r5)'
      System::Free $3
      IntOp $5 $5 - $4
      ; Halonic is gone now. Installing it again without administrator rights
      ; takes the kept access back (HAL-16084). Some access ("removed_manual")
      ; ends only with a removal without them: installing again with the
      ; sandbox step on and uninstalling normally (HAL-16082). Four lines
      ; high, so a wrap at a larger scaling isn't cut off.
      ${If} $SandboxOutcome == "removed_kept"
        ${NSD_CreateLabel} $4 12u $5 40u "It still has access to your project folders until you install ${PRODUCTNAME} again normally, not as administrator."
      ${Else}
        ${NSD_CreateLabel} $4 12u $5 40u "It may still have access to some of your project folders. To end that, install ${PRODUCTNAME} again with $\"Set up the agent sandbox$\" on, then uninstall it normally, not as administrator."
      ${EndIf}
      Pop $0
    ${EndIf}
  ${ElseIf} $SandboxOutcome == "refused"
  ${OrIf} $SandboxOutcome == "failed"
    ${NSD_CreateLabel} 0 0 100% 20u "! The agent sandbox's Windows account and firewall filters are still on this computer."
    Pop $0
    ${If} $SandboxOutcome == "refused"
      StrCpy $1 "Windows didn't give the uninstaller administrator rights."
    ${Else}
      StrCpy $1 "The removal stopped: $SandboxReason"
    ${EndIf}
    ; Three lines for the cause, as on the installer's finish page.
    ${NSD_CreateLabel} 10u 22u 96% 32u "$1"
    Pop $0
    ${NSD_CreateLabel} 10u 56u 96% 20u "To remove them, install ${PRODUCTNAME} again, then uninstall it and answer Yes when Windows asks."
    Pop $0
  ${EndIf}

  GetDlgItem $0 $HWNDPARENT 1
  SendMessage $0 ${WM_SETTEXT} 0 "STR:&Close"
  GetDlgItem $0 $HWNDPARENT 2
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 3
  ShowWindow $0 ${SW_HIDE}
  nsDialogs::Show
FunctionEnd
