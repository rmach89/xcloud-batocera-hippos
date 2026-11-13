#!/usr/bin/env python3
"""Fills Batocera's Xbox Cloud list with the cloud games themselves.

Settings > Batocera game list in the app runs this:
  Sync-GameList.py all      every Xbox Cloud Gaming game Microsoft lists
  Sync-GameList.py picked   only the games picked in the app (picked-games.json)
  Sync-GameList.py off      back to the single "Xbox Cloud Gaming" entry
                            (picking Xbox Cloud opens the app straight away)
Options: --market en-us (the region's language and country, default en-us)

Each game gets a small file in /userdata/roms/xcloud (it holds the game's
Microsoft Store ID, which the app opens), an entry in gamelist.xml with
Microsoft's description, developer, publisher, release date and genre, and
its box art, background and logo from Microsoft's store images. With
"game_list_3d" on (Settings > 3D game boxes), each game's picture is a 3D
case drawn from its box art (gamebox3d.py, needs Pillow); the flat box art
stays as the thumbnail.
Only files this script made are ever removed; games' play counts and
favourites set in Batocera are kept.

The game list comes from Microsoft's public Game Pass catalog (the list the
Xbox site itself uses), the details from Microsoft's store catalog. Neither
needs a sign-in, and nothing is sent to them but the IDs of the games.
Progress is printed as one JSON object per line.

It keeps going if the app closes before it's done (a big list takes a few
minutes): the games are listed first, with whatever pictures are already
there, then the pictures come in; what's left goes to xcloud-app.log, and
EmulationStation is asked to reload its games when it's finished. Two runs
never overlap: a second one waits for the first.
"""
import fcntl, json, os, re, shutil, sys, tempfile, time, urllib.parse, urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor

FILES = os.environ.get("XCLOUD_HOME", "/userdata/system/add-ons/xcloud")
ROMS = os.environ.get("XCLOUD_ROMS", "/userdata/roms/xcloud")
IMAGES = os.path.join(ROMS, "images")
GAMELIST = os.path.join(ROMS, "gamelist.xml")
STATE = os.path.join(FILES, "gamelist-state.json")
PICKED = os.path.join(FILES, "picked-games.json")
CONFIG = os.path.join(FILES, "config.json")
LS_LIST = os.environ.get("XCLOUD_LAUNCHSINGLE_LIST", "/userdata/system/launchsingle.systems")
CHANGED = os.environ.get("XCLOUD_GAMELIST_FLAG", "/tmp/xcloud-gamelist-changed")
APP_LOG = os.environ.get("XCLOUD_APP_LOG", "/userdata/system/logs/xcloud-app.log")
LOCK = os.path.join(FILES, ".gamelist.lock")
RELOAD_URL = os.environ.get("XCLOUD_ES_RELOAD", "http://127.0.0.1:1234/reloadgames")
PARENT = os.getppid()
SIGLS = os.environ.get("XCLOUD_CATALOG_URL", "https://catalog.gamepass.com/sigls/v2")
PRODUCTS = os.environ.get("XCLOUD_PRODUCTS_URL", "https://displaycatalog.mp.microsoft.com/v7.0/products")
# Microsoft's list of every game that streams in Xbox Cloud Gaming
CLOUD_LIST = "29a81209-df6f-41fd-a528-2ae6b91f719c"
DASHBOARD = "./Xbox Cloud Gaming.xcloud"
UA = "xcloud-app-gamelist/1.0"
ID_RE = re.compile(r"^[0-9A-Z]{12}$")
# the play counts and choices Batocera keeps for a game, kept across updates
KEEP_TAGS = ("playcount", "lastplayed", "gametime", "favorite", "hidden")
# games up to this age rating are marked kid-friendly for EmulationStation's
# own Kid mode (E10+, age 10). The ratings are information only: the app
# doesn't block any game (Microsoft's own family settings do that)
KIDS_AGE = 10


_alone = []
def alone():
    """The app that started this has closed (its end of the pipe is gone)."""
    if not _alone and os.getppid() != PARENT:
        went_alone()
    return bool(_alone)


