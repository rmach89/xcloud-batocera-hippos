XBOX CLOUD GAMING for Batocera & HippOS
=======================================
Version 1.2.9 (November 2026)
Home page and new versions: https://github.com/rmach89/xcloud-batocera-hippos

An unofficial, fan-made app, used at your own risk. It is not made,
affiliated with, endorsed or sponsored by Microsoft or Xbox. It opens
Microsoft's own Xbox Cloud Gaming website (play.xbox.com) in a fullscreen
window. You need your own Microsoft account and a Game Pass plan that
includes cloud gaming.


Contents
--------
  What you get        Settings                    Keeping it after a reboot
  What you need       EmulationStation game list  Compatibility
  Install and update  Profiles and PIN            config.json
  Using it            Controllers                 Uninstall
                      Launch Single Game          Troubleshooting


What you get
------------
- "Xbox Cloud Gaming" in the EmulationStation carousel, with its logo and
  background. Picking it opens the app fullscreen.
- The app only goes to Microsoft's own sites: Xbox, Microsoft sign-in,
  the Microsoft Store, your Microsoft account, and PayPal for paying for
  Game Pass. Every other link, popup or download is blocked.
- The app works entirely with a controller, including an on-screen
  keyboard for signing in and searching.
- Profiles, so each person has their own Xbox sign-in and settings.
- Optional: your cloud games in EmulationStation's own game list, with
  3D boxes.
- Three shortcuts in F1 > Applications: Xbox Cloud Gaming, Xbox Cloud
  Gaming Settings, and Xbox Cloud Gaming Uninstaller.
- The app's screens in 18 languages; by default it follows the system's
  language (Batocera's or HippOS's).


What you need
-------------
- Batocera or HippOS on a 64-bit PC or a Steam Deck (tested), or another
  PC handheld or ARM device (not fully tested yet; see Compatibility).
- An internet connection: about 20 Mbps, wired or 5 GHz Wi-Fi is best.
- An Xbox account with a Game Pass plan that includes cloud gaming, in a
  country where Xbox Cloud Gaming is offered.
- About 400 MB free in /userdata (check with: df -h /userdata).
- A controller (an Xbox controller is best), or a keyboard and mouse.


Install and update
------------------
1. Copy the "Xbox Cloud Gaming" folder to the top of the share folder,
   so it's at /userdata/Xbox Cloud Gaming.
2. Open a terminal (F1 > Applications > xterm, or SSH) and run:
     bash "/userdata/Xbox Cloud Gaming/install.sh"
3. Answer its questions, then restart EmulationStation
   (Main Menu > Quit > Restart EmulationStation).

Or with just the installer: install.sh also works on its own, with
nothing else next to it. It then downloads the newest release from
GitHub, unpacks it into /userdata/Xbox Cloud Gaming and installs it:
  curl -fsSL https://raw.githubusercontent.com/rmach89/xcloud-batocera-hippos/main/install.sh -o /tmp/xcloud-install.sh
  bash /tmp/xcloud-install.sh

Before installing, the installer checks GitHub for a newer version and
offers to download and install it instead (Enter = yes). With no
internet it installs the version you ran.

It also asks whether to install Launch Single Game (see below).

To update later: Settings > Updates (see Settings), or run the installer
again. Either way your sign-ins, profiles and settings are kept.

Options, set before the command (for example
XCLOUD_UPDATE=no bash install.sh):
  XCLOUD_NO_UPDATE_CHECK=1      skip the check for a newer version
  XCLOUD_UPDATE=yes / no        answer the update question ahead of time
  XCLOUD_SINGLE_LAUNCH=yes / no answer the Launch Single Game question

The first install needs internet: it downloads the browser engine the app
runs on (Electron, about 100 MB, checked against Electron's published
checksums). If the install was offline, the download happens the first
time you open the app instead.


Using it
--------
Exit back to EmulationStation: hold these two buttons for 2 seconds
(works everywhere, even in a game):
  Xbox            View + Menu
  PlayStation     Share (PS4) / Create (PS5) + Options
  Others          Select + Start
  Keyboard        hold Esc (a quick tap still goes to the game)

Welcome screen and Settings: hold Menu (Options / Start) for 1 second
while on Xbox, or hold S on a keyboard. The welcome screen opens, and
its View / Select button opens Settings. On the dashboard, Backspace
opens Settings directly.

