@echo off
rem Lance Coffre en mode test (sans compiler). Necessite Node.js 22 ou plus recent.
cd /d "%~dp0"
set NODEMAJ=
for /f "tokens=1 delims=v." %%a in ('node -v 2^>nul') do set NODEMAJ=%%a
if not defined NODEMAJ goto nonode
if %NODEMAJ% LSS 22 goto oldnode
rem Reinstalle les dependances si package.json a change depuis la derniere fois
set NEED=0
if not exist node_modules set NEED=1
if not exist node_modules\.coffre-package.json set NEED=1
if exist node_modules\.coffre-package.json fc /b package.json node_modules\.coffre-package.json >nul || set NEED=1
if "%NEED%"=="1" goto install
goto start
:install
echo Installation des dependances, patiente un peu...
call npm install
if errorlevel 1 goto fail
copy /y package.json node_modules\.coffre-package.json >nul
:start
call npm start
goto :eof
:nonode
echo Node.js n'est pas installe. Installe la version LTS sur https://nodejs.org puis relance.
pause
goto :eof
:oldnode
echo Ta version de Node.js est trop ancienne : v%NODEMAJ%. Il faut la 22 ou plus recente.
echo Installe la version LTS sur https://nodejs.org puis relance.
pause
goto :eof
:fail
echo L'installation a echoue. Envoie une capture de cette fenetre.
pause
