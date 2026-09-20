from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

SIZE = 256
OUT = Path(__file__).resolve().parents[1] / "build-assets" / "quantic-studio.ico"


def _lerp(a: int, b: int, t: float) -> int:
    return int(a * (1 - t) + b * t)


def _gradient_card(canvas: Image.Image, box: tuple[int, int, int, int], start: tuple[int, int, int], end: tuple[int, int, int], radius: int) -> None:
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    pixels = layer.load()
    for y in range(h):
        for x in range(w):
            t = (x + y) / max(1, w + h - 2)
            pixels[x, y] = (
                _lerp(start[0], end[0], t),
                _lerp(start[1], end[1], t),
                _lerp(start[2], end[2], t),
                255,
            )
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, w - 1, h - 1), radius=radius, fill=255)
    layer.putalpha(mask)
    canvas.alpha_composite(layer, (x0, y0))


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    image = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    _gradient_card(image, (110, 36, 208, 220), (255, 240, 189), (233, 165, 93), 27)
    _gradient_card(image, (72, 22, 180, 220), (211, 107, 255), (126, 54, 239), 29)
    _gradient_card(image, (31, 48, 147, 232), (239, 43, 216), (90, 23, 143), 31)
    draw = ImageDraw.Draw(image)
    draw.polygon([(67, 103), (67, 181), (131, 142)], fill=(255, 248, 237, 255))
    draw.line([(49, 67), (125, 41)], fill=(255, 255, 255, 72), width=4)
    image.save(
        OUT,
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    print(f"Quantic Studio icon generated: {OUT}")


if __name__ == "__main__":
    main()
