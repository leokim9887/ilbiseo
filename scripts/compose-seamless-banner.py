#!/usr/bin/env python3
"""Compose one seamless atmospheric family banner (스며드는 unified surface)."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageOps

W, H = 1680, 700
BG = (235, 230, 223)
TEAL = (22, 63, 57)
SRC = Path("/cursor/stores/self/media/family-source")
OUT_PUBLIC = Path("/workspace/public/ilbiseo-family-banner.jpg")
OUT_MEDIA = Path("/cursor/stores/self/media/ilbiseo-family-banner.jpg")


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
    """Opaque on left, dissolves through mid→right into atmosphere."""
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
            # slight vertical soft edges
            vy = 255
            ty = y / (h - 1)
            if ty < 0.04:
                vy = int(255 * (ty / 0.04))
            elif ty > 0.96:
                vy = int(255 * ((1 - ty) / 0.04))
            px[x, y] = min(a, vy)
    return mask.filter(ImageFilter.GaussianBlur(radius=26))


def night_grade(im: Image.Image, strength: float = 0.55) -> Image.Image:
    dim = ImageEnhance.Brightness(im).enhance(0.84)
    muted = ImageEnhance.Color(dim).enhance(0.78)
    contrast = ImageEnhance.Contrast(muted).enhance(0.96)
    veil = Image.new("RGBA", contrast.size, (*TEAL, int(50 * strength)))
    warm = Image.new("RGBA", contrast.size, (170, 150, 120, int(24 * strength)))
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


def main() -> None:
    # Atmosphere base: blurred family (city lights) stretched full-bleed — continuous plane
    fam_src = load("05-family.jpg")
    atmosphere = cover_crop(fam_src, W, H, bias=(0.55, 0.55))
    atmosphere = ImageEnhance.Brightness(atmosphere).enhance(0.72)
    atmosphere = ImageEnhance.Color(atmosphere).enhance(0.85)
    atmosphere = atmosphere.filter(ImageFilter.GaussianBlur(radius=18))
    canvas = atmosphere.copy()

    # Soft stone/teal mist so right side isn't a second "panel"
    mist = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    md = ImageDraw.Draw(mist)
    for x in range(W):
        t = x / (W - 1)
        a = int(38 * (t**1.4))
        md.line([(x, 0), (x, H)], fill=(*BG, a))
    canvas.alpha_composite(mist.filter(ImageFilter.GaussianBlur(radius=12)))

    # Family plane — faces readable on left, soft dissolve into atmosphere (no hard edge)
    # Portrait source: crop a landscape slice that keeps faces
    # bias_y≈0.38 keeps all four faces in-frame (do not shift up — faces sit low)
    family = cover_crop(fam_src, 1120, H, bias=(0.48, 0.38))
    family = ImageEnhance.Brightness(family).enhance(0.97)
    family = ImageEnhance.Color(family).enhance(0.96)
    fam_mask = soft_right_fade((1120, H), fade_start=0.5)
    paste_masked(canvas, family, (-30, 0), fam_mask, 1.0)

    # Portraits dissolve into the same continuous mist
    baby = night_grade(
        cover_crop(load("04-baby.png"), 540, 580, bias=(0.5, 0.24)), strength=0.55
    )
    paste_masked(canvas, baby, (980, 0), radial_mask((540, 580), soft=0.4), 0.94)

    dog = night_grade(
        cover_crop(load("02-dog.png"), 380, 380, bias=(0.5, 0.4)), strength=0.58
    )
    paste_masked(canvas, dog, (820, 310), radial_mask((380, 380), soft=0.36), 0.92)

    cat = night_grade(
        cover_crop(load("03-cat.png"), 360, 360, bias=(0.52, 0.34)), strength=0.55
    )
    paste_masked(canvas, cat, (1300, 310), radial_mask((360, 360), soft=0.38), 0.92)

    # Bridge haze between family dissolve and portraits
    bridge = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    bd = ImageDraw.Draw(bridge)
    for x in range(720, 1280):
        mid = 980
        dist = abs(x - mid) / 280
        peak = max(0.0, 1.0 - dist)
        a = int(22 * peak * peak)
        bd.line([(x, 0), (x, H)], fill=(30, 50, 55, a))
    canvas.alpha_composite(bridge.filter(ImageFilter.GaussianBlur(radius=28)))

    # Calm left + bottom band for motto/stats (quiet area, not a box)
    wash = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    wd = ImageDraw.Draw(wash)
    for x in range(0, 580):
        t = 1.0 - x / 580
        a = int(64 * (t**1.3))
        wd.line([(x, 0), (x, H)], fill=(*TEAL, a))
    for y in range(H - 200, H):
        t = (y - (H - 200)) / 200
        a = int(62 * (t**1.05))
        wd.line([(0, y), (W, y)], fill=(*TEAL, a))
    canvas.alpha_composite(wash)

    rgb = canvas.convert("RGB").filter(ImageFilter.GaussianBlur(radius=0.4))
    OUT_PUBLIC.parent.mkdir(parents=True, exist_ok=True)
    OUT_MEDIA.parent.mkdir(parents=True, exist_ok=True)
    rgb.save(OUT_PUBLIC, "JPEG", quality=91, optimize=True)
    rgb.save(OUT_MEDIA, "JPEG", quality=91, optimize=True)
    print(f"wrote {OUT_PUBLIC} ({W}x{H})")


if __name__ == "__main__":
    main()
