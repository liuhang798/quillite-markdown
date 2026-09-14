Unicode true

####
## Please note: Template replacements don't work in this file. They are provided with default defines like
## mentioned underneath.
## If the keyword is not defined, "wails_tools.nsh" will populate them with the values from ProjectInfo.
## If they are defined here, "wails_tools.nsh" will not touch them. This allows to use this project.nsi manually
## from outside of Wails for debugging and development of the installer.
##
## For development first make a wails nsis build to populate the "wails_tools.nsh":
## > wails build --target windows/amd64 --nsis
## Then you can call makensis on this file with specifying the path to your binary:
## For a AMD64 only installer:
## > makensis -DARG_WAILS_AMD64_BINARY=..\..\bin\app.exe
## For a ARM64 only installer:
## > makensis -DARG_WAILS_ARM64_BINARY=..\..\bin\app.exe
## For a installer with both architectures:
## > makensis -DARG_WAILS_AMD64_BINARY=..\..\bin\app-amd64.exe -DARG_WAILS_ARM64_BINARY=..\..\bin\app-arm64.exe
####
## The following information is taken from the ProjectInfo file, but they can be overwritten here.
####
## !define INFO_PROJECTNAME    "MyProject" # Default "{{.Name}}"
## !define INFO_COMPANYNAME    "MyCompany" # Default "{{.Info.CompanyName}}"
## !define INFO_PRODUCTNAME    "MyProduct" # Default "{{.Info.ProductName}}"
## !define INFO_PRODUCTVERSION "1.0.0"     # Default "{{.Info.ProductVersion}}"
## !define INFO_COPYRIGHT      "Copyright" # Default "{{.Info.Copyright}}"
###
!define INFO_PROJECTNAME    "quillite-markdown"
!define INFO_COMPANYNAME    "Quillite Open Source"
!define INFO_PRODUCTNAME    "轻阅 Markdown"
!define INFO_PRODUCTVERSION "2.7.4"
!define INFO_COPYRIGHT      "Copyright © 2026 柳航"
!define PRODUCT_EXECUTABLE  "QuilliteMarkdown.exe"
!define LEGACY_PRODUCTNAME  "MD阅读助手"
!define LEGACY_EXECUTABLE   "MDReaderAssistant.exe"
!define INSTALL_MARKER      ".quillite-install"
!define INSTALL_MARKER_CONTENT "QUILLITE_INSTALL_DIR_V1"
!define LEGACY_UNINST_KEY   "Software\Microsoft\Windows\CurrentVersion\Uninstall\LeafMD Open SourceMD阅读助手"
###
## !define PRODUCT_EXECUTABLE  "Application.exe"      # Default "${INFO_PROJECTNAME}.exe"
## !define UNINST_KEY_NAME     "UninstKeyInRegistry"  # Default "${INFO_COMPANYNAME}${INFO_PRODUCTNAME}"
####
## Keep the installed application at the same integrity level as Explorer.
## Otherwise an app launched from an elevated installer cannot receive Wails'
## single-instance WM_COPYDATA message when a document is double-clicked.
!ifndef WAILS_INSTALL_SCOPE
  !define WAILS_INSTALL_SCOPE "user"
!endif
!ifndef REQUEST_EXECUTION_LEVEL
  !define REQUEST_EXECUTION_LEVEL "user"
!endif
####
## Include the wails tools
####
!define WAILS_WIN10_REQUIRED "轻阅 Markdown 仅支持 Windows 10（Server 2016）及更高版本。"
!define WAILS_ARCHITECTURE_NOT_SUPPORTED "当前 Windows 系统架构不受支持。支持的架构：${ARCH}"
!define WAILS_INSTALL_WEBVIEW_DETAILPRINT "正在安装 Microsoft WebView2 运行时"
SetCompressor /SOLID lzma
SetDatablockOptimize on
!include "wails_tools.nsh"

# The version information for this two must consist of 4 parts
VIProductVersion "${INFO_PRODUCTVERSION}.0"
VIFileVersion    "${INFO_PRODUCTVERSION}.0"

