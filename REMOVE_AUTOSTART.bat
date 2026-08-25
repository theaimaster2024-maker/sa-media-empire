@echo off
chcp 65001 >nul
title Micvo - Auto-start off
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
del "%STARTUP%\Micvo.lnk" >nul 2>&1
taskkill /F /IM pythonw.exe >nul 2>&1
echo.
echo  [OK] Auto-chalu bondho kora hoyese ebong app off kora hoyese.
echo       Abar chalu korte SETUP.bat chalao.
echo.
timeout /t 5 >nul
