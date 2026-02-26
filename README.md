
# 🎵 Flute Music Bot

A lightweight Discord music bot with playback controls, filters, and a small web status page.

🔗 **Support server:** https://discord.gg/A5R9HWGkfF

👤 **Modified by:** flute music team

## 📸 Screenshots

![Bot Music Player](./images/bot-player.png)
![Web Dashboard](./images/web-dashboard.png)
![Help Command](./images/help_comm.png)

## ✨ Features

- 🎵 Play music from supported sources
- 📝 Queue management (`play`, `skip`, `queue`, `stop`)
- ⏯️ Playback controls (`pause`, `resume`, `seek`, `volume`)
- 🎚️ Audio effects and filters (e.g. `bassboost`, `nightcore`, `vaporwave`, `echo`)
- 🌐 Simple web status page in the `website/` folder

## 📋 Prerequisites

- 📦 Node.js v16 or newer
- 🤖 A Discord bot token and a server where you can add the bot

## 🚀 Quick Setup

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

## 📁 Files of interest

- `config.js` — main configuration (token, prefix, owner, etc.)
- `index.js` — bot entrypoint
- `commands/` — all command handlers (playback, filters, utilities)
- `utils/` — helper utilities such as `applyFilters.js` and message templates
- `website/` — small status page (`index.html`, `style.css`, `status.json`)

## 🎛️ Complete Commands List

### ⏯️ Playback Commands
- `play` — play a track or add to queue
- `pause` — pause playback
- `resume` — resume playback
- `skip` — skip current track
- `stop` — stop playback and clear queue
- `seek` — seek to a position in the track
- `replay` — replay current track
- `loop` — toggle loop mode
- `radio` — play radio stations

### 📝 Queue Management
- `queue` — show current queue
- `clearqueue` — clear the queue
- `move` — move a track in queue
- `remove` — remove a track from queue
- `shuffle` — shuffle the queue

### 🎵 Volume & Audio
- `volume` — change playback volume
- `bassboost` — enhance bass
- `vocalboost` — enhance vocals
- `treblebass` — boost treble and bass

### 🎚️ Audio Filters & Effects
- `247` — 24/7 filter
- `8d` — 8D audio effect
- `chipmunkfilter` — chipmunk voice filter
- `cinema` — cinema effect
- `darthvader` — Darth Vader effect
- `daycore` — daycore effect
- `doubletime` — double speed
- `earrape` — earrape effect
- `echo` — echo effect
- `karaoke` — karaoke mode
- `lofi` — lo-fi hip-hop
- `nightcore` — nightcore effect
- `party` — party mode
- `pop` — pop effect
- `slowmode` — slow down track
- `soft` — soft effect
- `telephone` — telephone filter
- `topac` — topac effect
- `underwater` — underwater effect
- `vaporwave` — vaporwave effect
- `vibrato` — vibrato effect
- `tremolo` — tremolo effect
- `cleareffects` — remove all effects
- `clearfilters` — remove all filters

### 💾 Playlist Management
- `saveplaylist` — save current queue as playlist
- `loadplaylist` — load a saved playlist
- `deleteplaylist` — delete a playlist
- `myplaylists` — view your playlists
- `favorite` — add track to favorites

### ℹ️ Information Commands
- `nowplaying` — show currently playing track
- `lyrics` — show lyrics for current track
- `history` — view playback history
- `botinfo` — show bot information
- `help` — show help menu
- `ping` — show bot latency
- `uptime` — show bot uptime
- `invite` — get bot invite link
- `feedback` — send feedback

### ⚙️ Other
- `clear` — clear chat
- `slowmode` — enable slowmode

## 🔧 Troubleshooting

- Ensure the bot token in `config.js` is valid and the bot has the required gateway and voice permissions.
- If audio or filters fail, check any ffmpeg installation or platform-specific audio prerequisites.


## 🤝 Contributing

Pull requests are welcome. For small edits (typos, readme improvements) open a PR. For code changes, please describe the change and test locally.

---

If you want, I can also generate a full commands list from the `commands/` folder and add example `config.js` instructions. Tell me which you'd prefer next.


## Invite Bot
https://discord.com/oauth2/authorize?client_id=1466777461680373820&permissions=281474980236544&integration_type=0&scope=bot+applications.commands