VIAddVersionKey "CompanyName"     "${INFO_COMPANYNAME}"
VIAddVersionKey "FileDescription" "${INFO_PRODUCTNAME} 安装程序"
VIAddVersionKey "ProductVersion"  "${INFO_PRODUCTVERSION}"
VIAddVersionKey "FileVersion"     "${INFO_PRODUCTVERSION}"
VIAddVersionKey "LegalCopyright"  "${INFO_COPYRIGHT}"
VIAddVersionKey "ProductName"     "${INFO_PRODUCTNAME}"
VIAddVersionKey "UninstallSafety" "QUILLITE_SAFE_UNINSTALL_V1"

# Enable HiDPI support. https://nsis.sourceforge.io/Reference/ManifestDPIAware
ManifestDPIAware true

!include "MUI.nsh"

!define MUI_ICON "..\icon.ico"
!define MUI_UNICON "..\icon.ico"
# !define MUI_WELCOMEFINISHPAGE_BITMAP "resources\leftimage.bmp" #Include this to add a bitmap on the left side of the Welcome Page. Must be a size of 164x314
!define MUI_FINISHPAGE_NOAUTOCLOSE # Wait on the INSTFILES page so the user can take a look into the details of the installation steps
!define MUI_FINISHPAGE_RUN "$INSTDIR\${PRODUCT_EXECUTABLE}"
!define MUI_FINISHPAGE_RUN_TEXT "$(FinishRunText)"
!define MUI_ABORTWARNING # This will warn the user if they exit from the installer.

!insertmacro MUI_PAGE_WELCOME # Welcome to the installer page.
# !insertmacro MUI_PAGE_LICENSE "resources\eula.txt" # Adds a EULA page to the installer
!insertmacro MUI_PAGE_DIRECTORY # In which folder install page.
!insertmacro MUI_PAGE_INSTFILES # Installing page.
!insertmacro MUI_PAGE_FINISH # Finished installation page.

!insertmacro MUI_UNPAGE_INSTFILES # Uinstalling page

!insertmacro MUI_LANGUAGE "SimpChinese"

LangString FinishRunText ${LANG_SIMPCHINESE} "运行 ${INFO_PRODUCTNAME}"
LangString CloseRunningAppPrompt ${LANG_SIMPCHINESE} "${INFO_PRODUCTNAME} 仍在运行，升级前必须关闭。是否立即关闭并继续安装？未保存的修改可能会丢失。"
LangString CloseRunningAppFailed ${LANG_SIMPCHINESE} "无法关闭正在运行的软件。请手动关闭后点击重试。"

Var ExternalCancelFile
Var ExternalInstallDir
Var ExternalAppLanguage
Var PreviousInstallDir
Var InstallOwned

!macro ExitIfExternalCancelled LABEL
    StrCmp $ExternalCancelFile "" externalCancelDone_${LABEL}
    IfFileExists "$ExternalCancelFile" 0 externalCancelDone_${LABEL}
    SetErrorLevel 66
    Quit
    externalCancelDone_${LABEL}:
!macroend

## The following two statements can be used to sign the installer and the uninstaller. The path to the binaries are provided in %1
#!uninstfinalize 'signtool --file "%1"'
#!finalize 'signtool --file "%1"'

Name "${INFO_PRODUCTNAME}"
!ifdef ARG_WAILS_INSTALLER_OUTPUT
  OutFile "${ARG_WAILS_INSTALLER_OUTPUT}"
!else
  OutFile "..\..\bin\quillite-markdown-${INFO_PRODUCTVERSION}-windows-${ARCH}.exe" # Keep release filenames ASCII-safe for CI.
!endif
!ifdef WAILS_INSTALL_SCOPE
  !if "${WAILS_INSTALL_SCOPE}" == "user"
    InstallDir "$LOCALAPPDATA\Programs\${INFO_PRODUCTNAME}"
  !else
    InstallDir "$PROGRAMFILES64\${INFO_COMPANYNAME}\${INFO_PRODUCTNAME}"
  !endif