def went_alone():
    if _alone:
        return
    _alone.append(1)
    try:  # nothing reads what's printed any more
        fd = os.open(os.devnull, os.O_WRONLY)
        os.dup2(fd, 1)
        os.close(fd)
    except OSError:
        pass
    log("the app closed before the list was finished; carrying on in the background")


def log(msg):
    try:
        with open(APP_LOG, "a", encoding="utf-8") as f:
            f.write(time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()) + "Z Batocera game list: " + msg + "\n")
    except OSError:
        pass


def emit(**kw):
    if not alone():
        try:
            print(json.dumps(kw), flush=True)
            return
        except (BrokenPipeError, OSError):
            went_alone()
    # after the app has gone: what matters goes to its log instead
    if "warning" in kw:
        log(kw["warning"])
    elif "error" in kw:
        log(f"couldn't update ({kw['error']})")
    elif kw.get("stage") == "listed":
        log(f"{kw.get('count')} games listed; their pictures are still coming")
    elif kw.get("done"):
        log(f"{kw.get('count')} games, finished after the app closed")


def app_running():
    """The Xbox Cloud Gaming app (its browser engine) is open."""
    me = os.path.join(FILES, "runtime") + "/"
    for pid in os.listdir("/proc"):
        if not pid.isdigit():
            continue
        try:
            with open(f"/proc/{pid}/cmdline", "rb") as f:
                if me.encode() in f.read():
                    return True
        except OSError:
            pass
    return False


def reload_es():
    """When the app is closed, EmulationStation shows the new list straight away
    (with the app open, its launcher asks for this when it closes)."""
    if not alone() or app_running():
        return
    try:
        urllib.request.urlopen(RELOAD_URL, timeout=5).read()
        try:
            os.remove(CHANGED)
        except OSError:
            pass
        log("EmulationStation reloaded its games")
    except Exception as e:
        log(f"couldn't ask EmulationStation to reload ({e}); it shows after a restart or Update game lists")


def read_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def write_atomic(path, data, binary=False):
    d = os.path.dirname(path)
    fd, tmp = tempfile.mkstemp(dir=d, prefix=".tmp-")
    with os.fdopen(fd, "wb" if binary else "w", **({} if binary else {"encoding": "utf-8"})) as f:
        f.write(data)
    os.replace(tmp, path)


def get(url, accept="application/json", timeout=30):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": accept})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def market_of(code):
    code = (code or "en-us").lower()
    m = re.match(r"^([a-z]{2})-([a-z]{2})$", code)
    return (m.group(2).upper(), code) if m else ("US", "en-us")


# ---------- which games ----------
def cloud_ids(lang, market):
    sigl = read_json(CONFIG, {}).get("game_list_catalog") or CLOUD_LIST
    q = urllib.parse.urlencode({"id": sigl, "language": lang, "market": market})
    data = json.loads(get(f"{SIGLS}?{q}").decode("utf-8"))
    ids = []
    for item in data if isinstance(data, list) else []:
        i = str(item.get("id", "")).upper() if isinstance(item, dict) else ""
        if ID_RE.match(i) and i not in ids:
            ids.append(i)
    return ids


def picked_ids():
    out = []
    for p in read_json(PICKED, []):
        i = str(p.get("id", "") if isinstance(p, dict) else p).upper()
        if ID_RE.match(i) and i not in out:
            out.append(i)
    return out


# ---------- age ratings ----------
# The youngest age each rating is meant for: shown in each game's description
# ("Rated ESRB T") and used for EmulationStation's kid-friendly marks.
AGES = {
    "ESRB": {"EC": (3, "EC"), "E": (6, "E"), "E10": (10, "E10+"), "E10+": (10, "E10+"), "T": (13, "T"), "M": (17, "M"), "AO": (18, "AO")},
    "PEGI": {"3": (3, "3"), "7": (7, "7"), "12": (12, "12"), "16": (16, "16"), "18": (18, "18")},
    "USK": {"0": (0, "0"), "6": (6, "6"), "12": (12, "12"), "16": (16, "16"), "18": (18, "18")},
    "CERO": {"A": (0, "A"), "B": (12, "B"), "C": (15, "C"), "D": (17, "D"), "Z": (18, "Z")},
    "COB-AU": {"G": (0, "G"), "PG": (8, "PG"), "M": (15, "M"), "MA15": (15, "MA 15+"), "R18": (18, "R 18+")},
    "GRB": {"ALL": (0, "ALL"), "12": (12, "12"), "15": (15, "15"), "18": (18, "18")},
}
MARKET_SYSTEM = {"US": "ESRB", "CA": "ESRB", "MX": "ESRB", "BR": "ESRB", "DE": "USK", "JP": "CERO", "AU": "COB-AU", "NZ": "COB-AU", "KR": "GRB"}


