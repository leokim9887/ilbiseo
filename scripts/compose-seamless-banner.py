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

# Banner insets use the new Ace (tan-cap) photo; cheer overlay keeps original baby face
BABY_SRC = "04-baby-ace-new.png"
CHEER_SRC = "04-baby.png"
DOG_SRC = "02-dog-new.png"
# Face + tan cap framing (mobile / shared default)
BABY_BIAS = (0.52, 0.30)
# PC-only: less cropped — full face (both cheeks + chin + hat brim), not a tight zoom
BABY_BIAS_PC = (0.50, 0.38)
# Original cheer crop bias (pre Ace-cap replace)
CHEER_BIAS = (0.50, 0.14)
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

    # Wider plane — slightly contained so soft mask doesn't eat chin / elder
    fw, fh = 1240, H
    family = family_plane(
        fam_src, fw, fh, scale_boost=1.04, anchor_x=0.34, anchor_y=0.50
    )
    family = ImageEnhance.Brightness(family).enhance(1.05)
    family = ImageEnhance.Color(family).enhance(1.0)
    fam_mask = soft_right_fade((fw, fh), fade_start=0.84)
    paste_masked(canvas, family, (-48, 0), fam_mask, 1.0)

    # Pets lower/outward — well clear of Ace cheeks (PC only)
    dog = night_grade(
        cover_crop(load_dog(), 320, 320, bias=DOG_BIAS), strength=0.36
    )
    paste_masked(canvas, dog, (680, 500), radial_mask((320, 320), soft=0.55), 0.90)

    cat = night_grade(
        cover_crop(load("03-cat.png"), 300, 300, bias=(0.52, 0.32)), strength=0.34
    )
    paste_masked(canvas, cat, (1425, 500), radial_mask((300, 300), soft=0.55), 0.90)

    # Baby/Ace — AGGRESSIVE zoom-out: visibly smaller face, full cheeks + hat
    # sides + shoulders/garment like source. Contain << 0.82. Soft ellipse keeps
    # entire portrait (incl. both cheeks) fully opaque. Ace on top. Mobile unchanged.
    bw, bh = 820, 860
    baby_src = load(BABY_SRC)
    sw, sh = baby_src.size
    scale = min(bw / sw, bh / sh) * 0.48  # much smaller face in slot
    nw, nh = max(1, int(sw * scale + 0.5)), max(1, int(sh * scale + 0.5))
    resized = night_grade(
        baby_src.resize((nw, nh), Image.Resampling.LANCZOS), strength=0.10
    )
    baby_plane = Image.new("RGBA", (bw, bh), (0, 0, 0, 0))
    ox, oy = (bw - nw) // 2, max(0, (bh - nh) // 2)
    baby_plane.paste(resized, (ox, oy), resized)
    # soft high + wide rx → whole photo inside opaque zone (cheeks never clipped)
    ace_mask = radial_mask((bw, bh), soft=0.88, rx_scale=1.35, ry_scale=1.20)
    # right edge 870+820=1690 → slight clip OK; keep centered on right half
    paste_masked(canvas, baby_plane, (870, -50), ace_mask, 0.99)

    bridge = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    bd = ImageDraw.Draw(bridge)
    for x in range(800, 1120):
        mid = 960
        dist = abs(x - mid) / 180
        peak = max(0.0, 1.0 - dist)
        a = int(10 * peak * peak)
        bd.line([(x, 0), (x, H)], fill=(30, 50, 55, a))
    canvas.alpha_composite(bridge.filter(ImageFilter.GaussianBlur(radius=16)))

    calm_wash(canvas, left_w=420, bottom_h=150)
    return canvas.convert("RGB")


def compose_mobile(fam_src: Image.Image) -> Image.Image:
    W, H = MOBILE
    canvas = city_atmosphere(fam_src, W, H)
    mist_right(canvas)

    # Large family blob — fit height so all 5 faces stay solid; shift LEFT on canvas
    fw, fh = 980, H - 16
    family = family_plane(
        fam_src, fw, fh, scale_boost=1.0, anchor_x=0.08, anchor_y=0.55
    )
    family = ImageEnhance.Brightness(family).enhance(1.06)
    family = ImageEnhance.Color(family).enhance(1.02)
    fam_mask = soft_right_fade((fw, fh), fade_start=0.90)
    bot = soft_bottom_fade((fw, fh), fade_start=0.995)
    combined = ImageChops.multiply(fam_mask, bot)
    # Negative x fills empty dark left; positive y keeps chin above bottom fade
    paste_masked(canvas, family, (-96, 12), combined, 1.0)

    baby = night_grade(
        cover_crop(load(BABY_SRC), 470, 515, bias=BABY_BIAS), strength=0.30
    )
    paste_masked(canvas, baby, (695, 12), radial_mask((470, 515), soft=0.54), 0.98)

    dog = night_grade(
        cover_crop(load_dog(), 385, 385, bias=DOG_BIAS), strength=0.32
    )
    paste_masked(canvas, dog, (620, 400), radial_mask((385, 385), soft=0.46), 0.97)

    cat = night_grade(
        cover_crop(load("03-cat.png"), 370, 370, bias=(0.52, 0.30)), strength=0.30
    )
    paste_masked(canvas, cat, (845, 355), radial_mask((370, 370), soft=0.48), 0.97)

    bridge = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    bd = ImageDraw.Draw(bridge)
    for x in range(560, 820):
        mid = 690
        dist = abs(x - mid) / 150
        peak = max(0.0, 1.0 - dist)
        a = int(8 * peak * peak)
        bd.line([(x, 0), (x, H)], fill=(30, 50, 55, a))
    canvas.alpha_composite(bridge.filter(ImageFilter.GaussianBlur(radius=14)))

    # Narrower left wash — family now occupies left edge
    calm_wash(canvas, left_w=160, bottom_h=130)
    return canvas.convert("RGB")


def compose_grandson_cheer_face() -> Image.Image:
    """Circular Ace face for daily cheer overlay — original baby (not banner Ace-cap)."""
    baby = cover_crop(load(CHEER_SRC), 640, 640, bias=CHEER_BIAS)
    baby = ImageEnhance.Contrast(baby).enhance(1.08)
    baby = ImageEnhance.Brightness(baby).enhance(1.04)
    baby = unsharp(baby, percent=130, radius=1.3)
    mask = radial_mask((640, 640), soft=0.72)
    baby.putalpha(mask)
    return baby


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
    save_png(cheer, OUT_PUBLIC / "ilbiseo-grandson-cheer.png")

    save_jpeg(pc, OUT_MEDIA / "ilbiseo-family-banner-pc.jpg")
    save_jpeg(mobile, OUT_MEDIA / "ilbiseo-family-banner-mobile.jpg")
    save_jpeg(pc, OUT_MEDIA / "ilbiseo-family-banner.jpg")
    save_png(cheer, OUT_MEDIA / "ilbiseo-grandson-cheer.png")


if __name__ == "__main__":
    main()