!else
  InstallDir "$PROGRAMFILES64\${INFO_COMPANYNAME}\${INFO_PRODUCTNAME}"
!endif # Default installing folder ($PROGRAMFILES is Program Files folder).
InstallDirRegKey HKCU "${UNINST_KEY}" "InstallLocation"
ShowInstDetails nevershow # Hide NSIS' English technical log; the localized progress page remains visible.

Function .onInit
   StrCpy $LANGUAGE ${LANG_SIMPCHINESE}
   ${GetOptions} $CMDLINE "/CANCELFILE=" $ExternalCancelFile
   # Environment transfer is Unicode-safe and avoids command-line parsing
   # differences in paths containing spaces or Chinese characters. Keep the
   # option as a compatibility fallback for direct core invocations.
   ReadEnvStr $ExternalInstallDir "QUILLITE_INSTALL_DIR"
   StrCmp $ExternalInstallDir "" 0 externalInstallDirRead
   ${GetOptions} $CMDLINE "/INSTALLDIR=" $ExternalInstallDir
   externalInstallDirRead:
   ${GetOptions} $CMDLINE "/APP-LANGUAGE=" $ExternalAppLanguage
   !insertmacro wails.checkArchitecture
   Call ResolvePreviousInstallDir
   StrCmp $ExternalInstallDir "" externalInstallDirDone
   StrCpy $INSTDIR "$ExternalInstallDir"
   externalInstallDirDone:
FunctionEnd

Function un.onInit
   StrCpy $LANGUAGE ${LANG_SIMPCHINESE}
FunctionEnd

Function un.VerifyInstallOwnership
    StrCpy $InstallOwned "0"
    # The marker alone is not authority to remove a same-named user file.
    # Require the installed executable and this exact uninstall registration.
    IfFileExists "$INSTDIR\${PRODUCT_EXECUTABLE}" 0 verifyInstallOwnershipDone
    IfFileExists "$INSTDIR\${INSTALL_MARKER}" 0 verifyInstallOwnershipDone
    ClearErrors
    FileOpen $0 "$INSTDIR\${INSTALL_MARKER}" r
    IfErrors verifyInstallOwnershipDone
    FileRead $0 $1
    FileClose $0
    StrCmp $1 "${INSTALL_MARKER_CONTENT}$\r$\n" 0 verifyInstallOwnershipDone
    SetRegView 64
    ReadRegStr $1 HKCU "${UNINST_KEY}" "InstallLocation"
    StrCmp $1 "$INSTDIR" 0 verifyInstallOwnershipDone
    ReadRegStr $1 HKCU "${UNINST_KEY}" "UninstallString"
    StrCmp $1 "$\"$INSTDIR\uninstall.exe$\"" 0 verifyInstallOwnershipDone
    StrCmp $EXEPATH "$INSTDIR\uninstall.exe" 0 verifyInstallOwnershipDone
    StrCpy $InstallOwned "1"
    verifyInstallOwnershipDone:
FunctionEnd

