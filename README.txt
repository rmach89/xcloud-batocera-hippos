XBOX CLOUD GAMING APP for Batocera & HippOS
===========================================
Version 1.1.30 (November 2026).
Home page and new versions: https://github.com/rmach89/xcloud-batocera-hippos

Runs on Batocera and on HippOS (the installer tells them apart).

Keeping its pieces after a reboot
---------------------------------
The F1 > Applications shortcuts and the carousel logo/background live in
Batocera's system area, which forgets changes at every reboot. Nothing is
saved into that area: they're linked there from the app's folder at every
boot (the way Batocera Unofficial Add-ons does it):
- On a Batocera with services (the usual case), as a service named
  "xcloud": /userdata/system/services/xcloud, switched on by the installer.
  It shows in Main menu > System settings > Services; switching it off
  there means the shortcuts and carousel art are gone after the next
  reboot (the app itself keeps working).
- On a Batocera without services, from one marked line in
  /userdata/system/custom.sh (the file is created if you don't have one).
  The installer's log says which one it used; whether BUA is installed is
  noted too (it isn't needed).
- xcloud-boot.log in Batocera's logs folder says what was linked at boot.
- The uninstaller stops and removes the service (or takes the custom.sh
  line out, and custom.sh too if it was made only for it), and puts back
  a theme's own logo where ours replaced it; nothing comes back after a
  reboot.
- On HippOS everything is in /userdata; only the carousel logo in its
  built-in theme is placed with sudo and put back after HippOS updates.
Coming from an older version that used batocera-save-overlay (1.1.18 or
earlier): uninstall it first (it takes its own files back out of the
system area), reboot, then install this.

This is an unofficial project - use at your own risk. It is not
affiliated with, endorsed by, or sponsored by Microsoft or Xbox; all
trademarks, product names, and company names or logos mentioned herein
are the property of their respective owners.

What's new in 1.1.30
--------------------
- The app has a home on GitHub: github.com/rmach89/xcloud-batocera-hippos.
  New versions are published there as Releases (the zip).
- The installer checks GitHub for a newer version before installing. If
  there is one, it asks whether to download and install that instead
  (Enter = yes). No internet, or no answer from GitHub: it installs the
  package you ran, as before. To skip the check: XCLOUD_NO_UPDATE_CHECK=1
  bash install.sh. To answer ahead of time: XCLOUD_UPDATE=yes (or no).
  To update later, just run the installer again.

What's new in 1.1.29
--------------------
- Steam controllers (the Steam Deck's controls, the Steam Controller):
  Xbox Cloud Gaming doesn't support them, so the app shows them to Xbox
  as an Xbox controller, its buttons in the Xbox layout (the app's own
  controller fix, as before). The app's screens show Xbox's button names
  for them. (This stops if Microsoft starts supporting them.)
- Removed: Switch controller support, and the "Use EmulationStation
  controller mapping" setting. Controllers the browser doesn't know are
  put in the Xbox layout by the app's own fix, as before.

What's new in 1.1.28
--------------------
- Games that are free to play with ads: starting one from Batocera's list
  lands on its game page, where Xbox wants "Play with ads" pressed. The
  app now presses it for you (only then; other games launch as before).
- The "Back to Xbox Cloud Gaming" bar names your controller's own button
  (Create on a DualSense, View on Xbox, Share on PS4) even on
  pages that can't see the controller yet.
- The "F8 or hold LB+RB+LT+RT" hint shows once a game is launching, not
  on its store page, and names the game (not its Store ID). Games added
  from a page whose address says "products" get their real name too.
- Children mode, the teen setting, each child's age limit and the age
  rating checks are gone: Microsoft's own family settings already stop a
  child's or teen's account from starting games or buying anything they
  aren't allowed. Age ratings stay in the game descriptions, as
  information only.
- The PIN stays, to keep children and teens out of adults' profiles, and
  is now required: once a child's or teen's profile is set up, adult
  profiles can't open until a PIN is made (no more "Later"). Teen
  profiles count too.
- Fixed: Settings > Change user let a child back into an adult's profile
  that had been opened earlier without asking for the PIN again.
- With more than one profile, a game started from Batocera's list waits
  for "Who's playing?" before it opens, so it never starts in the wrong
  account.
- The installer ends with "Press Enter to exit the installer" instead of
  offering to restart EmulationStation.
- 3D game boxes show the game's age rating in the bottom-right corner of
  the cover: the youngest age large ("13+", or "ALL"), the rating under it
  ("T", "PEGI 12"), on a color for the age group. The app's own design;
  games with no known rating get none. Existing boxes are redrawn the
  next time the game list updates.

What's new in 1.1.27
--------------------
- This is now the main app (the earlier test builds were called
  "alpha 2"). It no longer uses batocera-save-overlay, and it runs on
  Batocera and HippOS.
- Adding or taking out a game (F8 or LB+RB+LT+RT) works even when its
  pictures can't be saved. Before, one picture that couldn't be written
  (seen on HippOS, where part of its roms folder was read-only) stopped
  the whole update, so games were neither added nor taken out. Now the
  list is updated without those pictures, and the app's log says
  "pictures couldn't be saved" with the reason.

What's new in 1.1.26 (test build)
---------------------------------
- The on-screen keyboard's hint line names the buttons of the controller
  in use, like the profile and PIN screens: a PlayStation controller
  shows ✕ type · □ delete · △ shift · ○ hide · Options done. It changes
  if you switch controllers while the keyboard is open.

What's new in 1.1.25 (test build)
---------------------------------
- HippOS theme logo: the SVG is gone. The logo is now your xcloud.png
  (the Xbox sphere and XBOX CLOUD) made white, installed as
  art/xcloud.png, so the theme shows it in its own colour. An xcloud.svg
  placed by the 1.1.24 test build is taken out (the theme would show it first).

What's new in 1.1.24 (test build)
---------------------------------
- HippOS: the carousel logo in HippOS's built-in theme
  (es-theme-hippos-minimal). The theme shows each system as a white
  logo (art/<system>.svg, or .png, tinted by the theme).
  - That theme is in HippOS's system area, which only root can change.
    HippOS lets its user run sudo without a password, so the installer
    places the logo with "sudo -n" (never asks for a password; skipped,
    with the name shown as text, where it isn't allowed).
  - Every HippOS update replaces the system area. A small script in
    EmulationStation's scripts/start folder (in /userdata, kept by
    updates) puts the logo back when EmulationStation starts, and has
    it reload so the logo shows on that first boot (noted in
    xcloud-boot.log). It does nothing when the logo is still there.
  - A theme that ships its own Xbox Cloud Gaming logo keeps it.
  - The uninstaller takes the logo and the start script out again.

What's new in 1.1.20 (test build)
---------------------------------
- batocera-save-overlay is gone from the app entirely: no script runs
  it or mentions it, and the leftover bits from the normal build are
  removed.

What's new in 1.1.19 (test build)
---------------------------------
- HippOS: the same zip installs on HippOS. The installer, the app and the
  uninstaller tell Batocera and HippOS apart (/usr/share/hippos/version).
  On HippOS:
  - Everything goes in /userdata (HippOS runs as a normal user and its
    updates replace the system area): no theme art in the built-in
    themes (themes in /userdata/themes still get it), no service.
  - The shortcuts go in the desktop's applications menu (F1).
  - Launch Single Game is off unless you say yes (no other HippOS
    system opens a game by itself).
  - HippOS's controller hotkeys (Select+Start -> Esc, Select+B ->
    Space...) are switched off while the app is open, so they don't
    land on the Xbox page; they come back when it closes. Hold
    Select+Start (View+Menu) to quit, as on Batocera.
  - The log names HippOS and its version.
- A controller the browser doesn't know (its buttons in their own order)
  now works on the app's own screens and combos too: View, Menu, the
  triggers and the D-pad, not only A B X Y. Xbox already got it in the
  Xbox layout.

What's new in 1.1.17
--------------------
- The button hints on the profile screen and the PIN screen show the
  buttons of the controller in use: ✕ △ ○ □ on a PlayStation controller,
  coloured A B X Y on an Xbox controller; plain letters on others. What
  each button does is unchanged.

What's new in 1.1.16
--------------------
- The installer's Launch Single Game question now explains what it does,
  what happens with it and without it (opening the app, and where you
  land when you close it), that it leaves your other systems alone, and
  how to change your mind later.

What's new in 1.1.15
--------------------
- Adding games from the controller: on a game's page, hold LB + RB + LT +
  RT (L1 + R1 + L2 + R2 on a PlayStation controller) for a second. It
  works like F8: in the list, or out again if it's already there.
- Launch Single Game is optional: install.sh asks whether to install it.
  Without it, picking Xbox Cloud Gaming in the carousel shows its list
  (like any other system) and closing the app brings you back to that
  list; the app and the game list leave single launch alone. Answer
  ahead of time with XCLOUD_SINGLE_LAUNCH=yes or =no. Reinstalling with
  "no" after a "yes" takes xcloud back out of Launch Single Game's list
  (the scripts stay, in case your other systems use them).

What's new in 1.1.14
--------------------
- The controller works on the dashboard again after searching. Xbox
  stopped asking for the controller while the keyboard was open, and the
  app waited for it to ask before handing it back; the app now hands it
  back as soon as every button is let go. (The same fix covers the
  hand-back after the welcome screen and Settings.)
- Searching with a real keyboard: after Enter the search box lets go,
  and a D-pad press or B lets go of any text box still selected, so the
  controller moves around the dashboard again.
- The intro's sound (picture version) now plays through Web Audio, the
  way game sound does, instead of the media player, which doesn't work
  on some machines.
- The log's first line now says which Batocera version is running.

What's new in 1.1.13
--------------------
- 3D game boxes use Microsoft's tall cover (poster) when the game has
  one, so the cover fills the case without its sides being cut off (the
  usual box art is square). Games without one still use the box art.
  Boxes already drawn are redrawn once.

What's new in 1.1.12
--------------------
- 3D game boxes: a box the app drew is kept. The list update that ran
  right after it tried Pillow again on that cover and deleted the box.
- The picture version of the intro has its sound again (from a small
  audio-only file, so no video decoding is needed for it).
- Typing on a real keyboard moves the on-screen keyboard's selection to
  that key, so the controller carries on from there (also on the
  dashboard's search box).
- After the search keyboard closes, the controller works on the
  dashboard again (Xbox thought it had been unplugged while you typed;
  it's now told it's back).
- F8's message names the game (from the page's heading) instead of
  showing its Store ID.
- On Batocera 42, restart EmulationStation once after installing so it
  picks up Xbox Cloud Gaming's place at the top of the list.

What's new in 1.1.11
--------------------
- 3D game boxes: a saved cover that can't be read (cut short while it was
  downloading) is fetched again from Microsoft; the app's own drawing
  also falls back to Microsoft's copy. A box is never saved with an
  empty cover; if no cover can be read, the flat box art stays. Boxes
  already drawn are redrawn once.
- Xbox Cloud Gaming stays at the top of Batocera's list on every
  version: Batocera's EmulationStation only uses a "sort name" since
  December 2025, so on older ones the entry's name now starts with a
  space (which sorts before every letter).

What's new in 1.1.10
--------------------
- 3D game boxes: a cover Pillow can't read ("broken data stream") is
  handed to the app's own drawing instead.
- F8 on a game's stream page no longer names the game "Stream" (or
  opens it with "stream" in the address); the name comes from the page
  or Microsoft's catalog. Games already saved that way are fixed too.

