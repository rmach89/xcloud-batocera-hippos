"""A 3D game case for Batocera's list, drawn from a game's flat cover.

Black keep-case: a header with the app's cloud logo and XBOX CLOUD GAMING, a
green line under it, the cover, and a black spine with the logo and the
game's name. Turned so the spine shows; transparent background.
"""
import glob, os
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

GREEN = (16, 124, 16)
LIME = (64, 190, 40)
VERSION = 6   # bump to redraw every box after a design change (6: the age-rating tile)


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


def _front(cover, logo, W=640, H=960, rating=None):
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
    art = ImageOps.fit(cover.convert("RGB"), (W - 2 * edge, H - head - 5 - edge), Image.Resampling.LANCZOS)
    face.paste(art, (edge, head + 5))
    _tile(face, rating, (edge, head + 5, edge + art.width, head + 5 + art.height))
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


def make(cover, title, logo, out_w=500, rating=None):
    """rating: (age, label) from Sync-GameList.py, e.g. (13, "ESRB T"); None = no tile."""
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
    canvas.alpha_composite(_warp(_front(cover, logo, rating=rating), front_q, (CW, CH)))
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