# The launcher validates paths, but the bundled NSIS core can also be run
# directly. Never overwrite reserved filenames in a directory whose product
# ownership cannot be verified from both the marker and uninstall registry.
Function VerifyInstallDestination
    IfFileExists "$INSTDIR\${PRODUCT_EXECUTABLE}" installDestinationReserved
    IfFileExists "$INSTDIR\uninstall.exe" installDestinationReserved
    IfFileExists "$INSTDIR\${INSTALL_MARKER}" installDestinationReserved installDestinationDone
    installDestinationReserved:
        IfFileExists "$INSTDIR\${PRODUCT_EXECUTABLE}" 0 installDestinationRejected
        IfFileExists "$INSTDIR\${INSTALL_MARKER}" 0 installDestinationRejected
        ClearErrors
        FileOpen $0 "$INSTDIR\${INSTALL_MARKER}" r
        IfErrors installDestinationRejected
        FileRead $0 $1
        FileClose $0
        StrCmp $1 "${INSTALL_MARKER_CONTENT}$\r$\n" installDestinationMarkerOwned
        # The first 2.7.3 safety build used a versioned marker. Permit only
        # that known shape and still require the matching uninstall registry.
        StrCmp $1 "Quillite Markdown 2.7.3$\r$\n" installDestinationMarkerOwned
        StrCmp $1 "Quillite Markdown ${INFO_PRODUCTVERSION}$\r$\n" installDestinationMarkerOwned installDestinationRejected
    installDestinationMarkerOwned:
        SetRegView 64
        ReadRegStr $1 HKCU "${UNINST_KEY}" "InstallLocation"
        StrCmp $1 "$INSTDIR" installDestinationDone
        ReadRegStr $1 HKCU "${LEGACY_UNINST_KEY}" "InstallLocation"
        StrCmp $1 "$INSTDIR" installDestinationDone
    installDestinationRejected:
        IfSilent 0 installDestinationRejectedMessage
        SetErrorLevel 65
        Quit
    installDestinationRejectedMessage:
        MessageBox MB_ICONSTOP "安装目录中已有无法验证归属的程序文件。为保护该目录中的文件，请选择其他位置。"
        SetErrorLevel 65
        Quit
    installDestinationDone:
FunctionEnd

# A registry value is only a location hint, never deletion or overwrite
# authority. Reuse it only when a strict product marker proves ownership.
Function ResolvePreviousInstallDir
    SetRegView 64
    ReadRegStr $0 HKCU "${UNINST_KEY}" "InstallLocation"
    StrCmp $0 "" previousLegacyInstall previousInstallFound

    previousLegacyInstall:
        ReadRegStr $0 HKCU "${LEGACY_UNINST_KEY}" "InstallLocation"
        StrCmp $0 "" previousInstallFromIcon previousInstallFound

    previousInstallFromIcon:
        ReadRegStr $0 HKCU "${LEGACY_UNINST_KEY}" "DisplayIcon"
        StrCmp $0 "" previousInstallDone
        ${GetParent} "$0" $1
        StrCmp $1 "" previousInstallDone
        StrCpy $0 "$1"

    previousInstallFound:
		IfFileExists "$0\${PRODUCT_EXECUTABLE}" 0 previousInstallDone
		IfFileExists "$0\${INSTALL_MARKER}" 0 previousInstallDone
		ClearErrors
		FileOpen $1 "$0\${INSTALL_MARKER}" r
		IfErrors previousInstallDone
		FileRead $1 $2
		FileClose $1
		StrCmp $2 "${INSTALL_MARKER_CONTENT}$\r$\n" previousInstallOwned
		# Repair the first 2.7.3 safety build, which used a versioned marker.
		StrCmp $2 "Quillite Markdown 2.7.3$\r$\n" previousInstallOwned
		StrCmp $2 "Quillite Markdown ${INFO_PRODUCTVERSION}$\r$\n" previousInstallOwned previousInstallDone

	previousInstallOwned:
        StrCpy $PreviousInstallDir "$0"
        StrCpy $INSTDIR "$0"

    previousInstallDone:
FunctionEnd

# When a custom install moves the app to another drive, check and close the
# executable in the previous registered directory as well as the new target.
Function EnsurePreviousApplicationClosed
    StrCmp $PreviousInstallDir "" previousApplicationClosed
    StrCmp $PreviousInstallDir "$INSTDIR" previousApplicationClosed
    StrCpy $9 "$INSTDIR"
    StrCpy $INSTDIR "$PreviousInstallDir"
    Call EnsureApplicationClosed
    StrCpy $INSTDIR "$9"
    previousApplicationClosed:
FunctionEnd

