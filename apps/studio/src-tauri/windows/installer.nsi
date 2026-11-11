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

; Halonic change (HAL-1202): the sandbox step and the one page.
; Remove the next line for a build without the Windows sandbox (flow 2.2, D44 (c)):
; the checkbox, its three lines, the step and the finish page's sandbox line go,
; and nothing else moves.
!define SANDBOX_STEP
; What the installer says it uses. CI fails when the real size is off by a quarter.
!define SIZE_MB 130
Var SandboxState
Var ShortcutState
Var SandboxOutcome
Var SandboxReason
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
; licence, install mode, folder and Start menu pages. The Start menu entry is
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
; 1. Confirm uninstall page
Var DeleteAppDataCheckbox
Var DeleteAppDataCheckboxState
!define /ifndef WS_EX_LAYOUTRTL         0x00400000
!define MUI_PAGE_CUSTOMFUNCTION_SHOW un.ConfirmShow
Function un.ConfirmShow ; Add add a `Delete app data` check box
  ; $1 inner dialog HWND
  ; $2 window DPI
  ; $3 style
  ; $4 x
  ; $5 y
  ; $6 width
  ; $7 height
  FindWindow $1 "#32770" "" $HWNDPARENT ; Find inner dialog
  System::Call "user32::GetDpiForWindow(p r1) i .r2"
  ${If} $(^RTL) = 1
    StrCpy $3 "${__NSD_CheckBox_EXSTYLE} | ${WS_EX_LAYOUTRTL}"
    IntOp $4 50 * $2
  ${Else}
    StrCpy $3 "${__NSD_CheckBox_EXSTYLE}"
    IntOp $4 0 * $2
  ${EndIf}
  IntOp $5 100 * $2
  IntOp $6 400 * $2
  IntOp $7 25 * $2
  IntOp $4 $4 / 96
  IntOp $5 $5 / 96
  IntOp $6 $6 / 96
  IntOp $7 $7 / 96
  System::Call 'user32::CreateWindowEx(i r3, w "${__NSD_CheckBox_CLASS}", w "$(deleteAppData)", i ${__NSD_CheckBox_STYLE}, i r4, i r5, i r6, i r7, p r1, i0, i0, i0) i .s'
  Pop $DeleteAppDataCheckbox
  SendMessage $HWNDPARENT ${WM_GETFONT} 0 0 $1
  SendMessage $DeleteAppDataCheckbox ${WM_SETFONT} $1 1
FunctionEnd
!define MUI_PAGE_CUSTOMFUNCTION_LEAVE un.ConfirmLeave
Function un.ConfirmLeave
  SendMessage $DeleteAppDataCheckbox ${BM_GETCHECK} 0 0 $DeleteAppDataCheckboxState
FunctionEnd
!define MUI_PAGE_CUSTOMFUNCTION_PRE un.SkipIfPassive
!insertmacro MUI_UNPAGE_CONFIRM