What's new in 1.1.9
-------------------
- 3D game boxes no longer need Pillow. When Batocera's Python doesn't
  have it, the app draws the boxes itself with its browser engine (same
  design), right after the list is updated. If they weren't drawn yet
  (for example, turned on from the F1 Settings shortcut), the app draws
  them a few seconds after it next opens.
- What the game list update warns about now goes in xcloud-app.log
  ("Batocera game list: ..."), and how many boxes were drawn.

What's new in 1.1.8
-------------------
- The picture version of the intro (used when the engine can't decode
  video) is now full 1080p with every frame drawn whole, so the dark,
  smoky parts no longer turn blotchy.

What's new in 1.1.7
-------------------
- Intro video: some Batocera machines can't decode any video in the
  browser engine (the log said "video decode error"). The intro then
  plays as an animated picture with its soundtrack, instead of being
  skipped.
- Dashboard search: after Done (or B) the search box lets go, so the
  D-pad moves around the results and the dashboard again. The keyboard
  only opens with A or X, not when the D-pad passes over the box.
- F8 recognises more game pages (any Xbox address with the game's Store
  ID, or the page's own "this is game X" tag), and works while a game
  is starting too. If it can't tell which game it is, the log line
  "F8: no game on this page (...)" shows the address it saw.

What's new in 1.1.6
-------------------
- F8 on a game's page adds it to Batocera's list (Games I pick), and F8
  again takes it out; a message confirms which. Game pages are also
  recognised from more kinds of Xbox addresses.
- The dashboard's search box gets the on-screen keyboard: highlight it,
  press X (or A).
- The controller now works on the "Picking games" how-to and on the
  messages shown when a game can't start (it only took the keyboard).
- Microsoft's sign-in pages no longer react to the controller themselves.
  Their newer design has its own controller navigation, so moving around
  the on-screen keyboard also moved the page (to "Forgot your username?",
  or between the code boxes). The app now does all the controller work
  there.
- Boxes that take only digits (the sign-in code, phone numbers) get a
  number pad instead of the full keyboard, and each digit goes in as a
  real key press, so the code boxes move on to the next digit by
  themselves.
- The intro video now also comes as WebM; the app tries it first and
  the MP4 if it can't. If it still doesn't play, xcloud-app.log says why
  ("intro video: ...").
- Closing the window with Alt+F4 goes through the app's normal exit (the
  sign-in is saved; Sign out when closing still applies).

