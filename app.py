"""
Ala Eh! Food Products — Custom QR Code Generator
Flask backend: serves the React UI and renders branded QR codes as PNG or JPG.

Supports: links, Wi-Fi, phone, SMS, email and plain text codes; solid or
gradient colors; module + corner-eye styles; center logo; caption frames;
adjustable quiet zone.
"""
import io
import os
import re
from urllib.parse import quote, urlparse

import qrcode
from flask import Flask, jsonify, render_template, request, send_file
from PIL import Image, ImageDraw, ImageFont
from qrcode.image.styledpil import StyledPilImage
from qrcode.image.styles.colormasks import (
    HorizontalGradiantColorMask,
    RadialGradiantColorMask,
    SolidFillColorMask,
    VerticalGradiantColorMask,
)
from qrcode.image.styles.moduledrawers.pil import (
    CircleModuleDrawer,
    GappedSquareModuleDrawer,
    HorizontalBarsDrawer,
    RoundedModuleDrawer,
    SquareModuleDrawer,
    VerticalBarsDrawer,
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_LOGO = os.path.join(BASE_DIR, "static", "img", "logo.png")

try:
    LANCZOS = Image.Resampling.LANCZOS
except AttributeError:  # Pillow < 9.1
    LANCZOS = Image.LANCZOS

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 5 * 1024 * 1024  # 5 MB uploads max

DRAWERS = {
    "square": SquareModuleDrawer,
    "rounded": RoundedModuleDrawer,
    "dots": CircleModuleDrawer,
    "gapped": GappedSquareModuleDrawer,
    "vbars": VerticalBarsDrawer,
    "hbars": HorizontalBarsDrawer,
}
EYE_DRAWERS = {
    "square": SquareModuleDrawer,
    "rounded": lambda: RoundedModuleDrawer(radius_ratio=1),
    "dots": CircleModuleDrawer,
}
HEX_RE = re.compile(r"^#?([0-9a-fA-F]{6})$")
PHONE_RE = re.compile(r"^\+?[0-9 ()\-]{3,20}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


# ---------- helpers ----------
def parse_hex(value, fallback):
    m = HEX_RE.match((value or "").strip())
    if not m:
        return fallback
    h = m.group(1)
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def clamp(value, lo, hi, fallback):
    try:
        return max(lo, min(float(value), hi))
    except (TypeError, ValueError):
        return fallback


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


def wifi_escape(s):
    return re.sub(r'([\\;,":])', r"\\\1", s)


def build_payload(opts):
    """Turn the form fields for each code type into the text the QR holds."""
    kind = opts.get("kind", "url")
    def get(k): return (opts.get(k) or "").strip()

    if kind == "url":
        url = normalize_url(get("url"))
        if not url:
            raise ValueError(
                "Enter a full link, like https://www.facebook.com/yourpage")
        return url

    if kind == "wifi":
        ssid, password = get("ssid"), opts.get("password") or ""
        security = get("security").upper() or "WPA"
        if not ssid:
            raise ValueError("Enter the Wi-Fi network name.")
        if security not in ("WPA", "WEP", "NOPASS"):
            security = "WPA"
        if security != "NOPASS" and not password:
            raise ValueError(
                "Enter the Wi-Fi password, or set security to None.")
        hidden = "H:true;" if get("hidden") == "true" else ""
        pw = f"P:{wifi_escape(password)};" if security != "NOPASS" else ""
        return f"WIFI:T:{security};S:{wifi_escape(ssid)};{pw}{hidden};"

    if kind == "tel":
        phone = get("phone")
        if not PHONE_RE.match(phone):
            raise ValueError("Enter a phone number, like +63 917 123 4567.")
        return "tel:" + re.sub(r"[ ()\-]", "", phone)

    if kind == "sms":
        phone = get("phone")
        if not PHONE_RE.match(phone):
            raise ValueError("Enter the phone number the text should go to.")
        body = get("message")[:300]
        return f"SMSTO:{re.sub(r'[ ()-]', '', phone)}:{body}"

    if kind == "email":
        to = get("to")
        if not EMAIL_RE.match(to):
            raise ValueError("Enter an email address, like orders@alaeh.ph.")
        params = []
        if get("subject"):
            params.append("subject=" + quote(get("subject")[:150]))
        if get("body"):
            params.append("body=" + quote(get("body")[:500]))
        return f"mailto:{to}" + ("?" + "&".join(params) if params else "")

    if kind == "text":
        text = get("text")
        if not text:
            raise ValueError("Type the text the code should show.")
        if len(text) > 800:
            raise ValueError(
                "Text is over 800 characters. Shorten it so the code stays scannable.")
        return text

    raise ValueError("Unknown code type.")


def make_color_mask(fg, fg2, bg, gradient):
    if gradient == "vertical":
        return VerticalGradiantColorMask(back_color=bg, top_color=fg, bottom_color=fg2)
    if gradient == "horizontal":
        return HorizontalGradiantColorMask(back_color=bg, left_color=fg, right_color=fg2)
    if gradient == "radial":
        return RadialGradiantColorMask(back_color=bg, center_color=fg, edge_color=fg2)
    return SolidFillColorMask(back_color=bg, front_color=fg)


def circle_logo(logo, size, ring_color, ring_px):
    """Crop logo to a circle and put it on a solid ring so it stays readable."""
    logo = logo.convert("RGBA")
    side = min(logo.size)
    left, top = (logo.width - side) // 2, (logo.height - side) // 2
    logo = logo.crop((left, top, left + side, top + side))

    inner = size - ring_px * 2
    logo = logo.resize((inner, inner), LANCZOS)
    mask = Image.new("L", (inner, inner), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, inner - 1, inner - 1), fill=255)

    badge = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(badge).ellipse(
        (0, 0, size - 1, size - 1), fill=ring_color + (255,))
    badge.paste(logo, (ring_px, ring_px), mask)
    return badge


def load_font(size):
    for path in (
        os.path.join(BASE_DIR, "static", "fonts", "caption.ttf"),
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "C:/Windows/Fonts/arialbd.ttf",
        "/Library/Fonts/Arial Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    ):
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    try:
        return ImageFont.load_default(size=size)  # Pillow >= 10.1
    except TypeError:
        return ImageFont.load_default()


def fit_font(draw, text, max_width, start_size):
    """Shrink the caption font until the text fits the width."""
    size = start_size
    while size > 10:
        font = load_font(size)
        box = draw.textbbox((0, 0), text, font=font)
        if box[2] - box[0] <= max_width:
            return font, box
        size = int(size * 0.92)
    font = load_font(size)
    return font, draw.textbbox((0, 0), text, font=font)


def draw_centered(draw, text, font, box, area, fill):
    """Draw text centered inside area=(x0, y0, x1, y1)."""
    tw, th = box[2] - box[0], box[3] - box[1]
    x = area[0] + (area[2] - area[0] - tw) // 2 - box[0]
    y = area[1] + (area[3] - area[1] - th) // 2 - box[1]
    draw.text((x, y), text, font=font, fill=fill)


def apply_frame(img, frame, caption, fg, bg):
    size = img.width
    if frame == "caption":
        caption = caption or "Scan para umorder!"
        pad = int(size * 0.12)
        canvas = Image.new("RGBA", (size, size + pad), bg + (255,))
        canvas.paste(img, (0, 0))
        d = ImageDraw.Draw(canvas)
        font, box = fit_font(d, caption, int(size * 0.86), int(size * 0.065))
        draw_centered(d, caption, font, box, (0, size - int(size * 0.03),
                      size, size + pad - int(size * 0.02)), fg + (255,))
        return canvas

    if frame == "badge":
        text = caption or "Scan me"
        edge = int(size * 0.045)
        band = int(size * 0.16)
        radius = int(size * 0.08)
        w, h = size + edge * 2, size + edge * 2 + band
        canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        d = ImageDraw.Draw(canvas)
        d.rounded_rectangle((0, 0, w - 1, h - 1),
                            radius=radius, fill=fg + (255,))
        inner = Image.new("L", (size, size), 0)
        ImageDraw.Draw(inner).rounded_rectangle(
            (0, 0, size - 1, size - 1), radius=int(radius * 0.6), fill=255)
        canvas.paste(img, (edge, edge), inner)
        font, box = fit_font(d, text, int(w * 0.84), int(size * 0.075))
        draw_centered(d, text, font, box, (0, size + edge,
                      w, h - edge // 2), bg + (255,))
        return canvas

    return img


def build_qr(opts, logo_file=None):
    payload = build_payload(opts)

    fg = parse_hex(opts.get("fg"), (0, 0, 0))
    fg2 = parse_hex(opts.get("fg2"), fg)
    bg = parse_hex(opts.get("bg"), (255, 255, 255))
    gradient = opts.get("gradient", "none")
    style = opts.get("style", "rounded")
    eye = opts.get("eye", "rounded")
    size = int(clamp(opts.get("size"), 256, 2048, 1024))
    border = int(clamp(opts.get("border"), 1, 8, 4))
    use_logo = str(opts.get("logo", "true")).lower() == "true"
    logo_scale = clamp(opts.get("logoScale"), 0.15, 0.30, 0.24)
    caption = (opts.get("caption") or "").strip()[:40]
    frame = opts.get("frame", "none")
    fmt = "JPEG" if opts.get("format") == "jpg" else "PNG"

    qr = qrcode.QRCode(
        error_correction=qrcode.constants.ERROR_CORRECT_H,  # 30% recovery so the logo fits
        box_size=20,
        border=border,
    )
    qr.add_data(payload)
    qr.make(fit=True)

    kwargs = dict(
        image_factory=StyledPilImage,
        module_drawer=DRAWERS.get(style, RoundedModuleDrawer)(),
        color_mask=make_color_mask(fg, fg2, bg, gradient),
    )
    try:
        img = qr.make_image(eye_drawer=EYE_DRAWERS.get(
            eye, EYE_DRAWERS["rounded"])(), **kwargs)
    except TypeError:  # qrcode < 7.4 has no eye_drawer
        img = qr.make_image(**kwargs)
    img = img.convert("RGBA")

    if use_logo:
        source = Image.open(
            logo_file) if logo_file else Image.open(DEFAULT_LOGO)
        badge_px = int(img.width * logo_scale)
        badge = circle_logo(source, badge_px, bg, max(4, badge_px // 18))
        pos = ((img.width - badge_px) // 2, (img.height - badge_px) // 2)
        img.alpha_composite(badge, pos)

    img = img.resize((size, size), LANCZOS)
    img = apply_frame(img, frame, caption, fg, bg)

    # Flatten transparency (badge corners) onto white for JPG, keep alpha for PNG
    out = io.BytesIO()
    if fmt == "JPEG":
        flat = Image.new("RGB", img.size, (255, 255, 255))
        flat.paste(img, mask=img.split()[3])
        flat.save(out, "JPEG", quality=95)
    else:
        img.save(out, "PNG", optimize=True)
    out.seek(0)
    return out, fmt, len(payload)


# ---------- routes ----------
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/qr", methods=["POST"])
def api_qr():
    try:
        data, fmt, length = build_qr(
            request.form, request.files.get("logoFile"))
    except ValueError as e:
        return jsonify(error=str(e)), 400
    except Exception:
        app.logger.exception("QR generation failed")
        return jsonify(error="The QR code couldn't be made. Check the logo file and try again."), 500
    ext = "jpg" if fmt == "JPEG" else "png"
    resp = send_file(data, mimetype=f"image/{'jpeg' if ext == 'jpg' else 'png'}",
                     download_name=f"alaeh-qr.{ext}")
    resp.headers["X-Payload-Length"] = str(length)
    resp.headers["Access-Control-Expose-Headers"] = "X-Payload-Length"
    return resp


@app.errorhandler(413)
def too_big(_):
    return jsonify(error="Logo file is over 5 MB. Use a smaller image."), 413


if __name__ == "__main__":
    app.run(debug=True, port=5000)
