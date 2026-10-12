#!/usr/bin/env python3
"""Compose seamless atmospheric family banners (PC + mobile).

Family of 5: face-group crop from portrait source so all faces stay visible.
Mobile: taller, rebalanced collage (family / baby / dog / cat / city).
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageOps

SRC = Path("/cursor/stores/self/media/family-source")
OUT_PUBLIC = Path("/workspace/public")
OUT_MEDIA = Path("/cursor/stores/self/media")

# Keep legacy path as PC default for older caches / docs
PC = (1680, 700)
MOBILE = (1170, 780)  # ~1.5:1 — taller phone banner so faces breathe

BG = (235, 230, 223)
TEAL = (22, 63, 57)


def load(name: str) -> Image.Image:
    return ImageOps.exif_transpose(Image.open(SRC / name)).convert("RGBA")


def cover_crop(im: Image.Image, tw: int, th: int, bias=(0.5, 0.35)) -> Image.Image:
    sw, sh = im.size
    scale = max(tw / sw, th / sh)
    nw, nh = int(sw * scale + 0.5), int(sh * scale + 0.5)
    im = im.resize((nw, nh), Image.Resampling.LANCZOS)
    cx = max(0, min(int((nw - tw) * bias[0]), nw - tw))
    cy = max(0, min(int((nh - th) * bias[1]), nh - th))
    return im.crop((cx, cy, cx + tw, cy + th))


def box_crop_frac(im: Image.Image, l: float, t: float, r: float, b: float) -> Image.Image:
    w, h = im.size
    return im.crop((int(l * w), int(t * h), int(r * w), int(b * h)))


def fit_cover(im: Image.Image, tw: int, th: int) -> Image.Image:
    """Scale+center crop to exact size (no bias)."""
    return cover_crop(im, tw, th, bias=(0.5, 0.5))


def radial_mask(size: tuple[int, int], soft: float = 0.45) -> Image.Image:
    w, h = size
    mask = Image.new("L", (w, h), 0)
    cx, cy = (w - 1) / 2.0, (h - 1) / 2.0
    rx, ry = max(w / 2.0, 1), max(h / 2.0, 1)
    px = mask.load()
    for y in range(h):
        for x in range(w):
            nx = (x - cx) / rx
            ny = (y - cy) / ry
            d = (nx * nx + ny * ny) ** 0.5
            if d <= soft:
                a = 255
            elif d >= 1.0:
                a = 0
            else:
                t = (d - soft) / (1.0 - soft)
                t = t * t * (3 - 2 * t)
                a = int(255 * (1 - t))
            px[x, y] = a
    return mask.filter(ImageFilter.GaussianBlur(radius=max(14, int(min(w, h) * 0.05))))


def soft_right_fade(size: tuple[int, int], fade_start: float = 0.55) -> Image.Image:
    w, h = size
    mask = Image.new("L", (w, h), 255)
    px = mask.load()
    for x in range(w):
        t = x / (w - 1)
        if t <= fade_start:
            a = 255
        else:
            u = (t - fade_start) / max(1e-6, 1 - fade_start)
            u = u * u * (3 - 2 * u)
            a = int(255 * (1 - u))
        for y in range(h):
            vy = 255
            ty = y / (h - 1)
            if ty < 0.03:
                vy = int(255 * (ty / 0.03))
            elif ty > 0.97:
                vy = int(255 * ((1 - ty) / 0.03))
            px[x, y] = min(a, vy)
    return mask.filter(ImageFilter.GaussianBlur(radius=22))


def soft_bottom_fade(size: tuple[int, int], fade_start: float = 0.72) -> Image.Image:
    """Keep top opaque; dissolve toward bottom (for family sitting mid-banner)."""
    w, h = size
    mask = Image.new("L", (w, h), 255)
    px = mask.load()
    for y in range(h):
        t = y / (h - 1)
        if t <= fade_start:
            a = 255
        else:
            u = (t - fade_start) / max(1e-6, 1 - fade_start)
            u = u * u * (3 - 2 * u)
            a = int(255 * (1 - u))
        for x in range(w):
            vx = 255
            tx = x / (w - 1)
            if tx < 0.02:
                vx = int(255 * (tx / 0.02))
            elif tx > 0.98:
                vx = int(255 * ((1 - tx) / 0.02))
            px[x, y] = min(a, vx)
    return mask.filter(ImageFilter.GaussianBlur(radius=18))


def night_grade(im: Image.Image, strength: float = 0.55) -> Image.Image:
    dim = ImageEnhance.Brightness(im).enhance(0.88)
    muted = ImageEnhance.Color(dim).enhance(0.82)
    contrast = ImageEnhance.Contrast(muted).enhance(0.98)
    veil = Image.new("RGBA", contrast.size, (*TEAL, int(42 * strength)))
    warm = Image.new("RGBA", contrast.size, (170, 150, 120, int(22 * strength)))
    out = contrast.copy()
    out.alpha_composite(veil)
    out.alpha_composite(warm)
    return out


def paste_masked(
    base: Image.Image,
    layer: Image.Image,
    xy: tuple[int, int],
    mask: Image.Image,
    opacity: float = 1.0,
) -> None:
    a = mask if opacity >= 0.999 else mask.point(lambda p: int(p * opacity))
    tmp = Image.new("RGBA", base.size, (0, 0, 0, 0))
    tmp.paste(layer, xy, a)
    base.alpha_composite(tmp)


def family_five(fam_src: Image.Image) -> Image.Image:
    """Crop that keeps all 5 faces (bearded front + grandma back)."""
    # Deep vertical span of the cluster — include bearded chin + grandma crown
    return box_crop_frac(fam_src, 0.0, 0.22, 1.0, 0.93)


def family_plane(
    fam_src: Image.Image, tw: int, th: int
) -> Image.Image:
    """Fit face group inside tw×th without cropping faces (letterbox to canvas)."""
    faces = family_five(fam_src)
    sw, sh = faces.size
    scale = min(tw / sw, th / sh)
    nw, nh = max(1, int(sw * scale + 0.5)), max(1, int(sh * scale + 0.5))
    resized = faces.resize((nw, nh), Image.Resampling.LANCZOS)
    # Bottom-align in plane so faces sit low (motto/sky above on mobile)
    canvas = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    ox = (tw - nw) // 2
    oy = th - nh  # bottom align
    canvas.paste(resized, (ox, oy))
    return canvas


def city_atmosphere(fam_src: Image.Image, w: int, h: int) -> Image.Image:
    # Upper skyline/water for continuous city glow
    sky = box_crop_frac(fam_src, 0.0, 0.0, 1.0, 0.55)
    atm = fit_cover(sky, w, h)
    atm = ImageEnhance.Brightness(atm).enhance(0.70)
    atm = ImageEnhance.Color(atm).enhance(0.88)
    return atm.filter(ImageFilter.GaussianBlur(radius=16))


def calm_wash(canvas: Image.Image, left_w: int, bottom_h: int) -> None:
    w, h = canvas.size
    wash = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    wd = ImageDraw.Draw(wash)
    for x in range(0, left_w):
        t = 1.0 - x / max(1, left_w)
        a = int(70 * (t**1.25))
        wd.line([(x, 0), (x, h)], fill=(*TEAL, a))
    for y in range(h - bottom_h, h):
        t = (y - (h - bottom_h)) / max(1, bottom_h)
        a = int(58 * (t**1.05))
        wd.line([(0, y), (w, y)], fill=(*TEAL, a))
    # Soft top band so motto can sit above faces on mobile
    for y in range(0, int(h * 0.28)):
        t = 1.0 - y / max(1, int(h * 0.28))
        a = int(48 * (t**1.4))
        wd.line([(0, y), (w, y)], fill=(*TEAL, a))
    canvas.alpha_composite(wash.filter(ImageFilter.GaussianBlur(radius=10)))


def mist_right(canvas: Image.Image) -> None:
    w, h = canvas.size
    mist = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    md = ImageDraw.Draw(mist)
    for x in range(w):
        t = x / (w - 1)
        a = int(36 * (t**1.45))
        md.line([(x, 0), (x, h)], fill=(*BG, a))
    canvas.alpha_composite(mist.filter(ImageFilter.GaussianBlur(radius=12)))


def compose_pc(fam_src: Image.Image) -> Image.Image:
    W, H = PC
    canvas = city_atmosphere(fam_src, W, H)
    mist_right(canvas)

    # Narrower left plane ≈ source face-group aspect → all 5 faces survive cover-crop
    fw, fh = 860, H
    family = family_plane(fam_src, fw, fh)
    family = ImageEnhance.Brightness(family).enhance(0.98)
    family = ImageEnhance.Color(family).enhance(0.97)
    fam_mask = soft_right_fade((fw, fh), fade_start=0.55)
    paste_masked(canvas, family, (-8, 0), fam_mask, 1.0)

    # Portraits — smaller baby so family isn't dwarfed; dog/cat more present
    baby = night_grade(
        cover_crop(load("04-baby.png"), 400, 440, bias=(0.5, 0.22)), strength=0.5
    )
    paste_masked(canvas, baby, (1120, 30), radial_mask((400, 440), soft=0.42), 0.93)

    dog = night_grade(
        cover_crop(load("02-dog.png"), 380, 380, bias=(0.5, 0.38)), strength=0.52
    )
    paste_masked(canvas, dog, (920, 310), radial_mask((380, 380), soft=0.38), 0.94)

    cat = night_grade(
        cover_crop(load("03-cat.png"), 360, 360, bias=(0.52, 0.34)), strength=0.5
    )
    paste_masked(canvas, cat, (1360, 320), radial_mask((360, 360), soft=0.4), 0.93)

    # Bridge haze
    bridge = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    bd = ImageDraw.Draw(bridge)
    for x in range(780, 1180):
        mid = 980
        dist = abs(x - mid) / 220
        peak = max(0.0, 1.0 - dist)
        a = int(20 * peak * peak)
        bd.line([(x, 0), (x, H)], fill=(30, 50, 55, a))
    canvas.alpha_composite(bridge.filter(ImageFilter.GaussianBlur(radius=26)))

    calm_wash(canvas, left_w=520, bottom_h=180)
    return canvas.convert("RGB").filter(ImageFilter.GaussianBlur(radius=0.35))


def compose_mobile(fam_src: Image.Image) -> Image.Image:
    """Phone-width collage: family cluster centered-left, pets balanced, calm top for motto."""
    W, H = MOBILE
    canvas = city_atmosphere(fam_src, W, H)
    mist_right(canvas)

    # Family cluster: centered-left, all 5 faces; sky reserved for motto
    fw, fh = 760, 640
    family = family_plane(fam_src, fw, fh)
    family = ImageEnhance.Brightness(family).enhance(0.99)
    family = ImageEnhance.Color(family).enhance(0.98)
    fam_mask = soft_right_fade((fw, fh), fade_start=0.64)
    bot = soft_bottom_fade((fw, fh), fade_start=0.9)
    combined = ImageChops_multiply(fam_mask, bot)
    paste_masked(canvas, family, (40, 110), combined, 1.0)

    # Baby — upper-right, kept modest vs family scale
    baby = night_grade(
        cover_crop(load("04-baby.png"), 250, 280, bias=(0.5, 0.2)), strength=0.48
    )
    paste_masked(canvas, baby, (850, 110), radial_mask((250, 280), soft=0.44), 0.91)

    # Dog — stronger presence vs baby
    dog = night_grade(
        cover_crop(load("02-dog.png"), 330, 330, bias=(0.5, 0.38)), strength=0.5
    )
    paste_masked(canvas, dog, (700, 420), radial_mask((330, 330), soft=0.36), 0.95)

    # Cat — far right, similar scale to dog
    cat = night_grade(
        cover_crop(load("03-cat.png"), 310, 310, bias=(0.52, 0.32)), strength=0.48
    )
    paste_masked(canvas, cat, (900, 380), radial_mask((310, 310), soft=0.38), 0.94)

    bridge = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    bd = ImageDraw.Draw(bridge)
    for x in range(560, 900):
        mid = 730
        dist = abs(x - mid) / 180
        peak = max(0.0, 1.0 - dist)
        a = int(18 * peak * peak)
        bd.line([(x, 0), (x, H)], fill=(30, 50, 55, a))
    canvas.alpha_composite(bridge.filter(ImageFilter.GaussianBlur(radius=22)))

    # Stronger top calm for motto; lighter left so faces stay visible
    calm_wash(canvas, left_w=360, bottom_h=160)
    return canvas.convert("RGB").filter(ImageFilter.GaussianBlur(radius=0.35))


def ImageChops_multiply(a: Image.Image, b: Image.Image) -> Image.Image:
    from PIL import ImageChops

    return ImageChops.multiply(a, b)


def save_jpeg(im: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "JPEG", quality=91, optimize=True)
    print(f"wrote {path} ({im.size[0]}x{im.size[1]})")


def main() -> None:
    fam_src = load("05-family.jpg")
    pc = compose_pc(fam_src)
    mobile = compose_mobile(fam_src)

    # Dual assets
    save_jpeg(pc, OUT_PUBLIC / "ilbiseo-family-banner-pc.jpg")
    save_jpeg(mobile, OUT_PUBLIC / "ilbiseo-family-banner-mobile.jpg")
    # Legacy / default = PC (desktop SSR / older refs)
    save_jpeg(pc, OUT_PUBLIC / "ilbiseo-family-banner.jpg")

    save_jpeg(pc, OUT_MEDIA / "ilbiseo-family-banner-pc.jpg")
    save_jpeg(mobile, OUT_MEDIA / "ilbiseo-family-banner-mobile.jpg")
    save_jpeg(pc, OUT_MEDIA / "ilbiseo-family-banner.jpg")


if __name__ == "__main__":
    main()
