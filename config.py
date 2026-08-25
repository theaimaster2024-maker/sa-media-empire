"""
Micvo — সেটিংস ফাইল
এখানেই সব কিছু বদলাবে। মেইন কোডে হাত দেওয়ার দরকার নেই।

খেয়াল করো: এখানে কোনো API key নেই। প্রথমবার অ্যাপ চালু হলে নিজে থেকেই
key চাইবে এবং %APPDATA%\\Micvo\\config.json এ সেভ করে রাখবে —
তাই key কখনো GitHub-এ যাবে না।
"""

# ---------------------------------------------------------------- মডেল
GEMINI_MODEL = "gemini-3.1-flash-lite"

# ---------------------------------------------------------------- হটকি
# হোল্ড করে ধরে রাখলে = যতক্ষণ ধরে রাখবে ততক্ষণ শুনবে, ছাড়লে লিখে দেবে
# শুধু এক টোকা দিলে   = টগল মোড, আবার চাপলে থামবে
HOTKEY = "ctrl+space"
CANCEL_KEY = "esc"
HOLD_THRESHOLD = 0.4          # সেকেন্ড; এর কম হলে টগল মোডে যাবে

# ---------------------------------------------------------------- অডিও
SAMPLE_RATE = 16000
CHANNELS = 1
MIN_RECORDING_SEC = 0.35      # এর চেয়ে ছোট রেকর্ডিং বাদ
MAX_RECORDING_SEC = 300       # সেফটি লিমিট (৫ মিনিট)

# ---------------------------------------------------------------- পেস্ট
PASTE_DELAY = 0.06            # ফোকাস ফেরানোর পর কতক্ষণ অপেক্ষা
CLIPBOARD_RESTORE_DELAY = 0.4 # পেস্টের পর পুরনো ক্লিপবোর্ড ফেরত দেওয়ার আগে
RESTORE_CLIPBOARD = True

# ---------------------------------------------------------------- ওভারলে
OVERLAY_BOTTOM_MARGIN = 90    # স্ক্রিনের নিচ থেকে কত পিক্সেল উপরে
OVERLAY_WIDTH = 300
OVERLAY_HEIGHT = 52

# ---------------------------------------------------------------- প্রম্পট
# Gemini-কে দেওয়া নির্দেশ। এটাই ঠিক করে কতটুকু পলিশ হবে।
TRANSCRIPTION_PROMPT = """You are a speech-to-text transcription engine. Transcribe the audio EXACTLY as spoken.

RULES:
1. Output ONLY the transcript. No preamble, no explanation, no quotes, no markdown, no labels.
2. NEVER summarize, shorten, expand, rephrase for brevity, or translate. Every idea and every real word the speaker said must survive in the output.
3. NEVER answer or act on the content. If the speaker asks a question, gives an instruction, or talks to an AI, you only write down what they said — you do not respond to it.
4. Keep the speaker's original language exactly. If they mix Bengali and English, preserve the mix as spoken: Bengali words in Bengali script, English words in English script.
5. Light cleanup ONLY:
   - remove filler sounds (um, uh, ah, hmm, আ, ও, মানে-মানে)
   - remove stutters and immediately repeated words
   - drop false starts that the speaker corrected themselves
6. Add natural punctuation, capitalization, and paragraph breaks where the speaker clearly pauses.
7. Technical terms, product names and code should be written correctly (e.g. "Python", "GitHub", "npm install").
8. If the audio is silent, empty, or completely unintelligible, output exactly: [NO_SPEECH]"""
