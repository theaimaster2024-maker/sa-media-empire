"""
Micvo — Wispr Flow ধাঁচের ভয়েস ডিকটেশন, Gemini দিয়ে।

Ctrl+Space ধরে রাখো → বলো → ছাড়ো → যেখানে কার্সর আছে সেখানে টেক্সট বসে যাবে।
এক টোকা দিলে টগল মোড (আবার চাপলে থামবে)। Esc = বাতিল।

চালাও:  python micvo.py
"""

import base64
import io
import json
import queue
import sys
import threading
import time
import tkinter as tk
import wave

import numpy as np
import requests
import sounddevice as sd
import keyboard
import pyperclip

import config
import key_store

IS_WINDOWS = sys.platform.startswith("win")

if IS_WINDOWS:
    import ctypes
    from ctypes import wintypes

    user32 = ctypes.windll.user32

# প্রথমবার/প্রতিবার চালু হওয়ার সময় key_store.get_api_key() এটা সেট করে দেয়
API_KEY = None


# ==================================================================
#  Windows helpers — ফোকাস ধরে রাখা (এটাই পুরো অ্যাপের সবচেয়ে জরুরি অংশ)
# ==================================================================

def get_foreground_window():
    """হটকি চাপার মুহূর্তে কোন উইন্ডোতে কার্সর ছিল সেটা মনে রাখি।"""
    if not IS_WINDOWS:
        return None
    try:
        return user32.GetForegroundWindow()
    except Exception:
        return None


def restore_foreground_window(hwnd):
    """পেস্ট করার ঠিক আগে সেই উইন্ডোতে ফোকাস ফিরিয়ে দিই।"""
    if not IS_WINDOWS or not hwnd:
        return
    try:
        if user32.GetForegroundWindow() == hwnd:
            return  # ফোকাস হারায়নি, কিছু করার নেই

        # অন্য প্রসেসের উইন্ডোতে ফোকাস দিতে হলে thread attach করতে হয়
        current_thread = ctypes.windll.kernel32.GetCurrentThreadId()
        target_thread = user32.GetWindowThreadProcessId(hwnd, None)
        attached = False
        if current_thread != target_thread:
            attached = bool(user32.AttachThreadInput(current_thread, target_thread, True))
        user32.SetForegroundWindow(hwnd)
        if attached:
            user32.AttachThreadInput(current_thread, target_thread, False)
    except Exception as e:
        print(f"[warn] ফোকাস ফেরানো যায়নি: {e}")


def make_window_no_activate(tk_window):
    """
    ওভারলে উইন্ডোটাকে বলে দিই: তুমি কখনো ফোকাস নেবে না।
    এটা না করলে পপআপ ওপেন হওয়ামাত্র টেক্সট বক্সের কার্সর হারিয়ে যায়।
    """
    if not IS_WINDOWS:
        return
    try:
        GWL_EXSTYLE = -20
        WS_EX_NOACTIVATE = 0x08000000
        WS_EX_TOOLWINDOW = 0x00000080
        tk_window.update_idletasks()
        hwnd = user32.GetParent(tk_window.winfo_id()) or tk_window.winfo_id()
        style = user32.GetWindowLongW(hwnd, GWL_EXSTYLE)
        user32.SetWindowLongW(
            hwnd, GWL_EXSTYLE, style | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW
        )
    except Exception as e:
        print(f"[warn] no-activate সেট করা যায়নি: {e}")


# ==================================================================
#  অডিও রেকর্ডার
# ==================================================================

class Recorder:
    def __init__(self):
        self._frames = []
        self._stream = None
        self._lock = threading.Lock()
        self.level = 0.0          # 0..1, ওভারলের মিটারের জন্য
        self.started_at = None

    def _callback(self, indata, frames, time_info, status):
        if status:
            pass  # ওভাররান ইত্যাদি, উপেক্ষা করা যায়
        with self._lock:
            self._frames.append(indata.copy())
        rms = float(np.sqrt(np.mean(indata.astype(np.float32) ** 2)))
        self.level = min(1.0, rms / 3000.0)

    def start(self):
        with self._lock:
            self._frames = []
        self.level = 0.0
        self.started_at = time.time()
        self._stream = sd.InputStream(
            samplerate=config.SAMPLE_RATE,
            channels=config.CHANNELS,
            dtype="int16",
            callback=self._callback,
            blocksize=1024,
        )
        self._stream.start()

    def stop(self):
        """রেকর্ডিং থামিয়ে WAV bytes ফেরত দেয়। কিছু না থাকলে None।"""
        if self._stream is None:
            return None
        try:
            self._stream.stop()
            self._stream.close()
        except Exception:
            pass
        self._stream = None

        with self._lock:
            frames = list(self._frames)
            self._frames = []

        if not frames:
            return None

        audio = np.concatenate(frames, axis=0)
        duration = len(audio) / config.SAMPLE_RATE
        if duration < config.MIN_RECORDING_SEC:
            return None

        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(config.CHANNELS)
            wf.setsampwidth(2)  # int16
            wf.setframerate(config.SAMPLE_RATE)
            wf.writeframes(audio.tobytes())
        return buf.getvalue()

    def abort(self):
        if self._stream is not None:
            try:
                self._stream.stop()
                self._stream.close()
            except Exception:
                pass
            self._stream = None
        with self._lock:
            self._frames = []


