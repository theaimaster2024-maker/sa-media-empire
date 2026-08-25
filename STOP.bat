@echo off
chcp 65001 >nul
title Micvo - Stop
echo.
echo  Micvo bondho kortesi...
echo.
taskkill /F /IM pythonw.exe >nul 2>&1
if not errorlevel 1 (
    echo  [OK] Background e cholte thaka Micvo bondho hoyese.
) else (
    echo  [i] Background e kichu cholchilo na.
)
echo.
echo  Note: kalo window e cholle, oi window ta close korlei hobe.
echo.
timeout /t 4 >nul
