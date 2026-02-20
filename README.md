
# Flute Music Bot

A lightweight Discord music bot with playback controls, filters, and a small web status page.

Support server: https://discord.gg/A5R9HWGkfF

Modified by reddy bahi gaming

## Features

- Play music from supported sources
- Queue management (`play`, `skip`, `queue`, `stop`)
- Playback controls (`pause`, `resume`, `seek`, `volume`)
- Audio effects and filters (e.g. `bassboost`, `nightcore`, `vaporwave`, `echo`)
- Simple web status page in the `website/` folder

## Prerequisites

- Node.js v16 or newer
- A Discord bot token and a server where you can add the bot

## Quick Setup

1. Install dependencies:

```bash
npm install
```

2. Configure the bot by editing `config.js` (set your `token`, `prefix`, and other options).

3. Start the bot:

```bash
node index.js
```

Or use `npm start` if a start script is configured in `package.json`.

## Files of interest

- `config.js` — main configuration (token, prefix, owner, etc.)
- `index.js` — bot entrypoint
- `commands/` — all command handlers (playback, filters, utilities)
- `utils/` — helper utilities such as `applyFilters.js` and message templates
- `website/` — small status page (`index.html`, `style.css`, `status.json`)

## Common Commands

Some frequently used commands (see the full list in the `commands/` folder):

- `play` — play a track or add to queue
- `pause` / `resume` — control playback
- `skip` — skip current track
- `queue` — show current queue
- `stop` — stop playback and clear queue
- `volume` — change playback volume
- Filter commands: `bassboost`, `nightcore`, `vaporwave`, `echo`, etc.

## Troubleshooting

- Ensure the bot token in `config.js` is valid and the bot has the required gateway and voice permissions.
- If audio or filters fail, check any ffmpeg installation or platform-specific audio prerequisites.

## Contributing

Pull requests are welcome. For small edits (typos, readme improvements) open a PR. For code changes, please describe the change and test locally.

---

If you want, I can also generate a full commands list from the `commands/` folder and add example `config.js` instructions. Tell me which you'd prefer next.

