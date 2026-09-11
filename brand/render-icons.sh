#!/usr/bin/env bash
# Rasterize brand SVGs to opaque PNGs (Apple rejects app icons with alpha).
# Family: felt + gold frame + white Poker Party wordmark.
# Hold'em = black spade; Dealer's Choice = chip (source only).
# SpringBoard label is the game name (Texas Hold'em), not the brand.
# Requires: rsvg-convert (librsvg2-bin), python3 + PIL.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

rsvg-convert -w 1024 -h 1024 brand/home-game-icon-holdem.svg -o "$tmp/holdem.png"
rsvg-convert -w 1024 -h 1024 brand/home-game-icon-dealers.svg -o "$tmp/dealers.png"
rsvg-convert -w 2732 -h 2732 brand/home-game-splash.svg -o "$tmp/splash.png"

python3 - "$tmp" << 'PY'
import sys
from pathlib import Path
from PIL import Image

tmp = Path(sys.argv[1])

def flatten(src: Path, dst: Path, size: int) -> None:
    im = Image.open(src).convert("RGBA")
    if im.size != (size, size):
        im = im.resize((size, size), Image.Resampling.LANCZOS)
    bg = Image.new("RGB", im.size, (5, 48, 29))
    bg.paste(im, mask=im.split()[3])
    dst.parent.mkdir(parents=True, exist_ok=True)
    bg.save(dst, "PNG")

flatten(tmp / "holdem.png", Path("ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"), 1024)
flatten(tmp / "holdem.png", Path("brand/home-game-icon-holdem-1024.png"), 1024)
flatten(tmp / "dealers.png", Path("brand/home-game-icon-dealers-1024.png"), 1024)
flatten(tmp / "holdem.png", Path("src/app/icon.png"), 1024)
flatten(tmp / "splash.png", Path("ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png"), 2732)
print("rendered holdem + dealers icons and iOS splash")
PY
