@echo off
cd /d "%~dp0"
echo Starting Imperial Conflict...
"C:\Users\mschl\Godot\Godot_v4.4.1-stable_win64.exe" --path "." --rendering-method gl_compatibility
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Failed to launch Godot. Error code: %errorlevel%
    pause
)
