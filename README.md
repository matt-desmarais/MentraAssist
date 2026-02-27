# MentraOS Home Assistant Voice Control

A [MentraOS](https://mentra.glass) app that lets you control [Home Assistant](https://www.home-assistant.io/) by voice through your Mentra smart glasses.

## How it works

Say your wake word (default: **"home"**) followed by any Home Assistant Assist command:

> "Home, turn on the kitchen lights"
> "Home set the thermostat to 70"
> "Home, lock the front door"

The app listens via the glasses microphone, detects the wake word, and sends the rest of the phrase to Home Assistant's [Conversation API](https://developers.home-assistant.io/docs/intent_api). The response is spoken back through the glasses speaker.

## Requirements

- [Bun](https://bun.sh)
- A MentraOS developer account at [console.mentra.glass](https://console.mentra.glass)
- A Home Assistant instance with a Long-Lived Access Token

## Setup

### 1. Install dependencies

```bash
bun install
```

### 2. Configure environment

Create a `.env` file:

```env
PORT=3000
PACKAGE_NAME=com.yourname.homeassistant
MENTRAOS_API_KEY=your_mentraos_api_key
HA_BASE_URL=https://your-instance.ui.nabu.casa  # or http://homeassistant.local:8123
HA_TOKEN=your_long_lived_access_token
WAKE_WORD=home  # optional, default is "home"
```

To get a HA long-lived token: **Settings → Profile → Security → Long-Lived Access Tokens**.

### 3. Run

```bash
bun run index.ts
```

### 4. Register in MentraOS console

Register the app at [console.mentra.glass](https://console.mentra.glass) with:
- **Package name:** matching `PACKAGE_NAME` in your `.env`
- **Webhook URL:** your publicly accessible server (e.g. `wss://homeassistant.yourdomain.com`)

## Changing the wake word

Open the phone webview (`/webview`) while the app is running. There's a **Wake Word** field at the top — type any word and save. The change takes effect immediately and persists across restarts.

## Ports

| Port | Purpose |
|------|---------|
| 3000 | MentraOS WebSocket (app server) |
| 3001 | Express web UI / phone webview |

## Stack

- [MentraOS SDK](https://github.com/mentra-glass/mentraos-sdk)
- [Home Assistant Assist](https://www.home-assistant.io/voice_control/builtin_sentences/)
- [Bun](https://bun.sh)
- Express