; 2. Uninstalling Page
!insertmacro MUI_UNPAGE_INSTFILES

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
      StrCpy $SandboxState ${BST_CHECKED}
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
      StrCpy $INSTDIR "$LOCALAPPDATA\${PRODUCTNAME}"
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
    !insertmacro CheckIfAppIsRunning "$INSTDIR\${MAINBINARYNAME}.exe" "${PRODUCTNAME}"
  ${Else}
    Call WaitUntilHalonicIsClosed
  ${EndIf}

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

  ; Create start menu shortcut (always, in the "Halonic" folder)
  Call CreateOrUpdateStartMenuShortcut

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
    ${If} $SandboxState == ${BST_CHECKED}
      !insertmacro SetStep $LineSetup "◌ Setting up the agent sandbox…"
      StrCpy $0 ""
      ${IfNot} ${Silent}
        DetailPrint "   Windows is asking for administrator rights."
        DetailPrint "   Check the taskbar if you don't see the request."
      ${EndIf}
      ; Silent: no prompt (an installer that can't ask runs the setup as it is).
      ${If} ${Silent}
        StrCpy $0 "-NoElevate"
      ${EndIf}
      Call ProfileFolder
      Pop $1
      nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\sandbox-step.ps1" -HostExe "$INSTDIR\halonic-agent-host.exe" -ProfileFolder "$1" $0'
      Pop $2
      Pop $SandboxReason
      Push $SandboxReason
      Call TrimEol
      Pop $SandboxReason
      ${If} $2 == "0"
        StrCpy $SandboxOutcome "ready"
        !insertmacro SetStep $LineSetup "✓ Set up the agent sandbox"
        !insertmacro SetStep $LineCheck "✓ Checked the agent sandbox"
      ${ElseIf} $2 == "10"
        StrCpy $SandboxOutcome "refused"
        !insertmacro SetStep $LineSetup "! The agent sandbox isn't set up: Windows didn't give administrator rights."
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
    ${EndIf}
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
  ; Halonic change (HAL-1202, HAL-1139): Tauri's template reopens the app after
  ; a passive or silent install when it gets `/R`. Ours reopens it only on
  ; `/RELAUNCH`, which Studio adds for "Restart to update". "Install at quit"
  ; and `/S` installs (winget) leave Halonic closed.
  ${If} $PassiveMode = 1
  ${OrIf} ${Silent}
    ${GetOptions} $CMDLINE "/RELAUNCH" $R0
    ${IfNot} ${Errors}
      nsis_tauri_utils::RunAsUser "$INSTDIR\${MAINBINARYNAME}.exe" ""
    ${EndIf}
  ${EndIf}
FunctionEnd

Function un.onInit
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

  ; Delete the app directory and its content from disk
  ; Copy main executable
  Delete "$INSTDIR\${MAINBINARYNAME}.exe"

  ; Delete resources
  {{#each resources}}
    Delete "$INSTDIR\\{{this.[1]}}"
  {{/each}}

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

  ; Remove shortcuts if not updating
  ${If} $UpdateMode <> 1
    !insertmacro DeleteAppUserModelId

    ; Remove start menu shortcut
    StrCpy $AppStartMenuFolder "${STARTMENUFOLDER}"
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
  ${EndIf}

  !ifmacrodef NSIS_HOOK_POSTUNINSTALL
    !insertmacro NSIS_HOOK_POSTUNINSTALL
  !endif

  ; Auto close if passive mode or updating
  ${If} $PassiveMode = 1
  ${OrIf} $UpdateMode = 1
    SetAutoClose true
  ${EndIf}
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
Function un.SkipIfPassive
  ${IfThen} $PassiveMode = 1  ${|} Abort ${|}
FunctionEnd

Function CreateOrUpdateStartMenuShortcut
  ; We used to use product name as MAINBINARYNAME
  ; migrate old shortcuts to target the new MAINBINARYNAME
  StrCpy $R0 0

  !insertmacro IsShortcutTarget "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk" "$INSTDIR\$OldMainBinaryName"
  Pop $0
  ${If} $0 = 1
    !insertmacro SetShortcutTarget "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    StrCpy $R0 1
  ${EndIf}

  !insertmacro IsShortcutTarget "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\$OldMainBinaryName"
  Pop $0
  ${If} $0 = 1
    !insertmacro SetShortcutTarget "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    StrCpy $R0 1
  ${EndIf}

  ${If} $R0 = 1
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
; Halonic's pages (HAL-1202, flows 2.2 and 2.4). Standard Win32 controls only,
; so the keyboard, Narrator and high contrast work as they do for any Windows
; installer (flow 7.1).
; ---------------------------------------------------------------------------

; Takes a string from the stack and gives it back without the line end.
Function TrimEol
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

; Halonic's profile folder, as the agent host finds it, on the stack.
Function ProfileFolder
  Push $0
  Push $1
  StrCpy $1 "$LOCALAPPDATA\halonic"
  ReadEnvStr $0 "HALONIC_HOME"
  ${IfThen} $0 != "" ${|} StrCpy $1 $0 ${|}
  Exch $1
  Exch
  Pop $0
FunctionEnd

; Sets $SandboxReady to 1 when the installed Halonic's sandbox passes the
; check Settings uses, else 0. Asked when the run-again page opens.
Function CheckInstalledSandbox
  StrCpy $SandboxReady 0
  !ifdef SANDBOX_STEP
    ${If} ${FileExists} "$INSTDIR\halonic-agent-host.exe"
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
    ${NSD_Check} $SandboxCheckbox
    ${NSD_CreateLabel} 12u 66u 96% 32u "Agents then run in a fence: they can only change their own folder and can't reach the internet unless you allow a site. Windows asks for administrator rights once for this step."
    Pop $0
    ${NSD_CreateCheckbox} 0 102u 100% 10u "Add a desktop shortcut"
  !else
    ${NSD_CreateCheckbox} 0 54u 100% 10u "Add a desktop shortcut"
  !endif
  Pop $ShortcutCheckbox
  ${NSD_Check} $ShortcutCheckbox

  ${NSD_CreateLabel} 0 -12u 60% 10u "Uses about ${SIZE_MB} MB."
  Pop $0

  ; The buttons say what they do, and Install is the default button.
  GetDlgItem $0 $HWNDPARENT 1
  SendMessage $0 ${WM_SETTEXT} 0 "STR:&Install"
  ; Nothing comes before this page, so no Back button.
  GetDlgItem $0 $HWNDPARENT 3
  ShowWindow $0 ${SW_HIDE}
  Call PageInstallCheckFolder
  nsDialogs::Show
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
  ${ElseIf} $SandboxOutcome != ""
    ; The D44 fallback: the cause, then the same three sentences for every cause.
    ${NSD_CreateLabel} 0 0 100% 10u "! The agent sandbox isn't set up."
    Pop $0
    ${If} $SandboxOutcome == "refused"
      StrCpy $1 "Windows didn't give the installer administrator rights."
    ${ElseIf} $SandboxOutcome == "checkfailed"
      StrCpy $1 "It was set up, but didn't pass its check: $SandboxReason"
    ${Else}
      StrCpy $1 "The setup stopped: $SandboxReason"
    ${EndIf}
    ; Three lines for the cause, so a long reason isn't cut (checklist 2.4).
    ${NSD_CreateLabel} 10u 12u 96% 32u "$1"
    Pop $0
    ${NSD_CreateLabel} 10u 46u 96% 42u "Everything else works. Until the sandbox is set up, an agent can run on this computer only after a warning you confirm. To set it up later, open Settings › Agent sandbox in Halonic."
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
