#!/usr/bin/env python3
"""After Xbox Cloud Gaming closes, take EmulationStation back to the main
carousel (it would otherwise come back on the Xbox Cloud Gaming game list).

How: EmulationStation has a small web service for local programs
(127.0.0.1:1234, the same one Launch Single Game uses to start the app).
This script waits until EmulationStation says the app has finished
(/runningGame). EmulationStation then keeps its controls locked while it
rebuilds its screens (it reloads every game list, and lands back on the
Xbox Cloud Gaming list); a "back" press during that is ignored. So the
script waits until EmulationStation has gone quiet (its processor use
drops), and only then asks it to press its "back" button (/input), which
goes from the game list to the carousel. The button is whichever one
EmulationStation uses for back (it follows "Switch A/B buttons" in its
settings).

If that web service can't be reached, it falls back to tapping Esc on a
short-lived virtual keyboard (the way Batocera's evmapy does it).

  Return-To-Carousel.py                 do it now
  Return-To-Carousel.py --armed FILE    wait until FILE appears (the
                                        launcher creates it when the app
                                        closes), then do it. Gives up
                                        quietly if the launcher goes away
                                        without creating FILE.

Settings in config.json:
  "return_to_carousel": true          false turns this off
  "return_to_carousel_delay": 0.8     at least this many seconds after the
                                      app has finished before pressing back
                                      (it also waits for EmulationStation to
                                      go quiet, up to 10 seconds)
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

FILES = os.environ.get("XCLOUD_HOME", "/userdata/system/add-ons/xcloud")
LOG = os.environ.get("XCLOUD_RETURN_LOG", "/userdata/system/logs/xcloud.log")
ES_API = os.environ.get("XCLOUD_ES_API", "http://127.0.0.1:1234")
ES_SETTINGS = os.environ.get("XCLOUD_ES_SETTINGS", "/userdata/system/configs/emulationstation/es_settings.cfg")
DEFAULT_DELAY = 0.3   # at least this long after EmulationStation reports the app has finished
SETTLE_QUIET = 0.3    # EmulationStation quiet (little processor use) for this long...
SETTLE_LIMIT = 10.0   # ...or give up waiting after this long, and press back anyway
BUSY_SHARE = 0.25     # more than a quarter of one processor core counts as busy
ES_BACK_TIMEOUT = 20  # seconds to wait for EmulationStation to finish with the app
MAX_WAIT = 12 * 3600  # an armed script never outlives a long session
# a local-only opener: never send these requests through a proxy
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def log(msg):
    try:
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(f"{time.strftime('%a %b %d %H:%M:%S %Y')}: {msg}\n")
    except OSError:
        pass


def settings():
    enabled, delay = True, DEFAULT_DELAY
    try:
        with open(os.path.join(FILES, "config.json"), encoding="utf-8") as f:
            cfg = json.load(f)
        enabled = cfg.get("return_to_carousel", True) is not False
        d = float(cfg.get("return_to_carousel_delay", DEFAULT_DELAY))
        if 0 <= d <= 15:
            delay = d
    except (OSError, ValueError, TypeError):
        pass  # missing or broken config.json: use the defaults
    return enabled, delay


def es_request(path, body=None, timeout=2.0):
    """(status, text) from EmulationStation's local web service, or (0, error)."""
    req = urllib.request.Request(ES_API + path, data=body.encode() if body is not None else None,
                                 method="POST" if body is not None else "GET")
    try:
        with OPENER.open(req, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as err:
        return err.code, ""
    except Exception as err:  # not running, refused, timed out...
        return 0, str(err)


def back_button():
    """EmulationStation's name for its back button. On Batocera (Linux) "b"
    is OK (select / launch) and "a" is back; "Switch A/B buttons" in its
    settings (InvertButtons) swaps them. Never send OK here: on the game
    list it would start the app again."""
    try:
        with open(ES_SETTINGS, encoding="utf-8", errors="replace") as f:
            text = f.read()
        if re.search(r'name="InvertButtons"\s+value="true"', text):
            return "b"
    except OSError:
        pass
    return "a"


def wait_for_es():
    """Wait until EmulationStation has finished with the app. True when it
    has (and its web service answers), False when it can't be reached."""
    start = time.time()
    seen = False
    while time.time() - start < ES_BACK_TIMEOUT:
        status, text = es_request("/runningGame", timeout=1.0)
        if status == 201 or (status == 200 and "NO GAME RUNNING" in text):
            return True
        if status:
            seen = True  # it answers, but still thinks the app is running
        elif not seen and time.time() - start > 3:
            return False  # nothing is listening: EmulationStation's web service is off
        time.sleep(0.05)
    return seen


def es_pid():
    """EmulationStation's process id (or None)."""
    if os.environ.get("XCLOUD_ES_PID"):
        return int(os.environ["XCLOUD_ES_PID"])
    # Linux cuts process names to 15 letters ("emulationstatio"), and
    # Batocera's start-up script (emulationstation-standalone) gets the same
    # cut name, so check which program is actually running
    for name in os.listdir("/proc"):
        if not name.isdigit():
            continue
        try:
            with open(f"/proc/{name}/comm", encoding="utf-8") as f:
                if not f.read().strip().startswith("emulationstatio"):
                    continue
            if os.path.basename(os.readlink(f"/proc/{name}/exe")) == "emulationstation":
                return int(name)
        except OSError:
            pass
    return None


def cpu_ticks(pid):
    try:
        with open(f"/proc/{pid}/stat", encoding="utf-8") as f:
            fields = f.read().rsplit(")", 1)[1].split()
        return int(fields[11]) + int(fields[12])  # user + system time
    except (OSError, IndexError, ValueError):
        return None


def signal_count():
    """How many times EmulationStation has shown the Xbox Cloud Gaming list
    since the app closed (Launch Single Game adds a line each time)."""
    try:
        with open(BACK_SIGNAL, encoding="utf-8", errors="replace") as f:
            return sum(1 for _ in f)
    except OSError:
        return 0


def wait_until_quiet(min_wait):
    """After a game, EmulationStation re-opens its screen and reloads every
    game list, with its controls locked; a press before the reload is done
    is ignored. It shows the game list during that (more than once: the
    first time while still locked), so: wait until it has shown the list
    and then gone quiet for a moment (its processor use drops), which
    means the reload is finished."""
    start = time.time()
    pid = es_pid()
    hz = os.sysconf("SC_CLK_TCK") if hasattr(os, "sysconf") else 100
    step = 0.03
    window = 0.15                 # processor use is measured over this long
    samples = []                  # (time, ticks)
    peak = 0.0
    quiet_since = None
    signals = signal_count()
    last_signal = start if signals else None
    events = []
    while time.time() - start < SETTLE_LIMIT:
        time.sleep(step)
        now = time.time()
        # the clearest sign: EmulationStation announced its carousel while
        # reloading (a press now waits in line until the reload is done)
        if os.path.exists(RELOAD_SIGNAL):
            return f"reloaded after {now - start:.1f}s (showed the list {signals}x: {' '.join(events) or '-'})"
        n = signal_count()
        if n != signals:
            signals = n
            events.append(f"list@{now - start:.2f}")
        if now - start < RELOAD_WAIT:
            continue
        if signals:
            # Launch Single Game is there but no reload was reported: by now
            # it has surely finished
            return f"no reload reported, pressed after {now - start:.1f}s (showed the list {signals}x: {' '.join(events)})"
        n = signal_count()
        if n != signals:
            signals = n
            last_signal = now
            quiet_since = None    # it's (still) busy reloading
            events.append(f"list@{now - start:.2f}")
        ticks = cpu_ticks(pid) if pid else None
        if ticks is None:
            # can't see EmulationStation's processor use: go by the list alone
            if last_signal is not None and now - last_signal >= 2.5 and now - start >= min_wait:
                return f"showed the list {signals}x, {now - start:.1f}s ({' '.join(events)}; couldn't find EmulationStation's process)"
            if last_signal is None and now - start >= max(min_wait, 4.0):
                return "waited 4s (couldn't find EmulationStation's process)"
            continue
        samples.append((now, ticks))
        while len(samples) > 2 and now - samples[1][0] >= window:
            samples.pop(0)
        span = now - samples[0][0]
        if span < window * 0.8:
            continue
        share = (ticks - samples[0][1]) / hz / span
        peak = max(peak, share)
        # busy: a good share of one core, compared with the busiest moment seen
        # (an emulated machine without a graphics chip is never really idle)
        busy = share > max(BUSY_SHARE, 0.55 * peak)
        if busy:
            quiet_since = None
        elif quiet_since is None:
            quiet_since = now
        ready = last_signal is not None or now - start >= 2.5
        if ready and now - start >= min_wait and quiet_since is not None and now - quiet_since >= SETTLE_QUIET:
            return (f"quiet after {now - start:.1f}s, showed the list {signals}x "
                    f"(peak {peak:.2f} cores; {' '.join(events) or 'no list signal'})")
    return f"still busy after {SETTLE_LIMIT:g}s (showed the list {signals}x, peak {peak:.2f} cores; {' '.join(events)})"


def press_back_via_es(delay):
    if not wait_for_es():
        return False
    how = wait_until_quiet(delay)
    name = back_button()
    status, text = es_request("/input", body=name)
    if status == 200:
        log(f'return to carousel: pressed EmulationStation\'s back button ("{name}"); EmulationStation {how}')
        return True
    log(f"return to carousel: EmulationStation didn't take the back button ({status} {text.strip()[:80]})")
    return False


KEYBOARD_ERROR = ""


def make_keyboard():
    global KEYBOARD_ERROR
    try:
        from evdev import UInput, ecodes as e
        return UInput({e.EV_KEY: [e.KEY_ESC]}, name="xcloud-return-to-carousel"), e
    except Exception as err:  # no python evdev, or no permission for /dev/uinput
        KEYBOARD_ERROR = str(err)
        return None, None


def tap_esc(ui, e, delay):
    wait_until_quiet(max(delay, 1.1))  # EmulationStation back on screen, reload done
    ui.write(e.EV_KEY, e.KEY_ESC, 1)
    ui.syn()
    time.sleep(0.05)
    ui.write(e.EV_KEY, e.KEY_ESC, 0)
    ui.syn()
    time.sleep(0.2)  # let the key arrive before the keyboard disappears
    log("return to carousel: EmulationStation's web service didn't answer; tapped Esc instead")


HOLD = "/tmp/launchsingle_hold"  # stops Launch Single Game re-starting the app meanwhile
RELOAD_SIGNAL = os.environ.get("XCLOUD_RELOAD_SIGNAL", "/tmp/launchsingle_reload")  # written by Launch
                                 # Single Game when EmulationStation reloads its screens after the game
RELOAD_WAIT = 4.0                # how long to wait for that before pressing anyway
BACK_SIGNAL = os.environ.get("XCLOUD_BACK_SIGNAL", "/tmp/launchsingle_back")  # written by Launch Single
                                 # Game the moment EmulationStation shows the game list again


def lift_hold():
    time.sleep(1.0)  # let EmulationStation settle on the carousel first
    for f in (HOLD, BACK_SIGNAL, RELOAD_SIGNAL):
        try:
            os.remove(f)
        except OSError:
            pass


def main():
    try:
        return run()
    finally:
        lift_hold()


def run():
    for f in (BACK_SIGNAL, RELOAD_SIGNAL):
        try:
            os.remove(f)  # from an earlier time
        except OSError:
            pass
    armed = len(sys.argv) >= 3 and sys.argv[1] == "--armed"
    trigger = sys.argv[2] if armed else None
    enabled, delay = settings()
    if not enabled:
        log("return to carousel: turned off in config.json")
        return 0
    # the fallback keyboard is made now, so it's already known to the
    # system by the time it might be needed
    ui, e = make_keyboard()
    try:
        if armed:
            start = time.time()
            while not os.path.exists(trigger):
                if os.getppid() == 1 or time.time() - start > MAX_WAIT:
                    return 0  # launcher went away without the app closing normally
                time.sleep(0.05)
            try:
                os.remove(trigger)
            except OSError:
                pass
        if press_back_via_es(delay):
            return 0
        if ui is not None:
            tap_esc(ui, e, delay)
            return 0
        log(f"return to carousel: couldn't reach EmulationStation, and no virtual keyboard ({KEYBOARD_ERROR}); staying on the game list")
        return 1
    finally:
        if ui is not None:
            ui.close()


if __name__ == "__main__":
    sys.exit(main())
