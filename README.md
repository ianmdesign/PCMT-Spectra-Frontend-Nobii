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

PCMT Playercams now controls the **existing `/overlay` OBS browser source**. Its
`listenIn` state (`false`, `left`, or `right`) selects the team and reveals the
Listen-In panel directly on the main HUD. Left / Right reuse the original,
already-mounted playercam iframe elements; switching teams does not open
duplicate video receivers. Audio comes from distinct, opt-in microphone-only
VDO.Ninja streams.

**For private Listen-In audio**, the main OBS browser-source URL must include
the Playercams producer dashboard's read-only `listenToken` in its fragment:

```text
https://YOUR-SPECTRA-HOST/overlay?groupCode=YOUR-GROUP#listenToken=PRIVATE_READ_ONLY_TOKEN
```

The fragment is intentionally absent from public/shared overlay URLs and is
not sent to the web server via HTTP. Protect the entire OBS source URL as a
secret. Without this fragment, the playercam visuals and Listen-In panel still
follow producer controls, **but microphone audio is unavailable**. Set up this
token only in the private OBS browser source, never a public webpage.

Listen-In Off immediately removes the microphone receivers. Spectra's own
playercam visuals remain connected; the producer may separately control when
the playercam overlay is enabled. The separate `/listen-in` route is retained
for dedicated/legacy OBS layouts, but is no longer required for the main HUD.
URL `?team=` overrides are not accepted on production overlays.

# DISCLAIMER

Spectra-Frontend isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.
