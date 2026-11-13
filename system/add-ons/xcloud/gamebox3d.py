"""A 3D game case for Batocera's list, drawn from a game's flat cover.

Black keep-case: a header with the app's cloud logo and XBOX CLOUD GAMING, a
green line under it, the cover, and a black spine with the logo and the
game's name. Turned so the spine shows; transparent background.
"""
import glob, os
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

GREEN = (16, 124, 16)
LIME = (64, 190, 40)
VERSION = 8   # bump to redraw every box after a design change (6: the age-rating tile, 7: control badges, 8: cover kept near its top)


def _font(size):
    for f in ["/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
              "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf"] + sorted(glob.glob("/usr/share/fonts/**/*Bold*.ttf", recursive=True)):
        if os.path.exists(f):
            try:
                return ImageFont.truetype(f, size)
            except Exception:
                pass
    try:
        return ImageFont.load_default(size)
    except TypeError:
        return ImageFont.load_default()


def _solve(a, b):
    n = len(b)
    m = [row[:] + [b[i]] for i, row in enumerate(a)]
    for c in range(n):
        p = max(range(c, n), key=lambda r: abs(m[r][c]))
        m[c], m[p] = m[p], m[c]
        for r in range(n):
            if r != c:
                f = m[r][c] / m[c][c]
                m[r] = [x - f * y for x, y in zip(m[r], m[c])]
    return [m[i][n] / m[i][i] for i in range(n)]


def _warp(img, quad, size):
    w, h = img.size
    a, b = [], []
    for (x, y), (u, v) in zip(quad, [(0, 0), (w, 0), (w, h), (0, h)]):
        a.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.append(u)
        a.append([0, 0, 0, x, y, 1, -v * x, -v * y]); b.append(v)
    return img.transform(size, Image.Transform.PERSPECTIVE, _solve(a, b), Image.Resampling.BICUBIC)


def _spaced(d, xy, text, f, fill, spacing, anchor_mid=True):
    widths = [d.textlength(c, font=f) for c in text]
    total = sum(widths) + spacing * (len(text) - 1)
    x, y = xy
    if anchor_mid:
        x -= total / 2
    for c, w in zip(text, widths):
        d.text((x, y), c, font=f, fill=fill, anchor="lm")
        x += w + spacing
    return total


def _round(img, r):
    m = Image.new("L", img.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, img.width - 1, img.height - 1], radius=r, fill=255)
    out = img.convert("RGBA"); out.putalpha(m)
    return out


# ---------- the age-rating tile (bottom right of the cover) ----------
# The app's own design (not a rating board's logo): the youngest age large
# on top, the rating underneath, on a color for the age group.
TILE_COLORS = [(6, (59, 109, 17)), (10, (24, 95, 165)), (13, (133, 79, 11)), (16, (153, 60, 29)), (17, (163, 45, 45))]
TILE_ADULT = (121, 31, 31)
TILE_RULE = {6: (192, 221, 151), 10: (181, 212, 244), 13: (250, 199, 117), 16: (240, 153, 123), 17: (247, 193, 193), 18: (247, 193, 193)}


def tile_text(age, label):
    """(top, bottom, color, rule color) for a rating, or None when there's none to show.
    label is what Sync-GameList.py stores, e.g. "ESRB T", "PEGI 12", "ACB MA 15+"."""
    if age is None or not label:
        return None
    system, _, value = str(label).partition(" ")
    if system == "ESRB":
        top = "ALL" if value in ("E", "EC") else f"{age}+"
        bottom = value.rstrip("+")
    else:
        top = "ALL" if age <= 0 else f"{age}+"
        bottom = label if len(label) <= 8 else value
    color = next((c for limit, c in TILE_COLORS if age <= limit), TILE_ADULT)
    rule = next((c for limit, c in sorted(TILE_RULE.items()) if age <= limit), TILE_RULE[18])
    return top, bottom, color, rule


