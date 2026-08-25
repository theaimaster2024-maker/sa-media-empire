"""
API key সেভ করা ও প্রথমবার চালু হলে সুন্দর সেটআপ স্ক্রিন দেখানো।
key কখনো কোডে বা GitHub-এ যায় না — শুধু নিজের পিসিতে সেভ থাকে:
%APPDATA%\\Micvo\\config.json
"""

import json
import os
import tkinter as tk
import webbrowser

APP_DIR = os.path.join(
    os.environ.get("APPDATA", os.path.expanduser("~")), "Micvo"
)
CONFIG_FILE = os.path.join(APP_DIR, "config.json")

# ---- ফিউচারিস্টিক পালেট — Micvo-এর সব অ্যাপে এই থিম ইউজ হবে ----
BG = "#0b0e14"
PANEL = "#12151d"
FG = "#e8eaf2"
MUTED = "#8b91a5"
ACCENT = "#7c5cff"
ACCENT_2 = "#00d4c8"
BORDER = "#232838"
DANGER = "#ff6b6b"


def load_key():
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        key = (data.get("gemini_api_key") or "").strip()
        return key or None
    except Exception:
        return None


def save_key(key):
    os.makedirs(APP_DIR, exist_ok=True)
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump({"gemini_api_key": key}, f, ensure_ascii=False, indent=2)


def ask_for_key(model_name):
    """প্রথমবার চালু হলে key চাওয়ার উইন্ডো দেখায়। বাতিল করলে None ফেরত দেয়।"""
    result = {"key": None}

    root = tk.Tk()
    root.title("Micvo — প্রথমবার সেটআপ")
    root.configure(bg=BG)
    root.resizable(False, False)
    w, h = 460, 430
    sw, sh = root.winfo_screenwidth(), root.winfo_screenheight()
    root.geometry(f"{w}x{h}+{(sw - w)//2}+{(sh - h)//2}")

    pad = tk.Frame(root, bg=BG)
    pad.pack(fill="both", expand=True, padx=28, pady=26)

    tk.Label(pad, text="Micvo", font=("Segoe UI", 20, "bold"), fg=FG, bg=BG).pack(
        anchor="w"
    )
    tk.Label(
        pad,
        text="শুরু করার আগে একটা ফ্রি Gemini API key লাগবে",
        font=("Segoe UI", 11),
        fg=MUTED,
        bg=BG,
    ).pack(anchor="w", pady=(4, 20))

    entry_frame = tk.Frame(pad, bg=PANEL, highlightbackground=BORDER, highlightthickness=1)
    entry_frame.pack(fill="x")
    entry = tk.Entry(
        entry_frame,
        font=("Consolas", 11),
        bg=PANEL,
        fg=FG,
        insertbackground=FG,
        relief="flat",
        show="•",
    )
    entry.pack(fill="x", padx=12, pady=10)
    entry.focus()

    show_var = tk.BooleanVar(value=False)

    def toggle_show():
        entry.config(show="" if show_var.get() else "•")

    tk.Checkbutton(
        pad,
        text="key দেখাও",
        variable=show_var,
        command=toggle_show,
        font=("Segoe UI", 9),
        fg=MUTED,
        bg=BG,
        activebackground=BG,
        selectcolor=BG,
        relief="flat",
        bd=0,
    ).pack(anchor="w", pady=(6, 18))

    tk.Label(
        pad,
        justify="left",
        anchor="w",
        font=("Segoe UI", 10),
        fg=MUTED,
        bg=BG,
        text=(
            "কিভাবে ফ্রি key নেবে:\n"
            "১. aistudio.google.com/apikey এ যাও\n"
            "২. Google দিয়ে লগইন করো\n"
            "৩. \"Create API key\" চাপো\n"
            "৪. key কপি করে এখানে পেস্ট করো\n\n"
            f"মডেল: {model_name}  ·  ফ্রি টায়ারেই যথেষ্ট"
        ),
    ).pack(anchor="w", fill="x")

    error_lbl = tk.Label(pad, text="", font=("Segoe UI", 9), fg=DANGER, bg=BG)
    error_lbl.pack(anchor="w", pady=(6, 0))

    def on_submit(event=None):
        key = entry.get().strip()
        if len(key) < 10:
            error_lbl.config(text="সঠিক API key দাও")
            return
        result["key"] = key
        root.destroy()

    btn = tk.Button(
        pad,
        text="সেভ করে শুরু করো",
        command=on_submit,
        font=("Segoe UI", 11, "bold"),
        fg="#0b0e14",
        bg=ACCENT_2,
        activebackground=ACCENT,
        activeforeground=FG,
        relief="flat",
        padx=14,
        pady=10,
        cursor="hand2",
    )
    btn.pack(fill="x", pady=(18, 0))
    root.bind("<Return>", on_submit)

    link = tk.Label(
        pad,
        text="aistudio.google.com/apikey ↗",
        font=("Segoe UI", 9, "underline"),
        fg=ACCENT_2,
        bg=BG,
        cursor="hand2",
    )
    link.pack(anchor="w", pady=(10, 0))
    link.bind(
        "<Button-1>", lambda e: webbrowser.open("https://aistudio.google.com/apikey")
    )

    root.mainloop()
    return result["key"]


def get_api_key(model_name):
    key = load_key()
    if key:
        return key
    key = ask_for_key(model_name)
    if key:
        save_key(key)
    return key
