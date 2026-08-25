@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Micvo

echo.
echo ==================================================
echo    Micvo
echo ==================================================
echo.
echo  Python khujtesi...

set "PY="

REM ---- 1) Python Launcher (sob cheye nirbhorjoggo) ----
py -3 --version >nul 2>&1
if not errorlevel 1 set "PY=py -3"

REM ---- 2) PATH e python ----
if not defined PY (
    python --version >nul 2>&1
    if not errorlevel 1 set "PY=python"
)

REM ---- 3) User er nijer folder e khoja ----
if not defined PY (
    for /f "delims=" %%P in ('dir /b /s /a:-d "%LOCALAPPDATA%\Programs\Python\python.exe" 2^>nul') do (
        if not defined PY set "PY="%%P""
    )
)

REM ---- 4) Program Files e khoja ----
if not defined PY (
    for /f "delims=" %%P in ('dir /b /s /a:-d "%ProgramFiles%\Python*\python.exe" 2^>nul') do (
        if not defined PY set "PY="%%P""
    )
)

REM ---- 5) C drive e khoja ----
if not defined PY (
    for /f "delims=" %%P in ('dir /b /s /a:-d "C:\Python*\python.exe" 2^>nul') do (
        if not defined PY set "PY="%%P""
    )
)

if not defined PY (
    echo.
    echo ==================================================
    echo  [X] Python kothao pawa gelo na.
    echo.
    echo      python.org/downloads theke abar install koro.
    echo      Installer er PROTHOM screen e nichey
    echo      "Add python.exe to PATH" checkbox e
    echo      OBOSSHOI tick dio, tarpor Install Now.
    echo.
    echo      Install sesh hole ei file e abar double click.
    echo ==================================================
    echo.
    pause
    exit /b 1
)

for /f "delims=" %%v in ('%PY% --version 2^>^&1') do echo  [OK] %%v

REM ---- Library check ----
echo  Library check kortesi...
%PY% -c "import sounddevice, numpy, requests, keyboard, pyperclip" >nul 2>&1

if errorlevel 1 (
    echo.
    echo  Prothombar - library gulo namatesi. 1-3 min lagte pare.
    echo  ------------------------------------------------
    %PY% -m pip install --upgrade pip --quiet
    %PY% -m pip install -r requirements.txt
    echo  ------------------------------------------------
    %PY% -c "import sounddevice, numpy, requests, keyboard, pyperclip" >nul 2>&1
    if errorlevel 1 (
        echo.
        echo ==================================================
        echo  [X] Library install fail korse.
        echo      Upore lekha ta screenshot niye pathao.
        echo ==================================================
        echo.
        pause
        exit /b 1
    )
    echo  [OK] Sob library ready.
)

echo.
echo ==================================================
echo    App chalu hocche...
echo ==================================================
echo.

%PY% micvo.py

echo.
if errorlevel 1 (
    echo  [X] App bondho hoye gese. Upore error ta pathao.
)
pause
