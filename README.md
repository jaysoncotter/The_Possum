# The Possum 🐾

An ATC transcription assistant — a prompt + Chrome extension combo for verifying callsigns, flight plans, waypoints, and fixes. Integrates with [possumfix.com](https://www.possumfix.com) for phonetic fix search, flight path visualization, and FlightAware lookup.

---

## What's In This Repo

| File | What It Is |
|------|-----------|
| `The_Prompt.txt` | The Possum Prompt — paste this into your LLM session to start |
| `manifest.json` | Chrome extension manifest |
| `background.js` | Extension background service worker |
| `content.js` | Extension content script |
| `icon16.png` | Extension icon (16px) |
| `icon48.png` | Extension icon (48px) |
| `icon128.png` | Extension icon (128px) |
| `Fetch.png` | Possum Fetcher branding image |

---

## The Possum Prompt

The prompt is a plain text file (`The_Prompt.txt`) that you paste into an LLM chat session (tested primarily with Google Gemini). It turns the LLM into an ATC transcription assistant that can:

- **Parse a Global Key** to identify the airport, sector, date, and time
- **Verify callsigns** against FlightAware historical records
- **Generate one-click links** to PossumFix Playground showing the flight path on a map for the exact date
- **Search for waypoints and fixes** phonetically through PossumFix
- **Look up operators and telephony** (airline name, military callsign, tactical callsign)
- **Format transcripts** according to ATC transcription standards
- **Detect flyover traffic** — flights that transit your airport's airspace without landing
- **Handle partial/wildcard callsigns** when you can only hear part of a flight number

### How to Use the Prompt

1. Copy the entire contents of `The_Prompt.txt`
2. Paste it into a new LLM chat session
3. The assistant will say it's ready — paste your Global Key to begin

### Modes

The prompt supports multiple verbosity modes. Type any mode name at any time to switch.

| Mode | Description |
|------|-------------|
| **beginner** | Maximum detail. Explains every term, every step, and what each ATC instruction means. Recommended for new transcribers. |
| **novice** | Explains ATC concepts inline when relevant. Good for transcribers still building familiarity. |
| **intermediate** | Default mode. Clean, efficient output. No extra explanation unless something is ambiguous. |
| **enthusiast** | Same as intermediate plus aviation fun facts, airport history, and trivia. |
| **expert** | Bare facts only. Fix searches return just a link. No commentary unless you ask. |
| **demo** | A guided walkthrough that teaches you how to use the prompt step by step. Type `demo` to start. Returns to your previous mode when finished. |

### Quick Reference

| Command | What It Does |
|---------|-------------|
| `[callsign]` | Look up a callsign — e.g., `AAL1487` or `DELTA FIVE FORTY SIX` |
| `callsign [word]` | Operator/telephony lookup — e.g., `callsign nightmare` |
| `<?>835` | Wildcard search — flights ending in 835 at this airport |
| `UAL<?>` | Wildcard — United flights with unclear number |
| `fix: oh lah` | Phonetic fix search near your airport |
| `fix!: oh lah` | Confident fix search (tighter radius) |
| `fix?: oh lah` | Less confident fix search (wider radius) |
| `wp: kepec` | Fix + procedure search |
| `proc: kepec` | Procedure-only search |
| `commands` | Show the full command reference |
| `status` | Show current mode, Global Key, and active callsign |

---

## Possum Fetcher — Chrome Extension

Possum Fetcher is a Chrome extension that works with [possumfix.com](https://www.possumfix.com) to fetch flight plan data from FlightAware and display it on the PossumFix Playing Possum page.

### Supported Platforms

- **Windows** — Chrome ✅
- **Linux** — Chrome ✅
- **macOS** — Chrome (untested, may work)
- **Other Chromium browsers** (Edge, Brave, etc.) — untested, may work

### Installation

Since this extension is not published on the Chrome Web Store, you'll install it manually as an unpacked extension.

**Step 1 — Download the files**

Click the green **Code** button on this repo and select **Download ZIP**, then extract the ZIP to a folder on your computer. Or clone the repo:
