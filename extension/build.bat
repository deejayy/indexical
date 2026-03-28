@echo off
setlocal
set ZIP=7za
set EXCLUDES=-xr!_build.bat -xr!*.xpi -xr!*.bat -xr!*.7z -xr!*.zip -xr!.git
set XPI=..\dist\indexical.xpi
set CRX=..\dist\indexical-chrome.zip
if exist %XPI% del %XPI%
if exist %CRX% del %CRX%
cd src
%ZIP% a -tzip ..\%XPI% * ../assets/* %EXCLUDES% && echo Created %XPI%
%ZIP% a -tzip ..\%CRX% * ../assets/* %EXCLUDES% && echo Created %CRX%
