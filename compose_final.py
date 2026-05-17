"""Compose ModWingman submission video.

Layout (~45s):
    0:00–0:04  title slide
    0:04–0:08  challenge prompt
    0:08–0:35  live mod conversation w/ ModWingman private mod note
    0:35–0:40  stats outro
    0:40–0:43  repo card
"""
from __future__ import annotations

import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).parent
VIDEO_DIR = ROOT / "video"
LIVE = VIDEO_DIR / "segment_live.mp4"
SLIDES = VIDEO_DIR / "slides"
OUTPUT = VIDEO_DIR / "submission.mp4"

W, H = 1920, 1080
FPS = 30
BG = (12, 14, 18)
FG = (220, 222, 230)
DIM = (110, 115, 125)
ACC = (255, 69, 0)  # Reddit orange


def font(size: int) -> ImageFont.FreeTypeFont:
    for p in (r"C:\Windows\Fonts\consola.ttf", r"C:\Windows\Fonts\CascadiaCode.ttf"):
        if Path(p).exists():
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def slide(text: str, subtitle: str, out_path: Path) -> Path:
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    f_big = font(82)
    f_sub = font(36)
    tw = d.textlength(text, font=f_big)
    d.text(((W - tw) / 2, 420), text, font=f_big, fill=FG)
    d.line([(W / 2 - 220, 530), (W / 2 + 220, 530)], fill=ACC, width=3)
    if subtitle:
        sw = d.textlength(subtitle, font=f_sub)
        d.text(((W - sw) / 2, 560), subtitle, font=f_sub, fill=DIM)
    img.save(out_path)
    return out_path


def make_slide_video(image_path: Path, seconds: float, out: Path) -> Path:
    subprocess.run([
        "ffmpeg", "-y", "-loop", "1", "-i", str(image_path),
        "-c:v", "libx264", "-t", str(seconds), "-pix_fmt", "yuv420p",
        "-vf", f"scale={W}:{H}", "-r", str(FPS),
        str(out),
    ], check=True, capture_output=True)
    return out


def trim_live(start: float, length: float, out: Path) -> Path:
    subprocess.run([
        "ffmpeg", "-y", "-ss", str(start), "-i", str(LIVE),
        "-t", str(length),
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-vf", f"scale={W}:{H}", "-r", str(FPS),
        "-an",
        str(out),
    ], check=True, capture_output=True)
    return out


def concat(parts: list[Path], out: Path) -> None:
    list_file = VIDEO_DIR / "concat.txt"
    list_file.write_text("\n".join(f"file '{p.as_posix()}'" for p in parts))
    subprocess.run([
        "ffmpeg", "-y", "-f", "concat", "-safe", "0",
        "-i", str(list_file), "-c", "copy", str(out),
    ], check=True, capture_output=True)


def main():
    SLIDES.mkdir(parents=True, exist_ok=True)
    parts = []

    parts.append(make_slide_video(
        slide("ModWingman",
              "Reddit Mod Tools Hackathon  ·  AI ban-appeal triage",
              SLIDES / "s1.png"),
        4.0, SLIDES / "s1.mp4",
    ))

    parts.append(make_slide_video(
        slide("Ban appeals = mod toil.",
              "ModWingman drops a 4-line summary in every conversation, automatically.",
              SLIDES / "s2.png"),
        4.0, SLIDES / "s2.mp4",
    ))

    parts.append(trim_live(start=2.0, length=27.0, out=SLIDES / "live.mp4"))

    parts.append(make_slide_video(
        slide("Devvit onModMail trigger",
              "Gemini-2.5-Flash · TONE / KEY POINTS / RED FLAGS / SUGGESTED ACTION · private mod note via reddit.modMail.reply",
              SLIDES / "s3.png"),
        5.0, SLIDES / "s3.mp4",
    ))

    parts.append(make_slide_video(
        slide("github.com/run58669-maker/modwingman",
              "r/ModWingmanDemo  ·  Devvit web v0.0.10",
              SLIDES / "s4.png"),
        3.0, SLIDES / "s4.mp4",
    ))

    concat(parts, OUTPUT)
    dur = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(OUTPUT)],
        capture_output=True, text=True,
    ).stdout.strip()
    print(f"\n  -> {OUTPUT}  ({OUTPUT.stat().st_size // 1024} KB, {dur}s)")


if __name__ == "__main__":
    main()