What's new in 1.1.5
-------------------
- Fixed "Controller not detected" on the Xbox page when the controller
  was used on the intro or welcome screen. The app hides the controller
  from Xbox while its own screens are up, and Xbox only listens for a
  new controller once. The app now tells Xbox about the controller again
  each time it hands it back, and once after the page loads.
  (xcloud-app.log: "controller announced to the Xbox page again")

What's new in 1.1.4
-------------------
- Launch Single Game is now confirmed on Batocera v42 to v44.

What's new in 1.1.3
-------------------
- The README opens with a note that this is an unofficial project, not
  affiliated with, endorsed by or sponsored by Microsoft or Xbox.

What's new in 1.1.2
-------------------
- A button still held from the screen before (for example A, from the
  welcome screen's Settings button) no longer presses something on the
  next screen. That's what opened Controls instead of Settings.
- If the Xbox page is ever left without the controller after one of the
  app's screens closes, the app now gives it back within 2 seconds.
- The log says why the intro video ended, and what controllers the Xbox
  page sees (to sort out "controller not detected").

What's new in 1.1.1
-------------------
- The uninstaller can remove just the profiles and sign-ins and keep
  the settings.

What's new in 1.1.0
-------------------
- Profiles: each person keeps their own sign-in and settings; "Who's
  playing?" with gamerpics; a PIN for adult profiles when a child plays
  here; Change user in Settings.
- Children mode: age-rating limits for games started from Batocera's list
  and from the dashboard; an adult can set each child's limit (E, E10+,
  T) or turn children mode off; the PIN is needed for an adult's account
  to sign in on a child's profile, and to uninstall.
- Batocera game list (Settings): all cloud games, or just the ones you
  pick, in Batocera's Xbox Cloud list with art, description and age
  rating; picking one opens straight into it. Optional 3D game boxes.
  Kid-friendly and adult games are marked for Batocera's Kid mode.
- Settings: Controls, Clear cache, Update engine, Sign out when closing,
  Save logs for help, volume mute.
- Messages when the controller disconnects or its battery runs low.
- Steam Deck and other controllers the browser doesn't know: sticks and
  triggers fixed.
- The uninstaller can keep everyone's sign-ins and profiles for a
  reinstall.
- Faster launch, and a faster return to the carousel.

An unofficial, fan-made app. It is not made, endorsed or supported by
Microsoft, and isn't affiliated with Microsoft or Xbox in any way. It
just opens Microsoft's own Xbox Cloud Gaming website in a fullscreen
window; you need your own Microsoft account and a Game Pass membership
that includes cloud gaming.

What you get
------------
"Xbox Cloud Gaming" in the EmulationStation carousel (system name
xcloud) with your artwork. Picking it opens a fullscreen app that goes
straight to https://play.xbox.com/en-us/play (Xbox Cloud Gaming; the old
address www.xbox.com/en-us/play now redirects there) and can only go to
Microsoft's own sites:

  - xbox.com: Xbox Cloud Gaming (play.xbox.com), and the Xbox pages for
    signing up for or managing Game Pass
  - microsoft.com: the Microsoft Store (where Game Pass is bought) and
    your Microsoft account (account.microsoft.com)
  - live.com, microsoftonline.com, xboxlive.com: Microsoft and Xbox
    sign-in
  - aka.ms: Microsoft's own short links (ak.ms and other look-alikes are
    blocked)
  - paypal.com: for paying for Game Pass with PayPal (look-alikes are
    blocked)

Every other link, popup, page or download is blocked, and so is a link
that redirects somewhere else. Blocked attempts are written to
/userdata/system/logs/xcloud-app.log.

Back to the dashboard: on any page that isn't Xbox Cloud Gaming itself
(Game Pass sign-up, your Microsoft account, sign-in), a "Back to Xbox
Cloud Gaming" button sits at the top. Press the controller's View
button (Select / Share / -), the Home key, or click it. On those pages
the D-pad moves around, A selects, B goes back a page, and the on-screen
keyboard opens for typing.

Comes with Launch Single Game (installed automatically, see below), so
picking Xbox Cloud Gaming in the carousel opens the app straight away.

Also adds three shortcuts to F1 > Applications:
  Xbox Cloud Gaming             opens the app
  Xbox Cloud Gaming Settings    opens just the Settings screen (below)
  Xbox Cloud Gaming Uninstaller removes it, after asking first
(They're placed in /usr/share/applications, which is where Batocera's
F1 menu reads from, tagged "batocera.linux" like Batocera's own shortcuts
so its menu lists them, with copies in /userdata/system/.local/share/
applications. The system folder forgets them at every reboot, so the
xcloud service links them back at boot; if they ever vanish, check that
the service is on (System settings > Services) or run install.sh again.
On HippOS they go in the desktop's own menu folder instead.)
Nothing is put in the Ports menu.

No BUA needed. The app runs on Electron, a free, open-source browser
engine (the same kind Discord and VS Code are built on). The installer downloads it from Electron's
official GitHub releases and checks it against Electron's published
SHA-256 checksums.


Controller
----------
To exit back to EmulationStation, hold these two buttons together for
2 seconds (works everywhere, including during a game):
  Xbox                View + Menu
  PlayStation 4       Share + Options
  PlayStation 5       Create + Options
  Other controllers   Select + Start
On a keyboard: hold Esc for 2 seconds (a quick tap of Esc still goes
to the game). Alt+F4 should also close it (handled by Batocera's
window manager, not tested).

If the controller disconnects while the app is open (battery, Bluetooth,
cable), a message says so on screen, and another says when it's back.
A wireless controller whose battery Batocera can read gets a message when
it's low (at 15% and again at 5%).

Each time it opens, a short intro video plays (an Xbox controller
circles an Xbox on an entertainment center under a TV, shoots up into
the clouds, and it ends on the Xbox Cloud Gaming logo) while Xbox
Cloud Gaming loads behind it, so the site is ready when the video ends.
A, B, X, Menu, Enter or Space skip to the end of the video. Then the
welcome screen pops up on top of the site (the site stays loaded behind
it, and doesn't react to the controller while the welcome screen is
up). Turn the video off with "play_intro": false in config.json.

The welcome screen (which notes the app plays best with an Xbox
controller) shows these exit buttons named for
the controller you're using (it recognises the controller as soon as
you press any button on it), and waits for you to choose:
  "Got it, continue"        A on Xbox, Cross on PlayStation
  "Don't show this again"   Y on Xbox, Triangle on PlayStation
  "Settings"                View on Xbox, Share / Create on PlayStation
                            (Select on other controllers)
(or D-pad to pick one, then A). With a keyboard (or a controller that
Batocera maps to keys): arrow keys to pick, Enter, Space or X to select,
Y for "Don't show this again", Backspace (or S) for Settings. A mouse click works too.
The screen itself says which button opens Settings. After "Don't show
this again" it goes straight to xbox.com/play, and from then on it
opens straight to xbox.com/play.