def _tile(face, rating, art_box):
    t = tile_text(*rating) if rating else None
    if not t:
        return
    top, bottom, color, rule = t
    d = ImageDraw.Draw(face)
    ft, fb = _font(46), _font(32 if len(bottom) <= 4 else 24)
    pad, gap = 16, 12
    w = int(max(104, d.textlength(top, font=ft) + 2 * pad, d.textlength(bottom, font=fb) + 2 * pad))
    h = 46 + gap * 2 + 2 + 32 + pad * 2 - 4
    x1, y1 = art_box[2] - 22, art_box[3] - 22
    x0, y0 = x1 - w, y1 - h
    # a soft shadow so it lifts off any cover, then the white edge and the tile
    sh = Image.new("L", face.size, 0)
    ImageDraw.Draw(sh).rounded_rectangle([x0 + 3, y0 + 6, x1 + 3, y1 + 6], radius=18, fill=120)
    face.paste((0, 0, 0), (0, 0), sh.filter(ImageFilter.GaussianBlur(8)))
    d.rounded_rectangle([x0 - 5, y0 - 5, x1 + 5, y1 + 5], radius=22, fill="white")
    d.rounded_rectangle([x0, y0, x1, y1], radius=17, fill=color)
    cx = (x0 + x1) / 2
    d.text((cx, y0 + pad + 23), top, font=ft, fill="white", anchor="mm")
    ry = y0 + pad + 46 + gap
    d.line([(x0 + 16, ry), (x1 - 16, ry)], fill=rule, width=3)
    d.text((cx, ry + gap + 17), bottom, font=fb, fill=(250, 248, 240), anchor="mm")


# ---------- what the game can be played with (bottom left of the cover) ----------
# "mkb": keyboard and mouse, "touch": a touch screen (Microsoft's own lists of
# cloud games that support them). Dark tiles with a white edge, like the rating.
FEATURES = ("mkb", "touch")


def _icon_mkb(s):
    """A keyboard with a mouse beside it, white on transparent, s x s."""
    k = 4; S = s * k
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    W = (255, 255, 255, 255)
    # keyboard
    kx0, ky0, kx1, ky1 = 0.04 * S, 0.30 * S, 0.66 * S, 0.74 * S
    d.rounded_rectangle([kx0, ky0, kx1, ky1], radius=0.06 * S, outline=W, width=int(0.055 * S))
    cols, rows = 5, 2
    kw = (kx1 - kx0 - 0.16 * S) / cols
    for r in range(rows):
        for c in range(cols):
            x = kx0 + 0.08 * S + c * kw; y = ky0 + 0.10 * S + r * 0.10 * S
            d.rounded_rectangle([x + 0.012 * S, y, x + kw - 0.012 * S, y + 0.06 * S], radius=0.012 * S, fill=W)
    d.rounded_rectangle([kx0 + 0.16 * S, ky1 - 0.13 * S, kx1 - 0.16 * S, ky1 - 0.07 * S], radius=0.012 * S, fill=W)
    # mouse
    mx0, my0, mx1, my1 = 0.72 * S, 0.30 * S, 0.96 * S, 0.74 * S
    d.rounded_rectangle([mx0, my0, mx1, my1], radius=0.12 * S, outline=W, width=int(0.055 * S))
    cx = (mx0 + mx1) / 2
    d.line([(cx, my0 + 0.02 * S), (cx, my0 + 0.17 * S)], fill=W, width=int(0.045 * S))
    d.line([(mx0 + 0.02 * S, my0 + 0.17 * S), (mx1 - 0.02 * S, my0 + 0.17 * S)], fill=W, width=int(0.045 * S))
    return im.resize((s, s), Image.Resampling.LANCZOS)