# Detect a locked installed executable before extraction. Interactive upgrades
# let the user explicitly close the old process; silent upgrades (started by
# the in-app updater) force-close the old process and continue.
Function EnsureApplicationClosed
    # Close the legacy executable during the one-time product rename upgrade.
    # A missing process is harmless and taskkill simply returns a non-zero code.
    nsExec::ExecToStack '"$SYSDIR\taskkill.exe" /F /T /IM "${LEGACY_EXECUTABLE}"'
    Pop $0
    Pop $1
    IfFileExists "$INSTDIR\${PRODUCT_EXECUTABLE}" 0 applicationClosed
    ClearErrors
    FileOpen $0 "$INSTDIR\${PRODUCT_EXECUTABLE}" a
    IfErrors applicationLocked
    FileClose $0
    Goto applicationClosed

    applicationLocked:
        IfSilent silentForceClose applicationClosePrompt
    silentForceClose:
        # The in-app updater may have already quit by now; taskkill failing
        # because the process is gone is fine, we only wait for the lock to
        # be released before extracting the new files.
        nsExec::ExecToStack '"$SYSDIR\taskkill.exe" /F /T /IM "${PRODUCT_EXECUTABLE}"'
        Pop $0
        Pop $1
        Sleep 800
        Goto applicationClosed
    applicationClosePrompt:
        MessageBox MB_YESNO|MB_ICONEXCLAMATION "$(CloseRunningAppPrompt)" IDYES applicationForceClose IDNO applicationCloseCancelled
    applicationForceClose:
        nsExec::ExecToStack '"$SYSDIR\taskkill.exe" /F /T /IM "${PRODUCT_EXECUTABLE}"'
        Pop $0
        Pop $1
        IntCmp $0 0 applicationVerifyClosed applicationCloseFailed applicationCloseFailed
    applicationVerifyClosed:
        Sleep 500
        ClearErrors
        FileOpen $0 "$INSTDIR\${PRODUCT_EXECUTABLE}" a
        IfErrors applicationCloseFailed
        FileClose $0
        Goto applicationClosed
    applicationCloseFailed:
        IfSilent applicationCloseCancelled applicationCloseRetry
    applicationCloseRetry:
        MessageBox MB_RETRYCANCEL|MB_ICONSTOP "$(CloseRunningAppFailed)" IDRETRY applicationForceClose IDCANCEL applicationCloseCancelled
    applicationCloseCancelled:
        SetErrorLevel 66
        Quit
    applicationClosed:
FunctionEnd

# Wails' generated association macro writes a standalone .ico on every install.
# Explorer can keep that file locked. Use the executable's embedded icon instead.
!macro AssociateMarkdownFiles
    !insertmacro APP_ASSOCIATE "md" "Markdown Document" "Markdown 文档" "$INSTDIR\${PRODUCT_EXECUTABLE},0" "使用 ${INFO_PRODUCTNAME} 打开" "$\"$INSTDIR\${PRODUCT_EXECUTABLE}$\" $\"%1$\""
    !insertmacro APP_ASSOCIATE "markdown" "Markdown Document" "Markdown 文档" "$INSTDIR\${PRODUCT_EXECUTABLE},0" "使用 ${INFO_PRODUCTNAME} 打开" "$\"$INSTDIR\${PRODUCT_EXECUTABLE}$\" $\"%1$\""
    !insertmacro APP_ASSOCIATE "mdown" "Markdown Document" "Markdown 文档" "$INSTDIR\${PRODUCT_EXECUTABLE},0" "使用 ${INFO_PRODUCTNAME} 打开" "$\"$INSTDIR\${PRODUCT_EXECUTABLE}$\" $\"%1$\""
    !insertmacro APP_ASSOCIATE "mkd" "Markdown Document" "Markdown 文档" "$INSTDIR\${PRODUCT_EXECUTABLE},0" "使用 ${INFO_PRODUCTNAME} 打开" "$\"$INSTDIR\${PRODUCT_EXECUTABLE}$\" $\"%1$\""
    !insertmacro APP_ASSOCIATE "txt" "Text Document" "文本文件" "$INSTDIR\${PRODUCT_EXECUTABLE},0" "使用 ${INFO_PRODUCTNAME} 打开" "$\"$INSTDIR\${PRODUCT_EXECUTABLE}$\" $\"%1$\""
