' Autostart is now handled by Docker (docker-compose `restart: unless-stopped`
' + Docker Desktop starting at logon), so this launcher no longer starts a host
' server. Deploy with:  docker compose up -d --build
'
' To go back to running on the host instead of Docker, uncomment one line below:
' CreateObject("Wscript.Shell").Run "cmd /c ""D:\2026\rate-scrapper\start-host-next.bat""", 0, False   ' Next.js on host
' CreateObject("Wscript.Shell").Run "cmd /c ""D:\2026\rate-scrapper\start-host.bat""", 0, False        ' legacy plain-node
