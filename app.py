"""
Ala Eh! Food Products — Custom QR Code Generator
Flask backend: serves the React UI and renders branded QR codes as PNG.
"""
import io
import os
import re
from urllib.parse import urlparse

import qrcode
from flask import Flask, jsonify, render_template, request, send_file
from PIL import Image, ImageDraw, ImageFont
from qrcode.image.styledpil import StyledPilImage
from qrcode.image.styles.colormasks import SolidFillColorMask
from qrcode.image.styles.moduledrawers.pil import (
    CircleModuleDrawer,
    GappedSquareModuleDrawer,
    RoundedModuleDrawer,
    SquareModuleDrawer,
    VerticalBarsDrawer,
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_LOGO = os.path.join(BASE_DIR, "static", "img", "logo.jpg")

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 5 * 1024 * 1024  # 5 MB uploads max

DRAWERS = {
    "square": SquareModuleDrawer,
    "rounded": RoundedModuleDrawer,
    "dots": CircleModuleDrawer,
    "gapped": GappedSquareModuleDrawer,
    "bars": VerticalBarsDrawer,
}
HEX_RE = re.compile(r"^#?([0-9a-fA-F]{6})$")


# ---------- helpers ----------
def parse_hex(value, fallback):
    m = HEX_RE.match((value or "").strip())
    if not m:
        return fallback
    h = m.group(1)
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def normalize_url(raw):
    """Accepts 'alaeh.ph' or 'https://alaeh.ph/menu'. Returns None if invalid."""
    raw = (raw or "").strip()
    if not raw or len(raw) > 2000:
        return None
    if not re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", raw):
        raw = "https://" + raw
    parsed = urlparse(raw)
    if parsed.scheme in ("http", "https") and "." in parsed.netloc:
        return raw
    if parsed.scheme in ("mailto", "tel", "sms") and parsed.path:
        return raw
    return None


def circle_logo(logo, size, ring_color, ring_px):
    """Crop logo to a circle and put it on a solid ring so it stays readable."""
    logo = logo.convert("RGBA")
    side = min(logo.size)
    left, top = (logo.width - side) // 2, (logo.height - side) // 2
    logo = logo.crop((left, top, left + side, top + side))

    inner = size - ring_px * 2
    logo = logo.resize((inner, inner), Image.LANCZOS)
    mask = Image.new("L", (inner, inner), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, inner - 1, inner - 1), fill=255)

    badge = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(badge).ellipse((0, 0, size - 1, size - 1), fill=ring_color + (255,))
    badge.paste(logo, (ring_px, ring_px), mask)
    return badge


def load_font(size):
    for path in (
        os.path.join(BASE_DIR, "static", "fonts", "caption.ttf"),
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "C:/Windows/Fonts/arialbd.ttf",
        "/Library/Fonts/Arial Bold.ttf",
    ):
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default(size=size)


def build_qr(opts, logo_file=None):
    url = normalize_url(opts.get("url"))
    if not url:
        raise ValueError("Enter a full link, like https://www.facebook.com/yourpage")

    fg = parse_hex(opts.get("fg"), (30, 20, 16))
    bg = parse_hex(opts.get("bg"), (255, 255, 255))
    style = opts.get("style", "rounded")
    size = max(256, min(int(opts.get("size", 1024)), 2048))
    use_logo = str(opts.get("logo", "true")).lower() == "true"
    logo_scale = max(0.15, min(float(opts.get("logoScale", 0.24)), 0.30))
    caption = (opts.get("caption") or "").strip()[:40]

    qr = qrcode.QRCode(
        error_correction=qrcode.constants.ERROR_CORRECT_H,  # 30% recovery so the logo fits
        box_size=20,
        border=4,
    )
    qr.add_data(url)
    qr.make(fit=True)

    img = qr.make_image(
        image_factory=StyledPilImage,
        module_drawer=DRAWERS.get(style, RoundedModuleDrawer)(),
        color_mask=SolidFillColorMask(back_color=bg, front_color=fg),
    ).convert("RGBA")

    if use_logo:
        source = Image.open(logo_file) if logo_file else Image.open(DEFAULT_LOGO)
        badge_px = int(img.width * logo_scale)
        badge = circle_logo(source, badge_px, bg, max(4, badge_px // 18))
        pos = ((img.width - badge_px) // 2, (img.height - badge_px) // 2)
        img.alpha_composite(badge, pos)

    img = img.resize((size, size), Image.LANCZOS)

    if caption:
        font = load_font(int(size * 0.06))
        pad = int(size * 0.11)
        canvas = Image.new("RGBA", (size, size + pad), bg + (255,))
        canvas.paste(img, (0, 0))
        d = ImageDraw.Draw(canvas)
        box = d.textbbox((0, 0), caption, font=font)
        tw, th = box[2] - box[0], box[3] - box[1]
        d.text(((size - tw) // 2, size - int(size * 0.02) + (pad - th) // 2 - box[1]),
               caption, font=font, fill=fg + (255,))
        img = canvas

    out = io.BytesIO()
    img.convert("RGB").save(out, "PNG", optimize=True)
    out.seek(0)
    return out


# ---------- routes ----------
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/qr", methods=["POST"])
def api_qr():
    try:
        png = build_qr(request.form, request.files.get("logoFile"))
    except ValueError as e:
        return jsonify(error=str(e)), 400
    except Exception:
        app.logger.exception("QR generation failed")
        return jsonify(error="The QR code couldn't be made. Check the logo file and try again."), 500
    return send_file(png, mimetype="image/png", download_name="alaeh-qr.png")


@app.errorhandler(413)
def too_big(_):
    return jsonify(error="Logo file is over 5 MB. Use a smaller image."), 413


if __name__ == "__main__":
    app.run(debug=True, port=5000)