def age_rating(ratings, market):
    """(age, label) for the region's own rating system, else any known one."""
    found = {}
    for r in ratings:
        rid = str(r.get("RatingId", ""))
        system, _, value = rid.partition(":")
        system = (r.get("RatingSystem") or system).upper()
        hit = AGES.get(system, {}).get(value.upper().replace("PEGI", "").strip())
        if hit:
            found[system] = (hit[0], f"{'ACB' if system == 'COB-AU' else system} {hit[1]}")
    for system in (MARKET_SYSTEM.get(market, "PEGI"), "ESRB", "PEGI", "USK"):
        if system in found:
            return found[system]
    return next(iter(found.values()), (None, ""))


# ---------- details from the store catalog ----------
def image(images, *purposes):
    for purpose in purposes:
        best = None
        for im in images:
            if im.get("ImagePurpose") == purpose and im.get("Uri"):
                if not best or (im.get("Width") or 0) > (best.get("Width") or 0):
                    best = im
        if best:
            u = best["Uri"]
            return ("https:" + u) if u.startswith("//") else u
    return ""


def details(ids, lang, market):
    out = {}
    for n in range(0, len(ids), 20):
        batch = ids[n:n + 20]
        q = urllib.parse.urlencode({"bigIds": ",".join(batch), "market": market,
                                    "languages": f"{lang},neutral", "MS-CV": "DGU1mcuYo0WMMp+F.1"})
        try:
            data = json.loads(get(f"{PRODUCTS}?{q}").decode("utf-8"))
        except Exception as e:
            emit(warning=f"store details for {len(batch)} games: {e}")
            continue
        for p in data.get("Products", []):
            pid = str(p.get("ProductId", "")).upper()
            lp = (p.get("LocalizedProperties") or [{}])[0]
            mp = (p.get("MarketProperties") or [{}])[0]
            props = p.get("Properties") or {}
            title = (lp.get("ProductTitle") or "").strip()
            if not ID_RE.match(pid) or not title:
                continue
            rating = ""
            for u in mp.get("UsageData") or []:
                if u.get("AggregateTimeSpan") == "AllTime" and u.get("AverageRating"):
                    rating = f"{min(1.0, float(u['AverageRating']) / 5):.2f}"
            age, label = age_rating(mp.get("ContentRatings") or [], market)
            kid = age is not None and age <= KIDS_AGE
            released = str(mp.get("OriginalReleaseDate") or "")[:10].replace("-", "")
            cats = props.get("Categories") or ([props["Category"]] if props.get("Category") else [])
            imgs = lp.get("Images") or []
            out[pid] = {
                "title": title,
                "desc": (lp.get("ProductDescription") or lp.get("ShortDescription") or "").strip(),
                "developer": (lp.get("DeveloperName") or "").strip(),
                "publisher": (lp.get("PublisherName") or "").strip(),
                "released": released + "T000000" if re.match(r"^\d{8}$", released) and not released.startswith("1753") else "",
                "genre": ", ".join(c for c in cats[:2] if c),
                "rating": rating, "kid": kid, "age": age, "label": label,
                "box": image(imgs, "BoxArt", "Poster", "FeaturePromotionalSquareArt"),
                "fanart": image(imgs, "SuperHeroArt", "TitledHeroArt", "Screenshot"),
                # the tall cover, for 3D game boxes (the box art is often square)
                "poster": image(imgs, "Poster"),
                "logo": image(imgs, "Logo"),
            }
    return out


# ---------- pictures ----------
def ext_of(data):
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return ".png"
    if data[:3] == b"\xff\xd8\xff":
        return ".jpg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp"
    return ""