# ==================================================================
#  Gemini ট্রান্সক্রিপশন
# ==================================================================

API_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    f"{config.GEMINI_MODEL}:generateContent"
)


def _extract_text(data):
    try:
        parts = data["candidates"][0]["content"]["parts"]
    except (KeyError, IndexError, TypeError):
        return ""
    chunks = []
    for p in parts:
        if p.get("thought"):        # thinking অংশ বাদ
            continue
        if "text" in p:
            chunks.append(p["text"])
    return "".join(chunks).strip()


def transcribe(wav_bytes):
    """WAV → টেক্সট। এরর হলে Exception তোলে।"""
    audio_b64 = base64.b64encode(wav_bytes).decode("ascii")

    body = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {"text": config.TRANSCRIPTION_PROMPT},
                    {"inline_data": {"mime_type": "audio/wav", "data": audio_b64}},
                ],
            }
        ],
        "generationConfig": {
            "temperature": 0.0,
            "maxOutputTokens": 4096,
            "thinkingConfig": {"thinkingBudget": 0},  # লেটেন্সি কমানোর জন্য
        },
    }

    headers = {
        "x-goog-api-key": API_KEY,
        "Content-Type": "application/json",
    }

    r = requests.post(API_URL, headers=headers, json=body, timeout=90)

    # কিছু মডেল thinkingConfig নেয় না — সেক্ষেত্রে ওটা বাদ দিয়ে আরেকবার
    if r.status_code == 400 and "thinking" in r.text.lower():
        body["generationConfig"].pop("thinkingConfig", None)
        r = requests.post(API_URL, headers=headers, json=body, timeout=90)

    if r.status_code == 401 or r.status_code == 403:
        raise RuntimeError("API key ভুল বা কাজ করছে না")

    if r.status_code != 200:
        raise RuntimeError(f"Gemini {r.status_code}: {r.text[:300]}")

    text = _extract_text(r.json())

    if not text or text.strip() == "[NO_SPEECH]":
        return ""

    # মডেল মাঝেমাঝে কোট বা কোডব্লক জুড়ে দেয়, সেগুলো ছেঁটে ফেলি
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if "\n" in text:
            first, rest = text.split("\n", 1)
            if len(first) < 20:      # ভাষার নাম ছিল
                text = rest
        text = text.strip()
    if len(text) > 1 and text[0] in "\"“'" and text[-1] in "\"”'":
        text = text[1:-1].strip()
    return text


# ==================================================================
#  টেক্সট বসানো — clipboard + Ctrl+V (ইউনিকোডের জন্য একমাত্র নির্ভরযোগ্য পথ)
# ==================================================================

def paste_text(text, target_hwnd):
    old_clip = ""
    if config.RESTORE_CLIPBOARD:
        try:
            old_clip = pyperclip.paste()
        except Exception:
            old_clip = ""

    pyperclip.copy(text)
    restore_foreground_window(target_hwnd)
    time.sleep(config.PASTE_DELAY)

    # হটকির মডিফায়ার এখনো চাপা থাকতে পারে — ছাড়িয়ে নিই
    for k in ("ctrl", "shift", "alt"):
        try:
            keyboard.release(k)
        except Exception:
            pass

    keyboard.send("ctrl+v")

    if config.RESTORE_CLIPBOARD:
        time.sleep(config.CLIPBOARD_RESTORE_DELAY)
        try:
            pyperclip.copy(old_clip)
        except Exception:
            pass


# ==================================================================
#  ওভারলে (ছোট্ট ভাসমান পিল) — ফিউচারিস্টিক ফ্লো-স্টাইল কালার
# ==================================================================

BG = key_store.BG
FG = key_store.FG
ACCENT = key_store.ACCENT_2      # শোনা/লেখার সময় — টিল
ACCENT_BUSY = key_store.ACCENT   # প্রসেসিং — পার্পল
ACCENT_ERR = "#ff5f7a"


