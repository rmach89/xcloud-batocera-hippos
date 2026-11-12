#!/usr/bin/env python3
"""Sets up the browser engine for the Xbox Cloud Gaming app.

Downloads Electron (an open-source Chromium-based app runtime) from its
official GitHub releases, checks it against Electron's published SHA-256
checksums, unpacks it into ./runtime and puts this project's app
(app.asar) inside it. No BUA needed.

  Build-Runtime.py           set up if missing, or refresh the app inside it
  Build-Runtime.py --force   download Electron again (updates it)
  Build-Runtime.py --latest  used by the installer: get the newest Electron if
                             the one here is older (keeps it when offline)
  Build-Runtime.py --check   print the installed and newest versions (JSON)
  Build-Runtime.py --stage   download the newest version next to the one in
                             use; it takes over the next time the app opens
                             (used by Settings > Update engine)
"""
import hashlib, json, os, platform, shutil, stat, sys, tempfile, time, urllib.request, zipfile

FILES = os.environ.get("XCLOUD_HOME", "/userdata/system/add-ons/xcloud")
RUNTIME = os.path.join(FILES, "runtime")
NEXT = os.path.join(FILES, "runtime.next")   # a downloaded update, waiting for the next start
STAMP = os.path.join(RUNTIME, ".built-from.json")
APP = os.path.join(FILES, "app.asar")
CONFIG = os.path.join(FILES, "config.json")
REPO = "electron/electron"
OFFICIAL = "https://github.com/electron/electron/releases/download/"
UA = "xcloud-app-installer/1.0"
NEED_MB = 400  # download (~100 MB) + unpacked engine (~250 MB) + headroom


def say(msg):
    print(msg, flush=True)


def arch():
    m = platform.machine().lower()
    if m in ("x86_64", "amd64"):
        return "x64"
    if m in ("aarch64", "arm64"):
        return "arm64"
    if m.startswith("armv7"):
        return "armv7l"
    raise RuntimeError(f"Unsupported processor type: {m}")


def get(url, accept="application/octet-stream"):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": accept})
    return urllib.request.urlopen(req, timeout=60)


def wanted_version():
    try:
        with open(CONFIG, encoding="utf-8") as f:
            v = str(json.load(f).get("electron_version", "")).strip()
        if v:
            return v if v.startswith("v") else "v" + v
    except Exception:
        pass
    with get(f"https://api.github.com/repos/{REPO}/releases/latest", "application/vnd.github+json") as r:
        rel = json.loads(r.read().decode())
    if rel.get("draft") or rel.get("prerelease"):
        raise RuntimeError("Latest Electron release is a prerelease.")
    return rel["tag_name"]


def file_sig(path):
    st = os.stat(path)
    return f"{st.st_size} {int(st.st_mtime)}"