def fetch_image(job):
    url, base = job
    for e in (".jpg", ".png", ".webp"):
        if os.path.exists(base + e):
            return base + e
    try:
        data = get(url, "image/*", 30)
    except Exception:
        return ""
    e = ext_of(data)
    if not e:
        return ""
    try:
        write_atomic(base + e, data, binary=True)
    except OSError as err:
        # a picture that can't be saved (a read-only folder, a full disk)
        # doesn't stop the list: the game is still added or taken out
        note_unsaved(err)
        return ""
    return base + e


_unsaved = []
def note_unsaved(err):
    if not _unsaved:
        _unsaved.append(err)
        emit(warning=f"pictures couldn't be saved ({err}); the list is updated without them")


def sized(url, w, jpg=True):
    if not url:
        return ""
    return url + ("&" if "?" in url else "?") + f"w={w}" + ("&q=85&format=jpg" if jpg else "")


# ---------- gamelist.xml ----------
def load_gamelist():
    """Batocera's list as it is (a damaged one is left alone), with the app's own entry."""
    if os.path.exists(GAMELIST):
        try:
            root = ET.parse(GAMELIST).getroot()
        except ET.ParseError as e:
            raise RuntimeError(f"{GAMELIST} couldn't be read ({e}); it was left as it is")
    else:
        root = ET.Element("gameList")
    if not any((g.findtext("path") or "") == DASHBOARD for g in root.findall("game")):
        try:
            root.insert(0, ET.parse(os.path.join(FILES, "gamelist.xml")).getroot().find("game"))
        except Exception:
            pass
    return root


def pin_first(g):
    """The app's own entry stays at the top of the list: its sort name for
    EmulationStation versions that use one (Batocera since December 2025), and
    a name starting with a space for the ones that sort by the name itself (a
    space comes before every letter)."""
    if g.find("sortname") is None:
        sub(g, "sortname", "!Xbox Cloud Gaming")
    n = g.find("name")
    if n is None:
        n = ET.SubElement(g, "name")
    if not (n.text or "").startswith(" "):
        n.text = " " + (n.text or "Xbox Cloud Gaming").strip()


def sub(game, tag, text):
    if text:
        ET.SubElement(game, tag).text = text


def safe_name(title):
    t = re.sub(r'[\\/:*?"<>|\x00-\x1f]', "", title).strip().rstrip(".")
    return (t or "Game")[:120]


def write_gamelist(root):
    ET.indent(root, "  ") if hasattr(ET, "indent") else None
    write_atomic(GAMELIST, '<?xml version="1.0"?>\n' + ET.tostring(root, encoding="unicode") + "\n")


def set_launchsingle(on, state):
    """xcloud in Launch Single Game's list: out while the games are listed, back
    after (only if it was there, and single launch wasn't turned down at install)."""
    try:
        lines = open(LS_LIST, encoding="utf-8").read().replace("\r", "").split("\n")
    except Exception:
        return
    has = any(l.strip() == "xcloud" for l in lines)
    if not on and has:
        lines = [l for l in lines if l.strip() != "xcloud"]
        state["launchsingle_removed"] = True
    elif on and not has and state.get("launchsingle_removed") and read_json(CONFIG, {}).get("single_launch", True) is not False:
        lines = [l for l in lines if l != ""] + ["xcloud"]
        state.pop("launchsingle_removed", None)
    else:
        return
    write_atomic(LS_LIST, "\n".join(lines).rstrip("\n") + "\n")


def remove_ours(state, keep_ids=()):
    """Delete the game files and pictures this script made (not the ones kept)."""
    gone = []
    for pid, info in list(state.get("games", {}).items()):
        if pid in keep_ids:
            continue
        for f in [info.get("file", "")] + info.get("images", []):
            if f:
                p = os.path.join(ROMS, f[2:] if f.startswith("./") else f)
                try:
                    os.remove(p)
                except FileNotFoundError:
                    pass
                except OSError as err:   # can't be deleted (read-only folder): it's out of the list anyway
                    emit(warning=f"couldn't delete {os.path.basename(p)} ({err})")
        gone.append(info.get("file", ""))
        del state["games"][pid]
    return gone


