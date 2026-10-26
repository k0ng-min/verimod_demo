"""Download the official Microsoft Fluent Emoji 3D PNGs we use and convert them to WEBP.

Source: https://github.com/microsoft/fluentui-emoji (MIT License, Copyright (c) Microsoft Corporation)
Modification: transparent border trimmed, longest side resized to 240px, saved as WEBP (q=90).
Writes public/3d/<name>.webp and public/3d/SOURCES.json (url + sha256 of the downloaded PNG).

Usage (from frontend-redesign/):  python -I scripts/build_icons.py
"""
import hashlib
import io
import json
import pathlib
import urllib.parse
import urllib.request

from PIL import Image

BASE = "https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/"
# app name -> Fluent asset folder / file
ICONS = {
    "link": ("Link", "link_3d.png"),
    "chat-bubble": ("Speech balloon", "speech_balloon_3d.png"),
    "zoom": ("Magnifying glass tilted left", "magnifying_glass_tilted_left_3d.png"),
    "target": ("Bullseye", "bullseye_3d.png"),
    "gear": ("Gear", "gear_3d.png"),
    "shield": ("Shield", "shield_3d.png"),
    "tick": ("Check mark button", "check_mark_button_3d.png"),
    "receipt": ("Receipt", "receipt_3d.png"),
    "file-text": ("Page facing up", "page_facing_up_3d.png"),
    "folder": ("File folder", "file_folder_3d.png"),
    "clipboard": ("Clipboard", "clipboard_3d.png"),
    "key": ("Key", "key_3d.png"),
    "lock": ("Locked", "locked_3d.png"),
    "lock-key": ("Locked with key", "locked_with_key_3d.png"),
    "hourglass": ("Hourglass not done", "hourglass_not_done_3d.png"),
    "chains": ("Chains", "chains_3d.png"),
    "warning": ("Warning", "warning_3d.png"),
    "prohibited": ("Prohibited", "prohibited_3d.png"),
    "chart": ("Bar chart", "bar_chart_3d.png"),
    "card-box": ("Card file box", "card_file_box_3d.png"),
    "notebook": ("Notebook", "notebook_3d.png"),
    "bulb": ("Light bulb", "light_bulb_3d.png"),
    "bell": ("Bell", "bell_3d.png"),
    "star": ("Star", "star_3d.png"),
    "puzzle": ("Puzzle piece", "puzzle_piece_3d.png"),
    "sun": ("Sun", "sun_3d.png"),
    "moon": ("Crescent moon", "crescent_moon_3d.png"),
    "party": ("Party popper", "party_popper_3d.png"),
}

OUT = pathlib.Path(__file__).resolve().parent.parent / "public" / "3d"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    sources = {}
    for name, (folder, file) in ICONS.items():
        url = BASE + urllib.parse.quote(f"{folder}/3D/{file}")
        with urllib.request.urlopen(url, timeout=30) as response:
            if response.status != 200:
                raise SystemExit(f"{url}: HTTP {response.status}")
            data = response.read(4_000_000)
        image = Image.open(io.BytesIO(data)).convert("RGBA")
        box = image.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
        if box:
            image = image.crop(box)
        image.thumbnail((240, 240), Image.LANCZOS)
        image.save(OUT / f"{name}.webp", "WEBP", quality=90, method=6)
        sources[name] = {"url": url, "sha256": hashlib.sha256(data).hexdigest(), "license": "MIT (Microsoft fluentui-emoji)"}
        print(f"{name:12} <- {folder}/{file}")
    (OUT / "SOURCES.json").write_text(json.dumps(sources, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