def _icon_touch(s):
    """A hand with its finger tapping (rings around the fingertip), white on transparent."""
    k = 4; S = s * k
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    W = (255, 255, 255, 255)
    fx = 0.46 * S; ft = 0.22 * S    # fingertip
    # tap rings
    for r, w in ((0.13, 0.04), (0.21, 0.035)):
        d.arc([fx - r * S, ft - r * S, fx + r * S, ft + r * S], 200, 340, fill=W, width=int(w * S))
    # index finger
    fw = 0.13 * S
    d.rounded_rectangle([fx - fw / 2, ft, fx + fw / 2, 0.66 * S], radius=fw / 2, fill=W)
    # folded fingers (three knuckles to the right)
    for i, (x, top) in enumerate(((0.585, 0.47), (0.70, 0.50), (0.81, 0.55))):
        d.rounded_rectangle([x * S - 0.055 * S, top * S, x * S + 0.055 * S, 0.72 * S], radius=0.055 * S, fill=W)
    # palm
    d.rounded_rectangle([0.39 * S, 0.55 * S, 0.87 * S, 0.96 * S], radius=0.16 * S, fill=W)
    # thumb, angled in from the left
    th = Image.new("RGBA", (S, S), (0, 0, 0, 0)); td = ImageDraw.Draw(th)
    td.rounded_rectangle([0.20 * S, 0.60 * S, 0.50 * S, 0.71 * S], radius=0.055 * S, fill=W)
    th = th.rotate(-35, center=(0.47 * S, 0.70 * S), resample=Image.Resampling.BICUBIC)
    im.alpha_composite(th)
    # the gaps between the fingers, cut back out so they read as fingers
    cut = Image.new("L", (S, S), 0); cd = ImageDraw.Draw(cut)
    for x in (0.528, 0.643, 0.756):
        cd.line([(x * S, 0.50 * S), (x * S, 0.69 * S)], fill=255, width=int(0.018 * S))
    a = im.getchannel("A"); a.paste(0, (0, 0), cut); im.putalpha(a)
    return im.resize((s, s), Image.Resampling.LANCZOS)


ICONS = {"mkb": _icon_mkb, "touch": _icon_touch}