BOX_VERSION = 6   # gamebox3d.VERSION, for when Pillow isn't here


def cover_of(pid, d, got):
    """The picture a 3D box is drawn from: the tall cover (poster) when
    Microsoft has one, else the box art; and the address to fetch it again."""
    poster = got.get(os.path.join(IMAGES, f"{pid}-poster"))
    if poster:
        return poster, sized(d["poster"], 600)
    return got.get(os.path.join(IMAGES, f"{pid}-image")), (sized(d["box"], 480) if d.get("box") else "")


def make_boxes(info, got, state):
    """{id: path of its 3D case}; games without box art (or without Pillow) keep the flat one."""
    try:
        import gamebox3d
        from PIL import Image
    except Exception as e:
        # no Pillow here: the app draws the cases itself (with its browser
        # engine) and runs this again; the ones it has drawn are used
        out, need = {}, []
        for pid, d in info.items():
            art, url = cover_of(pid, d, got)
            box = os.path.join(IMAGES, f"{pid}-box3d.png")
            if os.path.exists(box) and state.get("box3d_version") == BOX_VERSION:
                out[pid] = box
            elif art or url:
                if os.path.exists(box):
                    out[pid] = box   # kept until the app has drawn the new one
                need.append({"id": pid, "title": d["title"], "cover": art or "", "url": url, "out": box,
                             "age": d.get("age"), "label": d.get("label") or ""})
        if need:
            emit(warning=f"no Pillow here ({e}): the app draws the 3D game boxes", need_boxes=need)
        state["box3d_version"] = BOX_VERSION
        return out
    # (a cover cut short isn't drawn half-empty: it's fetched again below)
    if shutil.disk_usage(ROMS).free // (1024 * 1024) < 200:
        emit(warning="3D game boxes skipped: less than 200 MB free")
        return {}
    try:
        logo = Image.open(os.path.join(FILES, "xcloud-icon.png")).convert("RGBA")
    except Exception:
        logo = Image.new("RGBA", (8, 8), (0, 0, 0, 0))
    redo = state.get("box3d_version") != gamebox3d.VERSION
    jobs = []
    for pid, d in info.items():
        art, url = cover_of(pid, d, got)
        if art:
            jobs.append((pid, d["title"], art, os.path.join(IMAGES, f"{pid}-box3d.png"), url, (d.get("age"), d.get("label") or "")))

    failed = []

    def cover(flat, url):
        try:
            im = Image.open(flat)
            im.load()
            return im
        except Exception:
            if not url:
                raise
        # the saved cover can't be read (cut short?): fetch it again, once
        data = get(url, "image/*", 30)
        if ext_of(data) != os.path.splitext(flat)[1]:
            raise RuntimeError("Microsoft's copy isn't a picture in the same format")
        write_atomic(flat, data, binary=True)
        im = Image.open(flat)
        im.load()
        return im

    def one(job):
        pid, title, flat, out, url, rating = job
        if os.path.exists(out) and not redo:
            return pid, out
        try:
            img = gamebox3d.make(cover(flat, url), title, logo, rating=rating)
            tmp = out + ".tmp.png"
            img.save(tmp, optimize=True)
            os.replace(tmp, out)
            return pid, out
        except Exception as e:
            # Pillow couldn't read this cover. A box the app drew for it is kept
            # (deleting it here is what made boxes vanish); otherwise the app draws one
            if os.path.exists(out) and not redo:
                return pid, out
            emit(warning=f"3D box for {title}: {e}; the app draws it instead")
            miss = {"id": pid, "title": title, "cover": flat, "url": url, "out": out, "age": rating[0], "label": rating[1]}
            if os.path.exists(out):
                failed.append(miss)
                return pid, out   # the old one stays until the app has drawn the new one
            failed.append(miss)
            return pid, ""

    out = {}
    with ThreadPoolExecutor(4) as pool:
        for n, (pid, path) in enumerate(pool.map(one, jobs), 1):
            if path:
                out[pid] = path
            if n % 25 == 0 or n == len(jobs):
                emit(stage="boxes", done=n, total=len(jobs))
    state["box3d_version"] = gamebox3d.VERSION
    if failed:
        emit(need_boxes=failed)
    return out


