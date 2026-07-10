#!/usr/bin/env python3
"""Generate original, deterministic PBR-support textures for Sol Action RPG DEMO.

No external images are used.  The output is intentionally compact WebP/PNG and can be
regenerated on any machine with Pillow + NumPy.
"""
from __future__ import annotations

import math
import os
from pathlib import Path
from typing import Iterable

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "assets" / "textures"
RNG = np.random.default_rng(18473)


def ensure(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def save_rgb(array: np.ndarray, path: Path, quality: int = 86) -> None:
    ensure(path)
    arr = np.clip(array, 0, 255).astype(np.uint8)
    image = Image.fromarray(arr, "RGB")
    if path.suffix.lower() == ".webp":
        image.save(path, "WEBP", quality=quality, method=6)
    else:
        image.save(path, optimize=True)


def save_gray(array: np.ndarray, path: Path, quality: int = 88) -> None:
    ensure(path)
    arr = np.clip(array, 0, 255).astype(np.uint8)
    image = Image.fromarray(arr, "L")
    if path.suffix.lower() == ".webp":
        image.save(path, "WEBP", quality=quality, method=6)
    else:
        image.save(path, optimize=True)


def octave_noise(size: int, octaves: Iterable[tuple[int, float]], seed_offset: int = 0) -> np.ndarray:
    local = np.random.default_rng(18473 + seed_offset)
    result = np.zeros((size, size), dtype=np.float32)
    weight_sum = 0.0
    for grid, weight in octaves:
        small = local.random((grid, grid), dtype=np.float32)
        image = Image.fromarray((small * 255).astype(np.uint8), "L")
        image = image.resize((size, size), Image.Resampling.BICUBIC)
        result += np.asarray(image, dtype=np.float32) / 255.0 * weight
        weight_sum += weight
    return result / max(weight_sum, 1e-6)


def normal_from_height(height: np.ndarray, strength: float = 4.0) -> np.ndarray:
    gy, gx = np.gradient(height.astype(np.float32))
    nx = -gx * strength
    ny = np.ones_like(height)
    nz = -gy * strength
    length = np.sqrt(nx * nx + ny * ny + nz * nz)
    nx /= length
    ny /= length
    nz /= length
    return np.stack([(nx * 0.5 + 0.5) * 255, (nz * 0.5 + 0.5) * 255, (ny * 0.5 + 0.5) * 255], axis=-1)


def terrain_set(name: str, base: tuple[int, int, int], rough: int, seed: int,
                streaks: bool = False, pebbles: bool = False, cracks: bool = False) -> None:
    size = 512
    macro = octave_noise(size, [(4, 0.5), (11, 0.3), (31, 0.2)], seed)
    micro = octave_noise(size, [(32, 0.35), (82, 0.25), (156, 0.15)], seed + 77)
    height = 0.62 * macro + 0.38 * micro
    yy, xx = np.mgrid[0:size, 0:size]
    if streaks:
        height += np.sin(xx / 14.0 + np.sin(yy / 37.0)) * 0.035
    if pebbles:
        for _ in range(180):
            cx, cy = RNG.integers(0, size, 2)
            rx = int(RNG.integers(2, 10)); ry = int(RNG.integers(2, 8))
            blob = np.exp(-(((xx-cx)/max(rx,1))**2 + ((yy-cy)/max(ry,1))**2) * 2.0)
            height += blob * float(RNG.uniform(0.05, 0.16))
    if cracks:
        crack = Image.new("L", (size, size), 0)
        draw = ImageDraw.Draw(crack)
        for _ in range(38):
            x, y = RNG.integers(0, size, 2)
            points = [(int(x), int(y))]
            for __ in range(int(RNG.integers(2, 6))):
                x += int(RNG.integers(-28, 29)); y += int(RNG.integers(-28, 29))
                points.append((int(x), int(y)))
            draw.line(points, fill=int(RNG.integers(90, 180)), width=int(RNG.integers(1, 3)))
        crack_arr = np.asarray(crack.filter(ImageFilter.GaussianBlur(0.55)), dtype=np.float32) / 255.0
        height -= crack_arr * 0.18
    variation = (macro - 0.5) * 0.20 + (micro - 0.5) * 0.11
    tint = np.array(base, dtype=np.float32)
    color = tint[None, None, :] * (1.0 + variation[..., None])
    # Slight warm/cool local hue shifts rather than neutral luminance noise.
    color[..., 0] += (macro - 0.5) * 10
    color[..., 1] += (micro - 0.5) * 8
    color[..., 2] -= (macro - 0.5) * 5
    roughness = np.full((size, size), rough, dtype=np.float32)
    roughness += (micro - 0.5) * 24
    ao = 232 - np.clip((0.56 - height) * 165, 0, 55)
    out = ASSETS / "terrain"
    save_rgb(color, out / f"{name}_basecolor.webp")
    save_rgb(normal_from_height(height, strength=5.8), out / f"{name}_normal.webp", 90)
    save_gray(roughness, out / f"{name}_roughness.webp")
    save_gray(ao, out / f"{name}_ao.webp")


def make_character_maps() -> None:
    size = 1024
    yy, xx = np.mgrid[0:size, 0:size]
    base = np.empty((size, size, 3), dtype=np.float32)
    base[:] = (198, 181, 148)
    # Four atlas quadrants: skin, cloth, leather/hair, metal. Materials may sample the
    # same atlas with differing UV transforms; it also provides coherent fallback maps.
    base[:512, :512] = (214, 163, 125)
    base[:512, 512:] = (48, 91, 104)
    base[512:, :512] = (73, 51, 42)
    base[512:, 512:] = (178, 150, 87)
    cloth = np.sin(xx / 5.5) * np.sin(yy / 6.5) * 2.2
    leather = octave_noise(size, [(42, .45), (130, .35)], 800) - .5
    base += cloth[..., None]
    base[512:, :512] += leather[512:, :512, None] * 16
    # Subtle edge-wear/rune swirls in the metal region.
    radial = np.sin(np.hypot(xx - 768, yy - 768) / 11.0 + np.arctan2(yy-768, xx-768) * 3.0)
    base[512:, 512:, 0] += radial[512:, 512:] * 3.5
    height = octave_noise(size, [(28, .25), (96, .35), (230, .25)], 811)
    height += cloth / 255.0
    rough = np.full((size, size), 180, dtype=np.float32)
    rough[:512, :512] = 150
    rough[:512, 512:] = 205
    rough[512:, :512] = 192 + leather[512:, :512] * 20
    rough[512:, 512:] = 78
    ao = np.full((size, size), 242, dtype=np.float32)
    ao -= np.clip((0.50 - height) * 60, 0, 25)
    out = ASSETS / "characters"
    save_rgb(base, out / "hero_basecolor.webp", 90)
    save_rgb(normal_from_height(height, 2.2), out / "hero_normal.webp", 92)
    save_gray(rough, out / "hero_roughness.webp", 90)
    save_gray(ao, out / "hero_ao.webp", 90)

    # Compact monster surface maps: skin pores/fur direction/chitin striation.
    for name, base_color, mode, seed in [
        ("slime", (92, 183, 116), "slime", 910),
        ("hare", (158, 119, 84), "fur", 911),
        ("boar", (112, 79, 62), "fur", 912),
        ("wisp", (108, 169, 189), "spirit", 913),
        ("humanoid", (115, 128, 89), "skin", 914),
        ("colossus", (103, 111, 91), "stone", 915),
    ]:
        s = 512
        y, x = np.mgrid[0:s, 0:s]
        n = octave_noise(s, [(18, .4), (64, .4), (150, .2)], seed)
        if mode == "fur":
            h = n * .35 + (np.sin((x + y * .36) / 4.8) * .5 + .5) * .65
        elif mode == "stone":
            h = n + np.maximum(0, np.sin(x / 31 + np.sin(y / 27))) * .1
        elif mode == "slime":
            h = octave_noise(s, [(8,.7),(50,.3)], seed) * .65 + n * .15
        elif mode == "spirit":
            h = (np.sin(x / 19 + np.sin(y / 23)) * .5 + .5) * .5 + n * .25
        else:
            h = n
        col = np.array(base_color, dtype=np.float32)[None,None,:] * (0.88 + h[...,None] * .22)
        r = np.full((s,s), 178 if mode in ("fur","skin") else 128 if mode in ("slime","spirit") else 212, dtype=np.float32)
        r += (n-.5)*18
        save_rgb(col, out / f"monster_{name}_basecolor.webp", 88)
        save_rgb(normal_from_height(h, 2.8 if mode != "stone" else 5.0), out / f"monster_{name}_normal.webp", 90)
        save_gray(r, out / f"monster_{name}_roughness.webp")
        save_gray(230 - np.clip((.52-h)*55,0,30), out / f"monster_{name}_ao.webp")


def make_environment_maps() -> None:
    size = 512
    yy, xx = np.mgrid[0:size, 0:size]
    out = ASSETS / "environment"
    # Bark with branching furrows.
    macro = octave_noise(size, [(7,.55),(25,.3),(90,.15)], 1001)
    grooves = (np.sin(xx/8.5 + np.sin(yy/41)*2.6) * .5 + .5)
    bark_h = macro*.42 + grooves*.58
    bark = np.zeros((size,size,3), np.float32)
    bark[:] = (91, 65, 46)
    bark *= (.78 + bark_h[...,None]*.36)
    save_rgb(bark, out / "bark_basecolor.webp")
    save_rgb(normal_from_height(bark_h, 5.6), out / "bark_normal.webp")
    save_gray(218 + (macro-.5)*18, out / "bark_roughness.webp")
    save_gray(218 - np.clip((.48-bark_h)*95,0,45), out / "bark_ao.webp")
    # Leaf cluster texture, opaque because the generated canopies are meshes.
    leaf_n = octave_noise(size, [(12,.5),(48,.35),(125,.15)], 1002)
    veins = np.abs(np.sin((xx + yy*.3)/21))
    leaf = np.zeros((size,size,3), np.float32); leaf[:] = (64, 124, 67)
    leaf *= (.84 + leaf_n[...,None]*.32)
    leaf[...,1] += veins*4
    save_rgb(leaf, out / "leaves_basecolor.webp")
    save_rgb(normal_from_height(leaf_n*.7+veins*.12, 2.2), out / "leaves_normal.webp")
    save_gray(206 + (leaf_n-.5)*15, out / "leaves_roughness.webp")
    # Rock/ruin.
    stone_n = octave_noise(size, [(5,.38),(19,.37),(95,.25)], 1003)
    pores = octave_noise(size, [(120,.5),(220,.5)], 1004)
    stone_h = stone_n*.7 + pores*.3
    stone = np.zeros((size,size,3), np.float32); stone[:] = (139, 130, 111)
    stone *= (.82 + stone_n[...,None]*.30)
    stone[...,0] += (stone_n-.5)*7
    save_rgb(stone, out / "stone_basecolor.webp")
    save_rgb(normal_from_height(stone_h, 4.0), out / "stone_normal.webp")
    save_gray(222 + (pores-.5)*14, out / "stone_roughness.webp")
    save_gray(224 - np.clip((.52-stone_h)*90,0,42), out / "stone_ao.webp")


def make_effect_maps() -> None:
    out = ASSETS / "effects"
    size = 256
    yy, xx = np.mgrid[0:size, 0:size]
    dx = (xx - size/2)/(size/2); dy=(yy-size/2)/(size/2)
    r = np.sqrt(dx*dx+dy*dy)
    soft = np.clip(1-r, 0, 1)**2.3*255
    save_gray(soft, out / "soft_particle.png")
    # Blade ribbon: bright narrow core and feathered sides, tapered along X.
    ydist = np.abs((yy-size/2)/(size/2))
    taper = np.sin(np.clip(xx/(size-1),0,1)*math.pi)**0.42
    ribbon = np.clip((1-ydist)**3 * taper,0,1)
    rgb = np.zeros((size,size,3),np.float32)
    rgb[...,0] = ribbon*205; rgb[...,1]=ribbon*239; rgb[...,2]=ribbon*255
    save_rgb(rgb, out / "blade_ribbon.webp", 92)
    # Animated rune/noise texture.
    noise = octave_noise(size, [(7,.55),(23,.3),(70,.15)], 1111)
    angle = np.arctan2(dy,dx); rings = (np.sin(r*50 + angle*4)*.5+.5)
    rune = np.clip((rings*.55+noise*.45)*(1-np.clip((r-.25)/.75,0,1)),0,1)*255
    save_gray(rune, out / "rune_noise.webp")
    dust = octave_noise(size, [(10,.4),(44,.35),(120,.25)], 1112)
    save_gray(np.clip(dust*.9 + soft/255*.1,0,1)*255, out / "dust_noise.webp")


def make_icons() -> None:
    out = ASSETS / "ui"
    out.mkdir(parents=True, exist_ok=True)
    styles = {
        "sword": ((213,224,214),(70,84,80)),
        "saber": ((189,231,230),(57,101,108)),
        "greatsword": ((232,195,139),(93,69,53)),
        "leaf": ((155,220,142),(51,100,60)),
        "katana": ((211,190,236),(78,54,98)),
        "relic": ((245,210,112),(107,72,34)),
        "armor": ((151,190,207),(53,70,81)),
        "charm": ((237,182,111),(97,56,48)),
    }
    for name,(light,dark) in styles.items():
        im=Image.new("RGBA",(160,160),(0,0,0,0)); d=ImageDraw.Draw(im)
        d.rounded_rectangle((8,8,152,152),radius=30,fill=(35,43,45,224),outline=(*light,210),width=4)
        if name in ("armor",):
            d.polygon([(44,52),(80,32),(116,52),(109,118),(80,137),(51,118)],fill=(*dark,255),outline=(*light,255))
            d.line([(80,40),(80,128)],fill=(*light,220),width=5)
        elif name=="charm":
            d.ellipse((48,43,112,107),fill=(*dark,255),outline=(*light,255),width=6)
            d.arc((59,55,101,97),0,300,fill=(*light,255),width=6)
            d.line((80,107,80,132),fill=(*light,255),width=8)
        else:
            # Distinct weapon silhouettes, not copied from any commercial game.
            d.polygon([(76,23),(90,23),(91,91),(84,119),(76,91)],fill=(*light,255),outline=(*dark,255))
            if name=="greatsword": d.polygon([(61,35),(99,35),(91,105),(69,105)],fill=(*light,255),outline=(*dark,255))
            if name=="leaf": d.ellipse((64,24,98,98),fill=(*light,255),outline=(*dark,255),width=4)
            if name=="saber": d.arc((44,24,105,121),280,80,fill=(*light,255),width=13)
            if name=="katana": d.arc((58,17,108,128),260,82,fill=(*light,255),width=10)
            if name=="relic":
                d.polygon([(80,18),(101,43),(88,91),(80,119),(72,91),(59,43)],fill=(*light,255),outline=(*dark,255))
            d.rounded_rectangle((50,99,110,111),radius=5,fill=(*dark,255),outline=(*light,255),width=3)
            d.rounded_rectangle((74,108,87,140),radius=5,fill=(*dark,255))
        im.save(out/f"icon_{name}.png",optimize=True)


def main() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)
    terrain_set("grass", (81, 137, 68), 218, 101, streaks=True)
    terrain_set("dirt", (142, 105, 70), 225, 102, pebbles=True)
    terrain_set("sand", (195, 157, 91), 220, 103, streaks=True)
    terrain_set("stone", (132, 132, 119), 205, 104, pebbles=True, cracks=True)
    terrain_set("path", (177, 140, 89), 214, 105, pebbles=True)
    terrain_set("cliff", (116, 101, 80), 226, 106, cracks=True)
    make_character_maps()
    make_environment_maps()
    make_effect_maps()
    make_icons()
    print("Texture generation complete.")


if __name__ == "__main__":
    main()
