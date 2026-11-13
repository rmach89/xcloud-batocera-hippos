# Xbox Cloud Gaming for Batocera & HippOS

Play **Xbox Cloud Gaming** from the EmulationStation carousel on [Batocera](https://batocera.org) and [HippOS](https://hippos-linux.org). Pick it, and a fullscreen app opens on [play.xbox.com](https://play.xbox.com), ready for your controller. Your cloud games can sit in EmulationStation's list like any other system, with box art, 3D cases and age ratings.

**[⬇ Download the latest release](https://github.com/rmach89/xcloud-batocera-hippos/releases/latest)**

> **Unofficial project, use at your own risk.** Not affiliated with, endorsed by or sponsored by Microsoft or Xbox. Xbox, Xbox Cloud Gaming and Xbox Game Pass are trademarks of the Microsoft group of companies.

## Features

**The app**
- A fullscreen Xbox Cloud Gaming app that works entirely with a controller. It has an on-screen keyboard for signing in and searching, and a number pad for codes.
- It only goes to Microsoft's own sites (Xbox, sign-in, the Microsoft Store and your account). Every other link, popup and download is blocked.
- **Profiles**: each person gets their own Xbox sign-in and settings. A PIN keeps children's and teens' profiles out of the adults' accounts.
- The app's own screens are in 18 languages and follow the system's language by default.

**Stream options** (Settings, saved per profile)
- **Resolution**: 720p, 1080p, 1080p high quality or 1440p. Each shows the internet speed it needs. 1440p requires Game Pass Ultimate and a game that offers it.
- **Picture**: sharpening, Clarity boost, and sliders for contrast, colour saturation and brightness.
- **Stream stats**: resolution, frame rate, ping, bitrate, packet loss and decode time, shown at the top while you play.
- **Controller vibration** strength, and **GPU acceleration** (including hardware video decoding).

**EmulationStation game list** (optional)
- **All cloud games** (about 570), **Games I pick** (add a game with F8 or LB + RB + LT + RT), or **Off** (just the app itself).
- Each game comes with box art, background, logo, description, developer, release date and age rating, all from Microsoft's catalog. Picking a game opens the app straight into it.
- **3D game boxes**: a black case with the cover, the name on the spine, an age-rating tile, and badges for games that support **keyboard and mouse** or **touch**.
- The list updates itself every few days. A progress bar shows how far an update has got, and an update carries on in the background if you close the app.
- Xbox Cloud Gaming itself always stays at the top of the list.

**Launch Single Game** (optional): picking Xbox Cloud Gaming in the carousel opens the app straight away, and closing it takes you back to the carousel.

## What you need

- **Batocera or HippOS** on a 64-bit PC, a 64-bit ARM board or handheld, or 32-bit ARM (see [Compatibility](#compatibility)).
- **An internet connection**: about 10 Mbps for 720p and 20 Mbps or more for 1080p. Wired or 5 GHz Wi-Fi is best.
- **An Xbox account with a Game Pass plan that includes cloud gaming**, in a country where Xbox Cloud Gaming is offered.
- **About 400 MB free** in `/userdata`, for the browser engine the installer downloads.
- **A controller** (an Xbox controller is best), or a keyboard and mouse.

## Install

1. Download the newest zip from **[Releases](https://github.com/rmach89/xcloud-batocera-hippos/releases/latest)**.
2. Unzip it into the share folder (`/userdata`, called "share" on the network). That gives you `/userdata/Xbox Cloud Gaming`.
3. Open a terminal (on Batocera, F1 → Applications → xterm; or SSH in) and run:
   ```bash
   bash "/userdata/Xbox Cloud Gaming/install.sh"
   ```
4. Answer its questions, then restart EmulationStation. Xbox Cloud Gaming appears in the carousel.

The installer checks this repository first. If a newer release is out, it offers to download and install that one instead.

## Updating

- **From the app:** Settings → Help and maintenance → **Updates**. One press checks for a newer app and a newer browser engine, and downloads whichever is newer. The new version is installed when you close the app, and your sign-ins, profiles, settings and picked games are kept. If anything fails, nothing changes, and the log says why.
- **Or run the installer again.** To skip its update check: `XCLOUD_NO_UPDATE_CHECK=1 bash install.sh`. To answer it ahead of time: `XCLOUD_UPDATE=yes` (or `no`).

## Controls

| Action | Xbox | PlayStation | Keyboard |
|---|---|---|---|
| Exit back to EmulationStation | hold View + Menu (2 s) | hold Share/Create + Options | hold Esc |
| Welcome screen and Settings | hold Menu (1 s) | hold Options | — |
| Settings on the dashboard | — | — | Backspace |
| Add or remove the current game in EmulationStation's list | hold LB + RB + LT + RT | hold L1 + R1 + L2 + R2 | F8 |

In Settings: up and down to move, left and right to change, A to select, Menu to save, B to cancel. The app's own screens show your controller's buttons: A B X Y on Xbox, ✕ ○ □ △ on PlayStation.

## Settings

| Section | What's in it |
|---|---|
| Profile and account | Change user, sign out of Xbox, sign out when closing |
| General | Region, language, volume, key highlights, intro video and its sound |
| Stream | Resolution, stream as a Windows PC, GPU acceleration, stream stats |
| Picture | Sharpening, Clarity boost, contrast, colour saturation, brightness |
| Controller | The full list of controls, vibration strength |
| EmulationStation | The game list (Off / All cloud games / Games I pick), 3D game boxes |
| Help and maintenance | Reload dashboard, clear cache, save logs for help, updates |

## Profiles and PIN

The first person to sign in becomes the first profile. When someone else signs in, the app offers to set up profiles. With two or more, **"Who's playing?"** appears when the app opens.

Once a child's or teen's profile exists, the adult profiles need a **4-digit PIN**. The PIN is also needed to add or remove profiles and to uninstall. It's stored only as a salted hash. It only guards this app: Microsoft's own family settings are what control what an account can play or buy.

Forgot the PIN? Create a file named `reset-pin` in `/userdata/system/add-ons/xcloud`. It's cleared the next time the app opens.

## Controllers

- **Xbox and PlayStation controllers** are passed to Xbox as they are; Xbox supports them directly.
- **Steam controllers** (Steam Deck controls, Steam Controller): Xbox doesn't support them, so the app shows them to Xbox as an Xbox controller, with the buttons in Xbox's layout.
- **Other controllers the browser doesn't recognise** are put into the Xbox layout, so the sticks, triggers and D-pad work.

## Compatibility

Tested on 64-bit PCs with Batocera v42 and v44, and on HippOS 0.5. Elsewhere it depends on the processor, because the game stream is video it has to decode.

| | Devices |
|---|---|
| ✅ Plays well | PCs; PC handhelds (Steam Deck, ROG Ally, Legion Go); Raspberry Pi 5; RK3588 boards; Snapdragon handhelds (AYN Odin 2, Retroid Pocket 5) |
| ⚠️ Works, may stutter | Raspberry Pi 4 (2 GB+); Odroid N2; RK3566 / RK3568 (Anbernic RG353 series); newer Amlogic TV boxes |
| 🐢 Too slow | 1 GB devices (RG35XX family, RG351, Raspberry Pi 3) and 32-bit ARM |
| ❌ Not supported | Raspberry Pi 1 / Zero (ARMv6) and 32-bit x86 PCs; the installer stops without changing anything |

On ARM boards that stutter, try Settings → GPU acceleration.

## Uninstall

F1 → Applications → **Xbox Cloud Gaming Uninstaller**, or:

```bash
bash /userdata/system/add-ons/xcloud/uninstall.sh
```

It asks before removing anything, and can keep everyone's sign-ins and profiles for a reinstall. When it's done, press Enter to exit; EmulationStation reloads by itself. To remove everything without questions, add `--all`.

## Help

- **Logs** are in `/userdata/system/logs/`:
  - `xcloud-install.log`: install and uninstall
  - `xcloud.log`: each launch
  - `xcloud-app.log`: what happens inside the app
  - `xcloud-update.log`: updates installed from Settings
- **Settings → Save logs for help** puts the logs and your settings into one zip in the share folder, ready to send. Gamertags are replaced, and nothing about sign-ins is included.
- **Full documentation:** `README.txt` in the download covers every setting, the game list, profiles and troubleshooting.
- **Problems and suggestions:** open an [issue](https://github.com/rmach89/xcloud-batocera-hippos/issues).

## Credits

- The app runs on [Electron](https://github.com/electron/electron) (MIT License), downloaded from Electron's official releases and checked against its published SHA-256 checksums.
- The intro video and sound are original, made for this project.
- Japanese and Korean text uses parts of Noto Sans CJK (SIL Open Font License 1.1). The controller emoji is from Noto Color Emoji (Apache License 2.0).
- Batocera, HippOS and EmulationStation are their own projects; this add-on only adds a system to them.
