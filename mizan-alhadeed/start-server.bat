@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo جاري تشغيل موقع ميزان الحديد للجمالونات...
start "" "http://localhost:8080"
python server.py
pause
