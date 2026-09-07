@echo off
setlocal EnableExtensions
title Muse Novel AI Launcher
where pwsh.exe >nul 2>&1
if errorlevel 1 (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-Muse-AI.ps1" %*
) else (
  pwsh.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-Muse-AI.ps1" %*
)
if errorlevel 1 pause