To bring the welcome screen back at any time: while on xbox.com, hold
Menu (Options / + / Start) on its own for 1 second, or hold S on a
keyboard for 1 second (not while typing in a box). A quick tap of Menu
or S still goes to your game, and holding View + Menu still exits.
Note: in games played with a keyboard, S often means "move back", so
walking backwards for a second also brings up the welcome screen. Your game sees the Menu press too, so it may pause. From the
welcome screen, "Got it, continue" takes you back to Xbox and turns the
screen back on at start-up; "Don't show this again" keeps it off.

On xbox.com/play the controller works the way Xbox's own site handles it.

On the Microsoft sign-in pages:
  D-pad / left stick   move between boxes and buttons
  A                    press a button, or open the keyboard on a text box
  B                    go back
  Menu                 continue (Next / Sign in)

On-screen keyboard (Microsoft sign-in pages):
The sign-in box is selected for you as soon as it appears (also on the
password step), so you can start typing right away, and the on-screen
keyboard opens with it. Use it any of these ways, even mixed:
  Controller      D-pad / stick choose a key, A type it, X delete,
                  Y shift (capitals and symbols), B hide, Menu done
  Mouse           click the keys
  Real keyboard   just type; each key you press lights up on the
                  on-screen keyboard (can be turned off in Settings),
                  the preview at the top shows what
                  you've typed (passwords as dots), and Enter = Done
A box that takes only digits (a sign-in code, a phone number) gets a
number pad (1-9, 0, Delete, Done, Hide) instead.
The bottom row has Shift, .com, Space, Delete, Hide and Done. Done
presses the page's Next / Sign in button. Hide it with B, the Hide key
or a tap of Esc; select the box again (or click it) to bring it back.

The dashboard's search box: highlight it and press X (or A), and the
same keyboard opens. While it's open the controller types (Xbox doesn't
see it); Menu or Done searches, B hides it. Either way the box then lets
go, and the D-pad moves around the dashboard again.

A USB keyboard works too. Easiest sign-in: on the Microsoft page choose
to approve the sign-in with the Microsoft Authenticator app on your
phone, so there's less to type. You only sign in once; it's remembered.


Settings screen
---------------
Open it any of these ways:
  - press Backspace on a keyboard while on the dashboard (not while
    typing in a box, and not during a game); Save or Cancel takes you
    straight back to the dashboard
  - press View / Select on the welcome screen (Share or Create on
    PlayStation; Backspace or S on a keyboard), or pick its
    Settings button; afterwards you're back on the welcome screen (hold
    Menu while playing to get to the welcome screen)
  - F1 > Applications > Xbox Cloud Gaming Settings; the app closes
    when you're done

From the top:
  Controls                   opens a list of every button and key the
                             app uses (exit, welcome screen, Settings,
                             back to the dashboard, typing, skipping the
                             intro). B, A or Esc goes back to Settings;
                             up / down scroll it.
  Change user                opens the profile screen (see Profiles
                             below): pick another person's profile, add
                             one, or remove one. Only when opened from
                             the app (not the F1 shortcut).
  Reload dashboard           loads Xbox Cloud Gaming again (if it's stuck
                             or blank) and closes the popup so you can
                             watch it reload. Only when opened from the
                             app (not the F1 shortcut). R on a keyboard.
  Clear cache                deletes the app's stored copies of web
                             pages, pictures and scripts (and its
                             graphics cache) and says how much it freed.
                             Fixes pages that look out of date or broken,
                             and frees space. You stay signed in; use
                             Reload dashboard afterwards to load fresh.
  Region                     the country and language the Xbox site
                             opens in: every country where Xbox Cloud
                             Gaming is offered, with a choice of language
                             where the site has more than one (Canada,
                             Switzerland, Belgium). This picks the site's
                             language and store; Microsoft still decides
                             what you can play from where you actually
                             are and your account's country.
  Language                   the language of the app's own screens (the
                             welcome screen, Settings, messages and the
                             on-screen keyboard): English, Français,
                             Español, Português (Brasil / Portugal),
                             Deutsch, Italiano, Nederlands, Dansk, Suomi,
                             Norsk, Svenska, Polski, Čeština, Slovenčina,
                             Magyar, 日本語 or 한국어. The first choice,
                             "Same as Batocera", follows the language
                             Batocera is set to (the default; English if
                             Batocera's language isn't one of these). The
                             screen switches language as you pick one.
                             This doesn't change the Xbox site's own
                             language; Region does that. Controller button
                             names (View, Menu, Start...) stay as printed.
  Volume                     0 to 100% in steps of 10 (left / right): how
                             loud the app and your games are (just this
                             app; the Batocera system volume isn't
                             changed). A short beep plays at the new level
                             as you change it. Mute: A / Enter, or click
                             the switch; changing the level unmutes. Takes
                             effect as soon as you save.
  Light up keys when typing  real-keyboard keys lighting up on the
                             on-screen keyboard
  Intro video                Every time / Once a day (the first time
                             you open the app each day) / Off
  Intro video sound          the intro video's volume (left / right, 0 to
                             100%) and Mute (A / Enter, or click the
                             switch).
  Stream as a Windows PC     tells the Xbox site this is a Windows PC.
                             Off by default. Some people have reported a
                             sharper picture this way on Linux; Microsoft
                             says it has since improved Linux streaming,
                             so it may make no difference: try it and
                             compare. Changing it reloads the dashboard.
  Sign out of Xbox           signs out, so someone else can sign in with
                             their own account. Press it twice (the
                             button asks "Press again to sign out"). The
                             dashboard then reloads at the sign-in page
                             (from the F1 shortcut, the app closes).
  Sign out when closing      On / Off (default Off). On: every time you
                             exit the app, it signs out of Xbox, so the
                             next person has to sign in with their own
                             account (handy on a shared machine). Not
                             when only the F1 Settings shortcut was open.
  Batocera game list         Off (default) / All cloud games / Games I
                             pick. Off: Xbox Cloud in Batocera has one
                             entry, and picking the system opens the app
                             straight away (Launch Single Game). The other
                             two put the cloud games themselves in
                             Batocera's Xbox Cloud list, each with its box
                             art, background, logo, description,
                             developer, publisher, release date, genre and
                             rating from Microsoft's store catalog (no
                             sign-in needed). Xbox Cloud Gaming stays at
                             the top of the list and opens the app as
                             before. Picking a game opens the app straight
                             into it (see "Games in Batocera's list"
                             below).
                             All cloud games: every game Microsoft lists
                             for Xbox Cloud Gaming in your region
                             (several hundred), kept up to date every few
                             days when the app opens.
                             Games I pick: only the ones you add. Open a
                             game's page on the dashboard and press F8 on
                             the keyboard, or hold LB + RB + LT + RT on the
                             controller for a second: "<game> added to
                             Batocera's list" shows. Again takes it out. (Or press
                             Backspace there and switch on "This game in
                             Batocera's list".)
                             With Games I pick on, a game that's starting
                             shows a hint at the bottom saying how to add
                             it (or take it out).
                             The first time you choose Games I pick, a
                             short how-to explains this (OK, or Don't
                             show this again; delete pick-tip-hidden to
                             see it again).
                             3D game boxes and "This game in Batocera's
                             list" only appear while the list is on.
                             Changes show once you're back in Batocera
                             (the app asks EmulationStation to reload its
                             games when it closes). Off takes the games
                             out again; only files the app added are
                             removed, and play counts and favourites are
                             kept while a game stays in the list.
  3D game boxes              On / Off (default Off: the flat box art from
                             Microsoft). On: each game's picture in
                             Batocera's list is a 3D game case drawn from
                             its tall cover (or its box art): a black case with the app's
                             cloud logo and XBOX CLOUD GAMING across the
                             top over a glowing green line, and the game's
                             name down the spine. The flat box art stays
                             as the thumbnail. Drawing them takes a few
                             minutes for the whole cloud library (150-350
                             KB a game, roughly 100-130 MB in all). Drawn
                             with Pillow (Python's picture library) when
                             Batocera has it, otherwise by the app's own
                             browser engine; they show once you're back
                             in Batocera. Grid views crop every picture to
                             fill their tiles, so a tall box shows only its
                             middle there; the detailed view shows it whole.
  Save logs for help         saves the app's logs, its settings and a
                             short summary
                             (versions, Batocera, controller batteries)
                             as one zip in Batocera's share folder
                             (/userdata, "share" on the network), named
                             xcloud-logs-<date>-<time>.zip. Gamertags and
                             Xbox user numbers are replaced, and nothing
                             about anyone's sign-in is included. Send that
                             file to whoever is helping you.
  Update engine              shows the version of the browser engine the
                             app runs on (Electron). Press it to look for
                             a newer engine; if there is one, press it
                             again to download it (about 100 MB, checked
                             against Electron's published checksums). The
                             app keeps working while it downloads; the
                             new engine takes over the next time you open
                             the app. Needs about 400 MB free space.

Controller: D-pad up/down to move, left/right to change, A to select
(toggles a switch, presses Save or Cancel), Menu to save, B to cancel.
Keyboard: arrow keys, Enter, S to save, Esc to cancel. The mouse works
too. Changes are saved to config.json; everything else in that file is
left as it is. Once profiles are set up, each profile's changes are
saved to its own file instead (profile-settings/<profile>.json) and
config.json isn't changed.


Games in Batocera's list
------------------------
With Settings > Batocera game list on, picking a game in Batocera's Xbox
Cloud list opens the app straight into that game: no intro video and no
welcome screen. With more than one profile, "Who's playing?" comes first.
Age ratings: each game's description in Batocera's list starts with its
age rating (for example "Rated ESRB E10+"), from Microsoft's catalog, in
your region's rating system where it has one (ESRB, PEGI, USK, CERO, ACB).
Games rated E / E10+ (PEGI 3 / 7 ...) are marked as kid-friendly, so
Batocera's own Kid mode shows them. Games for adults only (ESRB M / AO,
PEGI 18, USK 18, CERO D / Z, ACB R18+) are marked not-for-kids and get
"Adult" added to their genre (Batocera has no separate adult flag), so a
genre filter or collection can leave them out. The ratings are
information only: the app doesn't stop any game from starting. What a
child's or teen's account may play or buy is up to Microsoft's own
family settings, which Xbox applies to that account.

An adult's account signing in on a child's or teen's profile needs the
PIN: without it, that sign-in is signed out again and the profile stays
as it was.

Coming back from a game lands on Batocera's game list (as with any other
system), not the carousel. With the setting off, nothing changes: the
system opens the app and closing it goes back to the carousel.

