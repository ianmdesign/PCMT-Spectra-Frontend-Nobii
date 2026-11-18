# ValoSpectra - Frontend

Spectra is your all-in-one solution for an amazing looking Valorant Tournament Overlay, enabling all Organizers to display information like held gun, available credits etc. with just a single spectator running software.
To learn more and see a live demo, visit [valospectra.com](https://www.valospectra.com/).

It is comprised of three parts:

- [The Spectra Client](https://github.com/ValoSpectra/Spectra-Client)
  - Running this software on a single in-game observer provides the Spectra Server with all data currently provided by Overwolf.
- [The Spectra Server](https://github.com/ValoSpectra/Spectra-Server)
  - Ingests data from the Observer Client to reproduce the games state, allowing us to have an accurate representation of the game for further use.
- [The Spectra Frontend](https://github.com/ValoSpectra/Spectra-Frontend)
  - Receives the game state from the Server every 100 milliseconds, presenting it in a beautiful manner for viewers to enjoy.

Further updates for new features, as well as a detailed setup guide and an easy to host docker container are in the pipeline!

# Docker Compose tutorial

First, create a seperate folder in your working directory and create a folder `config` inside it:

```
mkdir -p spectra-frontend/config
cd spectra-frontend
```

Create a file named `docker-compose.yml` as follow:

```
---
services:
  valo-spectra-frontend:
    image: "ghcr.io/valospectra/overlay"
    ports:
      - "3000:80"
    volumes:
      - ./config:/usr/share/nginx/html/assets/config/
```

You can change `3000` to a different port which you want the frontend accessible outside the container to.

Inside `config` folder, create a file named `config.json` with the following content:

```
{
  "serverEndpoint": "http://localhost:5200",
  "redirectUrl": "https://valospectra.com",
  "sponsorImageUrls": ["/assets/misc/logo.webp"],
  "sponsorImageRotateSpeed": 5000,
  "attackerColorPrimary": "#b82e3c",
  "attackerColorSecondary": "#ff4557",
  "attackerColorShieldCurrency": "#ff838f",
  "defenderColorPrimary": "#25ac79",
  "defenderColorSecondary": "#61eab6",
  "defenderColorShieldCurrency": "#61eab6"
}
```

For the most up to date version of the available configuration values, check out the `config.ts` file in the `src/app/shared/config.ts` file.

Replace `https://localhost:5200` with your Spectra Server address and outcoming port (default is 5200).

After that you can start the frontend by running `docker compose up -d` and the frontend are accessible at port `3000` by default.

# PCMT Listen-In on the primary Spectra overlay

Playercams publishes player microphone feeds into a dedicated VDO.Ninja room
named `<session-room-id>_li`, separate from the visual playercam room.
Each mic is a distinct audio-only feed with `deafen`, `novideo`, and
`roombitrate=0` to suppress room multicast and prevent playback to players.

The producer's Left / Right / Off controls update the normal PCMT HUD
`playercamsInfo` state. The primary `/overlay?groupCode=CODE` source receives
only the stream IDs belonging to opted-in players on the selected team. It
then creates separate audio-only VDO.Ninja receivers with `room` and `view`.
Visual tiles reuse the existing preloaded playercam video iframe elements.

**No `#listenToken` is needed.** The visual HUD and audio receivers share the
same normal source URL. Because stream IDs are now available to regular
subscribers, **this architecture does not protect microphone audio against a
party who learns the room and stream identifiers**. The `_li` suffix is
not an access-control boundary; use only where this exposure is acceptable.

The independent legacy `/listen-in` route remains supported. Audio still
needs a successful VDO.Ninja WebRTC connection and OBS browser-source audio
capture. Validate mute and volume in OBS before using it on-air.

# DISCLAIMER

Spectra-Frontend isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.

## Producer-operated Spectra HUD during a detection outage

Keep the Valorant observer client connected. The client remains authoritative
for team identity, Attack/Defense sides, player telemetry and playercams.
The producer controls scores, displayed round, player scoreboard visibility,
spike graphic and round-winbox presentation through PCMT Production Control.

Use **Apply Spectra to OBS** to attach `pcmtShow=<SHOW_CODE>` to the normal
Spectra main source. The frontend polls the show-scoped, read-only producer
endpoint over HTTPS. No replacement browser source is required.

Click **Left wins round** or **Right wins round** to update the score and
trigger the selected Round Win / Ace / Clutch / Team Ace / Flawless / Thrifty
ceremony immediately. The displayed round changes **seven seconds later**.
The server persists the scheduled advance and rejects duplicate awards while
one is pending. Manual round corrections or reset cancel the pending advance.
The original winbox animation and its configured visuals remain in use; the
client controls the winner's Attack/Defense assignment.

**Plant spike** starts or restarts the 45-second pulse sequence, including
when there are no new Spectra gameplay packets. It uses reactive signal ticks
and the server's plant timestamp, avoiding restart on browser refresh. **Clear
spike** ends the animation for either detonation or defusal. Planting again
while already planted restarts the 45-second visual. A round win clears it too.
The old separate winbox, winbox-clear, detonate and defuse buttons are gone.

Deploy Production Control before this companion frontend and verify in OBS.

## Always-on producer tactical timeout / technical pause

The existing `/overlay` reads producer timeout controls from the same
show-scoped `/api/hud/manual-state` endpoint used for score overrides.
This new `timeoutControl` field is **independent of** `manualHud.enabled`:
the normal HUD can display producer-triggered tactical timeouts and tech pauses
without enabling manual score override.

The production panel can start a left or right tactical timeout, trigger an
indefinite tech pause, clear either graphic, or **Return to Client Hotkeys**.
Tactical timeout durations are measured against the backend's absolute expiry,
persisted per Show Code. While the panel owns the timeout graphic its state
takes precedence over client events. Releasing control immediately restores
the last Spectra client's `timeoutState`. All other client match data stays
live and intact. The existing Spectra timeout component and entry/exit
animation are reused; there is no additional OBS browser source.
