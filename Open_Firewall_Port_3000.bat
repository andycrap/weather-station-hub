@echo off
title Weather Station Hub - Windows Firewall Configurator
echo ============================================================
echo   Opening Windows Firewall Port 3000 for LAN Access...
echo ============================================================
echo.
netsh advfirewall firewall delete rule name="Weather Station Hub (Port 3000)" >nul 2>&1
netsh advfirewall firewall add rule name="Weather Station Hub (Port 3000)" dir=in action=allow protocol=TCP localport=3000
echo.
if %errorlevel% equ 0 (
    echo SUCCESS: Windows Firewall Rule added for Port 3000!
    echo Remote computers on your network can now connect.
) else (
    echo WARNING: Right-click this file and select "Run as Administrator" to apply firewall rule.
)
echo.
pause