!macroend

# Mirror the registry cleanup without Wails' generated icon deletion. Legacy
# icon files may share a custom install directory with user content and are
# therefore preserved deliberately.
!macro UnassociateMarkdownFiles
    !insertmacro APP_UNASSOCIATE "md" "Markdown Document"
    !insertmacro APP_UNASSOCIATE "markdown" "Markdown Document"
    !insertmacro APP_UNASSOCIATE "mdown" "Markdown Document"
    !insertmacro APP_UNASSOCIATE "mkd" "Markdown Document"
    !insertmacro APP_UNASSOCIATE "txt" "Text Document"
!macroend

# Electron releases and early Wails installers used different uninstall keys
# or installation scopes. Remove only stale entries with this exact product
# name so Windows shows a single installed application after an upgrade.
Function RemoveLegacyUninstallEntries
    SetRegView 64
    DeleteRegKey HKCU "${LEGACY_UNINST_KEY}"
    StrCpy $0 0
    legacyHKCU:
        EnumRegKey $1 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall" $0
        StrCmp $1 "" legacyCleanupDone
        StrCmp $1 "${UNINST_KEY_NAME}" legacyHKCUNext
        ReadRegStr $2 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\$1" "DisplayName"
        StrCmp $2 "${INFO_PRODUCTNAME}" 0 legacyHKCUNext
        DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\$1"
        Goto legacyHKCU
    legacyHKCUNext:
        IntOp $0 $0 + 1
        Goto legacyHKCU
    legacyCleanupDone:
        SetRegView 64
FunctionEnd

