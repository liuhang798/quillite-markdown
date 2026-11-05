# Additional document candidates use product-owned identifiers. The legacy
# Markdown macros remain separate; new TextPack registration never steals an
# existing merged HKCR default and never accesses protected UserChoice data.
!define QUILLITE_ASSOC_OWNER "cn.ssssa.quillite-markdown"
!define QUILLITE_CAPABILITIES "Software\QuilliteMarkdown\Capabilities"
!define QUILLITE_REGISTERED_APP "Quillite Markdown"
!define QUILLITE_APPLICATION_KEY "Software\Classes\Applications\${PRODUCT_EXECUTABLE}"

# A missing command does not prove an existing key is ours. Check existence,
# including empty keys and unknown child keys, before any registration writes.
!macro QuilliteAssociationPreflight KEY TAG FAILURE
    ReadRegStr $R0 HKCU "${KEY}" "QuilliteOwner"
    StrCmp $R0 "${QUILLITE_ASSOC_OWNER}" ${TAG}_namespaceReady
    StrCmp $R0 "" 0 ${FAILURE}
    System::Call 'advapi32::RegOpenKeyExW(p 0x80000001, w "${KEY}", i 0, i 0x20119, *p.r0) i.r1'
    IntCmp $1 2 ${TAG}_namespaceReady
    IntCmp $1 3 ${TAG}_namespaceReady
    IntCmp $1 0 ${TAG}_namespaceExists
    Goto ${FAILURE}
    ${TAG}_namespaceExists:
        System::Call 'advapi32::RegCloseKey(p r0)'
        Goto ${FAILURE}
    ${TAG}_namespaceReady:
!macroend

!macro QuilliteRegisterFileType EXT DESCRIPTION
    WriteRegStr HKCU "Software\Classes\QuilliteMarkdown.${EXT}" "" "${DESCRIPTION}"
    WriteRegStr HKCU "Software\Classes\QuilliteMarkdown.${EXT}" "QuilliteOwner" "${QUILLITE_ASSOC_OWNER}"
    WriteRegStr HKCU "Software\Classes\QuilliteMarkdown.${EXT}\DefaultIcon" "" "$R9"
    WriteRegStr HKCU "Software\Classes\QuilliteMarkdown.${EXT}\shell" "" "open"
    WriteRegStr HKCU "Software\Classes\QuilliteMarkdown.${EXT}\shell\open\command" "" "$R8"
    WriteRegStr HKCU "Software\Classes\.${EXT}\OpenWithProgids" "QuilliteMarkdown.${EXT}" ""
    StrCmp $R7 1 0 ${EXT}_supportedWriteDone
    WriteRegStr HKCU "${QUILLITE_APPLICATION_KEY}\SupportedTypes" ".${EXT}" ""
    ${EXT}_supportedWriteDone:
    WriteRegStr HKCU "${QUILLITE_CAPABILITIES}\FileAssociations" ".${EXT}" "QuilliteMarkdown.${EXT}"
!macroend

