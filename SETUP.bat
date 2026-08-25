@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Micvo - Setup

echo.
echo ==================================================
echo    Micvo  -  Ekbar Setup
echo ==================================================
echo.

REM ================= Temp folder theke cholche kina =================
echo %CD% | find /i "\Temp\" >nul
if not errorlevel 1 goto :tempError
echo %CD% | find /i "\AppData\" >nul
if not errorlevel 1 goto :tempError
goto :pathOk

:tempError
echo.
echo ==================================================
echo  [X] THAMO - eta zip er VITOR theke cholche.
echo.
echo      Tumi zip e double click kore vitore dhuke
echo      SETUP.bat chaliyecho. Eta kaj korbe na,
echo      karon Windows ei folder ta muche felbe.
echo.
echo      THIK VABE KORO:
echo      1. Zip file er upor RIGHT-CLICK koro
echo      2. "Extract All..." e click koro
echo      3. Je box ashbe, sekhane likho:  C:\Micvo
echo      4. Extract chapo
echo      5. C:\Micvo folder e giye SETUP.bat chalao
echo ==================================================
echo.
pause
exit /b 1

:pathOk
REM ================= Python khoja =================
echo  [1/4] Python khujtesi...
set "PY="
py -3 --version >nul 2>&1
if not errorlevel 1 set "PY=py -3"
if not defined PY (
    python --version >nul 2>&1
    if not errorlevel 1 set "PY=python"
)
if not defined PY (
    for /f "delims=" %%P in ('dir /b /s /a:-d "%LOCALAPPDATA%\Programs\Python\python.exe" 2^>nul') do (
        if not defined PY set "PY="%%P""
    )
)
if not defined PY (
    for /f "delims=" %%P in ('dir /b /s /a:-d "%LOCALAPPDATA%\Python\*\python.exe" 2^>nul') do (
        if not defined PY set "PY="%%P""
    )
)
if not defined PY (
    for /f "delims=" %%P in ('dir /b /s /a:-d "%ProgramFiles%\Python*\python.exe" 2^>nul') do (
        if not defined PY set "PY="%%P""
    )
)
if not defined PY (
    echo.
    echo  [X] Python pawa gelo na. python.org theke install koro,
    echo      "Add python.exe to PATH" e tick diye.
    echo.
    pause
    exit /b 1
)
for /f "delims=" %%v in ('%PY% --version 2^>^&1') do echo        %%v

REM ================= pythonw.exe er path =================
for /f "delims=" %%E in ('%PY% -c "import sys,os;print(os.path.join(os.path.dirname(sys.executable),'pythonw.exe'))"') do set "PYW=%%E"

REM ================= Library =================
echo  [2/4] Library check kortesi...
%PY% -c "import sounddevice, numpy, requests, keyboard, pyperclip" >nul 2>&1
if errorlevel 1 (
    echo        Namatesi... 1-5 min lagte pare, opekkha koro.
    %PY% -m pip install --upgrade pip --quiet
    %PY% -m pip install -r requirements.txt --quiet
    %PY% -c "import sounddevice, numpy, requests, keyboard, pyperclip" >nul 2>&1
    if errorlevel 1 (
        echo.
        echo  [X] Library install fail korse.
        echo      Micvo.bat chaliye screenshot pathao.
        echo.
        pause
        exit /b 1
    )
)
echo        Sob library ready.

REM ================= Background launcher banano =================
echo  [3/4] Background launcher banatesi...
set "VBS=%CD%\_background.vbs"
> "%VBS%" echo Set sh = CreateObject("WScript.Shell")
>> "%VBS%" echo pyw = "%PYW%"
>> "%VBS%" echo app = "%CD%\micvo.py"
>> "%VBS%" echo sh.CurrentDirectory = "%CD%"
>> "%VBS%" echo sh.Run """" ^& pyw ^& """ """ ^& app ^& """", 0, False

REM ================= Startup e add kora =================
echo  [4/4] PC on holei auto-chalu set kortesi...
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
powershell -NoProfile -Command "$W=New-Object -ComObject WScript.Shell; $S=$W.CreateShortcut('%STARTUP%\Micvo.lnk'); $S.TargetPath='wscript.exe'; $S.Arguments='\"%VBS%\"'; $S.WorkingDirectory='%CD%'; $S.Save()" >nul 2>&1

if exist "%STARTUP%\Micvo.lnk" (
    echo        Hoye gese.
) else (
    echo        [!] Auto-chalu set kora gelo na, kintu app cholbe.
)

REM ================= Ekhon chalu kora =================
taskkill /F /IM pythonw.exe >nul 2>&1
start "" wscript.exe "%VBS%"

echo.
echo ==================================================
echo    [OK] SOB HOYE GESE
echo.
echo    Micvo ekhon background e cholche.
echo    Ei window ta bondho kore dite paro.
echo.
echo    Ekhon jekono jaygay - Claude, Messenger,
echo    WhatsApp, Word - text box e click kore
echo    Ctrl+Space chepe DHORE bolo, tarpor CHERE dao.
echo.
echo    PC restart korleo nijei chalu hoye jabe.
echo    Bondho korte: STOP.bat
echo ==================================================
echo.
pause
