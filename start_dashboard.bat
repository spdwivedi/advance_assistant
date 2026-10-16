@echo off
TITLE Advance Assistant OS v6.0 - Web Gateway
COLOR 0B

echo ==================================================================
echo    Advance Assistant OS v6.0 - Windows Host Gateway Launcher
echo ==================================================================
echo.

echo [*] Launching Windows Chrome to http://localhost:5173 ...
start "" "http://localhost:5173"

echo [*] Initializing WSL backend and frontend services...
echo.

wsl.exe -e bash -ic "cd ~/advance_assistant && ./start_dashboard.sh"

echo.
echo [*] Services stopped.
pause
