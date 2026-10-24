# iBot

A 1:1 web recreation of Apple's iPod page that plays **your own Apple Music**. Live demo: **[ibotplayer.vercel.app](https://ibotplayer.vercel.app)**

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FPhillipHolland%2Fibot&project-name=ibot&repository-name=ibot&env=APPLE_TEAM_ID,APPLE_KEY_ID,APPLE_PRIVATE_KEY,ALLOWED_ORIGINS&envDescription=Apple%20Team%20ID%2C%20MusicKit%20Key%20ID%2C%20the%20.p8%20contents%2C%20and%20your%20bare%20host%20(no%20https%3A%2F%2F)&envLink=https%3A%2F%2Fgithub.com%2FPhillipHolland%2Fibot%23roll-your-own)

> Want a bot to set it up for you? Grab the iBot Grok Bot template: TEMPLATE_URL

## Features

- **A click wheel that works like Apple's.** Spin to scroll, with the same click sound and Menu / Back / Forward / Play-Pause buttons.
- **Sign in with Apple Music.** Uses MusicKit JS v3. Apple's own sign-in sheet opens; iBot never sees your Apple ID or password. Browse your library and playlists and play them.
- **Six Grok Bot style characters** in the center button (Ball, Cloud, Pill, Blob, Triangle, Pumpkin). Their eyes glance around and blink, and they bob to the beat.
- **Fills the screen on iPhone.** The device scales to the viewport, safe areas included.
- **PWA.** Add it to your home screen and it opens full screen like an app. A service worker caches the static shell.
- **No build step, no dependencies.** Vanilla JS. Tests use the Node standard library: `node --test`.

## Roll your own

You need your own Apple Developer account. Each deployment uses its own MusicKit key; this repo contains no keys.

### 1. Make a MusicKit key

1. Sign in at [developer.apple.com/account](https://developer.apple.com/account) (paid Apple Developer Program membership).
2. Go to **Certificates, Identifiers & Profiles > Identifiers**, add a **Media IDs** identifier, and enable **MusicKit**.
3. Go to **Keys**, create a key, enable **MusicKit**, and configure it with that identifier. Download the `.p8` file. Apple lets you download it only once.
4. Note two values:
   - **Key ID**: shown on the key's page (10 characters).
   - **Team ID**: shown under **Membership details** (10 characters).

### 2. Fork and deploy to Vercel

Click **Deploy with Vercel** above (or fork/clone this repo and import it at [vercel.com/new](https://vercel.com/new)). Vercel serves the static files and runs `api/token.js` as a serverless function. No install or build is needed.

Set these environment variables (Project > Settings > Environment Variables), then redeploy:

| Name | Value |
| --- | --- |
| `APPLE_TEAM_ID` | Your 10-character Team ID. |
| `APPLE_KEY_ID` | Your MusicKit Key ID. Sent as the JWT `kid`. |
| `APPLE_PRIVATE_KEY` | The full contents of the `.p8` file, including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines. Paste it as-is (multi-line is fine; a single line with literal `\n` also works). Mark it **Sensitive**. |
| `ALLOWED_ORIGINS` | The host(s) allowed to fetch a token, comma separated, **bare host only**: `ibot-yourname.vercel.app` or `ibot-yourname.vercel.app,music.example.com`. |

**`ALLOWED_ORIGINS` rules.** Write the host with no `https://`, no path, and no trailing slash. The function compares it exactly (case-insensitive) with the host of the browser's `Origin` or `Referer` header, so `https://ibot-yourname.vercel.app` will never match and sign-in fails with a 403. Wildcards are not supported. Include a port if you use one (`localhost:3000`). Preview deployments have different hosts; add them if you want them to work. If you leave `ALLOWED_ORIGINS` empty, any site can mint tokens from your key, so set it.

**Keep the key secret.** The `.p8` contents belong only in Vercel's `APPLE_PRIVATE_KEY` variable. Never commit the `.p8`, a `.env` file, or the `.vercel/` folder. `.gitignore` already excludes them.

`GET /api/token` returns `{ token, expiresAt }`: an ES256 developer token valid for 24 hours, sent with `Cache-Control: no-store`. If any of the three Apple variables is missing, it returns `500 {"error":"Token service is not configured"}`; if the requesting host is not in `ALLOWED_ORIGINS`, it returns `403 {"error":"Origin not allowed"}`.

### 3. Put it on your iPhone

1. Open your deployment in **Safari** on iPhone.
2. With **Sign In** selected, press the center button and finish Apple's Apple Music sign-in.
3. Tap **Share > Add to Home Screen**. iBot now opens full screen from your home screen.

Playback needs an Apple Music subscription. Without one, the screen shows "Needs Apple Music subscription".

### Troubleshooting

- **Sign-in fails or `/api/token` returns 403:** `ALLOWED_ORIGINS` doesn't exactly match your host (usually because it includes `https://` or a trailing slash).
- **Apple rejects the token (401/403 from Apple's API):** wrong Team ID or Key ID, a key without MusicKit enabled, or a truncated `APPLE_PRIVATE_KEY`.
- **Blocked scripts in the console:** if you change domains or add scripts, update the Content-Security-Policy in `vercel.json`.
- **A song won't play:** it may not be available in your Apple Music storefront (country).

## Develop

```sh
node --test        # 59 tests, no dependencies
vercel dev         # serves the page and /api/token locally (needs the env vars in Vercel or a local .env, never committed)
```

## Apple's assets are Apple's

The code in this repo is MIT licensed (see `LICENSE`). Apple's ChicagoKare font, click sound, wheel noise texture, wheel glyphs, and iPod CSS are included as-is from Apple's iPod page. They belong to Apple Inc. and are **not** covered by the MIT license. See [`NOTICE`](NOTICE). iBot is not affiliated with or endorsed by Apple.

## Credits

Made by [@PhillipHolland](https://github.com/PhillipHolland). Inspired by Apple's [iPod page](https://music.apple.com/us/ipod).
