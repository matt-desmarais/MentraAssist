import { AppServer, AppSession } from '@mentra/sdk';
import express from 'express';
import type { Request, Response } from 'express';
import * as fs from 'fs';

const HA_BASE_URL = process.env.HA_BASE_URL || 'http://localhost:8123';
const HA_TOKEN = process.env.HA_TOKEN || '';
const SETTINGS_FILE = './settings.json';

// ── Settings ──────────────────────────────────────────────────────────────────

interface Settings {
  wakeWord: string;
}

function loadSettings(): Settings {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
  } catch {
    return { wakeWord: process.env.WAKE_WORD || 'home' };
  }
}

function saveSettings(s: Settings): void {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2));
}

const settings = loadSettings();

function buildWakeRegex(word: string): RegExp {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^(?:hey\\s+)?${escaped}[,.]?\\s+(.+)`, 'i');
}

// ── HA API ────────────────────────────────────────────────────────────────────

interface CommandLog {
  timestamp: Date;
  command: string;
  response: string | null;
  error: string | null;
}

async function sendToAssist(text: string): Promise<string> {
  const res = await fetch(`${HA_BASE_URL}/api/conversation/process`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${HA_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text, language: 'en' }),
  });

  if (!res.ok) {
    throw new Error(`HA API error ${res.status}: ${await res.text()}`);
  }

  const data = await res.json() as {
    response?: { speech?: { plain?: { speech?: string } } };
  };
  return data.response?.speech?.plain?.speech ?? 'Done.';
}

// ── App ───────────────────────────────────────────────────────────────────────

class HomeAssistantApp extends AppServer {
  public log: CommandLog[] = [];

  protected override async onSession(
    session: AppSession,
    sessionId: string,
    _userId: string
  ): Promise<void> {
    console.log(`\n[HA] Session ${sessionId} started`);
    await session.audio.speak(`Home Assistant ready. Say ${settings.wakeWord} then your command.`);

    session.subscribe('transcription');

    session.events.onTranscription(async (data) => {
      const text = data.text.trim();
      if (!text) return;

      if (!data.isFinal) {
        process.stdout.write(`\r... ${text.slice(0, 80).padEnd(80)}`);
        return;
      }

      console.log(`\n[HA] Final: "${text}"`);

      const match = buildWakeRegex(settings.wakeWord).exec(text);
      if (!match) return;

      const command = (match[1] ?? '').trim();
      console.log(`[HA] Command: "${command}"`);

      const entry: CommandLog = { timestamp: new Date(), command, response: null, error: null };
      this.log.push(entry);

      try {
        const response = await sendToAssist(command);
        entry.response = response;
        console.log(`[HA] Response: "${response}"`);
        await session.audio.speak(response);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        entry.error = msg;
        console.error(`[HA] Error: ${msg}`);
        await session.audio.speak('Sorry, I could not reach Home Assistant.');
      }
    });

    session.events.onDisconnected(() => {
      console.log(`\n[HA] Session ${sessionId} ended. ${this.log.length} commands.`);
    });
  }
}

const app = new HomeAssistantApp({
  packageName: process.env.PACKAGE_NAME || 'com.mtm.homeassistant',
  apiKey: process.env.MENTRAOS_API_KEY || '',
  port: Number(process.env.PORT) || 3000,
});

// ── Phone UI ──────────────────────────────────────────────────────────────────

const expressApp = express();
expressApp.use(express.json());

expressApp.get('/webview/api/log', (_req: Request, res: Response) => {
  res.json(app.log ?? []);
});

expressApp.get('/webview/api/settings', (_req: Request, res: Response) => {
  res.json(settings);
});

expressApp.post('/webview/api/settings', (req: Request, res: Response) => {
  const { wakeWord } = req.body as { wakeWord?: string };
  if (!wakeWord || typeof wakeWord !== 'string' || !wakeWord.trim()) {
    res.status(400).json({ error: 'wakeWord is required' });
    return;
  }
  settings.wakeWord = wakeWord.trim().toLowerCase();
  saveSettings(settings);
  console.log(`[HA] Wake word changed to "${settings.wakeWord}"`);
  res.json({ wakeWord: settings.wakeWord });
});

expressApp.get('/webview', (_req: Request, res: Response) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Home Assistant</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, sans-serif; background: #0f1117; color: #eee; padding: 16px; }
    h1 { color: #18a0fb; font-size: 22px; margin-bottom: 4px; }
    .subtitle { color: #666; font-size: 13px; margin-bottom: 20px; }
    .settings { background: #1a2030; border-radius: 8px; padding: 12px 14px; margin-bottom: 20px; }
    .settings label { font-size: 12px; color: #888; display: block; margin-bottom: 6px; }
    .settings-row { display: flex; gap: 8px; }
    .settings input { flex: 1; background: #0f1117; border: 1px solid #333; border-radius: 6px; padding: 8px 10px; color: #eee; font-size: 14px; }
    .settings input:focus { outline: none; border-color: #18a0fb; }
    .settings button { background: #18a0fb; border: none; border-radius: 6px; padding: 8px 16px; color: #fff; font-size: 14px; cursor: pointer; }
    .settings button:active { opacity: 0.8; }
    .saved { color: #4c4; font-size: 12px; margin-top: 6px; display: none; }
    .hint { font-size: 12px; color: #555; margin-top: 6px; }
    .entry { margin-bottom: 14px; background: #1a1a2e; border-radius: 8px; padding: 12px; border-left: 3px solid #18a0fb; }
    .entry.error { border-left-color: #f55; }
    .command { font-size: 15px; font-weight: 600; }
    .response { color: #aad4ff; font-size: 13px; margin-top: 6px; }
    .err { color: #f88; font-size: 13px; margin-top: 6px; }
    .time { color: #444; font-size: 11px; margin-top: 6px; }
    .empty { color: #444; text-align: center; padding: 40px; }
  </style>
</head>
<body>
  <h1>Home Assistant</h1>
  <p class="subtitle">Voice control via Mentra glasses</p>

  <div class="settings">
    <label>WAKE WORD</label>
    <div class="settings-row">
      <input id="wakeInput" type="text" placeholder="home" />
      <button onclick="saveWakeWord()">Save</button>
    </div>
    <div class="saved" id="saved">Saved!</div>
    <div class="hint" id="hint"></div>
  </div>

  <div id="log"><p class="empty">Waiting for commands...</p></div>

  <script>
    async function loadSettings() {
      const s = await fetch('/webview/api/settings').then(r => r.json());
      document.getElementById('wakeInput').value = s.wakeWord;
      document.getElementById('hint').textContent = 'Say "' + s.wakeWord + ' turn on the lights"';
    }

    async function saveWakeWord() {
      const word = document.getElementById('wakeInput').value.trim();
      if (!word) return;
      await fetch('/webview/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wakeWord: word }),
      });
      document.getElementById('hint').textContent = 'Say "' + word + ' turn on the lights"';
      const saved = document.getElementById('saved');
      saved.style.display = 'block';
      setTimeout(() => saved.style.display = 'none', 2000);
    }

    async function refresh() {
      try {
        const entries = await fetch('/webview/api/log').then(r => r.json());
        const el = document.getElementById('log');
        if (!entries.length) { el.innerHTML = '<p class="empty">Waiting for commands...</p>'; return; }
        el.innerHTML = [...entries].reverse().map(e => \`
          <div class="entry \${e.error ? 'error' : ''}">
            <div class="command">\${e.command}</div>
            \${e.response ? \`<div class="response">\${e.response}</div>\` : ''}
            \${e.error ? \`<div class="err">Error: \${e.error}</div>\` : ''}
            <div class="time">\${new Date(e.timestamp).toLocaleTimeString()}</div>
          </div>
        \`).join('');
      } catch(e) {}
    }

    loadSettings();
    refresh();
    setInterval(refresh, 2000);
  </script>
</body>
</html>`);
});

expressApp.listen(3001, () => {
  console.log('[HA] Phone UI at http://localhost:3001');
});

app.start();
console.log('Home Assistant app running...');