!macro RegisterQuilliteDocumentApplication
    StrCpy $R8 "$\"$INSTDIR\${PRODUCT_EXECUTABLE}$\" $\"%1$\""
    StrCpy $R9 "$\"$INSTDIR\${PRODUCT_EXECUTABLE}$\",0"
    # Capture BEFORE creating any HKCU extension keys: their new OpenWith
    # parent must not affect discovery of an existing machine-wide handler.
    ReadRegStr $R6 HKCR ".textpack" ""
    !insertmacro QuilliteAssociationPreflight "Software\Classes\QuilliteMarkdown.md" "md" "quilliteAssociationDone"
    !insertmacro QuilliteAssociationPreflight "Software\Classes\QuilliteMarkdown.markdown" "markdown" "quilliteAssociationDone"
    !insertmacro QuilliteAssociationPreflight "Software\Classes\QuilliteMarkdown.mdown" "mdown" "quilliteAssociationDone"
    !insertmacro QuilliteAssociationPreflight "Software\Classes\QuilliteMarkdown.mkd" "mkd" "quilliteAssociationDone"
    !insertmacro QuilliteAssociationPreflight "Software\Classes\QuilliteMarkdown.txt" "txt" "quilliteAssociationDone"
    !insertmacro QuilliteAssociationPreflight "Software\Classes\QuilliteMarkdown.textpack" "textpack" "quilliteAssociationDone"
    !insertmacro QuilliteAssociationPreflight "${QUILLITE_CAPABILITIES}" "capabilities" "quilliteAssociationDone"
    StrCpy $R7 1
    !insertmacro QuilliteAssociationPreflight "${QUILLITE_APPLICATION_KEY}" "application" "quilliteApplicationUnavailable"
    Goto quilliteApplicationChecked
    quilliteApplicationUnavailable:
        StrCpy $R7 0
    quilliteApplicationChecked:
    ReadRegStr $R0 HKCU "Software\RegisteredApplications" "${QUILLITE_REGISTERED_APP}"
    StrCmp $R0 "" quilliteAssociationWrite
    StrCmp $R0 "${QUILLITE_CAPABILITIES}" 0 quilliteAssociationDone
    quilliteAssociationWrite:
    !insertmacro QuilliteRegisterFileType "md" "Markdown 文档"
    !insertmacro QuilliteRegisterFileType "markdown" "Markdown 文档"
    !insertmacro QuilliteRegisterFileType "mdown" "Markdown 文档"
    !insertmacro QuilliteRegisterFileType "mkd" "Markdown 文档"
    !insertmacro QuilliteRegisterFileType "txt" "文本文档"
    !insertmacro QuilliteRegisterFileType "textpack" "TextPack 文档包"
    StrCmp $R7 1 0 quilliteApplicationWriteDone
    WriteRegStr HKCU "${QUILLITE_APPLICATION_KEY}" "QuilliteOwner" "${QUILLITE_ASSOC_OWNER}"
    WriteRegStr HKCU "${QUILLITE_APPLICATION_KEY}" "FriendlyAppName" "轻阅 Markdown"
    WriteRegStr HKCU "${QUILLITE_APPLICATION_KEY}\DefaultIcon" "" "$R9"
    WriteRegStr HKCU "${QUILLITE_APPLICATION_KEY}\shell\open\command" "" "$R8"
    quilliteApplicationWriteDone:
    WriteRegStr HKCU "${QUILLITE_CAPABILITIES}" "QuilliteOwner" "${QUILLITE_ASSOC_OWNER}"
    WriteRegStr HKCU "${QUILLITE_CAPABILITIES}" "ApplicationName" "轻阅 Markdown"
    WriteRegStr HKCU "${QUILLITE_CAPABILITIES}" "ApplicationDescription" "Markdown、文本和 TextPack 文档阅读与编辑"
    WriteRegStr HKCU "${QUILLITE_CAPABILITIES}" "ApplicationIcon" "$R9"
    WriteRegStr HKCU "${QUILLITE_CAPABILITIES}" "QuilliteCommand" "$R8"
    WriteRegStr HKCU "Software\RegisteredApplications" "${QUILLITE_REGISTERED_APP}" "${QUILLITE_CAPABILITIES}"
    # HKCR is merged: an HKLM default also counts. Do not shadow it with HKCU.
    StrCmp $R6 "" 0 quilliteAssociationDone
    WriteRegStr HKCU "Software\Classes\.textpack" "" "QuilliteMarkdown.textpack"
    quilliteAssociationDone:
!macroend

# Delete only values which still contain this installation's exact data. Empty
# keys may be removed, but unrelated values/children and newer paths survive.
!macro QuilliteDeleteMatchingValue KEY NAME VALUE TAG
    ReadRegStr $R0 HKCU "${KEY}" "${NAME}"
    StrCmp $R0 "${VALUE}" 0 ${TAG}_valueDone
    DeleteRegValue HKCU "${KEY}" "${NAME}"
    ${TAG}_valueDone:
!macroend