The files: each game is a small file in /userdata/roms/xcloud named after
the game, holding its Microsoft Store ID; its pictures are in
/userdata/roms/xcloud/images (about 150 KB a game; the backgrounds are
skipped when space is short). The list of what the app added is
gamelist-state.json, the games you picked picked-games.json (both in
/userdata/system/add-ons/xcloud). Batocera needs restarting once after
installing this version, for game entries to open their game.


Children's and teens' accounts
------------------------------
The app doesn't limit children's or teens' accounts itself: Microsoft
does, from the age on the Microsoft account and your Microsoft Family
settings (a teen's account trying a game it isn't allowed gets "ask a
parent for permission", and can't buy a subscription). What the app
does is keep them out of adults' profiles with the PIN (see Profiles).

How it knows: when an account signs in, Xbox's sign-in service tells
the Xbox site the account's age group (Adult, Teen or Child). The app
reads that answer; it never sends anything anywhere. The age group is
written to xcloud-app.log ("account age group: ...").


Profiles
--------
Profiles
--------
Each person who plays on the machine can have a profile, with their
own Xbox sign-in and their own Settings (region, language, volume,
intro video, and so on). Switching is instant: nobody signs out.

How they start: the first person who signs in becomes the first profile
(nothing changes for them). When someone else signs in, the app asks
"Set up profiles?":
  Set up profiles    they get a profile with this sign-in. The person
                     who was here before keeps their profile, and signs
                     in to it again the next time it's picked.
  Not now            nothing changes (asked again next time)
  Don't ask again    never asked again (profiles can still be added with
                     Settings > Change user)

With two or more profiles, "Who's playing?" comes up every time the app
opens, after the welcome screen (or after the intro video, if the
welcome screen is off), and before a game picked in Batocera's list
opens. The dashboard of whoever played last is already loading behind
it; a game from the list waits until someone is picked. Controller: left / right to pick, A to choose, Y
twice to remove a profile, B to keep the one that's loading. Keyboard:
arrow keys, Enter, Y (or Delete), Esc. Add profile makes a new, empty
profile that signs in straight away. Settings > Change user brings up
the same screen at any time.

Each tile shows the person's gamerpic: once they've signed in, the app
asks Xbox's own profile service (profile.xboxlive.com, with that
person's own sign-in) for their gamerpic and keeps a small copy with
the profile. If that doesn't work, it copies the picture the dashboard
shows in its top corner straight off the screen instead. Until then,
or if neither finds a picture, the tile shows the first letter of the
gamertag. xcloud-app.log (in Batocera's logs folder) says which way it got it.

PIN for adult profiles: once a child's or teen's profile exists, adult
profiles need a 4-number PIN. The app asks for one the next time an
adult's profile is playing, or when an adult's profile is picked; until
it's made, adult profiles don't open. After that the PIN is needed to:
  - open an adult's profile (a child's or teen's profile never needs
    it), also from Settings > Change user: switching to a child's or
    teen's profile locks the adults' profiles again
  - add or remove a profile
  - use the F1 > Applications > Xbox Cloud Gaming Settings shortcut in
    an adult's profile
Controller: D-pad and A on the number pad, X to delete; or type the
numbers on a keyboard. The PIN is stored as a salted hash in
/userdata/system/add-ons/xcloud/pin, never as the numbers themselves.

Forgot the PIN? Create a file named reset-pin in
/userdata/system/add-ons/xcloud (F1 > Files, or over the network), or
delete the file named pin there. The next time the app opens, the PIN
is cleared (and reset-pin is removed); create a new one from an adult's
profile.

