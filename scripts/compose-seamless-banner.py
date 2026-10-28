#!/usr/bin/env python3
"""Compose atmospheric family banners (PC + mobile) with clearer faces.

Goals (banner-scroll-daily-cheer):
- Family-of-5: ALL faces fully visible (no chin/beanie/elder clip)
- Mobile: enlarge + shift LEFT to kill empty dark gap beside family blob
- Baby remains largest inset; pets slightly smaller
- Also export grandson face asset for daily cheer overlay
- Keep calm sky for gold motto + fused stats
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageOps

SRC = Path("/cursor/stores/self/media/family-source")
OUT_PUBLIC = Path("/workspace/public")
OUT_MEDIA = Path("/cursor/stores/self/media")

PC = (1680, 700)
MOBILE = (1170, 780)

BG = (235, 230, 223)
TEAL = (22, 63, 57)

# Banner insets use the new Ace (tan-cap) photo; cheer uses hooded upper-body source
BABY_SRC = "04-baby-ace-new.png"
# Absolute path preferred for cheer — tall phone portrait (hood + torso)
CHEER_SRC_ABS = Path(
    "/cursor/stores/self/media/ilbiseo-ace-cheer-source.png"
)
CHEER_SRC = "04-baby.png"  # legacy family-source fallback name
DOG_SRC = "02-dog-new.png"
# Face + tan cap framing (mobile / shared default)
BABY_BIAS = (0.52, 0.30)
# Gemini-match Ace: full cheeks + chin + hat brim (face-centered like ref)
BABY_BIAS_PC = (0.50, 0.32)
# Hooded Ace cheer: upper-body square (head/hood + torso); legs cropped out
# (cover_crop bias unused when CHEER_BOX_FRAC path is used)
CHEER_BIAS = (0.42, 0.158)
# Explicit frac box on 1440×3120 source → ~90% width square upper body
CHEER_BOX = (60 / 1440, 493 / 3120, 1356 / 1440, 1789 / 3120)
# New dog: face-forward Maltese; bias keeps eyes in upper-center of square crop
DOG_BIAS = (0.50, 0.28)


def load(name: str) -> Image.Image:
    return ImageOps.exif_transpose(Image.open(SRC / name)).convert("RGBA")


def enhance_dog_hq(im: Image.Image) -> Image.Image:
    """Practical HQ pass for small/noisy dog source — no invented detail.

    Pipeline (documented for handoff):
    1) Mild OpenCV bilateral denoise (preserves edges, softens JPEG grain)
    2) Stepwise LANCZOS upscale if short side < 600 (max ~2×)
    3) Mild UnsharpMask after upscale
    4) Slight contrast / brightness for night-grade collage
    """
    import numpy as np

    try:
        import cv2
    except ImportError:  # pragma: no cover
        cv2 = None

    rgb = im.convert("RGB")
    arr = np.asarray(rgb)

    if cv2 is not None:
        # d=5, sigmaColor/Space modest — denoise without plastic look
        arr = cv2.bilateralFilter(arr, d=5, sigmaColor=35, sigmaSpace=35)
        rgb = Image.fromarray(arr)
    else:
        rgb = rgb.filter(ImageFilter.MedianFilter(size=3))

    w, h = rgb.size
    short = min(w, h)
    if short < 600:
        # Cap at 2× so we don't fabricate fine fur detail
        target_short = min(600, short * 2)
        scale = target_short / short
        nw, nh = int(w * scale + 0.5), int(h * scale + 0.5)
        # Two-step LANCZOS when scale > 1.5 for gentler interp
        if scale > 1.5:
            mid = (
                int(w * (scale**0.5) + 0.5),
                int(h * (scale**0.5) + 0.5),
            )
            rgb = rgb.resize(mid, Image.Resampling.LANCZOS)
        rgb = rgb.resize((nw, nh), Image.Resampling.LANCZOS)

    rgb = unsharp(rgb, percent=110, radius=1.1)
    rgb = ImageEnhance.Contrast(rgb).enhance(1.04)
    rgb = ImageEnhance.Brightness(rgb).enhance(1.02)
    return rgb.convert("RGBA")


def load_dog() -> Image.Image:
    return enhance_dog_hq(load(DOG_SRC))


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
    return cover_crop(im, tw, th, bias=(0.5, 0.5))


def unsharp(im: Image.Image, percent: int = 115, radius: float = 1.2) -> Image.Image:
    return im.filter(
        ImageFilter.UnsharpMask(radius=radius, percent=percent, threshold=2)
    )


def radial_mask(
    size: tuple[int, int],
    soft: float = 0.45,
    *,
    rx_scale: float = 1.0,
    ry_scale: float = 1.0,
) -> Image.Image:
    """Elliptical vignette. rx_scale>1 widens horizontal so cheeks stay opaque."""
    w, h = size
    mask = Image.new("L", (w, h), 0)
    cx, cy = (w - 1) / 2.0, (h - 1) / 2.0
    rx, ry = max(w / 2.0, 1) * rx_scale, max(h / 2.0, 1) * ry_scale
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
    return mask.filter(ImageFilter.GaussianBlur(radius=max(6, int(min(w, h) * 0.028))))


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
            if ty < 0.015:
                vy = int(255 * (ty / 0.015))
            elif ty > 0.985:
                vy = int(255 * ((1 - ty) / 0.015))
            px[x, y] = min(a, vy)
    return mask.filter(ImageFilter.GaussianBlur(radius=12))


def soft_bottom_fade(size: tuple[int, int], fade_start: float = 0.72) -> Image.Image:
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
            if tx < 0.012:
                vx = int(255 * (tx / 0.012))
            elif tx > 0.988:
                vx = int(255 * ((1 - tx) / 0.012))
            px[x, y] = min(a, vx)
    return mask.filter(ImageFilter.GaussianBlur(radius=10))


def subject_ellipse_mask(
    size: tuple[int, int],
    cx: float = 0.48,
    cy: float = 0.58,
    rx: float = 0.42,
    ry: float = 0.48,
    soft: float = 0.55,
) -> Image.Image:
    w, h = size
    mask = Image.new("L", (w, h), 0)
    px = mask.load()
    ecx, ecy = cx * (w - 1), cy * (h - 1)
    erx, ery = max(rx * w, 1), max(ry * h, 1)
    for y in range(h):
        for x in range(w):
            nx = (x - ecx) / erx
            ny = (y - ecy) / ery
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
    return mask.filter(ImageFilter.GaussianBlur(radius=max(8, int(min(w, h) * 0.022))))


def night_grade(im: Image.Image, strength: float = 0.45) -> Image.Image:
    dim = ImageEnhance.Brightness(im).enhance(0.96)
    muted = ImageEnhance.Color(dim).enhance(0.92)
    contrast = ImageEnhance.Contrast(muted).enhance(1.08)
    veil = Image.new("RGBA", contrast.size, (*TEAL, int(22 * strength)))
    warm = Image.new("RGBA", contrast.size, (170, 150, 120, int(14 * strength)))
    out = contrast.copy()
    out.alpha_composite(veil)
    out.alpha_composite(warm)
    return unsharp(out, percent=125, radius=1.25)


def paste_masked(
    base: Image.Image,
    layer: Image.Image,
    xy: tuple[int, int],
    mask: Image.Image,
    opacity: float = 1.0,
) -> None:
    layer_a = layer.getchannel("A")
    if mask.size != layer.size:
        mask = mask.resize(layer.size, Image.Resampling.BILINEAR)
    combined = ImageChops.multiply(layer_a, mask)
    if opacity < 0.999:
        combined = combined.point(lambda p: int(p * opacity))
    tmp = Image.new("RGBA", base.size, (0, 0, 0, 0))
    rgb = layer.convert("RGBA")
    rgb.putalpha(combined)
    tmp.paste(rgb, xy, rgb)
    base.alpha_composite(tmp)


def family_five(fam_src: Image.Image) -> Image.Image:
    """Face-group — tight on faces; cut empty beach left; pad chin/elder."""
    return box_crop_frac(fam_src, 0.11, 0.29, 0.935, 0.94)


def polish_family_faces(faces: Image.Image) -> Image.Image:
    w, h = faces.size
    sharp = ImageEnhance.Contrast(faces).enhance(1.18)
    sharp = ImageEnhance.Brightness(sharp).enhance(1.10)
    sharp = ImageEnhance.Color(sharp).enhance(1.04)
    sharp = unsharp(sharp, percent=155, radius=1.55)
    top_dim = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    td = ImageDraw.Draw(top_dim)
    band = int(h * 0.22)
    for y in range(0, band):
        t = 1.0 - y / max(1, band)
        a = int(110 * (t**1.35))
        td.line([(0, y), (w, y)], fill=(*TEAL, a))
    sharp = Image.alpha_composite(sharp, top_dim.filter(ImageFilter.GaussianBlur(radius=6)))
    # Wide opaque core — periphery faces (cap + older man) stay fully solid
    subject = subject_ellipse_mask(
        sharp.size, cx=0.50, cy=0.55, rx=0.72, ry=0.78, soft=0.66
    )
    out = sharp.copy()
    out.putalpha(subject)
    return out


def family_plane(
    fam_src: Image.Image,
    tw: int,
    th: int,
    scale_boost: float = 1.12,
    *,
    anchor_x: float = 0.5,
    anchor_y: float = 0.48,
    allow_overflow: bool = False,
) -> Image.Image:
    """Compose family faces into a plane.

    When allow_overflow is False (default), scale never exceeds the plane so
    chin / beanie / elder faces aren't clipped by the canvas edge.
    """
    faces = polish_family_faces(family_five(fam_src))
    sw, sh = faces.size
    scale = min(tw / sw, th / sh) * scale_boost
    nw, nh = max(1, int(sw * scale + 0.5)), max(1, int(sh * scale + 0.5))
    if not allow_overflow:
        if nw > tw:
            scale = tw / sw
            nw, nh = tw, max(1, int(sh * scale + 0.5))
        if nh > th:
            scale = th / sh
            nw, nh = max(1, int(sw * scale + 0.5)), th
    resized = faces.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    ox = int((tw - nw) * anchor_x)
    oy = int((th - nh) * anchor_y)
    # Clamp so paste never clips faces off the plane
    if not allow_overflow:
        ox = max(0, min(ox, tw - nw))
        oy = max(0, min(oy, th - nh))
    canvas.paste(resized, (ox, oy), resized)
    return canvas


def city_atmosphere(fam_src: Image.Image, w: int, h: int) -> Image.Image:
    sky = box_crop_frac(fam_src, 0.0, 0.0, 1.0, 0.50)
    atm = fit_cover(sky, w, h)
    atm = ImageEnhance.Brightness(atm).enhance(0.62)
    atm = ImageEnhance.Color(atm).enhance(0.80)
    return atm.filter(ImageFilter.GaussianBlur(radius=22))


def calm_wash(canvas: Image.Image, left_w: int, bottom_h: int) -> None:
    w, h = canvas.size
    wash = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    wd = ImageDraw.Draw(wash)
    for x in range(0, left_w):
        t = 1.0 - x / max(1, left_w)
        a = int(52 * (t**1.25))
        wd.line([(x, 0), (x, h)], fill=(*TEAL, a))
    for y in range(h - bottom_h, h):
        t = (y - (h - bottom_h)) / max(1, bottom_h)
        a = int(44 * (t**1.05))
        wd.line([(0, y), (w, y)], fill=(*TEAL, a))
    for y in range(0, int(h * 0.24)):
        t = 1.0 - y / max(1, int(h * 0.24))
        a = int(36 * (t**1.4))
        wd.line([(0, y), (w, y)], fill=(*TEAL, a))
    canvas.alpha_composite(wash.filter(ImageFilter.GaussianBlur(radius=8)))


def mist_right(canvas: Image.Image) -> None:
    w, h = canvas.size
    mist = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    md = ImageDraw.Draw(mist)
    for x in range(w):
        t = x / (w - 1)
        a = int(24 * (t**1.45))
        md.line([(x, 0), (x, h)], fill=(*BG, a))
    canvas.alpha_composite(mist.filter(ImageFilter.GaussianBlur(radius=10)))


def compose_pc(fam_src: Image.Image) -> Image.Image:
    W, H = PC
    canvas = city_atmosphere(fam_src, W, H)
    mist_right(canvas)

    # Gemini-match: family ~left 42–45% with soft-right feather into mid gutter
    fw, fh = 1080, H
    family = family_plane(
        fam_src, fw, fh, scale_boost=1.02, anchor_x=0.30, anchor_y=0.50
    )
    family = ImageEnhance.Brightness(family).enhance(1.05)
    family = ImageEnhance.Color(family).enhance(1.0)
    fam_mask = soft_right_fade((fw, fh), fade_start=0.68)
    paste_masked(canvas, family, (-40, 0), fam_mask, 1.0)

    # Gemini-match (real sources only — never paste Gemini mock):
    # Ace dominates right; closer to mid so gutter matches ref; soft circular glow.
    bw, bh = 740, 800
    baby = night_grade(
        cover_crop(load(BABY_SRC), bw, bh, bias=BABY_BIAS_PC), strength=0.16
    )
    # Warm circular halo behind Ace (ref soft yellow-white glow)
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gx, gy = 1285, 300
    for r, a in ((400, 24), (300, 36), (210, 50), (140, 58)):
        gd.ellipse([gx - r, gy - r, gx + r, gy + r], fill=(245, 235, 210, a))
    canvas.alpha_composite(glow.filter(ImageFilter.GaussianBlur(radius=52)))
    paste_masked(
        canvas,
        baby,
        (920, -30),
        radial_mask((bw, bh), soft=0.58, rx_scale=1.14, ry_scale=1.08),
        0.99,
    )

    # Pets after Ace — smaller, flanking chin/chest like ref (cheeks clear)
    dog = night_grade(
        cover_crop(load_dog(), 310, 310, bias=DOG_BIAS), strength=0.26
    )
    # Nudge left toward Ace left cheek (user: 강아지만 살짝 왼쪽)
    paste_masked(canvas, dog, (880, 440), radial_mask((310, 310), soft=0.40), 0.95)

    cat = night_grade(
        cover_crop(load("03-cat.png"), 300, 300, bias=(0.52, 0.32)), strength=0.24
    )
    paste_masked(canvas, cat, (1410, 420), radial_mask((300, 300), soft=0.42), 0.95)

    # Soft mid feather bridge (family → Ace)
    bridge = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    bd = ImageDraw.Draw(bridge)
    for x in range(760, 1100):
        mid = 930
        dist = abs(x - mid) / 190
        peak = max(0.0, 1.0 - dist)
        a = int(12 * peak * peak)
        bd.line([(x, 0), (x, H)], fill=(28, 45, 52, a))
    canvas.alpha_composite(bridge.filter(ImageFilter.GaussianBlur(radius=20)))

    calm_wash(canvas, left_w=360, bottom_h=140)
    return canvas.convert("RGB")


def compose_mobile(fam_src: Image.Image) -> Image.Image:
    W, H = MOBILE
    canvas = city_atmosphere(fam_src, W, H)
    mist_right(canvas)

    # Gemini-match mobile: family left + soft feather; Ace larger on right
    fw, fh = 880, H - 16
    family = family_plane(
        fam_src, fw, fh, scale_boost=1.0, anchor_x=0.10, anchor_y=0.52
    )
    family = ImageEnhance.Brightness(family).enhance(1.06)
    family = ImageEnhance.Color(family).enhance(1.02)
    fam_mask = soft_right_fade((fw, fh), fade_start=0.72)
    bot = soft_bottom_fade((fw, fh), fade_start=0.97)
    combined = ImageChops.multiply(fam_mask, bot)
    paste_masked(canvas, family, (-80, 10), combined, 1.0)

    bw, bh = 600, 660
    baby = night_grade(
        cover_crop(load(BABY_SRC), bw, bh, bias=BABY_BIAS_PC), strength=0.16
    )
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gx, gy = 900, 290
    for r, a in ((320, 22), (240, 34), (160, 46)):
        gd.ellipse([gx - r, gy - r, gx + r, gy + r], fill=(245, 235, 210, a))
    canvas.alpha_composite(glow.filter(ImageFilter.GaussianBlur(radius=42)))
    paste_masked(
        canvas,
        baby,
        (600, -5),
        radial_mask((bw, bh), soft=0.56, rx_scale=1.12, ry_scale=1.06),
        0.99,
    )

    dog = night_grade(
        cover_crop(load_dog(), 260, 260, bias=DOG_BIAS), strength=0.24
    )
    paste_masked(canvas, dog, (560, 475), radial_mask((260, 260), soft=0.38), 0.95)

    cat = night_grade(
        cover_crop(load("03-cat.png"), 250, 250, bias=(0.52, 0.30)), strength=0.22
    )
    paste_masked(canvas, cat, (960, 455), radial_mask((250, 250), soft=0.40), 0.95)

    bridge = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    bd = ImageDraw.Draw(bridge)
    for x in range(500, 760):
        mid = 630
        dist = abs(x - mid) / 140
        peak = max(0.0, 1.0 - dist)
        a = int(11 * peak * peak)
        bd.line([(x, 0), (x, H)], fill=(28, 45, 52, a))
    canvas.alpha_composite(bridge.filter(ImageFilter.GaussianBlur(radius=16)))

    calm_wash(canvas, left_w=140, bottom_h=120)
    return canvas.convert("RGB")


def compose_grandson_cheer_face() -> Image.Image:
    """Square Ace upper-body for daily cheer overlay (CSS clips to circle).

    Source: tall phone portrait — crop favors hood/ears + face + buttoned torso;
    cuts above empty lower legs. Soft circular alpha no longer baked in (overlay
    frame + radial vignette handle the circle).
    """
    if CHEER_SRC_ABS.exists():
        raw = ImageOps.exif_transpose(Image.open(CHEER_SRC_ABS)).convert("RGBA")
        l, t, r, b = CHEER_BOX
        baby = box_crop_frac(raw, l, t, r, b).resize(
            (640, 640), Image.Resampling.LANCZOS
        )
    else:
        baby = cover_crop(load(CHEER_SRC), 640, 640, bias=CHEER_BIAS)
    baby = ImageEnhance.Contrast(baby).enhance(1.06)
    baby = ImageEnhance.Brightness(baby).enhance(1.03)
    baby = ImageEnhance.Color(baby).enhance(1.02)
    baby = unsharp(baby, percent=120, radius=1.2)
    return baby.convert("RGB")


def save_jpeg(im: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "JPEG", quality=94, optimize=True)
    print(f"wrote {path} ({im.size[0]}x{im.size[1]})")


def save_png(im: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "PNG", optimize=True)
    print(f"wrote {path} ({im.size[0]}x{im.size[1]})")


def main() -> None:
    fam_src = load("05-family.jpg")
    pc = compose_pc(fam_src)
    mobile = compose_mobile(fam_src)
    cheer = compose_grandson_cheer_face()

    save_jpeg(pc, OUT_PUBLIC / "ilbiseo-family-banner-pc.jpg")
    save_jpeg(mobile, OUT_PUBLIC / "ilbiseo-family-banner-mobile.jpg")
    save_jpeg(pc, OUT_PUBLIC / "ilbiseo-family-banner.jpg")
    save_jpeg(cheer, OUT_PUBLIC / "ilbiseo-grandson-cheer.jpg")

    save_jpeg(pc, OUT_MEDIA / "ilbiseo-family-banner-pc.jpg")
    save_jpeg(mobile, OUT_MEDIA / "ilbiseo-family-banner-mobile.jpg")
    save_jpeg(pc, OUT_MEDIA / "ilbiseo-family-banner.jpg")
    save_jpeg(cheer, OUT_MEDIA / "ilbiseo-grandson-cheer.jpg")


if __name__ == "__main__":
    main()
