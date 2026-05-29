; 66Claw NSIS Installer Hooks

!macro NSIS_HOOK_PREINSTALL
  ; Pre-install hook
!macroend

!macro NSIS_HOOK_POSTINSTALL
  CreateShortCut "$DESKTOP\66Claw.lnk" "$INSTDIR\sixtysixclaw-desktop.exe" "" "$INSTDIR\sixtysixclaw-desktop.exe" 0
  EnVar::SetHKLM
  EnVar::AddValue "Path" "$INSTDIR"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; Pre-uninstall hook
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  Delete "$DESKTOP\66Claw.lnk"
  EnVar::SetHKLM
  EnVar::DeleteValue "Path" "$INSTDIR"
!macroend