The PIN only protects things inside this app. It doesn't change
Batocera, and someone with access to Batocera's files can reset it as
above. Microsoft Family settings on the accounts are the real
protection; this is a convenience on top.

Files (in /userdata/system/add-ons/xcloud):
  profiles.json          the profiles and who played last
  profile-settings/      each profile's own Settings choices
  profile-pics/          each profile's gamerpic
  pin                    the PIN (salted hash); delete it to clear the PIN
  profile/               the sign-ins (each profile has its own storage)


Small things it does for you
----------------------------
- Keeps the screen awake while the app is open. Playing with only a
  controller doesn't count as activity for Linux's screen blanking.
- Hides the mouse cursor after 3 seconds without moving the mouse; it
  comes back as soon as you move it.
- Puts the F1 > Applications shortcuts back if they go missing. They
  have to live in a system folder that a Batocera update replaces; the
  next time you open Xbox Cloud Gaming from the carousel, they're
  restored from the copies kept in /userdata.
- Keeps its log small: over 1 MB, it keeps just the newest part.
- Carousel artwork in other themes: besides Carbon (logo and
  background), the installer looks in every installed theme
  (/usr/share/emulationstation/themes and /userdata/themes) for the
  folder where it keeps a PNG logo for each system, and puts the xcloud
  logo there. Themes that only use SVG logos show the name "xcloud"
  instead. Installed a new theme? Run install.sh again. Uninstall
  removes everything it added.


What's in this zip
------------------
Copy the whole "Xbox Cloud Gaming" folder to the Batocera share.

  install.sh                        installs everything (run in a terminal)
  uninstall.sh                      removes it (run in a terminal)
  README.txt                        this file
  system/add-ons/xcloud/
    xcloud.png                      your artwork: the carousel logo
    xcloud1.png                     your artwork: a second Xbox Cloud logo
                                    for Carbon-style themes
    xcloud-background.jpg           carousel background for Xbox Cloud
                                    Gaming (1920x1080 JPG)
    xcloud-icon.png                 the Xbox cloud emblem on a transparent
                                    background (512x512): the picture on
                                    the Xbox Cloud Gaming entry, and the
                                    "Xbox Cloud Gaming" F1 shortcut icon
    xcloud-uninstall-icon.png       icon for "Uninstall Xbox Cloud
                                    Gaming": the cloud with a red
                                    trash-can badge
    xcloud-intro.mp4                the intro video played when the app
                                    opens (1080p, 12 s, with sound: an
                                    original sound track made for it)
    xcloud-settings-icon.png        icon for "Xbox Cloud Gaming
                                    Settings": the cloud with a gear badge
    es_systems_xcloud.cfg           the xcloud system definition
    gamelist.xml                    name and picture for the entry
    launchsingle/                   Launch Single Game (two small scripts)
    Install-XboxCloudGaming.sh      the installer (install.sh runs it)
    Launch-XboxCloudGaming.sh       starts the app
    Return-To-Carousel.py           after the app closes, takes
                                    EmulationStation back to the carousel
    Run-App.sh                      sets up the app's environment
    uninstall.sh                    the uninstaller (stays with the
                                    installed files)
    Uninstall-From-Menu.sh          opens the uninstaller in a terminal
                                    window, for the F1 shortcut
    Build-Runtime.py                downloads and sets up Electron
    config.json                     settings (start page, allowed sites)
    app.asar                        the app itself, packed for Electron
    app-source/                     the app's source code (readable copy
                                    of what's inside app.asar)
    lib/x64/ lib/arm64/ lib/armv7l/  libcups.so.2 for PCs, 64-bit ARM and
                                    32-bit ARM: a stand-in for the printing
                                    library Electron requires but Batocera
                                    lacks (does nothing; source:
                                    lib/cups-stub.c).
                                    Only used when BUA isn't installed and
                                    Batocera has no real one. With BUA
                                    installed, BUA's libraries are used.

Nothing goes in the Ports menu (roms/ports), and the installer clears
out entries older versions left there.


Compatibility
-------------
Xbox Cloud Gaming runs on any Batocera device that can run its browser
engine (Electron), with an internet connection. The installer checks the
device first: on hardware that can't run it, it stops and installs
nothing; with less than 2 GB of memory it warns you and installs anyway.
It works with both of Batocera's screen systems: X11 (PCs) and Wayland
(labwc, on most ARM boards and newer handhelds).

How well it plays depends mostly on the processor: the game stream is a
video that has to be decoded as it arrives, and on ARM boards that is
usually done by the processor alone.

Tested so far: 64-bit PC builds of Batocera v42 and v44. The rest of this
list is what to expect from each device's processor and memory; it
hasn't been tried on every board. If you try one, the log
(/userdata/system/logs/xcloud.log) shows the device, memory and screen
system on its first lines.

  Batocera build / devices                                   Expect
  ---------------------------------------------------------  -----------------
  PCs (x86_64): desktops, laptops, mini PCs                  plays well (tested)
  PC handhelds (x86_64 / zen3): Steam Deck, ROG Ally,
    Legion Go and similar                                    should play well
  Raspberry Pi 5 (bcm2712)                                   should play well
  RK3588: Orange Pi 5 / 5 Plus, Radxa Rock 5B and similar    should play well
  Qualcomm (sm8250, sm8550, qcs6490): AYN Odin 2,
    Retroid Pocket 5 / Mini and similar handhelds            should play well
  Amlogic A311D2 (a3gen2): Khadas VIM4                       should play well
  Amlogic S922X: Odroid N2 / N2+, Odroid GO Ultra            should work
  Raspberry Pi 4 / 400 / CM4 (bcm2711), 2 GB or more         should work; may
                                                             stutter at times
  RK3568 / RK3566: Odroid M1, Anbernic RG353 series,
    Anbernic RG-DS and similar; RK3399 boards                works; may stutter
  Amlogic S905X2 / X3 / X4 / Y4 (s905gen2, s905gen3,
    s9gen4: TV boxes, Khadas VIM1S); Allwinner H6 / H616     works; may stutter
  RK3326: Anbernic RG351 series, Odroid Go Advance / Super,
    Powkiddy RGB10 and similar (1 GB)                        too slow / too
  Allwinner H700: Anbernic RG35XX family, RG40XX, RG28XX    little memory to
    (1 GB); Allwinner H5; Amlogic S905 (first generation);   be playable
    Raspberry Pi 3 (1 GB)
  32-bit ARM (ARMv7): ODROID-XU4, Raspberry Pi 2, RK3288,
    RK3128, Allwinner H3                                     runs, but too slow
                                                             to be playable
  Raspberry Pi 1 / Zero / Zero W (bcm2835, ARMv6)            not supported (no
                                                             browser engine);
                                                             the installer stops
  32-bit x86 PCs                                             not supported

What you need:
  - an internet connection. Microsoft recommends a fast, steady one for
    cloud gaming (around 20 Mbps); wired or 5 GHz Wi-Fi works best
  - an Xbox account with a Game Pass plan that includes cloud gaming, in
    a country where Xbox Cloud Gaming is offered
  - about 400 MB of free space in /userdata (for the browser engine)
  - a controller (best: an Xbox controller), or a keyboard and mouse