Quick settings in a game: hold LB + RB + View (L1 + R1 + Share/Select)
for 1 second while playing, or press F9 on a keyboard. A panel opens on
the right with the sound (Volume, Game volume boost), Controller
vibration, the picture (Sharpening, Clarity boost, Colour saturation,
Contrast, Brightness, Video clean-up, and on 64-bit PCs 4K upscaling
with its size and sharpness), and Stream stats on or off; with Instant
replay on, "Save the last 30 seconds" too. With Settings per game on,
the picture, boost and vibration changed here are kept for that game
only.
Up / down choose, left / right change, A puts one back to its default,
B (or the same buttons, F9, Esc) closes. Changes show at once and are
saved when it closes. The game doesn't get the controller while it's up.
Its first row, Take a screenshot (A), saves the game's picture as it
looks, with the picture settings (and the 4K upscaling, when it's on), as
a PNG in /userdata/screenshots. PrintScreen on a keyboard does the same.
The first few times a game starts, a hint at the bottom shows how to open
quick settings.

A whole row of games: Xbox's controller navigation skips the row titles
("Stream for free with ads >"). Hold View (Share / Select) for 1 second
on a game in the row to open its full list. The first few times you move
onto a row with the controller, a hint at the bottom names it ("Hold View
to open Stream for free with ads"); once you've opened a row this way,
or after five hints, it stops.

Intro video: plays while Xbox loads behind it. A, B, X, Menu, Enter or
Space skip it. Settings > Intro video: every time, once a day, or off.

Signing in: the sign-in box is selected for you and the on-screen
keyboard opens. To type:
  Controller   D-pad picks a key, A types, X deletes, Y shift, B hides,
               Menu = Done (Next / Sign in)
  Keyboard     just type; Enter = Done
  Mouse        click the keys
Boxes that only take numbers (sign-in codes) get a number pad. Easiest
sign-in: approve it with the Microsoft Authenticator app on your phone.
You only sign in once.

Searching the dashboard: highlight the search box and press X (or A) for
the same keyboard. Menu or Done searches; B closes it.

Other Microsoft pages (Game Pass sign-up, your account): a "Back to Xbox
Cloud Gaming" bar sits at the top. Press View / Select, the Home key, or
click it. On those pages the D-pad moves, A selects and B goes back.

On-screen messages tell you when the controller disconnects or comes
back, and when its battery is low (15% and 5%, where the system can read
it).


Settings
--------
Open with Backspace on the dashboard, from the welcome screen, or from
F1 > Applications > Xbox Cloud Gaming Settings.
Controller: up / down to move, left / right to change, A to select, Menu
to save, B to cancel. Keyboard: arrows, Enter, S to save, Esc to cancel.
LB / RB (Page Up / Page Down) jump to the previous / next section.
Y twice puts the section you're in back to how the app comes (Region
and Language stay as they are); Save keeps it, Cancel undoes it.

The rows are grouped in sections:

  PROFILE AND ACCOUNT
  Change user                the profile screen (see Profiles)
  Sign out of Xbox           press twice to sign out
  Sign out when closing      signs out every time the app closes (for a
                             shared machine)

  GENERAL
  Region                     the country and language of the Xbox site:
                             its store, prices and game list. Xbox still
                             sees where you really are, so this alone
                             doesn't get around a country where Xbox
                             Cloud Gaming isn't offered
  Region unlock (no VPN)     off / Australia / Brazil / Europe / Japan /
                             Korea / United States. For where Xbox Cloud
                             Gaming isn't offered: Xbox is told you're in
                             that country, and games then run on that
                             country's servers, so the further away it
                             is, the higher the ping. Leave it off if
                             Xbox Cloud Gaming works where you are. No
                             VPN, but the same risk as one. Applies
                             after Reload dashboard
  Language                   the language of the app's own screens
                             ("Same as Batocera", or "Same as HippOS"
                             on HippOS, follows the system's language)
  Volume                     the app's volume (0-100%), or mute
  Game volume boost          makes a game's sound louder: 100-600%. Very
                             high levels can distort. A / Enter: 100%
  Light up keys when typing  real-keyboard keys light up on screen
  Intro video                every time / once a day / off
  Intro video sound          the intro's volume, or mute
  Low-power settings         A: the lighter choices for slower devices
                             in one go: fewer animations, analytics and
                             social features off, and sharpening, 4K
                             upscaling, video clean-up, clarity boost
                             and instant replay off. Save keeps them.
                             (On an ARM device the app offers this once,
                             the first time it opens)

  STREAM
  Stream resolution          720p (standard, about 10 Mbps internet,
                             20 recommended) / 1080p (about 20 Mbps) /
                             1080p high quality (about 30 Mbps) / 1440p
                             (about 35 Mbps; needs Game Pass Ultimate and
                             a game that offers it, otherwise Xbox sends
                             1080p). Wired is best. There's no 4K. Starts
                             with the next game
  Connection check           A: tests the download speed and the ping to
                             Xbox, and says which resolution suits them;
                             A again sets it
  Stream as a Windows PC     tells Xbox this is a Windows PC; may give a
                             sharper picture on some machines (reloads
                             the dashboard)
  GPU acceleration           uses the graphics chip more, including for
                             decoding the game's video. Smoother on many
                             machines; turn it off if the screen flickers
                             or goes black. Applies the next time the app
                             opens, for everyone on this machine
  Prefer IPv6 server         connects to the game's server over IPv6
                             when your internet has it; can lower the
                             ping. Starts with the next game
  Microphone on game launch  turns on the microphone for voice chat when
                             a game starts (sound only; the camera is
                             never allowed). It presses the stream's own
                             microphone switch; the log says what it
                             found. Starts with the next game
  Keep stream quality steady asks Xbox to keep the bitrate up for the
                             chosen resolution (about 12 / 22 / 32 / 42
                             Mb/s) instead of letting it drift down.
                             Xbox's server still decides; the stats show
                             what it sends. Starts with the next game
  Reconnect automatically    (on by default) if the stream drops, presses
                             Xbox's own reconnect / try again button, up
                             to 3 times in 5 minutes
  Stay connected             answers Xbox's "Are you still there?"
                             during a game, so the stream doesn't end
  Instant replay             keeps the last 30 seconds of a game; quick
                             settings' "Save the last 30 seconds" saves
                             them as a video in /userdata/recordings.
                             Uses more of the processor
  Stream stats               a small box at the top while you play:
                             resolution, frame rate, ping, bitrate,
                             packet loss and decode time, with graphs
                             of the last 60 seconds (frame rate, ping,
                             bitrate)

  PICTURE
  Sharpening                 off / low / medium / high. Sharpens the
                             game's picture; uses more processing power,
                             so lower it if games stutter
  4K upscaling               64-bit PCs only. Draws the game at the
                             screen's full resolution on the graphics
                             chip and sharpens it (contrast-adaptive
                             sharpening), for 4K TVs. Xbox itself sends
                             at most 1440p, so this makes it sharper,
                             not real 4K. Uses more of the GPU: turn it
                             off if games stutter
  Upscaling size             (with 4K upscaling on) screen size, 1080p,
                             1440p or 4K; never bigger than the screen,
                             never smaller than the stream
  Upscaling sharpness        (with 4K upscaling on) 0-100%; A: 60%
  Video clean-up             softens the blocks video compression leaves
                             in flat areas, keeping edges sharp (on the
                             graphics chip; any machine)
  Clarity boost              a little more contrast and colour, in one
                             switch (works together with the sliders)
  Contrast, Colour           fine-tune the game's picture, 50-150%.
  saturation, Brightness     A / Enter puts a slider back to 100%
  Settings per game          quick settings in a game saves the picture,
                             Game volume boost and controller vibration
                             for that game only; other games keep the
                             ones here

  CONTROLLER
  Controls                   every button and key the app uses
  Controller vibration       how strong the rumble is in games: off, 25%,
                             50%, 75% or 100%
  Each controller            pick a connected controller (left / right)
                             to give it settings of its own, kept by its
                             name (two of the same model share them) and
                             for the whole machine, not per profile:
    Stick dead zone          off / 5% / 10% / 15% / 20% / 25%: small
                             stick movements are ignored, for a stick
                             that drifts; past it the stick still
                             reaches full
    Its vibration            same as above / off / 25% / 50% / 75% / 100%
    Swap A/B and X/Y         for controllers with these buttons the
                             other way round (in games; the app's own
                             screens keep A as select)
  On-screen touch controller see-through controller buttons over a game
                             while it streams, for touch screens: sticks,
                             D-pad, A B X Y, bumpers, triggers, View,
                             Menu, L3 and R3. Xbox sees it as one more
                             Xbox controller from the first touch
  Controller battery         the charge of wireless Xbox and PlayStation
                             controllers (when Linux reports it), and a
                             Steam Deck's own battery
  Split screen               off / 2 / 3 / 4 players on one screen (off
                             by default; only turned on here). Player 1
                             uses the first controller. Each other box
                             says "Press A to join": a spare controller
                             presses A to take the next box, then picks
                             who's playing there: one of the profiles
                             (adults' need the PIN when a child's
                             profile exists) or a guest who signs in in
                             that box. Each player's selection is in
                             their colour: green (A), red (B), blue (X),
                             yellow (Y). Each needs Game Pass, and 2-4
                             streams need a fast connection and
                             machine; the sound of all of them plays
                             together. Applies the next time the app
                             opens (for everyone on this machine)
  Remember split-screen      (with split screen on) keeps the guests'
  players                    Xbox sign-ins for next time. Off (the
                             default): they're forgotten when the app
                             closes

  XBOX DASHBOARD
  Disable social features    friends, messages and suggested people
                             aren't loaded, so the dashboard loads
                             faster. Applies after Reload dashboard
  Wait time on game pages    a game's page shows how long you'd wait for
                             a server (on by default)
  Skip Xbox splash video     skips the short Xbox video as a game starts
                             (about 3 seconds sooner)
  Turn off post-game         closes the questions about the game or the
  feedback                   stream after you stop playing
  Reduce animations          fewer moving effects on the dashboard;
                             smoother on slower devices like ARM boards
  Turn off analytics         Xbox's usage statistics and error reports
                             aren't sent

  EMULATIONSTATION
  EmulationStation game list off / all cloud games / free with ads /
                             games I pick
  3D game boxes              3D cases instead of flat box art

  HELP AND MAINTENANCE
  Reload dashboard           reloads Xbox if it's stuck or blank
  Clear cache                clears stored web pages (you stay signed in)
  Save logs for help         puts the logs and settings in one zip:
                             /userdata/xcloud-logs-<date>-<time>.zip
                             (gamertags are replaced; nothing about
                             sign-ins is included)
  Back up settings           saves the settings, profiles (names,
                             colours, gamerpics, each one's settings, the
                             PIN's hash), per-game picture settings and
                             picked games in one file:
                             /userdata/xcloud-backup-<date>-<time>.json.
                             The Xbox sign-ins aren't in it
  Restore settings           A twice: puts back the newest backup in
                             /userdata (the screen shows which). What was
                             there is kept first as
                             xcloud-backup-before-restore-....json. The
                             app then closes; open it again. On another
                             machine each profile signs in to Xbox again
  Updates                    shows the app and engine versions. One press
                             checks GitHub for a newer app (published
                             Releases only) and Electron for a newer
                             engine, and gets whatever is newer by itself.
                             It's used the next time the app opens: a new
                             app version is installed in the background
                             when the app closes. Settings, profiles,
                             sign-ins and picked games are kept. Nothing
                             changes if it fails; the log says why.


EmulationStation game list
--------------------------
Settings > EmulationStation game list puts the cloud games themselves in
EmulationStation's Xbox Cloud list. Each game comes with art,
description, developer, release date and age rating from Microsoft's
catalog. Picking one opens the app straight into that game. Xbox Cloud
Gaming itself stays at the top of the list.
  All cloud games   every cloud game in your region (several hundred),
                    refreshed every few days
  Free with ads     the games anyone can play free with ads, without
                    Game Pass (they're in All cloud games too)
  Games I pick      only the ones you add. On a game's page press F8, or
                    hold LB + RB + LT + RT (L1 + R1 + L2 + R2) for a
                    second. Do it again to take the game out.
  Off               only Xbox Cloud Gaming itself stays in the list:
                    every other game comes out and every picture the
                    app downloaded is deleted (for good, not to a
                    trash folder)
Changes show when you're back in EmulationStation. All cloud games takes
a few minutes the first time (hundreds of pictures, and the 3D boxes):
the games show first and their pictures follow. You can close the app
meanwhile; it finishes in the background and EmulationStation reloads
its games when it's done. While it runs, a bar with the percentage shows
in the bottom-left corner of the dashboard and under the setting in
Settings.

3D game boxes: each game becomes a black case with the cover, the
game's name on the spine and its age rating in the corner. Detailed
views show the whole box; grid views crop it.

Badges: games Microsoft lists as playable with a keyboard and mouse get
a keyboard-and-mouse badge in the bottom-left corner of their cover, and
games that support touch get a hand tapping. They're on the 3D boxes,
and on the flat box art when 3D game boxes are off.

Age ratings are information only. What a child's or teen's account may
play or buy is set by Microsoft's own family settings for that account.
Kid-friendly games are marked for EmulationStation's Kid mode.

Free-to-play games with ads: the app presses "Play with ads" for you.

The files: one small file per game in /userdata/roms/xcloud, pictures in
/userdata/roms/xcloud/images.


Profiles and PIN
----------------
Each person can have a profile, with their own Xbox sign-in and
settings: every Settings choice is theirs, except GPU acceleration, split
screen, the EmulationStation game list and the controller layout, which
are for the whole machine. A new profile starts from the machine's
settings. The first person to sign in becomes the first profile. When
someone else signs in, the app offers to set up profiles.

With two or more profiles, "Who's playing?" appears when the app opens
(and before a game from EmulationStation's list starts). The controls:
  Left / right   pick a profile
  A              choose it
  Y twice        remove a profile
  B              keep the one that's loading
Settings > Change user brings it up at any time.

PIN: once a child's or teen's profile exists, adult profiles need a
4-number PIN. The app asks for it as soon as that profile is set up,
so create it then. Until it exists, adult profiles stay locked and
profiles can't be added or removed. After that the PIN is needed to:
- open an adult's profile;
- add or remove profiles;
- use the F1 Settings shortcut in an adult's profile;
- uninstall.
The PIN is stored only as a salted hash.

Forgot it? Create a file named reset-pin in
/userdata/system/add-ons/xcloud, or delete the file named pin there. The
PIN is cleared the next time the app opens.
The PIN only guards this app; Microsoft's family settings are the real
protection.


Controllers
-----------
- Xbox and PlayStation controllers are passed to Xbox as they are.
- Steam controllers (the Steam Deck's controls, the Steam Controller)
  aren't supported by Xbox, so the app shows them to Xbox as an Xbox
  controller, with the buttons in Xbox's layout.
- Other controllers the browser doesn't recognise are put into the Xbox
  layout too, so the right stick, triggers and D-pad work.
The app's screens name your controller's buttons (✕ ○ □ △ on
PlayStation). xcloud-app.log records each controller it sees
("controller: ...").


Launch Single Game
------------------
Optional; the installer asks. With it, picking Xbox Cloud Gaming in the
carousel opens the app straight away, and closing the app returns to the
carousel. Without it, the carousel opens Xbox Cloud Gaming's list like
any other system. It's off unless you choose it, on Batocera and HippOS
alike; installing again keeps what you chose before. On HippOS the
installer asks nothing (its content downloader can't answer questions):
Launch Single Game is left off, and XCLOUD_SINGLE_LAUNCH=yes bash
install.sh adds it.

It only acts on systems listed in /userdata/system/launchsingle.systems
(one per line; the installer adds xcloud). Add another system's short
name (its folder name under /userdata/roms) to make it open straight
away too, when that system has exactly one game.

Tip: Main menu > User Interface Settings > Game launch transition >
Instant makes every launch quicker.


Keeping it after a reboot
-------------------------
Batocera forgets changes to its system area at every reboot. The F1
shortcuts and the carousel art in Batocera's built-in themes have to be
there, so the app puts them back as links at every boot:
- with a service named "xcloud" (System settings > Services), or
- on a Batocera without services, with one marked line in
  /userdata/system/custom.sh.
xcloud-boot.log says what was linked.

On HippOS everything stays in /userdata. Its built-in theme gets the
logo with sudo, and a small start script puts it back after HippOS
updates.

Installed a new theme? Run install.sh again to give it the logo.


Compatibility
-------------
Tested: 64-bit PCs with Batocera v42 and v44, and HippOS 0.5; the Steam
Deck, including its built-in controls. Other devices haven't been fully
tested yet; how well they do depends on the processor, because the game
stream is video it has to decode.
  Tested              64-bit PCs; Steam Deck
  Should play well    other PC handhelds (ROG Ally, Legion Go);
  (not fully tested)  Raspberry Pi 5; RK3588 boards; Snapdragon handhelds
                      (AYN Odin 2, Retroid Pocket 5)
  May stutter         Raspberry Pi 4 (2 GB+); Odroid N2; RK3566 / RK3568
  (not tested)        (Anbernic RG353 series); newer Amlogic TV boxes
  Too slow            1 GB devices (RG35XX family, RG351, Raspberry Pi 3)
                      and 32-bit ARM
  Not supported       Raspberry Pi 1 / Zero (ARMv6) and 32-bit x86 PCs:
                      the installer stops without changing anything
With less than 2 GB of memory the installer warns you but installs. On
ARM boards that stutter, try Settings > GPU acceleration.


config.json
-----------
/userdata/system/add-ons/xcloud/config.json holds settings. Most are on
the Settings screen; these are only in the file:
  exit_hold_seconds  how long to hold the exit buttons (default 2)
  show_exit_tip      false: never show the welcome screen at start
  return_to_carousel false: stay on the Xbox Cloud list after closing
  controller_fix     false: don't rearrange unknown controllers
  allowed            extra sites the app may open. A "blocked" line in
                     xcloud-app.log names one it refused.
  electron_version   pin a browser engine version (empty = newest)
If the file has a mistake, the app uses its built-in settings and says
so in the log.


Uninstall
---------
F1 > Applications > Xbox Cloud Gaming Uninstaller, or:
  bash /userdata/system/add-ons/xcloud/uninstall.sh
It asks first (and asks for the PIN when a child's profile exists).
- You can keep everyone's sign-ins, profiles and settings for a
  reinstall, keep just the settings, or remove everything.
- It also asks whether to keep Launch Single Game for your other
  systems.
- Everything it added is removed, and anything a theme had before is
  put back.
- When it's done, press Enter to exit the uninstaller. EmulationStation
  reloads by itself and Xbox Cloud Gaming leaves the carousel; there's
  no need to restart it.
To remove everything without questions:
  bash /userdata/system/add-ons/xcloud/uninstall.sh --all
From BUA its questions appear on BUA's screen. The PIN can't be typed
there, so when one is needed, use the F1 shortcut above instead.


Troubleshooting
---------------
Logs in /userdata/system/logs:
  xcloud-install.log   install and uninstall
  xcloud.log           each launch (engine download, missing libraries)
  xcloud-app.log       inside the app (blocked pages, controllers, game
                       list)
  xcloud-boot.log      links made at boot
  xcloud-update.log    app updates installed from Settings > Updates
                       (the checks themselves are in xcloud-app.log,
                       lines starting "updates:")
Settings > Save logs for help puts them in one zip for sending.

- The picture is black, flickers or breaks up: hold LB + RB (L1 + R1)
  for 2 seconds while the app opens (safe mode). It turns off GPU
  acceleration, split screen, 4K upscaling, video clean-up, sharpening,
  clarity boost, Keep stream quality steady, picture settings per game,
  and puts contrast, saturation and brightness back to 100%. If GPU
  acceleration or split screen was on, the app closes: open it again.
  Turn things back on one at a time in Settings. From a terminal:
  Run-App.sh --safe does the same.
- The app flashes and closes: check xcloud.log.
  - "No space left on device": /userdata is full.
  - "Could not set up the browser engine": the download failed (no
    internet?).
  - "Missing libraries": the system lacks something the engine needs.
    Please report it.
- "Can't reach Xbox Cloud Gaming": you're offline. Press A to retry.
- A page won't load during sign-in: look for "blocked" in
  xcloud-app.log and add that site to "allowed" in config.json.
- No carousel logo: restart EmulationStation. Themes installed after the
  app need install.sh run again.
Problems or ideas: https://github.com/rmach89/xcloud-batocera-hippos/issues


What's new in 1.2.9
-------------------
- Settings > Controller > Each controller: a stick dead zone, its own
  vibration strength, and A/B and X/Y swapped, for each controller.
- Settings per game (was Picture settings per game) also keeps the game
  volume boost and controller vibration for each game.
- Quick settings has a Controller vibration row.

What's new in 1.2.8
-------------------
- Each profile keeps all of its own settings. Before, with profiles set
  up, most settings added since 1.2.5 went back to their old values the
  next time the app opened.
- Settings: LB / RB jump between sections, and Y twice resets the one
  you're in.
- Low-power settings in Settings > General, offered once on ARM devices.
- Back up settings and Restore settings (Help and maintenance).
- Safe mode: hold LB + RB while the app opens (see Troubleshooting).
- A short "What's new" card the first time the app opens after an update.
- Quick settings: "Take" and "Save" instead of "Press A" on the
  screenshot and instant replay rows.
- Clearer help for Region and Region unlock.

What's new in 1.2.7
-------------------
- Split screen: 2 to 4 players on one screen, each with their own Xbox
  sign-in, controller and selection colour (Settings > Controller; off
  by default).
- 4K upscaling: choose its size (screen, 1080p, 1440p, 4K) and
  sharpness, in Settings and in quick settings during a game.
- Video clean-up and Keep stream quality steady.
- Picture settings per game.
- Stream stats: graphs of the last 60 seconds; on or off in quick
  settings too.
- Split screen: "Press A to join" for players 2-4, each picking a
  profile or playing as a guest; guests are forgotten when the app
  closes unless Remember split-screen players is on.
- Instant replay (save the last 30 seconds from quick settings), Stay
  connected, Reconnect automatically, a Connection check and the
  Controller battery in Settings.
- Games started from the dashboard count in EmulationStation's list
  (play count, last played, play time), like the ones it starts itself.
- 3D game boxes: smaller keyboard/mouse and touch badges and age-rating
  tile (the boxes are redrawn at the next list update).

What's new in 1.2.6
-------------------
- Quick settings in a game: hold LB + RB + View for a second (F9 on a
  keyboard) for the sound and picture settings over the game, and a
  screenshot button (PrintScreen on a keyboard). A hint shows how to
  open it the first few times a game starts.
- 4K upscaling (64-bit PCs), Skip Xbox splash video, Turn off post-game
  feedback, Reduce animations and Turn off analytics. Settings has a
  new Xbox dashboard section for the options about the Xbox site.
- New in Settings: Game volume boost (up to 600%),
  Region unlock without a VPN, Disable social features, Prefer IPv6
  server, Microphone on game launch, Wait time on game pages and an
  on-screen touch controller (see Settings).

What's new in 1.2.5
-------------------
- install.sh works on its own: with nothing else next to it, it
  downloads the newest release from GitHub into /userdata/Xbox Cloud
  Gaming and installs that (see Install and update). With the zip it
  works as before.
- On HippOS the installer asks nothing, so HippOS's content downloader
  can run it: Launch Single Game is left off and a newer release, if
  any, is installed.
- From BUA (Batocera Unofficial Add-ons), the installer's and the
  uninstaller's questions appear on BUA's own screen (yes / no and
  menus). BUA can't take typed answers, so when a child's profile
  needs the PIN, the uninstaller says to use F1 > Applications > Xbox
  Cloud Gaming Uninstaller instead.
- Holding View on a game to open its whole row finds the row's title by
  where it sits on screen (just above the row), so it works with how the
  Xbox dashboard is built now. A hint at the bottom shows it the first
  few times you move onto a row with the controller.
- The game list's progress bar is in the bottom-left corner of the
  dashboard (it was top right).
- When run straight from GitHub (curl ... | bash), install.sh always
  downloads the newest release, whatever folder it's started from.

What's new in 1.2.4
-------------------
- More detail in xcloud-app.log for finding a row's title (an outline of
  the page around the game) and the Library's games (where the page
  keeps their IDs).

What's new in 1.2.3
-------------------
- Holding View on a game finds that game's own row title (the row's
  section on the Xbox page), not another one such as Genres.
- xcloud-app.log notes where the Library page gets its games from, for
  the coming "Games I own" choice.

What's new in 1.2.2
-------------------
- EmulationStation game list: new choice "Free with ads", the games
  anyone can play free with ads, no Game Pass needed (Microsoft's
  "Stream for free with ads" list). All cloud games includes them too.
- Hold View for a second on a game on the dashboard to open its whole
  row (the same as clicking the row's title, which the controller
  can't reach).
- xcloud-app.log notes the Library page's address and games, for the
  coming "Games I own" choice.

What's new in 1.2.1
-------------------
- xcloud-app.log names each Game Pass list the Xbox site loads
  ("catalog list: <id> | <name> | <n> games"), to find Microsoft's
  free-to-play and play-with-ads lists for the game list.

What's new in 1.2.0
-------------------
- New stream options in Settings, saved for each profile: Stream
  resolution (up to 1440p, with the internet speed each needs),
  Sharpening, Clarity boost, Contrast / Colour saturation / Brightness
  sliders, Stream stats and Controller vibration strength. They're
  logged in xcloud-app.log when saved and when a game starts.
- EmulationStation game list "All cloud games" (about 500 games) no
  longer stops when the app is closed before it's done: the games are
  listed first, their pictures follow, and it finishes in the
  background, then has EmulationStation reload its games. Progress is in
  xcloud-app.log. A bar shows how far it has got, as a percentage.
- Keyboard-and-mouse and touch badges on the covers of the games that
  support them, from Microsoft's own lists.
- 3D game boxes are drawn for every game again on systems whose picture
  library can't read Microsoft's covers ("broken data stream" in the
  log): those covers are converted with ffmpeg first.
- A cover with a banner across its top (XBOX, XBOX 360, XBOX ONE,
  "Digital version", "Game Preview", a black REMASTERED strip) is
  shifted down on its 3D box so the banner isn't cut in half. Other
  covers stay centred as before.
- Turning the game list Off now deletes every picture it downloaded
  (also ones from an update that was cut short) and leaves only Xbox
  Cloud Gaming itself in the list.
- Launch Single Game is now simply optional: the installer no longer
  recommends it on either system, and it's off unless you choose it.
  Installing again keeps your earlier choice.
- The uninstaller ends with "Press Enter to exit the uninstaller", and
  EmulationStation reloads by itself instead of needing a restart.
- Xbox Cloud Gaming stays at the top of its list on HippOS too: its sort
  name now starts with a space, like its name.
- The Settings screen is organised into sections: Profile and account,
  General, Stream, Picture, Controller, EmulationStation, and
  Help and maintenance.
- On HippOS the language choice reads "Same as HippOS" and follows
  HippOS's own language setting (hippos.conf).
- GPU acceleration is now in Settings (it was only in config.json), and
  also turns on hardware decoding of the game's video. The log notes
  what the engine reports for the graphics chip.

What's new in 1.1.33
--------------------
- Settings > Updates (was Update engine) shows the app version next to
  the engine's. One press checks your GitHub Releases for a newer app
  and Electron for a newer engine, and downloads and applies whatever is
  newer without asking again. The new version is used the next time the
  app opens; settings, profiles and sign-ins are kept. Every check,
  download and failure is logged.

What's new in 1.1.32
--------------------
- PIN: as soon as a child's or teen's profile is set up, the app asks for
  the adult PIN right then (while the adult setting it up is there), not
  later. Until a PIN exists, adding or removing a profile needs one made
  first, the same as opening an adult's profile.
- This README is shorter and up to date (the version history is in the
  Releases on GitHub).

1.1.30: new home on GitHub; the installer checks it for a newer version
before installing.
Earlier changes are listed in the Releases on the home page.


Credits and trademarks
----------------------
Xbox, Xbox Cloud Gaming, Xbox Game Pass, Microsoft and Windows are
trademarks of the Microsoft group of companies; PayPal is a trademark of
PayPal, Inc. They're named only to say what the app opens and works
with.
- Runs on Electron (MIT License, github.com/electron/electron).
- The intro video and its sound are original, made for this app.
- Controller emoji: Google's Noto Color Emoji (Apache License 2.0).
  Japanese and Korean text: parts of Noto Sans CJK (SIL Open Font
  License 1.1).
- Batocera, HippOS and EmulationStation are their own projects; this app
  only adds a system to them.