!macro QuilliteUnregisterFileType EXT DESCRIPTION
    ReadRegStr $R0 HKCU "Software\Classes\QuilliteMarkdown.${EXT}" "QuilliteOwner"
    StrCmp $R0 "${QUILLITE_ASSOC_OWNER}" 0 ${EXT}_associationRemoveDone
    ReadRegStr $R0 HKCU "Software\Classes\QuilliteMarkdown.${EXT}\shell\open\command" ""
    StrCmp $R0 "$R8" 0 ${EXT}_associationRemoveDone
    !insertmacro QuilliteDeleteMatchingValue "Software\Classes\.${EXT}" "" "QuilliteMarkdown.${EXT}" "${EXT}_default"
    !insertmacro QuilliteDeleteMatchingValue "Software\Classes\.${EXT}\OpenWithProgids" "QuilliteMarkdown.${EXT}" "" "${EXT}_openwith"
    DeleteRegKey /ifempty HKCU "Software\Classes\.${EXT}\OpenWithProgids"
    DeleteRegKey /ifempty HKCU "Software\Classes\.${EXT}"
    !insertmacro QuilliteDeleteMatchingValue "Software\Classes\QuilliteMarkdown.${EXT}\shell\open\command" "" "$R8" "${EXT}_command"
    DeleteRegKey /ifempty HKCU "Software\Classes\QuilliteMarkdown.${EXT}\shell\open\command"
    DeleteRegKey /ifempty HKCU "Software\Classes\QuilliteMarkdown.${EXT}\shell\open"
    !insertmacro QuilliteDeleteMatchingValue "Software\Classes\QuilliteMarkdown.${EXT}\shell" "" "open" "${EXT}_verb"
    DeleteRegKey /ifempty HKCU "Software\Classes\QuilliteMarkdown.${EXT}\shell"
    !insertmacro QuilliteDeleteMatchingValue "Software\Classes\QuilliteMarkdown.${EXT}\DefaultIcon" "" "$R9" "${EXT}_icon"
    DeleteRegKey /ifempty HKCU "Software\Classes\QuilliteMarkdown.${EXT}\DefaultIcon"
    !insertmacro QuilliteDeleteMatchingValue "Software\Classes\QuilliteMarkdown.${EXT}" "" "${DESCRIPTION}" "${EXT}_description"
    DeleteRegValue HKCU "Software\Classes\QuilliteMarkdown.${EXT}" "QuilliteOwner"
    DeleteRegKey /ifempty HKCU "Software\Classes\QuilliteMarkdown.${EXT}"
    ${EXT}_associationRemoveDone:
!macroend

!macro QuilliteUnregisterApplicationType EXT
    !insertmacro QuilliteDeleteMatchingValue "${QUILLITE_APPLICATION_KEY}\SupportedTypes" ".${EXT}" "" "${EXT}_supported"
!macroend

!macro QuilliteUnregisterCapabilityType EXT
    !insertmacro QuilliteDeleteMatchingValue "${QUILLITE_CAPABILITIES}\FileAssociations" ".${EXT}" "QuilliteMarkdown.${EXT}" "${EXT}_capability"
!macroend

