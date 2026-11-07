@echo off
echo Packaging NoteWalt-iOS into NoteWalt-iOS.zip for GitHub upload...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Compress-Archive -Path '%~dp0*' -DestinationPath '%~dp0..\NoteWalt-iOS.zip' -Force; Write-Host 'Successfully created NoteWalt-iOS.zip in the parent directory!'"
pause
