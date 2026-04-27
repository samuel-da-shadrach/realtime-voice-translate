# Yet Another Translate

Minimal full-screen mobile transcription display for ElevenLabs Scribe v2 Realtime.

This app was written using OpenAI Codex GPT-5.5.

## What It Does

- Uses ElevenLabs Scribe v2 Realtime through the official client-side token flow.
- Keeps the ElevenLabs API key on the server.
- Shows only the last five word-like transcription segments.
- Supports multilingual transcription display, including languages that do not use spaces between words.
- Optimizes the display for horizontal mobile use and iOS Safari fullscreen behavior.

## Run

```bash
npm install
npm run build
source /root/all_tokens.sh
HTTP_PORT=80 HTTPS_PORT=443 \
TLS_CERT=/etc/letsencrypt/live/translate.samuelshadrach.com/fullchain.pem \
TLS_KEY=/etc/letsencrypt/live/translate.samuelshadrach.com/privkey.pem \
node server.js
```

## Service

The included `eleven-scribe-last5.service` is the systemd unit used on the server.
