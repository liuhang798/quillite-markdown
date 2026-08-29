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
!define INFO_PRODUCTVERSION "2.6.2"
!define INFO_COPYRIGHT      "Copyright © 2026 柳航"
!define PRODUCT_EXECUTABLE  "QuilliteMarkdown.exe"
!define LEGACY_PRODUCTNAME  "MD阅读助手"
!define LEGACY_EXECUTABLE   "MDReaderAssistant.exe"
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

## The following two statements can be used to sign the installer and the uninstaller. The path to the binaries are provided in %1
#!uninstfinalize 'signtool --file "%1"'
#!finalize 'signtool --file "%1"'

Name "${INFO_PRODUCTNAME}"
OutFile "..\..\bin\quillite-markdown-${INFO_PRODUCTVERSION}-windows-${ARCH}.exe" # Keep release filenames ASCII-safe for CI.
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
   !insertmacro wails.checkArchitecture
   Call ResolvePreviousInstallDir
FunctionEnd

Function un.onInit
   StrCpy $LANGUAGE ${LANG_SIMPCHINESE}
FunctionEnd

# Prefer the directory recorded by 2.2.3 and later. Version 2.2.2 did not
# write InstallLocation, so use its DisplayIcon path as an upgrade fallback.
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
        StrCpy $INSTDIR "$0"

    previousInstallDone:
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

    Call EnsureApplicationClosed

    Call RemoveLegacyUninstallEntries

    !insertmacro wails.webview2runtime

    SetOutPath $INSTDIR

    !insertmacro wails.files

    # Preserve preferences written by MD阅读助手 during the product rename.
    # Windows setup is Simplified Chinese only, so only a genuinely fresh
    # installation receives the default Chinese preferences.
    CreateDirectory "$APPDATA\${INFO_PRODUCTNAME}"
    Delete "$APPDATA\${INFO_PRODUCTNAME}\first-run-language.flag"
    IfFileExists "$APPDATA\${INFO_PRODUCTNAME}\preferences.json" installerLanguageDone
    IfFileExists "$APPDATA\${LEGACY_PRODUCTNAME}\preferences.json" 0 installerFreshPreferences
    CopyFiles /SILENT "$APPDATA\${LEGACY_PRODUCTNAME}\preferences.json" "$APPDATA\${INFO_PRODUCTNAME}\preferences.json"
    Goto installerLanguageDone
    installerFreshPreferences:
    FileOpen $0 "$APPDATA\${INFO_PRODUCTNAME}\preferences.json" w
    FileWrite $0 "{$\"recentFiles$\":[],$\"favoriteFiles$\":[],$\"draftFiles$\":[],$\"language$\":$\"zh-CN$\"}"
    FileClose $0
    installerLanguageDone:

    # 2.2.2 could leave a public shortcut because its CI rebuild omitted the
    # user execution-level define. Try to remove both locations. If Windows
    # does not permit deleting the public link, keep it and do not create a
    # second per-user link.
    SetShellVarContext current
    Delete "$SMPROGRAMS\${INFO_PRODUCTNAME}.lnk"
    Delete "$DESKTOP\${INFO_PRODUCTNAME}.lnk"
    Delete "$SMPROGRAMS\${LEGACY_PRODUCTNAME}.lnk"
    Delete "$DESKTOP\${LEGACY_PRODUCTNAME}.lnk"
    SetShellVarContext all
    Delete "$SMPROGRAMS\${INFO_PRODUCTNAME}.lnk"
    Delete "$DESKTOP\${INFO_PRODUCTNAME}.lnk"
    Delete "$SMPROGRAMS\${LEGACY_PRODUCTNAME}.lnk"
    Delete "$DESKTOP\${LEGACY_PRODUCTNAME}.lnk"

    IfFileExists "$SMPROGRAMS\${INFO_PRODUCTNAME}.lnk" publicStartMenuRemains createUserStartMenu
    createUserStartMenu:
        SetShellVarContext current
        CreateShortcut "$SMPROGRAMS\${INFO_PRODUCTNAME}.lnk" "$INSTDIR\${PRODUCT_EXECUTABLE}" "" "$INSTDIR\${PRODUCT_EXECUTABLE}" 0
    publicStartMenuRemains:

    SetShellVarContext all
    IfFileExists "$DESKTOP\${INFO_PRODUCTNAME}.lnk" publicDesktopRemains createUserDesktop
    createUserDesktop:
        SetShellVarContext current
        CreateShortCut "$DESKTOP\${INFO_PRODUCTNAME}.lnk" "$INSTDIR\${PRODUCT_EXECUTABLE}" "" "$INSTDIR\${PRODUCT_EXECUTABLE}" 0
    publicDesktopRemains:
        SetShellVarContext current

    # Older installers stored a separate shortcut icon. Explorer may keep that
    # file locked during a same-version reinstall, so shortcuts now use the icon
    # embedded in the executable and stale icon files are removed when possible.
    Delete /REBOOTOK "$INSTDIR\MDReaderAssistant-*.ico"
    Delete /REBOOTOK "$INSTDIR\QuilliteMarkdown-*.ico"
    Delete /REBOOTOK "$INSTDIR\${LEGACY_EXECUTABLE}"

    !insertmacro AssociateMarkdownFiles
    Delete /REBOOTOK "$INSTDIR\mdFileIcon.ico"
    System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
    !insertmacro wails.associateCustomProtocols

    !insertmacro wails.writeUninstaller
    # Persist the actual directory selected by the user so future upgrades
    # open the directory page at the same location.
    SetRegView 64
    WriteRegStr HKCU "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
    # A silent in-app upgrade (/S) should start the new version automatically.
    IfSilent 0 silentRunDone
    ExecShell "" "$INSTDIR\${PRODUCT_EXECUTABLE}"
    silentRunDone:
SectionEnd

Section "uninstall"
    !insertmacro wails.setShellContext

    RMDir /r "$AppData\${PRODUCT_EXECUTABLE}" # Remove the WebView2 DataPath

    RMDir /r $INSTDIR

    SetShellVarContext current
    Delete "$SMPROGRAMS\${INFO_PRODUCTNAME}.lnk"
    Delete "$DESKTOP\${INFO_PRODUCTNAME}.lnk"
    Delete "$SMPROGRAMS\${LEGACY_PRODUCTNAME}.lnk"
    Delete "$DESKTOP\${LEGACY_PRODUCTNAME}.lnk"
    SetShellVarContext all
    Delete "$SMPROGRAMS\${INFO_PRODUCTNAME}.lnk"
    Delete "$DESKTOP\${INFO_PRODUCTNAME}.lnk"
    Delete "$SMPROGRAMS\${LEGACY_PRODUCTNAME}.lnk"
    Delete "$DESKTOP\${LEGACY_PRODUCTNAME}.lnk"
    SetShellVarContext current

    !insertmacro wails.unassociateFiles
    !insertmacro wails.unassociateCustomProtocols

    !insertmacro wails.deleteUninstaller
SectionEnd
