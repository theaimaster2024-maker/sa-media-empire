# Micvo

যেকোনো জায়গায় (Claude, ChatGPT, Messenger, WhatsApp, Word) মাইকে বলে টেক্সট লিখে ফেলো — বাংলা বা ইংরেজি, যা বলবে তাই বসে যাবে।

Windows-এর জন্য। ব্যাকগ্রাউন্ডে চলে, কোনো খরচ নেই।

## ইউজ করবে কীভাবে

1. **[MicvoSetup.exe ডাউনলোড করো](../../releases/latest)**
2. ফাইলটায় ডাবল ক্লিক করো → Next → Install
3. Micvo চালু হবে, প্রথমবার একটা ফ্রি Gemini API key চাইবে (উইন্ডোতেই লিংক ও ধাপ দেওয়া আছে, ২ মিনিটের কাজ)
4. এখন যেকোনো টেক্সট বক্সে ক্লিক করে **Ctrl+Space ধরে রেখে বলো, ছেড়ে দাও** — লেখা বসে যাবে

শুধু এক টোকা দিলে টগল মোড (আবার Ctrl+Space চাপলে থামবে)। বাতিল করতে **Esc**।

PC restart দিলে নিজে থেকেই চালু হবে। বন্ধ করতে Start মেনুতে "Micvo bondho koro"।

## Windows ওয়ার্নিং দেখালে

"Windows protected your PC" — এটা স্বাভাবিক, কারণ এই অ্যাপে পেইড কোড-সাইনিং সার্টিফিকেট নেই। **More info → Run anyway** চাপলেই হবে। কোড পুরোপুরি ওপেন সোর্স, এখানেই সব দেখা যায়।

## API key নিয়ে

- key শুধু তোমার পিসিতে সেভ থাকে (`%APPDATA%\Micvo\config.json`), কোথাও পাঠানো হয় না
- Gemini-র ফ্রি টায়ারেই যথেষ্ট
- মডেল: `gemini-3.1-flash-lite`

---

## ডেভেলপারদের জন্য

### কোড থেকে চালাতে

```
pip install -r requirements.txt
python micvo.py
```

Python 3.10+ লাগবে।

### ইনস্টলার নিজে বানাতে

Windows লাগবে। [Inno Setup 6](https://jrsoftware.org/isdl.php) ইনস্টল করে **BUILD.bat** চালাও — `Output\MicvoSetup.exe` তৈরি হবে।

### সেটিংস বদলাতে

`config.py` — হটকি, ট্রান্সক্রিপশন প্রম্পট, অডিও সেটিংস।

## লাইসেন্স

MIT
