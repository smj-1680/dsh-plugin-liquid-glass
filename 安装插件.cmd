@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion
title Install dsh-plugin-liquid-glass

echo.
echo  ==========================================================
echo    dsh-plugin-liquid-glass   ^(Liquid Glass for DSH^)
echo  ==========================================================
echo.

REM ---------------------------------------------------------------
REM  Locate the dsh command. Three fallbacks, because a fresh DSH
REM  desktop install does not always publish `dsh` on PATH.
REM    1) dsh on PATH
REM    2) the copy bundled with the app (next to the .exe)
REM    3) common install directories
REM ---------------------------------------------------------------
set "DSH="

for %%P in (dsh.cmd) do if not defined DSH if not "%%~$PATH:P"=="" set "DSH=%%~$PATH:P"
if defined DSH echo  [1/3] found dsh on PATH: !DSH!

if not defined DSH (
  for %%D in (
    "E:\Deepseek"
    "C:\Program Files\DeepSeek Harness"
    "C:\Program Files (x86)\DeepSeek Harness"
    "%LOCALAPPDATA%\Programs\DeepSeek Harness"
    "%LOCALAPPDATA%\DeepSeek Harness"
    "D:\Deepseek"
  ) do (
    if not defined DSH if exist "%%~D\resources\runtime\cli\bin\dsh.cmd" (
      set "DSH=%%~D\resources\runtime\cli\bin\dsh.cmd"
    )
  )
  if defined DSH echo  [1/3] found dsh in the app folder: !DSH!
)

if not defined DSH (
  echo.
  echo  ----------------------------------------------------------
  echo   Could not find the dsh command.
  echo  ----------------------------------------------------------
  echo.
  echo   I looked on PATH and in these folders:
  echo     E:\Deepseek
  echo     C:\Program Files\DeepSeek Harness
  echo     %%LOCALAPPDATA%%\Programs\DeepSeek Harness
  echo.
  echo   Two options:
  echo.
  echo   A^) Install DSH to a standard folder and run this again.
  echo.
  echo   B^) Install from the plugin marketplace instead:
  echo        open DSH, go to the marketplace, search for "liquid glass".
  echo.
  echo   C^) Or paste this into a PowerShell window:
  echo        dsh plugin --profile desktop add dsh-plugin-liquid-glass
  echo.
  pause
  exit /b 1
)

REM ---------------------------------------------------------------
REM  Install.
REM  The package is prebuilt, so no build approval is needed.
REM  `dsh plugin` forwards straight to pnpm.
REM ---------------------------------------------------------------
echo.
echo  [2/3] installing (needs internet, about 3-10 seconds)...
echo.

call "!DSH!" plugin --profile desktop add dsh-plugin-liquid-glass
set "RC=!errorlevel!"

echo.
if not "!RC!"=="0" (
  echo  ----------------------------------------------------------
  echo   Install FAILED  ^(exit code !RC!^)
  echo  ----------------------------------------------------------
  echo.
  echo   Common causes:
  echo     - no internet, or the npm registry is unreachable
  echo     - DSH is still running and has the profile folder locked
  echo       ^(close DSH completely and run this again^)
  echo     - the desktop profile is managed by the app and is read-only
  echo.
  echo   You can also install it from inside DSH:
  echo     marketplace -^> search "liquid glass" -^> install
  echo.
  pause
  exit /b !RC!
)

echo  [3/3] done.
echo.
echo  ----------------------------------------------------------
echo   Installed. Now RESTART DSH: on first launch it will ask
echo   you to pick a quality level - choose it once, then you can
echo   change it later in  Settings ^-^> Liquid Glass.
echo  ----------------------------------------------------------
echo.
pause
exit /b 0