def badges(face, features, art_box, size=112, gap=14, margin=22):
    """The control badges in the bottom-left corner of art_box on face (in place)."""
    feats = [f for f in FEATURES if f in (features or ())]
    if not feats:
        return
    d = ImageDraw.Draw(face)
    y1 = art_box[3] - margin
    y0 = y1 - size
    x = art_box[0] + margin
    sh = Image.new("L", face.size, 0)
    for _ in feats:
        ImageDraw.Draw(sh).rounded_rectangle([x + 3, y0 + 6, x + size + 3, y1 + 6], radius=18, fill=120)
        x += size + gap
    face.paste((0, 0, 0), (0, 0), sh.filter(ImageFilter.GaussianBlur(8)))
    x = art_box[0] + margin
    for f in feats:
        d.rounded_rectangle([x - 5, y0 - 5, x + size + 5, y1 + 5], radius=22, fill="white")
        d.rounded_rectangle([x, y0, x + size, y1], radius=17, fill=(22, 22, 22))
        ic = ICONS[f](int(size * 0.8))
        face.paste(ic, (x + (size - ic.width) // 2, y0 + (size - ic.height) // 2), ic)
        x += size + gap


def flat(cover, features, width=480):
    """The flat box art with the control badges, for the list when 3D boxes are off."""
    img = cover.convert("RGB")
    if img.width != width:
        img = img.resize((width, round(img.height * width / img.width)), Image.Resampling.LANCZOS)
    k = width / 640
    badges(img, features, (0, 0, img.width, img.height), size=round(112 * k), gap=round(14 * k), margin=round(22 * k))
    return img


def _front(cover, logo, W=640, H=960, rating=None, features=None):
    face = Image.new("RGB", (W, H), (6, 6, 6))
    head, edge = 86, 11
    d = ImageDraw.Draw(face)
    for y in range(head):                                # glossy black header, a hint of green
        t = y / head
        d.line([(0, y), (W, y)], fill=(int(30 - 24 * t), int(36 - 24 * t), int(30 - 24 * t)))
    lg = logo.copy(); lg.thumbnail((62, 62), Image.Resampling.LANCZOS)
    face.paste(lg, (34, (head - lg.height) // 2), lg)
    f = _font(31)
    d.text((34 + lg.width + 14, head / 2 + 2), "XBOX CLOUD GAMING", font=f, fill="white", anchor="lm")
    for i in range(14):                                  # the glowing line, like Steam's blue one
        a = max(0, 1 - i / 14) ** 2
        d.line([(0, head - i), (W, head - i)], fill=tuple(int(c1 * (1 - a * 0.5) + c2 * a * 0.5) for c1, c2 in zip(d.im.getpixel((5, head - i))[:3], LIME)))
    d.rectangle([0, head, W, head + 5], fill=GREEN)
    d.line([(0, head), (W, head)], fill=(120, 230, 90), width=2)
    # a cover taller than the box loses a little of its bottom rather than its top,
    # so a banner across the top of a retail cover (XBOX 360...) isn't cut in half
    art = ImageOps.fit(cover.convert("RGB"), (W - 2 * edge, H - head - 5 - edge), Image.Resampling.LANCZOS, centering=(0.5, 0.1))
    face.paste(art, (edge, head + 5))
    _tile(face, rating, (edge, head + 5, edge + art.width, head + 5 + art.height))
    badges(face, features, (edge, head + 5, edge + art.width, head + 5 + art.height))
    return _round(face, 16)


def _spine(title, logo, W=58, H=960):
    sp = Image.new("RGB", (W, H), (4, 4, 4))
    d = ImageDraw.Draw(sp)
    for x in range(W):                                   # rounded plastic: lighter in the middle
        v = int(4 + 20 * (1 - abs(x - W * 0.45) / (W / 2)) ** 2)
        d.line([(x, 0), (x, H)], fill=(v, v, v))
    lg = logo.copy(); lg.thumbnail((W - 20, W - 20), Image.Resampling.LANCZOS)
    sp.paste(lg, ((W - lg.width) // 2, 24), lg)
    # the name, top to bottom, in big spaced capitals (like "RAFT")
    side = Image.new("RGBA", (H - 120, W), (0, 0, 0, 0))
    sd = ImageDraw.Draw(side)
    t, size = title.upper(), 27
    f = _font(size)
    width = lambda: sum(sd.textlength(c, font=f) for c in t) + 10 * (len(t) - 1)
    while width() > side.width - 30 and len(t) > 3:
        size -= 2
        if size < 18:
            t, size = t[:-2].rstrip() + "…", 18
        f = _font(size)
    _spaced(sd, (6, W / 2 + 1), t, f, "white", 10, False)
    side = side.rotate(-90, expand=True)
    sp.paste(side, (0, 96), side)
    return _round(sp, 10)


def make(cover, title, logo, out_w=500, rating=None, features=None):
    """rating: (age, label) from Sync-GameList.py, e.g. (13, "ESRB T"); None = no tile.
    features: what the game can be played with besides a controller ("mkb", "touch")."""
    S = 2
    CW, CH = 620 * S, 910 * S
    canvas = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
    sx0, sx1, fx1 = 16 * S, 52 * S, 604 * S
    front_q = [(sx1, 10 * S), (fx1, 34 * S), (fx1, 872 * S), (sx1, 898 * S)]
    spine_q = [(sx0, 22 * S), (sx1, 10 * S), (sx1, 898 * S), (sx0, 886 * S)]
    sh = Image.new("L", (CW, CH), 0)                     # a soft shadow on the floor
    ImageDraw.Draw(sh).polygon([(sx0 + 10 * S, 892 * S), (fx1, 866 * S), (fx1 - 6 * S, 880 * S), (sx0 + 20 * S, 906 * S)], fill=160)
    sh = sh.filter(ImageFilter.GaussianBlur(10 * S))
    canvas.paste((0, 0, 0, 255), (0, 0), sh)
    canvas.alpha_composite(_warp(_spine(title, logo), spine_q, (CW, CH)))
    canvas.alpha_composite(_warp(_front(cover, logo, rating=rating, features=features), front_q, (CW, CH)))
    # a soft gloss across the cover, and light catching the case edges
    gloss = Image.new("L", (CW, CH), 0)
    ImageDraw.Draw(gloss).polygon([(sx1, 10 * S), (sx1 + 260 * S, 22 * S), (sx1 + 40 * S, 896 * S), (sx1, 898 * S)], fill=30)
    gloss = gloss.filter(ImageFilter.GaussianBlur(60 * S))
    mask = Image.new("L", (CW, CH), 0)
    ImageDraw.Draw(mask).polygon(front_q, fill=255)
    gloss = Image.composite(gloss, Image.new("L", (CW, CH), 0), mask)
    canvas.alpha_composite(Image.merge("RGBA", (Image.new("L", (CW, CH), 255),) * 3 + (gloss,)))
    e = ImageDraw.Draw(canvas)
    e.line([(sx1, 16 * S), (sx1, 892 * S)], fill=(255, 255, 255, 60), width=S)
    e.line([(fx1 - 1 * S, 46 * S), (fx1 - 1 * S, 860 * S)], fill=(255, 255, 255, 50), width=S)
    canvas = canvas.crop(canvas.getbbox())
    return canvas.resize((out_w, round(canvas.height * out_w / canvas.width)), Image.Resampling.LANCZOS)