def list_games(info, got, boxes, state):
    """The games' entries in gamelist.xml (and their small files), with the pictures in got / boxes."""
    # the games no longer listed go (only ones this script made)
    gone = set(remove_ours(state, keep_ids=set(info)))
    root = load_gamelist()
    old = {}
    for g in list(root.findall("game")):
        p = g.findtext("path") or ""
        if p in gone or any(p == v.get("file") for v in state["games"].values()):
            old[p] = g
            root.remove(g)
        elif p == DASHBOARD:
            pin_first(g)

    used = {os.path.basename(v.get("file", "")) for v in state["games"].values()}
    for pid in sorted(info, key=lambda i: info[i]["title"].lower()):
        d = info[pid]
        prev = state["games"].get(pid, {})
        fname = os.path.basename(prev.get("file", "")) or safe_name(d["title"]) + ".xcloud"
        if not prev and (fname in used or os.path.exists(os.path.join(ROMS, fname))):
            fname = f"{safe_name(d['title'])} ({pid}).xcloud"
        used.add(fname)
        with open(os.path.join(ROMS, fname), "w", encoding="utf-8") as f:
            f.write(pid + "\n")
        rel = "./" + fname
        g = ET.SubElement(root, "game")
        sub(g, "path", rel)
        sub(g, "name", d["title"])
        sub(g, "desc", (f"Rated {d['label']}\n\n" if d["label"] else "") + d["desc"][:2000])
        pics = {}
        for kind in ("image", "marquee", "fanart"):
            p = got.get(os.path.join(IMAGES, f"{pid}-{kind}"))
            if p:
                pics[kind] = "./images/" + os.path.basename(p)
        if boxes.get(pid):
            pics["box3d"] = "./images/" + os.path.basename(boxes[pid])
        sub(g, "image", pics.get("box3d") or pics.get("image"))
        sub(g, "thumbnail", pics.get("image"))
        sub(g, "marquee", pics.get("marquee"))
        sub(g, "fanart", pics.get("fanart"))
        sub(g, "rating", d["rating"])
        sub(g, "releasedate", d["released"])
        sub(g, "developer", d["developer"])
        sub(g, "publisher", d["publisher"])
        # games for adults only (ESRB M / AO, PEGI 18 ...): Batocera has no
        # "adult" flag, so they're marked not-for-kids and get "Adult" in their genre
        adult = d["age"] is not None and d["age"] >= 17
        sub(g, "genre", ", ".join(x for x in (d["genre"], "Adult" if adult else "") if x))
        before = old.get(rel)
        for t in KEEP_TAGS:
            v = before.findtext(t) if before is not None else None
            if v:
                sub(g, t, v)
        # kid-friendly or not, from the age rating (adults-only games never are)
        sub(g, "kidgame", "true" if d["kid"] and not adult else "false" if adult or d["age"] is not None else None)
        poster = got.get(os.path.join(IMAGES, f"{pid}-poster"))
        state["games"][pid] = {"file": rel, "title": d["title"], "images": list(pics.values()) + (["./images/" + os.path.basename(poster)] if poster else []),
                               "age": d["age"], "rating_label": d["label"], "adult": adult}
    write_gamelist(root)