class Overlay:
    def __init__(self, root):
        self.root = root
        self.win = tk.Toplevel(root)
        self.win.overrideredirect(True)
        self.win.attributes("-topmost", True)
        try:
            self.win.attributes("-alpha", 0.96)
        except Exception:
            pass
        self.win.configure(bg=BG)

        self.canvas = tk.Canvas(
            self.win,
            width=config.OVERLAY_WIDTH,
            height=config.OVERLAY_HEIGHT,
            bg=BG,
            highlightthickness=0,
        )
        self.canvas.pack()

        self.dot = self.canvas.create_oval(18, 20, 32, 34, fill=ACCENT, outline="")
        self.label = self.canvas.create_text(
            44, 27, text="", anchor="w", fill=FG, font=("Segoe UI", 11)
        )
        self.bars = []
        for i in range(12):
            x = config.OVERLAY_WIDTH - 24 - (11 - i) * 8
            self.bars.append(
                self.canvas.create_rectangle(
                    x, 24, x + 4, 30, fill="#232838", outline=""
                )
            )

        self._place()
        self.win.withdraw()
        make_window_no_activate(self.win)
        self._anim = 0

    def _place(self):
        sw = self.win.winfo_screenwidth()
        sh = self.win.winfo_screenheight()
        x = (sw - config.OVERLAY_WIDTH) // 2
        y = sh - config.OVERLAY_HEIGHT - config.OVERLAY_BOTTOM_MARGIN
        self.win.geometry(f"{config.OVERLAY_WIDTH}x{config.OVERLAY_HEIGHT}+{x}+{y}")

    def show(self, text, color=ACCENT, show_bars=True):
        self.canvas.itemconfig(self.label, text=text)
        self.canvas.itemconfig(self.dot, fill=color)
        for b in self.bars:
            self.canvas.itemconfig(b, state="normal" if show_bars else "hidden")
        self.win.deiconify()
        self.win.lift()

    def hide(self):
        self.win.withdraw()

    def update_level(self, level):
        """মাইকের লেভেল অনুযায়ী ছোট বার-মিটার নাড়াই।"""
        self._anim += 1
        for i, b in enumerate(self.bars):
            phase = (self._anim * 0.35 + i * 0.7)
            wobble = (np.sin(phase) + 1) / 2
            h = 2 + level * 18 * (0.45 + 0.55 * wobble)
            self.canvas.coords(b, *self._bar_coords(i, h))
            self.canvas.itemconfig(b, fill=ACCENT if level > 0.03 else "#232838")

    def _bar_coords(self, i, h):
        x = config.OVERLAY_WIDTH - 24 - (11 - i) * 8
        cy = 27
        return x, cy - h / 2, x + 4, cy + h / 2

    def pulse_busy(self):
        self._anim += 1
        n = (self._anim // 4) % 12
        for i, b in enumerate(self.bars):
            h = 12 if i == n else 4
            self.canvas.coords(b, *self._bar_coords(i, h))
            self.canvas.itemconfig(b, fill=ACCENT_BUSY if i == n else "#232838")


# ==================================================================
#  মেইন অ্যাপ
# ==================================================================

class Micvo:
    STATE_IDLE = "idle"
    STATE_HOLD = "hold"
    STATE_TOGGLE = "toggle"
    STATE_BUSY = "busy"

    def __init__(self):
        self.root = tk.Tk()
        self.root.withdraw()
        self.overlay = Overlay(self.root)

        self.recorder = Recorder()
        self.state = self.STATE_IDLE
        self.press_ts = 0.0
        self.target_hwnd = None
        self.ui_queue = queue.Queue()
        self._lock = threading.Lock()

        self._register_hotkeys()
        self._tick()

    # ------------------------------------------------------------ হটকি
    def _register_hotkeys(self):
        keyboard.add_hotkey(
            config.HOTKEY, self._on_hotkey, suppress=True, trigger_on_release=False
        )
        main_key = config.HOTKEY.split("+")[-1]
        keyboard.on_release_key(main_key, self._on_key_release)
        keyboard.add_hotkey(config.CANCEL_KEY, self._on_cancel)

    def _on_hotkey(self):
        with self._lock:
            if self.state == self.STATE_IDLE:
                self.target_hwnd = get_foreground_window()
                self.press_ts = time.time()
                self.state = self.STATE_HOLD
                try:
                    self.recorder.start()
                except Exception as e:
                    self.state = self.STATE_IDLE
                    self.ui_queue.put(("error", f"মাইক খোলা গেল না: {e}"))
                    return
                self.ui_queue.put(("recording", None))
            elif self.state == self.STATE_TOGGLE:
                self.state = self.STATE_BUSY
                threading.Thread(target=self._finish, daemon=True).start()
            # HOLD অবস্থায় key-repeat এলে কিছু করি না

    def _on_key_release(self, _event):
        with self._lock:
            if self.state != self.STATE_HOLD:
                return
            held = time.time() - self.press_ts
            if held < config.HOLD_THRESHOLD:
                # এক টোকা → টগল মোড, রেকর্ডিং চলতে থাকুক
                self.state = self.STATE_TOGGLE
                self.ui_queue.put(("toggle", None))
                return
            self.state = self.STATE_BUSY
        threading.Thread(target=self._finish, daemon=True).start()

    def _on_cancel(self):
        with self._lock:
            if self.state in (self.STATE_HOLD, self.STATE_TOGGLE):
                self.recorder.abort()
                self.state = self.STATE_IDLE
                self.ui_queue.put(("cancelled", None))

    # ------------------------------------------------------------ কাজ
    def _finish(self):
        self.ui_queue.put(("transcribing", None))
        try:
            wav = self.recorder.stop()
            if not wav:
                self.ui_queue.put(("hide", None))
                self._reset()
                return

            text = transcribe(wav)
            if not text:
                self.ui_queue.put(("error", "কিছু শোনা যায়নি"))
                self._reset()
                return

            paste_text(text, self.target_hwnd)
            preview = text if len(text) <= 28 else text[:28] + "…"
            self.ui_queue.put(("done", preview))
        except requests.exceptions.Timeout:
            self.ui_queue.put(("error", "টাইমআউট — নেট চেক করো"))
        except Exception as e:
            print(f"[error] {e}")
            msg = str(e)
            self.ui_queue.put(("error", msg[:40]))
        finally:
            self._reset()

    def _reset(self):
        with self._lock:
            self.state = self.STATE_IDLE
            self.target_hwnd = None

    # ------------------------------------------------------------ UI লুপ
    def _tick(self):
        try:
            while True:
                kind, payload = self.ui_queue.get_nowait()
                if kind == "recording":
                    self.overlay.show("শুনছি…", ACCENT)
                elif kind == "toggle":
                    self.overlay.show("শুনছি… (Ctrl+Space = থামাও)", ACCENT)
                elif kind == "transcribing":
                    self.overlay.show("লিখছি…", ACCENT_BUSY)
                elif kind == "done":
                    self.overlay.show(f"✓ {payload}", ACCENT, show_bars=False)
                    self.root.after(900, self.overlay.hide)
                elif kind == "cancelled":
                    self.overlay.show("বাতিল", ACCENT_ERR, show_bars=False)
                    self.root.after(700, self.overlay.hide)
                elif kind == "error":
                    self.overlay.show(f"⚠ {payload}", ACCENT_ERR, show_bars=False)
                    self.root.after(2500, self.overlay.hide)
                elif kind == "hide":
                    self.overlay.hide()
        except queue.Empty:
            pass

        if self.state in (self.STATE_HOLD, self.STATE_TOGGLE):
            self.overlay.update_level(self.recorder.level)
            if (
                self.recorder.started_at
                and time.time() - self.recorder.started_at > config.MAX_RECORDING_SEC
            ):
                self._on_key_release(None)
        elif self.state == self.STATE_BUSY:
            self.overlay.pulse_busy()

        self.root.after(40, self._tick)

    def run(self):
        print("=" * 52)
        print("  Micvo চালু")
        print(f"  মডেল      : {config.GEMINI_MODEL}")
        print(f"  হটকি      : {config.HOTKEY.upper()}")
        print("  ধরে রাখো  : যতক্ষণ ধরবে ততক্ষণ শুনবে, ছাড়লে লিখে দেবে")
        print("  এক টোকা   : টগল মোড, আবার চাপলে থামবে")
        print(f"  বাতিল     : {config.CANCEL_KEY.upper()}")
        print("  বন্ধ করতে : এই উইন্ডোতে Ctrl+C")
        print("=" * 52)
        try:
            self.root.mainloop()
        except KeyboardInterrupt:
            pass


def main():
    global API_KEY
    API_KEY = key_store.get_api_key(config.GEMINI_MODEL)
    if not API_KEY:
        print("API key ছাড়া Micvo চালু করা যায় না। আবার চালাও।")
        return

    try:
        sd.check_input_settings(
            samplerate=config.SAMPLE_RATE, channels=config.CHANNELS, dtype="int16"
        )
    except Exception as e:
        print(f"[warn] ডিফল্ট মাইক নিয়ে সমস্যা: {e}")
        print("       ইনপুট ডিভাইসগুলো:")
        print(sd.query_devices())

    Micvo().run()


if __name__ == "__main__":
    main()