!macro UnregisterQuilliteDocumentApplication
    StrCpy $R8 "$\"$INSTDIR\${PRODUCT_EXECUTABLE}$\" $\"%1$\""
    StrCpy $R9 "$\"$INSTDIR\${PRODUCT_EXECUTABLE}$\",0"
    !insertmacro QuilliteUnregisterFileType "md" "Markdown 文档"
    !insertmacro QuilliteUnregisterFileType "markdown" "Markdown 文档"
    !insertmacro QuilliteUnregisterFileType "mdown" "Markdown 文档"
    !insertmacro QuilliteUnregisterFileType "mkd" "Markdown 文档"
    !insertmacro QuilliteUnregisterFileType "txt" "文本文档"
    !insertmacro QuilliteUnregisterFileType "textpack" "TextPack 文档包"
    ReadRegStr $R0 HKCU "${QUILLITE_APPLICATION_KEY}" "QuilliteOwner"
    StrCmp $R0 "${QUILLITE_ASSOC_OWNER}" 0 quilliteApplicationRemoveDone
    ReadRegStr $R0 HKCU "${QUILLITE_APPLICATION_KEY}\shell\open\command" ""
    StrCmp $R0 "$R8" 0 quilliteApplicationRemoveDone
    !insertmacro QuilliteUnregisterApplicationType "md"
    !insertmacro QuilliteUnregisterApplicationType "markdown"
    !insertmacro QuilliteUnregisterApplicationType "mdown"
    !insertmacro QuilliteUnregisterApplicationType "mkd"
    !insertmacro QuilliteUnregisterApplicationType "txt"
    !insertmacro QuilliteUnregisterApplicationType "textpack"
    DeleteRegKey /ifempty HKCU "${QUILLITE_APPLICATION_KEY}\SupportedTypes"
    !insertmacro QuilliteDeleteMatchingValue "${QUILLITE_APPLICATION_KEY}\shell\open\command" "" "$R8" "application_command"
    DeleteRegKey /ifempty HKCU "${QUILLITE_APPLICATION_KEY}\shell\open\command"
    DeleteRegKey /ifempty HKCU "${QUILLITE_APPLICATION_KEY}\shell\open"
    DeleteRegKey /ifempty HKCU "${QUILLITE_APPLICATION_KEY}\shell"
    !insertmacro QuilliteDeleteMatchingValue "${QUILLITE_APPLICATION_KEY}\DefaultIcon" "" "$R9" "application_icon"
    DeleteRegKey /ifempty HKCU "${QUILLITE_APPLICATION_KEY}\DefaultIcon"
    !insertmacro QuilliteDeleteMatchingValue "${QUILLITE_APPLICATION_KEY}" "FriendlyAppName" "轻阅 Markdown" "application_name"
    DeleteRegValue HKCU "${QUILLITE_APPLICATION_KEY}" "QuilliteOwner"
    DeleteRegKey /ifempty HKCU "${QUILLITE_APPLICATION_KEY}"
    quilliteApplicationRemoveDone:
    ReadRegStr $R0 HKCU "${QUILLITE_CAPABILITIES}" "QuilliteOwner"
    StrCmp $R0 "${QUILLITE_ASSOC_OWNER}" 0 quilliteCapabilitiesRemoveDone
    ReadRegStr $R0 HKCU "${QUILLITE_CAPABILITIES}" "QuilliteCommand"
    StrCmp $R0 "$R8" 0 quilliteCapabilitiesRemoveDone
    !insertmacro QuilliteDeleteMatchingValue "Software\RegisteredApplications" "${QUILLITE_REGISTERED_APP}" "${QUILLITE_CAPABILITIES}" "registered_application"
    !insertmacro QuilliteUnregisterCapabilityType "md"
    !insertmacro QuilliteUnregisterCapabilityType "markdown"
    !insertmacro QuilliteUnregisterCapabilityType "mdown"
    !insertmacro QuilliteUnregisterCapabilityType "mkd"
    !insertmacro QuilliteUnregisterCapabilityType "txt"
    !insertmacro QuilliteUnregisterCapabilityType "textpack"
    DeleteRegKey /ifempty HKCU "${QUILLITE_CAPABILITIES}\FileAssociations"
    !insertmacro QuilliteDeleteMatchingValue "${QUILLITE_CAPABILITIES}" "ApplicationName" "轻阅 Markdown" "capabilities_name"
    !insertmacro QuilliteDeleteMatchingValue "${QUILLITE_CAPABILITIES}" "ApplicationDescription" "Markdown、文本和 TextPack 文档阅读与编辑" "capabilities_description"
    !insertmacro QuilliteDeleteMatchingValue "${QUILLITE_CAPABILITIES}" "ApplicationIcon" "$R9" "capabilities_icon"
    DeleteRegValue HKCU "${QUILLITE_CAPABILITIES}" "QuilliteCommand"
    DeleteRegValue HKCU "${QUILLITE_CAPABILITIES}" "QuilliteOwner"
    DeleteRegKey /ifempty HKCU "${QUILLITE_CAPABILITIES}"
    DeleteRegKey /ifempty HKCU "Software\QuilliteMarkdown"
    quilliteCapabilitiesRemoveDone:
!macroend
