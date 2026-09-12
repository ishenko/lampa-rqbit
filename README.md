# Lampa USB Downloads

JavaScript plugin for Android Lampa with Transmission on Cudy/OpenWrt.
The historical repository and filename remain for existing CUB installations:

```
https://ishenko.github.io/lampa-rqbit/rqbit.js
```

- Short tap preserves Lampa's original TorrServer action.
- Long tap offers the device's local torrent client, including away from home.
- USB download appears only when the paired router and USB are available.
- Select several episodes/files or all files; later selections accumulate.
- Downloaded videos appear in "Скачанное", grouped into folders. Only complete
  files can be opened. Eye marks are saved on each device when opening a file.
- Downloads stop seeding on completion. No TEMP cleanup or playback priority.

Requires the matching /cgi-bin/cudy-downloads helper on 192.168.1.1,
Transmission on port 9091 and completed-file HTTP service on port 8081.
This repository contains the client only, not a router installer.
LAN downloads need no login. Router and Samba administration retain passwords.

Restart Lampa after upgrading to discard the old plugin's event handlers.
The plugin targets Android's native external-player and torrent-client actions.
It does not transcode video or enable unfinished-torrent streaming.
