@echo off
rem Lance Coffre en mode test (sans compiler). Necessite Node.js.
cd /d "%~dp0"
if not exist node_modules (
  echo Installation des dependances, patiente un peu...
  call npm install
)
call npm start