Section
    !insertmacro wails.setShellContext

    !insertmacro ExitIfExternalCancelled 01
    Call VerifyInstallDestination
    Call EnsureApplicationClosed
    Call EnsurePreviousApplicationClosed
    !insertmacro ExitIfExternalCancelled 02

    Call RemoveLegacyUninstallEntries

    !insertmacro ExitIfExternalCancelled 03
    !insertmacro wails.webview2runtime
    !insertmacro ExitIfExternalCancelled 04

    SetOutPath $INSTDIR

    !insertmacro wails.files
    !insertmacro ExitIfExternalCancelled 05

    # Mark this directory as owned by Quillite. Custom selection is resolved to
    # a dedicated child directory by the launcher; normal upgrades continue to
    # use the exact InstallLocation recorded by the previous release.
    FileOpen $0 "$INSTDIR\${INSTALL_MARKER}" w
    FileWrite $0 "${INSTALL_MARKER_CONTENT}$\r$\n"
    FileClose $0
    SetFileAttributes "$INSTDIR\${INSTALL_MARKER}" HIDDEN

    # Preserve preferences written by MD阅读助手 during the product rename.
    # Only a genuinely fresh installation receives the language currently
    # selected in the bilingual launcher. Upgrades keep the user's preference.
    CreateDirectory "$APPDATA\${INFO_PRODUCTNAME}"
    Delete "$APPDATA\${INFO_PRODUCTNAME}\first-run-language.flag"
    IfFileExists "$APPDATA\${INFO_PRODUCTNAME}\preferences.json" installerLanguageDone
    IfFileExists "$APPDATA\${LEGACY_PRODUCTNAME}\preferences.json" 0 installerFreshPreferences
    CopyFiles /SILENT "$APPDATA\${LEGACY_PRODUCTNAME}\preferences.json" "$APPDATA\${INFO_PRODUCTNAME}\preferences.json"
    Goto installerLanguageDone
    installerFreshPreferences:
    StrCmp $ExternalAppLanguage "en" installerFreshPreferencesEnglish
    FileOpen $0 "$APPDATA\${INFO_PRODUCTNAME}\preferences.json" w
    FileWrite $0 "{$\"recentFiles$\":[],$\"favoriteFiles$\":[],$\"draftFiles$\":[],$\"language$\":$\"zh-CN$\"}"
    FileClose $0
    Goto installerLanguageDone
    installerFreshPreferencesEnglish:
    FileOpen $0 "$APPDATA\${INFO_PRODUCTNAME}\preferences.json" w
    FileWrite $0 "{$\"recentFiles$\":[],$\"favoriteFiles$\":[],$\"draftFiles$\":[],$\"language$\":$\"en$\"}"
    FileClose $0
    installerLanguageDone:

    # A shortcut's filename does not prove its target or ownership. Preserve
    # any existing shortcut, including legacy and public links.
    !insertmacro ExitIfExternalCancelled 06
    SetShellVarContext all
    IfFileExists "$SMPROGRAMS\${INFO_PRODUCTNAME}.lnk" publicStartMenuRemains createUserStartMenu
    createUserStartMenu:
        SetShellVarContext current
        IfFileExists "$SMPROGRAMS\${INFO_PRODUCTNAME}.lnk" publicStartMenuRemains
        CreateShortcut "$SMPROGRAMS\${INFO_PRODUCTNAME}.lnk" "$INSTDIR\${PRODUCT_EXECUTABLE}" "" "$INSTDIR\${PRODUCT_EXECUTABLE}" 0
    publicStartMenuRemains:

    SetShellVarContext all
    IfFileExists "$DESKTOP\${INFO_PRODUCTNAME}.lnk" publicDesktopRemains createUserDesktop
    createUserDesktop:
        SetShellVarContext current
        IfFileExists "$DESKTOP\${INFO_PRODUCTNAME}.lnk" publicDesktopRemains
        CreateShortCut "$DESKTOP\${INFO_PRODUCTNAME}.lnk" "$INSTDIR\${PRODUCT_EXECUTABLE}" "" "$INSTDIR\${PRODUCT_EXECUTABLE}" 0
    publicDesktopRemains:
        SetShellVarContext current

    # Older installers stored versioned shortcut icons. Do not use wildcard
    # deletion here: a custom/shared install directory may contain user files
    # with a matching name. The harmless legacy icon can remain on disk.
    !insertmacro ExitIfExternalCancelled 07
    !insertmacro AssociateMarkdownFiles
    System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
    !insertmacro wails.associateCustomProtocols

    !insertmacro ExitIfExternalCancelled 08
    !insertmacro wails.writeUninstaller
    # Persist the actual directory selected by the user so future upgrades
    # open the directory page at the same location.
    SetRegView 64
    WriteRegStr HKCU "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
    # Never delete files from a previous install location automatically. Older
    # versions allowed shared/custom directories and their registry location is
    # not sufficient proof that every matching file is product-owned.
    # A silent in-app upgrade (/S) should start the new version automatically.
    IfSilent 0 silentRunDone
    ExecShell "" "$INSTDIR\${PRODUCT_EXECUTABLE}"
    silentRunDone:
SectionEnd

Section "uninstall"
    !insertmacro wails.setShellContext

    # Preserve the WebView2 data directory. Recursive deletion is intentionally
    # forbidden because ownership of every descendant cannot be proven.

    # A copied or damaged uninstaller must not alter files, shortcuts, or file
    # associations without proof that it is running for an owned install.
    Call un.VerifyInstallOwnership
    StrCmp $InstallOwned "1" uninstallOwnershipConfirmed
    SetErrorLevel 65
    Quit

    uninstallOwnershipConfirmed:

    # Shortcut targets cannot be verified here, so uninstallation leaves them
    # in place rather than deleting a potentially user-created link.

    !insertmacro UnassociateMarkdownFiles
    !insertmacro wails.unassociateCustomProtocols

    # The install destination may have contained user files before Quillite was
    # installed. Delete exact product filenames and remove the directory
    # non-recursively, leaving every unrelated descendant untouched.
    Delete /REBOOTOK "$INSTDIR\${PRODUCT_EXECUTABLE}"
    !insertmacro wails.deleteUninstaller
    Delete /REBOOTOK "$INSTDIR\${INSTALL_MARKER}"
    RMDir "$INSTDIR"

SectionEnd