Tips for ARM boards:
  - If the picture stutters, try "gpu_acceleration": true in config.json
    (it asks the engine to use the graphics chip more); set it back to
    false if things get worse.
  - Close other apps, and use a wired connection if you can.
  - BUA isn't needed: the package brings its own stand-in printing
    library for PCs, 64-bit ARM and 32-bit ARM.


Install with install.sh (easiest)
---------------------------------
Batocera needs to be online for the first install (about 100 MB), and
needs at least 400 MB free space. Check with:  df -h /userdata
A Batocera image starts with a very small storage area that's meant to
grow to fill its disk; in a virtual machine, enlarge the virtual disk
first (16 GB or more is a good size).

1. Copy this whole folder ("Xbox Cloud Gaming") onto the Batocera
   network share, at the top level, so it ends up at
   /userdata/Xbox Cloud Gaming on the device.
2. Open a terminal on Batocera: F1 > Applications > xterm, or SSH in.
3. Run:
     bash "/userdata/Xbox Cloud Gaming/install.sh"
   (keep the quotes; the folder name has spaces)
4. Answer Y to restart EmulationStation.

It installs everything in one go, with no questions: the xcloud system,
your carousel logo and background, the app (downloading the newest
browser engine), Launch Single Game, and the three F1 > Applications
shortcuts. It also clears out Ports entries left by older versions.
Running it again is safe: it updates the files, keeps your config.json
settings and your Launch Single Game list, and always fetches the
newest browser engine (if the one installed is older; if there's no
internet, the installed one is kept).

The Xbox Cloud Gaming entry in the list gets a description, developer,
publisher, genre, players and release date. If the xcloud system
already has a gamelist.xml, only that entry is replaced; anything else
in it (other entries) is kept.

If there was no internet during the install, it still finishes; the
download happens the first time you launch Xbox Cloud Gaming instead.


Launch Single Game (included)
-----------------------------
This package comes with Launch Single Game and installs it for you.
When you pick a system in the carousel and that system holds exactly
one game, the game starts straight away instead of showing a list with
one item. That's how Xbox Cloud Gaming opens the app as soon as you
pick it. It starts the game the moment the list opens, so the list
hardly shows.

To make it quicker still: EmulationStation plays a short zoom (about
0.75 s) before starting any game. Main menu > User Interface Settings >
Game launch transition > Instant skips it (for every game, not just
this one).

It only does this for the systems named in its list:

    /userdata/system/launchsingle.systems

(on your PC: the "system" folder of the Batocera share, e.g.
\\BATOCERA\share\system\launchsingle.systems or Y:\system\launchsingle.systems)

The installer adds xcloud to that list. To add other systems:

1. Find the system's short name. It's the same as its folder name under
   /userdata/roms, e.g. ports, nes, snes, megadrive, n64, psx. For a
   custom system it's the <name> in its es_systems_*.cfg file.
2. Add it to the list, one name per line. Either edit the file in any
   text editor (Notepad over the network share is fine), or in a
   Batocera terminal run, for example:
     echo nes >> /userdata/system/launchsingle.systems
3. That's it. No restart needed; the list is read each time you pick a
   system. The system must hold exactly one game file for it to open
   straight away; with more than one, you get the normal game list.

Example list:

    # Launch Single Game: systems that open their game straight away
    xcloud
    ports
    nes

Notes:
  - Lines starting with # are ignored. Watch for spaces after a name.
  - To take a system off, delete its line.
  - Delete the whole file and every system with exactly one game opens
    straight away. An empty list switches it off for every system.
  - Each attempt is logged to /tmp/launchsingle.log (with the number of
    game files it found), which helps if a system doesn't open.
  - The scripts it adds:
      /userdata/system/configs/emulationstation/scripts/system-selected/launchsingle-arm.sh
      /userdata/system/configs/emulationstation/scripts/game-selected/launchsingle-launch.sh


