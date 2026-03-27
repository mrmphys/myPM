# myPM — Phase 1 PRD: Chat Portal with Voice + Text

## Overview

A Next.js web portal to chat with myPM (an AI project manager). Supports both text and voice input/output. Protected by a simple password gate on the landing page.

## Stack

- **Framework:** Next.js 14+ (App Router)
- **AI:** Anthropic Claude (via `@anthropic-ai/sdk`) — claude-3-5-sonnet-20241022
- **STT:** Deepgram (speech-to-text) — browser records audio via MediaRecorder, sends to API route, Deepgram transcribes
- **TTS:** Deepgram (text-to-speech) — AI response text sent to Deepgram TTS API, audio streamed back and played in browser
- **Deployment:** Railway
- **Repo:** git@github.com:mrmphys/myPM.git

## Features

### 1. Password Gate
- Single landing/login page
- User enters a password (stored as env var `PORTAL_PASSWORD`)
- On correct password: set a session cookie and redirect to chat
- On wrong password: show error message
- No user accounts, no database needed — just a cookie check

### 2. Chat Interface
- Clean, minimal chat UI (dark theme preferred)
- Shows conversation history in the session
- Text input: type and hit Enter or click Send
- Voice input: hold/click mic button → records audio → auto-sends when released
- Displays user messages and AI responses in chat bubbles
- Shows typing/thinking indicator while AI is responding
- AI responses are spoken aloud via Deepgram TTS automatically

### 3. Voice Input Flow
1. User clicks mic button → MediaRecorder starts capturing audio
2. User speaks → releases button → audio blob sent to `/api/transcribe`
3. API route sends audio to Deepgram STT → returns transcript text
4. Transcript appears in chat input → auto-submitted as message

### 4. Voice Output Flow
1. AI response text received
2. Text sent to `/api/speak` → Deepgram TTS API → returns audio
3. Audio plays automatically in browser

### 5. AI Chat
- System prompt: "You are myPM, an AI project manager. You help users plan, track, and execute their projects. Be concise, direct, and actionable."
- Conversation history maintained in React state (session only, no persistence for now)
- Streaming responses preferred (stream from Anthropic → stream to browser)

## API Routes

- `POST /api/transcribe` — receives audio blob, calls Deepgram STT, returns `{ transcript: string }`
- `POST /api/speak` — receives `{ text: string }`, calls Deepgram TTS, streams audio back
- `POST /api/chat` — receives `{ messages: [] }`, streams Claude response
- `POST /api/auth` — receives `{ password: string }`, sets cookie if correct

## Environment Variables

```
ANTHROPIC_API_KEY=
DEEPGRAM_API_KEY=
PORTAL_PASSWORD=
```

## Project Structure

```
myPM/
├── app/
│   ├── page.tsx              # Password gate (login)
│   ├── chat/
│   │   └── page.tsx          # Chat interface (protected)
│   ├── api/
│   │   ├── auth/route.ts
│   │   ├── chat/route.ts
│   │   ├── transcribe/route.ts
│   │   └── speak/route.ts
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── ChatInterface.tsx
│   ├── MessageBubble.tsx
│   ├── VoiceButton.tsx
│   └── AudioPlayer.tsx
├── middleware.ts             # Protect /chat route — redirect to / if no auth cookie
├── .env.local                # Dev env vars (gitignored)
├── .env.example              # Template
├── railway.json              # Railway config
└── package.json
```

## Middleware / Auth Protection

- `middleware.ts` checks for `mypm_auth` cookie on `/chat` routes
- No cookie → redirect to `/`
- Cookie present → allow through

## Railway Config

- `railway.json` with build + start commands
- `nixpacks` compatible (Next.js auto-detected)
- Port: use `process.env.PORT || 3000`

## Acceptance Criteria

- [ ] Landing page with password field — correct password grants access, wrong shows error
- [ ] Chat page protected — unauthenticated users redirected to login
- [ ] Text chat works — send message, get streaming Claude response
- [ ] Voice input works — click mic, speak, release, transcript appears and sends
- [ ] Voice output works — AI response plays as audio via Deepgram TTS
- [ ] Dark theme, clean UI, mobile-friendly
- [ ] `.env.example` with all required vars documented
- [ ] `railway.json` present and app runs on Railway with env vars set
- [ ] Repo pushed to git@github.com:mrmphys/myPM.git

## Notes

- No database needed for Phase 1
- Conversation history is in-memory (React state), resets on page refresh — that's fine for now
- Keep it simple and working — no over-engineering
- Use Deepgram's `nova-2` model for STT, `aura-asteria-en` voice for TTS
- Use `@deepgram/sdk` for Deepgram API calls
- Cookie name: `mypm_auth`, value: hashed or plain password match (plain is fine for now)