def main():
    args = sys.argv[1:]
    mode = args[0] if args and args[0] in ("all", "picked", "off") else read_json(CONFIG, {}).get("game_list", "off")
    market, lang = market_of(args[args.index("--market") + 1] if "--market" in args and args.index("--market") + 1 < len(args) else "en-us")
    state = read_json(STATE, {})
    state.setdefault("games", {})
    os.makedirs(IMAGES, exist_ok=True)

    if mode == "off":
        gone = set(remove_ours(state))
        root = load_gamelist()
        for g in list(root.findall("game")):
            if (g.findtext("path") or "") in gone:
                root.remove(g)
        write_gamelist(root)
        set_launchsingle(True, state)
        state.update(mode="off", count=0, synced=time.time())
        write_atomic(STATE, json.dumps(state, indent=2) + "\n")
        open(CHANGED, "w").write("off\n")
        emit(done=True, mode="off", count=0)
        return 0

    emit(stage="list")
    ids = cloud_ids(lang, market) if mode == "all" else picked_ids()
    if mode == "all" and not ids:
        raise RuntimeError("Microsoft's cloud game list came back empty")
    emit(stage="details", total=len(ids))
    info = details(ids, lang, market)
    if ids and not info:
        raise RuntimeError("Microsoft's store catalog didn't answer")

    # the games straight away, with the pictures already here (a big list's
    # pictures take minutes; this way the list is there even if that's cut short)
    def have(base):
        for e in (".jpg", ".png", ".webp"):
            if os.path.exists(base + e):
                return base + e
        return ""
    now = {}
    for pid in info:
        for kind in ("image", "marquee", "fanart", "poster"):
            b = os.path.join(IMAGES, f"{pid}-{kind}")
            now[b] = have(b)
    want3d_now = bool(read_json(CONFIG, {}).get("game_list_3d", False))
    old_boxes = {pid: os.path.join(IMAGES, f"{pid}-box3d.png") for pid in info
                 if want3d_now and os.path.exists(os.path.join(IMAGES, f"{pid}-box3d.png"))}
    list_games(info, now, old_boxes, state)
    set_launchsingle(False, state)
    state.update(mode=mode, count=len(info), market=lang)
    write_atomic(STATE, json.dumps(state, indent=2) + "\n")
    open(CHANGED, "w").write(mode + "\n")
    emit(stage="listed", count=len(info))
    reload_es()

    # pictures: box art, a background and the logo (skipped when space is short)
    want3d = bool(read_json(CONFIG, {}).get("game_list_3d", False))
    free_mb = shutil.disk_usage(ROMS).free // (1024 * 1024)
    jobs = []
    for pid, d in info.items():
        if want3d and free_mb > 200 and d.get("poster"):
            jobs.append((sized(d["poster"], 600), os.path.join(IMAGES, f"{pid}-poster")))
        if free_mb > 100 and d["box"]:
            jobs.append((sized(d["box"], 480), os.path.join(IMAGES, f"{pid}-image")))
        if free_mb > 100 and d["logo"]:
            jobs.append((sized(d["logo"], 400, False), os.path.join(IMAGES, f"{pid}-marquee")))
        if free_mb > 400 and d["fanart"]:
            jobs.append((sized(d["fanart"], 1280), os.path.join(IMAGES, f"{pid}-fanart")))
    got = {}
    with ThreadPoolExecutor(8) as pool:
        for n, (job, path) in enumerate(zip(jobs, pool.map(fetch_image, jobs)), 1):
            got[job[1]] = path
            if n % 25 == 0 or n == len(jobs):
                emit(stage="art", done=n, total=len(jobs))

    # 3D cases, drawn from the tall cover (or the box art) (Settings > 3D game boxes)
    boxes = make_boxes(info, got, state) if want3d else {}

    list_games(info, got, boxes, state)

    # 3D cases no longer used (turned off, or the game left the list)
    for f in os.listdir(IMAGES):
        if (f.endswith("-box3d.png") and f[:12] not in boxes) or ("-poster." in f and (not want3d or f[:12] not in info)):
            try:
                os.remove(os.path.join(IMAGES, f))
            except OSError:
                pass
    set_launchsingle(False, state)
    state.update(mode=mode, count=len(info), synced=time.time(), market=lang, box3d=bool(boxes))
    if not want3d:
        state.pop("box3d_version", None)
    write_atomic(STATE, json.dumps(state, indent=2) + "\n")
    open(CHANGED, "w").write(mode + "\n")
    emit(done=True, mode=mode, count=len(info))
    reload_es()
    return 0


def locked():
    """One run at a time: a second one waits for the first (which may be
    carrying on after the app closed), then goes, quickly, with its pictures."""
    try:
        lock = open(LOCK, "w")
    except OSError:
        return None
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        emit(stage="waiting")
        fcntl.flock(lock, fcntl.LOCK_EX)
    return lock


if __name__ == "__main__":
    try:
        _lock = locked()
        sys.exit(main())
    except Exception as e:
        emit(error=str(e))
        sys.exit(1)
