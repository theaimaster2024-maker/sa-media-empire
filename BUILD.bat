@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Micvo - Installer Builder

echo.
echo ==================================================
echo    Micvo Installer Builder
echo    Ei file ekbar chalale MicvoSetup.exe toiri hobe
echo ==================================================
echo.

REM ---------- Python khoja ----------
set "PY="
py -3 --version >nul 2>&1
if not errorlevel 1 set "PY=py -3"
if not defined PY (
    python --version >nul 2>&1
    if not errorlevel 1 set "PY=python"
)
if not defined PY (
    echo  [X] Python pawa gelo na. python.org theke install koro.
    pause
    exit /b 1
)

REM ---------- PyInstaller ready kora ----------
echo  [1/3] PyInstaller ready kortesi...
%PY% -m pip install --upgrade pip --quiet
%PY% -m pip install pyinstaller --quiet
%PY% -m pip install -r requirements.txt --quiet

REM ---------- exe banano ----------
echo  [2/3] Micvo.exe banatesi... (2-5 min lagte pare)
%PY% -m PyInstaller ^
    --onefile ^
    --windowed ^
    --name Micvo ^
    --icon micvo.ico ^
    --add-data "config.py;." ^
    --hidden-import sounddevice ^
    --hidden-import numpy ^
    --hidden-import keyboard ^
    --hidden-import pyperclip ^
    --clean ^
    --noconfirm ^
    micvo.py

if not exist "dist\Micvo.exe" (
    echo.
    echo  [X] exe banano fail korse. Upore error ta dekho.
    pause
    exit /b 1
)
echo        dist\Micvo.exe toiri hoyese.

REM ---------- Inno Setup diye installer ----------
echo  [3/3] Installer banatesi...
set "ISCC="
if exist "%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe" set "ISCC=%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"
if exist "%ProgramFiles%\Inno Setup 6\ISCC.exe" set "ISCC=%ProgramFiles%\Inno Setup 6\ISCC.exe"

if not defined ISCC (
    echo.
    echo  [!] Inno Setup pawa gelo na.
    echo      jrsoftware.org/isdl.php theke Inno Setup 6 install koro,
    echo      tarpor ei file abar chalao.
    echo.
    echo      Tobe dist\Micvo.exe toiri hoye gese - eta ekai cholbe.
    echo.
    pause
    exit /b 0
)

"%ISCC%" installer.iss
if errorlevel 1 (
    echo  [X] Installer banano fail korse.
    pause
    exit /b 1
)

echo.
echo ==================================================
echo    [OK] SOB HOYE GESE
echo.
echo    Output\MicvoSetup.exe  <- eta-i audience ke dibe
echo.
echo    Eta GitHub Releases e upload koro.
echo ==================================================
echo.
pause