def read_stamp():
    try:
        with open(STAMP, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def install_app_into(runtime_dir):
    res = os.path.join(runtime_dir, "resources")
    os.makedirs(res, exist_ok=True)
    for name in ("default_app.asar", "app"):
        p = os.path.join(res, name)
        if os.path.isdir(p):
            shutil.rmtree(p, ignore_errors=True)
        elif os.path.exists(p):
            os.remove(p)
    shutil.copy2(APP, os.path.join(res, "app.asar"))


def download_electron(version):
    a = arch()
    name = f"electron-{version}-linux-{a}.zip"
    base = f"{OFFICIAL}{version}/"
    say(f"Electron {version} ({a}): getting checksums")
    with get(base + "SHASUMS256.txt", "text/plain") as r:
        sums = r.read().decode()
    expected = None
    for line in sums.splitlines():
        parts = line.strip().split()
        if len(parts) == 2 and parts[1].lstrip("*") == name:
            expected = parts[0].lower()
    if not expected:
        raise RuntimeError(f"{name} is not listed in Electron's checksums.")

    tmpdir = tempfile.mkdtemp(prefix="electron-", dir=FILES)
    try:
        return _download_into(tmpdir, base, name, expected)
    except BaseException:
        # never leave a half-finished download behind taking up space
        shutil.rmtree(tmpdir, ignore_errors=True)
        raise


def _download_into(tmpdir, base, name, expected):
    zpath = os.path.join(tmpdir, name)
    h = hashlib.sha256()
    say(f"Downloading {name} from GitHub")
    with get(base + name) as r, open(zpath, "wb") as f:
        total = int(r.headers.get("Content-Length") or 0)
        done, last = 0, 0
        while True:
            b = r.read(1024 * 1024)
            if not b:
                break
            f.write(b)
            h.update(b)
            done += len(b)
            if total and done * 10 // total > last:
                last = done * 10 // total
                say(f"  {last * 10}%")
    if h.hexdigest().lower() != expected:
        shutil.rmtree(tmpdir, ignore_errors=True)
        raise RuntimeError("Checksum mismatch: the download was damaged or not genuine. Nothing was changed.")
    say("Checksum OK, unpacking")

    out = os.path.join(tmpdir, "runtime")
    with zipfile.ZipFile(zpath) as z:
        for info in z.infolist():
            target = os.path.realpath(os.path.join(out, info.filename))
            if not target.startswith(os.path.realpath(out) + os.sep) and target != os.path.realpath(out):
                raise RuntimeError("Unsafe path in the Electron download.")
            z.extract(info, out)
            mode = (info.external_attr >> 16) & 0o777
            if mode:
                os.chmod(target, mode)
    os.remove(zpath)
    for exe in ("electron", "chrome-sandbox", "chrome_crashpad_handler"):
        p = os.path.join(out, exe)
        if os.path.exists(p):
            os.chmod(p, os.stat(p).st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    if not os.path.isfile(os.path.join(out, "electron")):
        shutil.rmtree(tmpdir, ignore_errors=True)
        raise RuntimeError("The Electron download didn't contain the electron program.")
    return tmpdir, out


def read_json(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def check():
    """The installed engine, a downloaded update waiting (if any) and the newest one."""
    out = {"installed": read_stamp().get("electron", ""),
           "staged": read_json(os.path.join(NEXT, ".built-from.json")).get("electron", "")
           if os.path.isfile(os.path.join(NEXT, "electron")) else ""}
    out["latest"] = wanted_version()
    print(json.dumps(out), flush=True)
    return 0


def stage():
    """Download the newest engine into runtime.next; the one in use isn't touched."""
    if not os.path.isfile(APP):
        say(f"Missing {APP}.")
        return 1
    free_mb = shutil.disk_usage(FILES).free // (1024 * 1024)
    if free_mb < NEED_MB:
        say(f"Not enough free space: about {NEED_MB} MB is needed and Batocera has {free_mb} MB.")
        return 1
    for leftover in os.listdir(FILES):
        if leftover.startswith("electron-"):
            shutil.rmtree(os.path.join(FILES, leftover), ignore_errors=True)
    version = wanted_version()
    tmpdir, out = download_electron(version)
    try:
        install_app_into(out)
        with open(os.path.join(out, ".built-from.json"), "w", encoding="utf-8") as f:
            json.dump({"electron": version, "arch": arch(), "app": file_sig(APP),
                       "built": time.strftime("%Y-%m-%d %H:%M:%S")}, f, indent=2)
        shutil.rmtree(NEXT, ignore_errors=True)
        os.rename(out, NEXT)
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)
    say(f"STAGED {version}")
    return 0


def main():
    if "--check" in sys.argv[1:]:
        return check()
    if "--stage" in sys.argv[1:]:
        return stage()
    force = "--force" in sys.argv[1:]
    if "--latest" in sys.argv[1:] and os.path.isfile(os.path.join(RUNTIME, "electron")):
        installed = read_stamp().get("electron", "")
        try:
            latest = wanted_version()
        except Exception as e:
            say(f"Couldn't look up the newest Electron ({e}); keeping {installed or 'the installed one'}.")
            latest = installed
        if latest and latest != installed:
            say(f"Newer browser engine available: {installed or '?'} -> {latest}")
            force = True
    if not os.path.isfile(APP):
        say(f"Missing {APP}.")
        return 1
    stamp = read_stamp()
    have_engine = os.path.isfile(os.path.join(RUNTIME, "electron"))

    if have_engine and not force:
        if stamp.get("app") != file_sig(APP) or not os.path.isfile(os.path.join(RUNTIME, "resources", "app.asar")):
            install_app_into(RUNTIME)
            stamp["app"] = file_sig(APP)
            with open(STAMP, "w", encoding="utf-8") as f:
                json.dump(stamp, f, indent=2)
            say("Updated the app inside the existing runtime.")
        else:
            say(f"Runtime is ready (Electron {stamp.get('electron', '?')}).")
        return 0

    # clean up leftovers from an earlier failed attempt
    for leftover in os.listdir(FILES):
        if leftover.startswith("electron-") or leftover in ("runtime.new", "runtime.old", "runtime.next"):
            shutil.rmtree(os.path.join(FILES, leftover), ignore_errors=True)

    free_mb = shutil.disk_usage(FILES).free // (1024 * 1024)
    if free_mb < NEED_MB:
        say(f"Not enough free space: the browser engine needs about {NEED_MB} MB free, "
            f"and Batocera has {free_mb} MB. Make Batocera's storage bigger (see the README), then try again.")
        return 1

    version = wanted_version()
    # a newer engine downloaded from Settings that's not in use yet is replaced by this one
    shutil.rmtree(NEXT, ignore_errors=True)
    tmpdir, out = download_electron(version)
    try:
        install_app_into(out)
        old = RUNTIME + ".old"
        shutil.rmtree(old, ignore_errors=True)
        if os.path.exists(RUNTIME):
            os.rename(RUNTIME, old)
        os.rename(out, RUNTIME)
        shutil.rmtree(old, ignore_errors=True)
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)
    with open(STAMP, "w", encoding="utf-8") as f:
        json.dump({"electron": version, "arch": arch(), "app": file_sig(APP),
                   "built": time.strftime("%Y-%m-%d %H:%M:%S")}, f, indent=2)
    say(f"Electron {version} is ready in {RUNTIME}.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        say(f"Could not set up the browser engine: {e}")
        sys.exit(1)
