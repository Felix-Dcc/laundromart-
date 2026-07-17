"""
LaundroMart brand asset generator.

Design-time utility, NOT part of the build. Run it only when the brand changes:

    python scripts/brand/generate_icons.py

Requires Pillow (`pip install pillow`). Writes every master asset into
mobile/assets/. Expo/EAS derives the per-density sizes (mipmaps, iOS icon set)
from these masters at build time, so there is no need to commit dozens of sizes.

The mark: a washing-machine porthole with sudsy water — laundry-specific,
geometric, and legible down to favicon size. All variants are rendered from the
single `draw_mark()` definition below so they can never drift apart.
"""

import math
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from PIL.PngImagePlugin import PngInfo

# ── Brand ────────────────────────────────────────────────────────────
BRAND_BRIGHT = (53, 160, 255)   # #35A0FF
BRAND_MID    = (27, 123, 247)   # #1B7BF7
BRAND_DEEP   = (11, 79, 216)    # #0B4FD8
ACCENT_CYAN  = (125, 217, 255)  # #7DD9FF — the water; must differ from the ring
WHITE        = (255, 255, 255)

SS = 4  # supersample factor — draw big, downscale with LANCZOS for clean edges

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.abspath(os.path.join(HERE, "..", "..", "assets"))

META = PngInfo()
META.add_text("Software", "LaundroMart brand generator")


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient_square(size):
    """Diagonal brand gradient, full-bleed (Apple applies its own corner mask)."""
    img = Image.new("RGB", (size, size), BRAND_MID)
    px = img.load()
    for y in range(size):
        for x in range(size):
            # normalised diagonal position
            t = (x / size * 0.45) + (y / size * 0.55)
            px[x, y] = lerp(BRAND_BRIGHT, BRAND_DEEP, min(1.0, t))
    return img


BUBBLES = [  # (dx, dy, r) relative to mark size — above the waterline
    (0.080, -0.120, 0.042),
    (-0.070, -0.058, 0.028),
    (0.008, -0.175, 0.022),
]


def draw_mark(size, color=WHITE, water=ACCENT_CYAN, solid=False):
    """
    Washing-machine porthole: a bold ring, water resting in the lower half,
    bubbles rising through the glass.

    color : ring + bubble colour
    water : waterline colour — MUST contrast with `color`, or the two shapes
            merge into an unreadable blob.
    solid : single-colour silhouette for Android monochrome/notification icons,
            where only the alpha channel survives.
    """
    S = size * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    cx = cy = S / 2
    R = 0.325 * S            # outer ring radius
    stroke = 0.072 * S       # ring thickness
    r_in = R - stroke * 0.5  # inner (glass) radius

    # ── water: gentle single-period wave, clipped to the glass ───────
    wmask = Image.new("L", (S, S), 0)
    wd = ImageDraw.Draw(wmask)
    level = cy + 0.055 * S
    amp = 0.022 * S
    pts = []
    steps = 300
    for i in range(steps + 1):
        t = i / steps
        x = cx - r_in + (2 * r_in) * t
        y = level + math.sin(t * math.pi * 2.0) * amp
        pts.append((x, y))
    pts += [(cx + r_in, cy + r_in + S), (cx - r_in, cy + r_in + S)]
    wd.polygon(pts, fill=255)

    clip = Image.new("L", (S, S), 0)
    ImageDraw.Draw(clip).ellipse([cx - r_in, cy - r_in, cx + r_in, cy + r_in], fill=255)
    wmask = Image.composite(wmask, Image.new("L", (S, S), 0), clip)

    fill = color if solid else water
    img.paste(Image.new("RGBA", (S, S), fill + (255,)), (0, 0), wmask)

    # ── bubbles in the glass, above the water ────────────────────────
    for bx, by, br in BUBBLES:
        x, y, r = cx + bx * S, cy + by * S, br * S
        d.ellipse([x - r, y - r, x + r, y + r], fill=color + (255,))

    # ── ring drawn last so it caps the water cleanly ─────────────────
    d.ellipse([cx - R, cy - R, cx + R, cy + R], outline=color + (255,), width=int(stroke))

    return img.resize((size, size), Image.LANCZOS)


def save(img, name):
    path = os.path.join(ASSETS, name)
    img.save(path, pnginfo=META)
    print(f"  {name:34s} {img.size[0]}x{img.size[1]}")


def scaled_mark(canvas, mark_frac, color=WHITE, water=ACCENT_CYAN, solid=False):
    """Mark centred on a transparent canvas, occupying `mark_frac` of the width."""
    out = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    m = int(canvas * mark_frac)
    mk = draw_mark(m, color, water, solid)
    out.paste(mk, ((canvas - m) // 2, (canvas - m) // 2), mk)
    return out


def font(size):
    for p in ["C:/Windows/Fonts/segoeuib.ttf", "C:/Windows/Fonts/arialbd.ttf"]:
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            continue
    return ImageFont.load_default()


def wordmark(width, text_color):
    """Horizontal lockup: mark + 'LaundroMart' — for auth screens/headers."""
    H = 320
    W = width
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    m = 300
    mk = draw_mark(m, text_color, ACCENT_CYAN)
    img.paste(mk, (0, (H - m) // 2), mk)
    d = ImageDraw.Draw(img)
    f = font(150)
    d.text((m + 40, H / 2), "LaundroMart", font=f, fill=text_color + (255,), anchor="lm")
    return img.crop(img.getbbox())


def main():
    os.makedirs(ASSETS, exist_ok=True)
    print(f"Writing brand assets to {ASSETS}\n")

    # 1. iOS / general app icon — full-bleed, opaque, NO rounded corners
    #    (Apple applies the mask; baking corners in is a rejection risk).
    icon = gradient_square(1024)
    mk = draw_mark(1024)
    icon.paste(mk, (0, 0), mk)
    save(icon, "icon.png")

    # 2. Android adaptive icon: foreground glyph must sit inside the centre 66%
    #    safe zone — launchers crop the outer edge to circles/squircles.
    save(scaled_mark(1024, 0.62), "adaptive-icon.png")

    # 3. Adaptive background layer (gradient, so Android matches iOS)
    save(gradient_square(1024).convert("RGBA"), "adaptive-icon-bg.png")

    # 4. Android 13+ themed icon — silhouette; the OS supplies the colour
    save(scaled_mark(1024, 0.62, WHITE, WHITE, solid=True), "adaptive-icon-mono.png")

    # 5. Notification icon — Android uses ALPHA ONLY; any colour becomes a
    #    white blob, so this must be a silhouette on transparent.
    save(scaled_mark(96, 0.86, WHITE, WHITE, solid=True), "notification-icon.png")

    # 6. Splash logo — composited over splash.backgroundColor
    save(scaled_mark(1024, 0.70), "splash.png")

    # 7. Favicon
    fav = gradient_square(48)
    fmk = draw_mark(48)
    fav.paste(fmk, (0, 0), fmk)
    save(fav.convert("RGBA"), "favicon.png")

    # 8. Auth-screen lockups. The app theme is dark glassmorphism, so the white
    #    lockup is the primary; the deep-blue one is for any light surface.
    save(wordmark(1400, WHITE), "logo-light.png")
    save(wordmark(1400, BRAND_DEEP), "logo-dark.png")

    # 9. Bare mark for headers/in-app use
    save(scaled_mark(512, 0.92), "logo-mark.png")

    print("\nDone. Expo derives per-density sizes from these at build time.")


if __name__ == "__main__":
    main()
