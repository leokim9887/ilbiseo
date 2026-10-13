#!/usr/bin/env python3
"""Compose atmospheric family banners (PC + mobile) with clearer faces.

Goals (faces-fullscreen-pull-refresh):
- Every subject face clearly visible (family 5, baby, dog, cat)
- Mobile: baby face noticeably larger; dog & cat a bit larger too
- Baby still largest among insets; pets larger than prior polish
- Keep calm sky for gold motto + fused stats (no face cover in layout)
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
    return cover_crop(im, tw, th, bias=(0.5, 0.5))


def unsharp(im: Image.Image, percent: int = 115, radius: float = 1.2) -> Image.Image:
    return im.filter(
        ImageFilter.UnsharpMask(radius=radius, percent=percent, threshold=2)
    )


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
    """Face-group — keep all 5 (bearded chin + older faces); more bottom for cap-wearer."""
    return box_crop_frac(fam_src, 0.06, 0.24, 0.92, 0.92)


def polish_family_faces(faces: Image.Image) -> Image.Image:
    w, h = faces.size
    sharp = ImageEnhance.Contrast(faces).enhance(1.18)
    sharp = ImageEnhance.Brightness(sharp).enhance(1.10)
    sharp = ImageEnhance.Color(sharp).enhance(1.04)
    sharp = unsharp(sharp, percent=155, radius=1.55)
    top_dim = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    td = ImageDraw.Draw(top_dim)
    band = int(h * 0.28)
    for y in range(0, band):
        t = 1.0 - y / max(1, band)
        a = int(130 * (t**1.35))
        td.line([(0, y), (w, y)], fill=(*TEAL, a))
    sharp = Image.alpha_composite(sharp, top_dim.filter(ImageFilter.GaussianBlur(radius=6)))
    # Opaque core covers all 5 faces incl. bearded chin (bottom) + older man (right)
    subject = subject_ellipse_mask(
        sharp.size, cx=0.50, cy=0.52, rx=0.62, ry=0.72, soft=0.48
    )
    out = sharp.copy()
    out.putalpha(subject)
    return out


def family_plane(fam_src: Image.Image, tw: int, th: int, scale_boost: float = 1.12) -> Image.Image:
    faces = polish_family_faces(family_five(fam_src))
    sw, sh = faces.size
    # Fit inside plane (contain) so bearded chin / cap aren't clipped by crop
    scale = min(tw / sw, th / sh) * scale_boost
    nw, nh = max(1, int(sw * scale + 0.5)), max(1, int(sh * scale + 0.5))
    if nw > tw:
        scale = tw / sw
        nw, nh = tw, max(1, int(sh * scale + 0.5))
    if nh > th:
        scale = th / sh
        nw, nh = max(1, int(sw * scale + 0.5)), th
    resized = faces.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    ox = (tw - nw) // 2
    # Bias slightly up so bottom faces (cap) stay inside + soft fade doesn't eat chin
    oy = max(0, (th - nh) // 2 - int(th * 0.02))
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

    # Larger family plane — 5 faces read clearer on fullscreen PC
    fw, fh = 1080, H
    family = family_plane(fam_src, fw, fh, scale_boost=1.08)
    family = ImageEnhance.Brightness(family).enhance(1.05)
    family = ImageEnhance.Color(family).enhance(1.0)
    fam_mask = soft_right_fade((fw, fh), fade_start=0.78)
    paste_masked(canvas, family, (0, 0), fam_mask, 1.0)

    # Baby — larger than polish (was 500×545)
    baby = night_grade(
        cover_crop(load("04-baby.png"), 560, 610, bias=(0.5, 0.16)), strength=0.34
    )
    paste_masked(canvas, baby, (1045, -15), radial_mask((560, 610), soft=0.52), 0.98)

    # Dog / cat — a bit larger, still below baby
    dog = night_grade(
        cover_crop(load("02-dog.png"), 470, 470, bias=(0.5, 0.36)), strength=0.36
    )
    paste_masked(canvas, dog, (880, 255), radial_mask((470, 470), soft=0.46), 0.97)

    cat = night_grade(
        cover_crop(load("03-cat.png"), 450, 450, bias=(0.52, 0.32)), strength=0.34
    )
    paste_masked(canvas, cat, (1310, 255), radial_mask((450, 450), soft=0.48), 0.97)

    bridge = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    bd = ImageDraw.Draw(bridge)
    for x in range(800, 1120):
        mid = 960
        dist = abs(x - mid) / 180
        peak = max(0.0, 1.0 - dist)
        a = int(10 * peak * peak)
        bd.line([(x, 0), (x, H)], fill=(30, 50, 55, a))
    canvas.alpha_composite(bridge.filter(ImageFilter.GaussianBlur(radius=16)))

    calm_wash(canvas, left_w=460, bottom_h=150)
    return canvas.convert("RGB")


def compose_mobile(fam_src: Image.Image) -> Image.Image:
    W, H = MOBILE
    canvas = city_atmosphere(fam_src, W, H)
    mist_right(canvas)

    # Family left — contain-fit so all 5 faces (incl. beard/cap) stay solid
    fw, fh = 900, 720
    family = family_plane(fam_src, fw, fh, scale_boost=1.05)
    family = ImageEnhance.Brightness(family).enhance(1.06)
    family = ImageEnhance.Color(family).enhance(1.02)
    fam_mask = soft_right_fade((fw, fh), fade_start=0.82)
    bot = soft_bottom_fade((fw, fh), fade_start=0.97)
    combined = ImageChops.multiply(fam_mask, bot)
    paste_masked(canvas, family, (4, 50), combined, 1.0)

    # Baby — noticeably larger for father on phone (polish 345×380 → 470×515)
    baby = night_grade(
        cover_crop(load("04-baby.png"), 470, 515, bias=(0.5, 0.14)), strength=0.30
    )
    paste_masked(canvas, baby, (695, 12), radial_mask((470, 515), soft=0.54), 0.98)

    # Dog / cat — larger than polish; still under baby
    dog = night_grade(
        cover_crop(load("02-dog.png"), 385, 385, bias=(0.5, 0.36)), strength=0.32
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

    calm_wash(canvas, left_w=300, bottom_h=130)
    return canvas.convert("RGB")


def save_jpeg(im: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "JPEG", quality=94, optimize=True)
    print(f"wrote {path} ({im.size[0]}x{im.size[1]})")


def main() -> None:
    fam_src = load("05-family.jpg")
    pc = compose_pc(fam_src)
    mobile = compose_mobile(fam_src)

    save_jpeg(pc, OUT_PUBLIC / "ilbiseo-family-banner-pc.jpg")
    save_jpeg(mobile, OUT_PUBLIC / "ilbiseo-family-banner-mobile.jpg")
    save_jpeg(pc, OUT_PUBLIC / "ilbiseo-family-banner.jpg")

    save_jpeg(pc, OUT_MEDIA / "ilbiseo-family-banner-pc.jpg")
    save_jpeg(mobile, OUT_MEDIA / "ilbiseo-family-banner-mobile.jpg")
    save_jpeg(pc, OUT_MEDIA / "ilbiseo-family-banner.jpg")


if __name__ == "__main__":
    main()
