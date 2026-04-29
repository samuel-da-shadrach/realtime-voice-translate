**May contain hallucinations!**

# Realtime voice translate

Minimal full-screen mobile voice translator.

Uses ElevenLabs Scribe v2 Realtime and OpenAI GPT-5.4-mini

This app and README was written using OpenAI Codex GPT-5.5.

## What It Does

- Uses ElevenLabs Scribe v2 Realtime through the official client-side token flow.
- Keeps the ElevenLabs API key on the server.
- Uses VAD and partial transcripts.
- Detects the source language from the script of each partial transcript.
- Sends each partial transcript to OpenAI for translation without waiting for earlier partials.
- Uses `gpt-5.4-mini` with reasoning effort `none` for translation.
- Displays only the latest available translation for the latest segment.
- Shows the last 30 word-like translated segments.
- Shows `???` if script-based language detection fails for the latest partial.
- Supports `English/Hindi` and `English/Russian` language pairs from a dropdown.
- Shows a Settings button during translation that disconnects Scribe and resets the current conversation.
- Clears the current conversation when the page is hidden, closed, or unloaded.
- Ignores stale translation responses after a reset.
- Optimizes the display for mobile use, with a horizontal phone recommendation and Add to Home Screen note for fullscreen mode.

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
