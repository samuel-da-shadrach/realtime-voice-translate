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
- Bottom-aligns the full latest translation and clips older overflowing lines off-screen.
- Shows `???` if script-based language detection fails for the latest partial.
- Supports `English/Hindi` and `English/Russian` language pairs from a dropdown.
- Shows a Settings button during translation that disconnects Scribe and resets the current conversation.
- Clears the current conversation when the page is hidden, closed, or unloaded.
- Ignores stale translation responses after a reset.
- Requests a screen wake lock while translating when the browser supports it.
- Optimizes the display for mobile use, with a horizontal phone recommendation and Add to Home Screen note for fullscreen mode.

## Run

For local/manual testing after dependencies and tokens are present:

```bash
npm install
npm run build
source /root/all_tokens.sh
HTTP_PORT=80 HTTPS_PORT=443 \
TLS_CERT=/etc/letsencrypt/live/translate.samuelshadrach.com/fullchain.pem \
TLS_KEY=/etc/letsencrypt/live/translate.samuelshadrach.com/privkey.pem \
node server.js
```

## Fresh Server Deployment

These steps are intended to be enough for a new OpenAI Codex instance or human operator to host the app on a fresh Ubuntu/Debian server.

Assumptions:

- Domain: `translate.samuelshadrach.com`
- App directory: `/root/realtime-voice-translate`
- Public repo: `https://github.com/samuel-da-shadrach/realtime-voice-translate.git`
- Runtime user: `root`
- HTTP/HTTPS ports: `80` and `443`
- TLS: Let's Encrypt certificate at `/etc/letsencrypt/live/translate.samuelshadrach.com/`

### 1. DNS

Create an `A` record:

```text
translate.samuelshadrach.com -> SERVER_IPV4_ADDRESS
```

For initial Let's Encrypt setup, use DNS-only mode in Cloudflare if possible. After the certificate works, Cloudflare proxying can be enabled with SSL/TLS mode set to Full or Full strict.

### 2. System Packages

Install Node.js, npm, git, and certbot:

```bash
apt update
apt install -y nodejs npm git certbot
```

If the distro Node.js is too old for Vite/React tooling, install a current LTS Node.js release and then rerun `npm install`.

### 3. Clone

Clone this repo into the path expected by the included service files:

```bash
cd /root
git clone https://github.com/samuel-da-shadrach/realtime-voice-translate.git realtime-voice-translate
cd /root/realtime-voice-translate
```

If you clone elsewhere, update both `start.sh` and `realtime-voice-translate.service`.

### 4. Tokens

Create `/root/all_tokens.sh`:

```bash
cat >/root/all_tokens.sh <<'EOF'
export ELEVENLABS_API_KEY='replace-with-elevenlabs-api-key'
export OPENAI_API_KEY='replace-with-openai-api-key'
EOF
chmod 600 /root/all_tokens.sh
```

Do not commit this file. It is intentionally outside the repo.

### 5. Build

```bash
cd /root/realtime-voice-translate
npm install
npm run build
```

### 6. TLS Certificate

Make sure nothing is already listening on port `80`, then issue the certificate:

```bash
certbot certonly --standalone -d translate.samuelshadrach.com
```

Expected files:

```text
/etc/letsencrypt/live/translate.samuelshadrach.com/fullchain.pem
/etc/letsencrypt/live/translate.samuelshadrach.com/privkey.pem
```

The app can run HTTP-only if these files are absent, but microphone access in browsers requires HTTPS for normal use.

### 7. Install Service

```bash
cd /root/realtime-voice-translate
chmod +x start.sh
cp realtime-voice-translate.service /etc/systemd/system/realtime-voice-translate.service
systemctl daemon-reload
systemctl enable realtime-voice-translate.service
systemctl restart realtime-voice-translate.service
```

### 8. Verify

Check service status:

```bash
systemctl status realtime-voice-translate.service
```

Check logs:

```bash
journalctl -u realtime-voice-translate.service -f
```

Check health:

```bash
curl -sS http://127.0.0.1/health
curl -sS https://translate.samuelshadrach.com/health
```

Open:

```text
https://translate.samuelshadrach.com
```

### 9. Firewall

Ensure inbound TCP `80` and `443` are allowed by the server firewall and any cloud firewall.

### 10. Common Failure Points

- `ELEVENLABS_API_KEY is not set`: `/root/all_tokens.sh` is missing, unreadable, or does not export `ELEVENLABS_API_KEY`.
- `OPENAI_API_KEY is not set`: `/root/all_tokens.sh` is missing, unreadable, or does not export `OPENAI_API_KEY`.
- Browser microphone does not work: use HTTPS, not plain HTTP.
- HTTPS does not start: check the Let's Encrypt cert/key paths in `realtime-voice-translate.service`.
- Service starts but domain fails: check DNS, Cloudflare SSL mode, firewall, and whether ports `80`/`443` are already in use.
- Certbot standalone fails: stop anything using port `80`, verify DNS points to this server, and rerun certbot.

## Service

The included `realtime-voice-translate.service` is the systemd unit used on the server.
