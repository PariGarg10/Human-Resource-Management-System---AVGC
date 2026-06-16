@echo off
cd /d "%~dp0.."
echo Starting ESSL bridge - office PC to Vercel HRMS
echo Keep this window open during office hours.
npm run essl:bridge
pause
