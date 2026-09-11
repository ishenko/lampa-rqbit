# Lampa rqbit plugin

JavaScript plugin for Android Lampa, paired with a Cudy/OpenWrt rqbit backend.
No APK, TorrServer bridge, or video proxy.

Plugin URL for CUB personal plugins:

```
https://ishenko.github.io/lampa-rqbit/rqbit.js
```

The router must already provide stock rqbit at `http://192.168.1.1:3030` and
the matching retention/priority helper at `/cgi-bin/cudy-rqbit` on port 80.
This repository contains only the client plugin, not a standalone backend installer.

- Short tap: select a video, keep a TEMP download, and open a direct stream in
  the Android external player. Select VLC as the default external player.
- Long tap: download locally using the device torrent client, or save to USB.
  Saving to USB offers one file or all files; selections accumulate.
- The router pauses background jobs for playback sessions and restores its own
  pauses on return to Lampa or after 60 seconds without client HTTP connections.
- The router removes TEMP jobs and files daily at 04:00 Europe/Moscow, including
  files being played at that time. Permanent downloads survive that cleanup.

Set the dedicated rqbit username and password in Lampa settings under `rqbit`.
Credentials are stored on the device and are not included in this repository.
Treat all other plugins installed in the same Lampa instance as trusted code.
`Reset playback priority` in those settings clears this device's playback session.

V1 targets the Android app. Browser playback needs a separate solution for
CORS, authentication, mixed content, and browser-supported codecs. This plugin
does not enable browser playback or transcode media.

HTTP connection activity is an approximation: API connections can extend
priority, and a player that has buffered the video may close its connection
before playback ends. A session expires after that 60-second grace period.