Settings (config.json)
----------------------
Region, Language, Volume and key highlights are easier to change on the
Settings screen; the rest are only here.

  start_url          the page it opens (Settings > Region sets this),
                     e.g. https://play.xbox.com/en-gb/play. Any other
                     play.xbox.com address shows as "Custom" in Settings
                     and is kept unless you pick a region (an old www.xbox.com/<region>/play address is
                     changed to play.xbox.com automatically, which
                     skips a redirect)
  allowed            extra pages it may open, added to the built-in
                     list (Microsoft's sites above are always allowed,
                     even if they're not listed here)
  user_agent         leave empty; only for advanced troubleshooting
  exit_hold_seconds  how long to hold the exit buttons or Esc (0.5 to 10)
  show_exit_tip      true shows the "how to exit" (welcome) screen at
                     start; false never shows it (holding Menu while
                     playing still opens it)
  volume             0 to 100 (default 100): the app's sound level
  language           "auto" (default) = the same as Batocera, or one of:
                     en fr es pt-BR pt-PT de it nl da fi nb sv pl cs sk
                     hu ja ko
  play_intro         true (default) plays the intro video every time the
                     app opens, "daily" the first time each day, false
                     never (Settings > Intro video)
  intro_volume       0 to 100 (default 100): the intro video's volume
  intro_muted        false (default); true plays the intro video silently
  stream_as_windows  false (default); true = Settings > Stream as a
                     Windows PC
  keyboard_highlight true (default): keys you type on a real keyboard
                     light up on the on-screen keyboard. false turns the
                     light-up off (typing, Enter = Done and everything
                     else still work the same)
  gpu_acceleration   false (default). true asks Chromium to use the
                     graphics card even where it normally wouldn't. It can
                     make xbox.com draw faster, or cause glitches, mostly
                     depending on the machine (in a virtual machine
                     without a real GPU it often doesn't help). Compare
                     the "Xbox page loaded in ..." lines in
                     xcloud-app.log, and turn it back off if it's worse.
  muted              true: the app's sound is off (Settings > Volume)
  return_to_carousel true (default): when you exit the app after picking
                     it from the carousel, EmulationStation goes back to
                     the main carousel instead of the Xbox Cloud Gaming
                     list. When the app closes, EmulationStation
                     reopens its screen and reloads its game lists with
                     its controls locked (a press then is ignored), and
                     shows the Xbox Cloud Gaming list again along the
                     way. Launch Single Game reports when EmulationStation
                     reloads (it announces its carousel then), and right
                     after that the app asks it (through its own local web service,
                     127.0.0.1:1234) to press its back button; that
                     follows "Switch A/B buttons". If the web service
                     can't be reached, it taps Esc on a short-lived
                     virtual keyboard instead. What happened, with
                     timings, is written at the end of
                     /userdata/system/logs/xcloud.log ("return to
                     carousel: ..."). While it's on its way back,
                     Launch Single Game won't start the app again.
                     false turns this off.
  return_to_carousel_delay
                     only used if the reload isn't reported (Launch
                     Single Game removed): the shortest wait, in
                     seconds, after the app has finished (default 0.3);
                     it then also waits for EmulationStation to go quiet,
                     up to 10 seconds.
  sign_out_on_exit   false (default); true: sign out of Xbox every time
                     the app closes (Settings > Sign out when closing)
  controller_fix     true (default): a controller the browser doesn't
                     recognise (a Steam Deck's built-in controls, many
                     third-party pads) reaches Xbox in its raw order:
                     left stick, left trigger, right stick, right
                     trigger. The app puts it into the standard Xbox
                     layout first, so the right stick and triggers work.
                     The controller's name, and whether it was put into
                     the Xbox layout, is written to xcloud-app.log
                     ("controller: ..."). false turns this off (only if
                     a controller works worse with it).
  game_list          "off" (default), "all" or "picked": Settings >
                     Batocera game list
  game_list_3d       false (default); true: 3D game boxes in that list
  electron_version   leave empty (the default) so the installer and Update
                     engine always use the newest Electron; or pin a
                     version from github.com/electron/electron/releases

Allowed-site rules: "host" allows a whole site; "host/path" allows that
path and everything under it; "*" in a path matches one part such as
en-us. So "www.xbox.com/*/play" allows /en-us/play/... but not the
Xbox store. The start page is always allowed.

If sign-in ever gets stuck on a blank or "not available" step, look at
/userdata/system/logs/xcloud-app.log for a "blocked" line, and add that
site to "allowed".

If config.json has a typo, the app uses its built-in settings and says
so in the log, so it never fails to start because of a settings mistake.

To update the engine later: Settings > Update engine, run install.sh
again, or:
  python3 /userdata/system/add-ons/xcloud/Build-Runtime.py --force


Uninstall
---------
Easiest: F1 > Applications > Xbox Cloud Gaming Uninstaller.
Or in a Batocera terminal:

     bash /userdata/system/add-ons/xcloud/uninstall.sh

(or uninstall.sh in this folder, which does the same). Either way, a
terminal window opens and it first says:

     You are about to remove Xbox Cloud Gaming.
     Are you sure? [y/N]

Anything but y stops there and changes nothing.

When a child or teen plays on this machine (a child's or teen's profile
is set up), it first asks for the adult PIN, the same one the app uses.
Three wrong tries, or no PIN set yet, stops it with nothing changed
(create the PIN by opening an adult's profile in the app). This applies
to --all too. Someone who can delete files from Batocera's file manager
can still remove the folder.

After y it asks:

  - "Keep Launch Single Game for your other systems?" (default: keep)
    Keep it if other systems use it. Your launchsingle.systems list is
    kept either way.
  - "What should be kept for a later reinstall?"
      1) Keep everything (the default): everyone's Xbox sign-ins,
         profiles, PIN and settings stay in /userdata/system/add-ons/xcloud
         (with a note, KEPT-FOR-REINSTALL.txt), so a reinstall picks up
         where you left off: nobody signs in again or sets up the PIN.
      2) Remove the profiles, keep the settings: everyone's sign-in, the
         profiles, gamerpics and the PIN are removed; your Settings
         choices (config.json) and picked games stay.
      3) Remove everything.

Then it removes everything automatically and offers to restart
EmulationStation: the xcloud system, its entry, the carousel logo and
background (restoring anything the themes had before), the downloaded
browser engine, all three F1 > Applications shortcuts, and xcloud from the
Launch Single Game list. From the F1 shortcut, the window waits for
Enter at the end so you can read what it did.

To remove everything, Launch Single Game included, without being asked:

     bash /userdata/system/add-ons/xcloud/uninstall.sh --all


Troubleshooting
---------------
Logs:
  /userdata/system/logs/xcloud-install.log   install / uninstall result
  /userdata/system/logs/xcloud.log           each launch (engine setup,
                                             missing system libraries)
  /userdata/system/logs/xcloud-app.log       inside the app: blocked
                                             pages, load errors, exits
  Settings > Save logs for help puts all of these (and the settings) in
  one zip in the share folder, ready to send.

- Picking Xbox Cloud Gaming flashes and returns: check xcloud.log.
  "No space left on device" or "Not enough free space" means Batocera's
  storage is full; see the install section about making it bigger.
  "Could not set up the browser engine" means it couldn't download
  Electron (no internet?). "Missing libraries" lists system libraries
  Batocera doesn't have; send me that list.
- "Can't reach Xbox Cloud Gaming" screen: Batocera is offline. Press A
  or Enter (or click Try again) to retry.
- The start screen doesn't respond: xcloud-app.log shows "start screen
  shown" when it opens, and a line for each choice that arrives (with
  how it arrived: controller, or keyboard/mouse).
- A page you need is blocked: see Settings above.
- Carousel logo or background not showing: the installer puts them where
  the theme looks (art/logos/xcloud.png and xcloud-w.png, and
  art/background/xcloud.jpg, plus the br/ jp/ us/ region folders the
  theme has). Restart EmulationStation after installing.
- Carousel logo missing after a reboot: built-in themes are in Batocera's
  system area; the xcloud service links the logo back at boot (see
  xcloud-boot.log). On HippOS only themes in /userdata/themes get it.
  The picture on the Xbox Cloud Gaming entry is kept regardless.


Credits and trademarks
----------------------
This is an unofficial project - use at your own risk. It is not
affiliated with, endorsed by, or sponsored by Microsoft or Xbox; all
trademarks, product names, and company names or logos mentioned herein
are the property of their respective owners.

Not affiliated with Microsoft. Xbox, Xbox Cloud Gaming, Xbox Game Pass,
the Xbox logo, Microsoft and Windows are trademarks of the Microsoft
group of companies. PayPal is a trademark of PayPal, Inc. They're named
here only to say what the app opens and works with.

- The app: made for this package. It runs on Electron (MIT License,
  github.com/electron/electron), downloaded from Electron's official
  releases.
- The intro video and its sound: original, made for this package. The
  sound was synthesized from scratch (no Microsoft sounds or music);
  the console, controller and room are built from the package owner's
  own photos.
- The controller emoji on the start screen is from Google's Noto Color
  Emoji (Apache License 2.0), built in as a small picture so it shows
  even though Batocera has no emoji font.
- Japanese and Korean text uses small parts of Noto Sans CJK (SIL Open
  Font License 1.1), built in because Batocera has no CJK font.
- Translations of the app's screens: made for this package.
- Batocera (batocera.org) and EmulationStation are their own projects;
  this package only adds a system to them.


Status
------
Launch Single Game: confirmed working on Batocera v42-44 (this package
installs the same version).

The app was tested off-device: the site rules (32 checks, including
look-alike addresses), the app logic against a simulated Electron (146
checks, including Settings, Controls, Update engine, Clear cache and children
mode), the controller and keyboard code (15 checks), the Electron
download (good, damaged and offline cases) and the full install /
launch / uninstall flow in a simulated Batocera layout. It has not yet
run on a real Batocera machine, so the first real launch is the test
that matters, especially whether Batocera has every library Electron
needs, and whether every Microsoft sign-in step is on the allowed list.
