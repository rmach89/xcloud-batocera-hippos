# Changelog

Every version of the Xbox Cloud Gaming add-on for Batocera and HippOS. Download them from [Releases](https://github.com/rmach89/xcloud-batocera-hippos/releases).

## 1.2.8

- Each profile keeps all of its own settings. Before, with profiles set up, most settings added since 1.2.5 went back to their old values the next time the app opened.
- Settings: LB / RB jump between sections, and Y twice resets the one you're in.
- Low-power settings in Settings > General, offered once on ARM devices.
- Back up settings and Restore settings (Help and maintenance).
- Safe mode: hold LB + RB while the app opens (see Troubleshooting).
- A short "What's new" card the first time the app opens after an update.
- Quick settings: "Take" and "Save" instead of "Press A" on the screenshot and instant replay rows.
- Clearer help for Region and Region unlock.

## 1.2.7

- Split screen: 2 to 4 players on one screen, each with their own Xbox sign-in, controller and selection colour (Settings > Controller; off by default).
- 4K upscaling: choose its size (screen, 1080p, 1440p, 4K) and sharpness, in Settings and in quick settings during a game.
- Video clean-up and Keep stream quality steady.
- Picture settings per game.
- Stream stats: graphs of the last 60 seconds; on or off in quick settings too.
- Split screen: "Press A to join" for players 2-4, each picking a profile or playing as a guest; guests are forgotten when the app closes unless Remember split-screen players is on.
- Instant replay (save the last 30 seconds from quick settings), Stay connected, Reconnect automatically, a Connection check and the Controller battery in Settings.
- Games started from the dashboard count in EmulationStation's list (play count, last played, play time), like the ones it starts itself.
- 3D game boxes: smaller keyboard/mouse and touch badges and age-rating tile (the boxes are redrawn at the next list update).

## 1.2.6

- Quick settings in a game: hold LB + RB + View for a second (F9 on a keyboard) for the sound and picture settings over the game, and a screenshot button (PrintScreen on a keyboard). A hint shows how to open it the first few times a game starts.
- 4K upscaling (64-bit PCs), Skip Xbox splash video, Turn off post-game feedback, Reduce animations and Turn off analytics. Settings has a new Xbox dashboard section for the options about the Xbox site.
- New in Settings: Game volume boost (up to 600%), Region unlock without a VPN, Disable social features, Prefer IPv6 server, Microphone on game launch, Wait time on game pages and an on-screen touch controller (see Settings).

## 1.2.5

- install.sh works on its own: with nothing else next to it, it downloads the newest release from GitHub into /userdata/Xbox Cloud Gaming and installs that (see Install and update). With the zip it works as before.
- On HippOS the installer asks nothing, so HippOS's content downloader can run it: Launch Single Game is left off and a newer release, if any, is installed.
- From BUA (Batocera Unofficial Add-ons), the installer's and the uninstaller's questions appear on BUA's own screen (yes / no and menus). BUA can't take typed answers, so when a child's profile needs the PIN, the uninstaller says to use F1 > Applications > Xbox Cloud Gaming Uninstaller instead.
- Holding View on a game to open its whole row finds the row's title by where it sits on screen (just above the row), so it works with how the Xbox dashboard is built now. A hint at the bottom shows it the first few times you move onto a row with the controller.
- The game list's progress bar is in the bottom-left corner of the dashboard (it was top right).
- When run straight from GitHub (curl ... | bash), install.sh always downloads the newest release, whatever folder it's started from.

## 1.2.4

- More detail in xcloud-app.log for finding a row's title (an outline of the page around the game) and the Library's games (where the page keeps their IDs).

## 1.2.3

- Holding View on a game finds that game's own row title (the row's section on the Xbox page), not another one such as Genres.
- xcloud-app.log notes where the Library page gets its games from, for the coming "Games I own" choice.

## 1.2.2

- EmulationStation game list: new choice "Free with ads", the games anyone can play free with ads, no Game Pass needed (Microsoft's "Stream for free with ads" list). All cloud games includes them too.
- Hold View for a second on a game on the dashboard to open its whole row (the same as clicking the row's title, which the controller can't reach).
- xcloud-app.log notes the Library page's address and games, for the coming "Games I own" choice.

## 1.2.1

- xcloud-app.log names each Game Pass list the Xbox site loads ("catalog list: <id> | <name> | <n> games"), to find Microsoft's free-to-play and play-with-ads lists for the game list.

## 1.2.0

- New stream options in Settings, saved for each profile: Stream resolution (up to 1440p, with the internet speed each needs), Sharpening, Clarity boost, Contrast / Colour saturation / Brightness sliders, Stream stats and Controller vibration strength. They're logged in xcloud-app.log when saved and when a game starts.
- EmulationStation game list "All cloud games" (about 500 games) no longer stops when the app is closed before it's done: the games are listed first, their pictures follow, and it finishes in the background, then has EmulationStation reload its games. Progress is in xcloud-app.log. A bar shows how far it has got, as a percentage.
- Keyboard-and-mouse and touch badges on the covers of the games that support them, from Microsoft's own lists.
- 3D game boxes are drawn for every game again on systems whose picture library can't read Microsoft's covers ("broken data stream" in the log): those covers are converted with ffmpeg first.
- A cover with a banner across its top (XBOX, XBOX 360, XBOX ONE, "Digital version", "Game Preview", a black REMASTERED strip) is shifted down on its 3D box so the banner isn't cut in half. Other covers stay centred as before.
- Turning the game list Off now deletes every picture it downloaded (also ones from an update that was cut short) and leaves only Xbox Cloud Gaming itself in the list.
- Launch Single Game is now simply optional: the installer no longer recommends it on either system, and it's off unless you choose it. Installing again keeps your earlier choice.
- The uninstaller ends with "Press Enter to exit the uninstaller", and EmulationStation reloads by itself instead of needing a restart.
- Xbox Cloud Gaming stays at the top of its list on HippOS too: its sort name now starts with a space, like its name.
- The Settings screen is organised into sections: Profile and account, General, Stream, Picture, Controller, EmulationStation, and Help and maintenance.
- On HippOS the language choice reads "Same as HippOS" and follows HippOS's own language setting (hippos.conf).
- GPU acceleration is now in Settings (it was only in config.json), and also turns on hardware decoding of the game's video. The log notes what the engine reports for the graphics chip.

## 1.1.33

- Settings > Updates (was Update engine) shows the app version next to the engine's. One press checks your GitHub Releases for a newer app and Electron for a newer engine, and downloads and applies whatever is newer without asking again. The new version is used the next time the app opens; settings, profiles and sign-ins are kept. Every check, download and failure is logged.

## 1.1.32

- PIN: as soon as a child's or teen's profile is set up, the app asks for the adult PIN right then (while the adult setting it up is there), not later. Until a PIN exists, adding or removing a profile needs one made first, the same as opening an adult's profile.
- This README is shorter and up to date (the version history is in the Releases on GitHub).

## 1.1.30 and earlier

1.1.30 moved the project to GitHub; the installer checks it for a newer version before installing. Earlier changes are in the [Releases](https://github.com/rmach89/xcloud-batocera-hippos/releases).
