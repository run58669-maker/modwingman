"""Record ModWingman demo segment.

Scenario:
  - 9222 mod chrome navigates to existing conversation 3fc1jv (already has mod note)
  - Window placed full-screen
  - ffmpeg gdigrab records ~30s
  - User sees: appeal message at top, ModWingman private mod note expanded below
"""
from __future__ import annotations

import ctypes
import subprocess
import sys
import time
from ctypes import wintypes
from pathlib import Path

ROOT = Path(__file__).parent
VIDEO_DIR = ROOT / "video"
OUT = VIDEO_DIR / "segment_live.mp4"

SCREEN_W = 1920
SCREEN_H = 1080
RECORD_S = 32

user32 = ctypes.windll.user32
SWP_SHOWWINDOW = 0x0040
SW_MAXIMIZE = 3
HWND_TOPMOST = -1


def enum_windows():
    out: list[tuple[int, str]] = []

    @ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)
    def cb(hwnd, _lp):
        if not user32.IsWindowVisible(hwnd):
            return True
        n = user32.GetWindowTextLengthW(hwnd)
        if n == 0:
            return True
        buf = ctypes.create_unicode_buffer(n + 2)
        user32.GetWindowTextW(hwnd, buf, n + 1)
        out.append((hwnd, buf.value))
        return True

    user32.EnumWindows(cb, 0)
    return out


def main():
    from playwright.sync_api import sync_playwright

    print("[1/4] navigate 9222 chrome to mod-side conversation with mod note")
    with sync_playwright() as p:
        browser = p.chromium.connect_over_cdp("http://localhost:9222")
        ctx = browser.contexts[0]
        # close any modmail tabs already open
        pg = next((t for t in ctx.pages if "reddit.com" in t.url), None) or ctx.new_page()
        pg.bring_to_front()
        pg.goto("https://www.reddit.com/mail/all/3fc1jv",
                wait_until="domcontentloaded", timeout=25000)
        time.sleep(5)
        # scroll to top so the conv body is visible
        pg.evaluate("window.scrollTo(0, 0)")
        time.sleep(1)

    print("[2/4] find Chrome window + maximize")
    chrome_hwnd = None
    for hwnd, title in enum_windows():
        if "Reddit" in title and ("Chrome" in title or "Google" in title):
            chrome_hwnd = hwnd
            print(f"  found: {title[:80]} hwnd={hwnd}")
            break
    if not chrome_hwnd:
        for hwnd, title in enum_windows():
            if title.endswith("Google Chrome"):
                chrome_hwnd = hwnd
                print(f"  fallback: {title[:80]} hwnd={hwnd}")
                break
    if not chrome_hwnd:
        print("  ERROR: no chrome window")
        sys.exit(1)
    user32.ShowWindow(chrome_hwnd, SW_MAXIMIZE)
    user32.SetWindowPos(chrome_hwnd, HWND_TOPMOST, 0, 0, SCREEN_W, SCREEN_H, SWP_SHOWWINDOW)
    time.sleep(1.5)

    print(f"[3/4] ffmpeg gdigrab {RECORD_S}s -> {OUT.name}")
    VIDEO_DIR.mkdir(exist_ok=True)
    log = (VIDEO_DIR / "ffmpeg_live.log").open("w")
    proc = subprocess.Popen(
        [
            "ffmpeg", "-y",
            "-f", "gdigrab", "-framerate", "30", "-t", str(RECORD_S),
            "-i", "desktop",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
            "-pix_fmt", "yuv420p",
            str(OUT),
        ],
        stdout=log, stderr=log,
    )

    # mid-record: scroll down slowly so the mod note shows up in motion
    time.sleep(8)
    user32.SetWindowPos(chrome_hwnd, -2, 0, 0, 0, 0, 0x0001 | 0x0002 | SWP_SHOWWINDOW)

    print("[4/4] recording...")
    rc = proc.wait()
    log.close()
    print(f"  ffmpeg rc={rc} -> {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
