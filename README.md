# Xbox Cloud Gaming for Batocera & HippOS

An unofficial add-on that puts **Xbox Cloud Gaming** in the EmulationStation carousel of [Batocera](https://batocera.org) and [HippOS](https://hippos-linux.org). Pick it and a fullscreen app opens on [play.xbox.com](https://play.xbox.com), ready for your controller, with no keyboard or mouse needed.

> **Unofficial project, use at your own risk.** Not affiliated with, endorsed by or sponsored by Microsoft or Xbox. Xbox, Xbox Cloud Gaming and Xbox Game Pass are trademarks of the Microsoft group of companies.

## What you get

- **An "Xbox Cloud Gaming" system** in the carousel, with its own logo and background.
- **A fullscreen app** that only goes to Microsoft's own sites (Xbox, Microsoft sign-in, the Microsoft Store and your account). Every other link, popup or download is blocked.
- **Full controller control:** an on-screen keyboard for sign-in and search, and a number pad for codes.
- **Profiles:** each person gets their own Xbox sign-in. A PIN keeps children's and teens' profiles out of adults' accounts.
- **Your games in Batocera's list (optional):** all cloud games, or only the ones you pick. Each comes with art, description and age rating, and can have a 3D game box. Picking one opens straight into it.
- **Launch Single Game (optional):** picking Xbox Cloud Gaming in the carousel opens the app straight away.
- **Translations:** the app's own screens in 18 languages, following Batocera's language.

## What you need

- Batocera or HippOS on a 64-bit PC, a 64-bit ARM board or handheld, or 32-bit ARM. 64-bit PCs are tested; see *Compatibility* in `README.txt` for each kind of device.
- An internet connection. Microsoft recommends about 20 Mbps; wired or 5 GHz Wi-Fi is best.
- An Xbox account with a Game Pass plan that includes cloud gaming, in a country where Xbox Cloud Gaming is offered.
- About 400 MB free in `/userdata`, for the browser engine the installer downloads.
- A controller (an Xbox controller is best), or a keyboard and mouse.

## Install

1. Download the newest zip from **[Releases](https://github.com/rmach89/xcloud-batocera-hippos/releases/latest)**.
2. Unzip it into Batocera's share folder (`/userdata`, called "share" on the network). That gives you `/userdata/Xbox Cloud Gaming`.
3. Open a terminal (F1 → Applications → xterm, or SSH in) and run:
   ```bash
   bash "/userdata/Xbox Cloud Gaming/install.sh"
   ```
4. Answer its questions, then restart EmulationStation.

## Updating

Run the installer again. It **checks this repository for a newer release** first; if there is one, it asks whether to download and install that instead (press Enter for yes). Your sign-ins, profiles and settings are kept.

- **Skip the check:** `XCLOUD_NO_UPDATE_CHECK=1 bash install.sh`
- **Answer ahead of time:** `XCLOUD_UPDATE=yes` (or `no`)

## Controls

| Action | Xbox | PlayStation | Keyboard |
|---|---|---|---|
| Exit back to EmulationStation | hold View + Menu (2 s) | hold Share/Create + Options | hold Esc |
| Welcome screen and Settings | hold Menu (1 s) | hold Options | — |
| Add or remove the current game in Batocera's list | hold LB + RB + LT + RT | hold L1 + R1 + L2 + R2 | F8 |
| Settings on the dashboard | — | — | Backspace |

The app's own screens name your controller's buttons: ✕ ○ □ △ on PlayStation, A B X Y on Xbox.

## Controllers

- **Xbox and PlayStation controllers:** passed to Xbox as they are; Xbox supports them directly.
- **Steam controllers** (Steam Deck controls, Steam Controller): Xbox doesn't support them, so the app shows them to Xbox as an Xbox controller, with the buttons in Xbox's layout.
- **Other controllers the browser doesn't recognise:** put into the Xbox layout by the app, so the sticks, triggers and D-pad work.

## Uninstall

F1 → Applications → **Xbox Cloud Gaming Uninstaller**, or:

```bash
bash /userdata/system/add-ons/xcloud/uninstall.sh
```

It asks before removing anything, and can keep everyone's sign-ins and profiles for a reinstall.

## Help

- **Logs:** they're in `/userdata/system/logs/`:
  - `xcloud-install.log`: install and uninstall;
  - `xcloud.log`: each launch;
  - `xcloud-app.log`: what happened inside the app.
- **Settings → Save logs for help:** collects these and your settings into one zip in the share folder, ready to send. Gamertags are replaced, and nothing about sign-ins is included.
- **Full documentation:** `README.txt` in the download covers every setting, the profiles, the game list and troubleshooting.
- **Problems and suggestions:** open an [issue](https://github.com/rmach89/xcloud-batocera-hippos/issues).

## Credits

- The app runs on [Electron](https://github.com/electron/electron) (MIT License), downloaded from Electron's official releases and checked against its published SHA-256 checksums.
- The intro video and sound are original, made for this project.
- Japanese and Korean text uses parts of Noto Sans CJK (SIL Open Font License 1.1). The controller emoji is from Noto Color Emoji (Apache License 2.0).
- Batocera, HippOS and EmulationStation are their own projects; this add-on only adds a system to them.
