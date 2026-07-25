' Optional hidden launcher for autostart at logon. Runs start-host-docker.bat
' (waits for the Docker engine, then `docker compose up -d --build`) with no
' visible console window. Point a Startup-folder shortcut at this file to use it.
'
' Not required if Docker Desktop autostarts the container itself
' (docker-compose `restart: unless-stopped` + "start at logon").
'
' CreateObject("Wscript.Shell").Run "cmd /c ""D:\2026\rate-scrapper\start-host-docker.bat""", 0, False
