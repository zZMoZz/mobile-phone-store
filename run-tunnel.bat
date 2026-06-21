@echo off
title Mobile Store Tunnel
echo Checking which port the server is on...
echo.

:: Check port 5173 (Vite dev server)
netstat -ano | findstr ":5173 " | findstr "LISTENING" >nul 2>&1
if %errorlevel%==0 (
    set PORT=5173
    echo Found server on port 5173 (dev mode)
    goto run_tunnel
)

:: Check port 4000 (production / Express)
netstat -ano | findstr ":4000 " | findstr "LISTENING" >nul 2>&1
if %errorlevel%==0 (
    set PORT=4000
    echo Found server on port 4000 (production mode)
    goto run_tunnel
)

echo ERROR: No server found on port 5173 or 4000.
echo Make sure the dev server is running first (npm run dev or start.bat).
pause
exit /b 1

:run_tunnel
echo.
echo Starting tunnel for port %PORT%...
echo The public URL will appear below in a moment.
echo (Keep this window open while using the tunnel)
echo.
npx --yes localtunnel --port %PORT%
pause
