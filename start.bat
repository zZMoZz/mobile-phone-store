@echo off
REM Launch the Mobile Phone Store app in production mode and open it in the browser.
cd /d "%~dp0"

echo Building client (first run may take a minute)...
call npm run build
if errorlevel 1 goto :error

echo Starting server...
start "" http://localhost:4000
call npm start
goto :eof

:error
echo.
echo Build failed. Make sure you ran "npm install" first.
pause
