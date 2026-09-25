# Ala Eh! QR Code Maker

Flask + React app that turns any link into a branded QR code with the Ala Eh! logo in the center.

## Run it

```bash
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Open http://127.0.0.1:5000

## What you can customize
- Link (Facebook page, Shopee store, order form, menu, etc.)
- Code and background colors, with brand presets
- Pattern: rounded, square, dots, tiles, bars
- Logo on/off, logo size, or upload a different logo
- Optional text under the code
- Download size: 512, 1024 or 2048 px

## Files
- `app.py` — Flask server and QR rendering (`POST /api/qr`)
- `templates/index.html` — page shell (loads React from CDN)
- `static/js/app.jsx` — React UI
- `static/css/style.css` — styles
- `static/img/logo.jpg` — company logo (replace to update the default)

QR codes use the highest error correction level (H), so they still scan with the logo covering the center.
For production, run with a WSGI server, e.g. `pip install gunicorn && gunicorn app:app`.
