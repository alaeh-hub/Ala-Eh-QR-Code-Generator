const { useState, useEffect, useRef, useCallback, useMemo } = React;

/* =========================================================
   Data
   ========================================================= */
const KINDS = [
  { id: "url", label: "Link", icon: "link" },
  { id: "wifi", label: "Wi-Fi", icon: "wifi" },
  { id: "tel", label: "Call", icon: "phone" },
  { id: "sms", label: "Text", icon: "sms" },
  { id: "email", label: "Email", icon: "mail" },
  { id: "text", label: "Note", icon: "note" },
];

const QUICK_LINKS = [
  { label: "Facebook", prefix: "https://www.facebook.com/" },
  { label: "Messenger", prefix: "https://m.me/" },
  { label: "Shopee", prefix: "https://shopee.ph/" },
  { label: "Lazada", prefix: "https://www.lazada.com.ph/shop/" },
  { label: "TikTok", prefix: "https://www.tiktok.com/@" },
  { label: "Google Maps", prefix: "https://maps.app.goo.gl/" },
];

const PRESETS = [
  { name: "Toyo", fg: "#FFFFFF", fg2: "#FFFFFF", bg: "#1A0F08", gradient: "none", note: "White on soy-dark brown" },
  { name: "Suka", fg: "#3B2410", fg2: "#3B2410", bg: "#F3E9D2", gradient: "none", note: "Brown on pale vinegar cream" },
  { name: "Catsup", fg: "#FFFFFF", fg2: "#FFE9B3", bg: "#D94A1A", gradient: "vertical", note: "White to cream on banana-catsup orange" },
  { name: "Sili", fg: "#FFFFFF", fg2: "#FFFFFF", bg: "#B81A13", gradient: "none", note: "White on chili red" },
  { name: "Oil", fg: "#5C3A00", fg2: "#5C3A00", bg: "#FFC93C", gradient: "radial", note: "Amber brown on cooking-oil gold" },
  { name: "Patis", fg: "#2B1B00", fg2: "#8A5A1E", bg: "#F6D98A", gradient: "vertical", note: "Dark to amber brown on patis gold" },
];

const PATTERNS = [
  { id: "rounded", label: "Rounded" },
  { id: "square", label: "Square" },
  { id: "dots", label: "Dots" },
  { id: "gapped", label: "Tiles" },
  { id: "vbars", label: "Columns" },
  { id: "hbars", label: "Rows" },
];
const EYES = [
  { id: "rounded", label: "Soft" },
  { id: "square", label: "Sharp" },
  { id: "dots", label: "Dotted" },
];
const FRAMES = [
  { id: "none", label: "None" },
  { id: "caption", label: "Text below" },
  { id: "badge", label: "Sticker" },
];
const GRADIENTS = [
  { id: "none", label: "Solid" },
  { id: "vertical", label: "Vertical" },
  { id: "horizontal", label: "Across" },
  { id: "radial", label: "Radial" },
];
const SIZES = [
  { id: 512, label: "512" },
  { id: 1024, label: "1024" },
  { id: 2048, label: "2048" },
];
const FORMATS = [
  { id: "png", label: "PNG" },
  { id: "jpg", label: "JPG" },
];

const DEFAULTS = {
  kind: "url",
  fields: { url: "", ssid: "", password: "", security: "WPA", hidden: false, phone: "", message: "", to: "", subject: "", body: "", text: "" },
  fg: "#000000", fg2: "#000000", bg: "#FFD400", gradient: "none",
  style: "rounded", eye: "rounded",
  useLogo: true, logoScale: 0.24,
  caption: "", frame: "none",
  border: 4, size: 1024, format: "png",
};

const HISTORY_KEY = "alaeh-qr-history-v1";

/* =========================================================
   Helpers
   ========================================================= */
const validHex = (h) => /^#[0-9A-F]{6}$/i.test(h);

function luminance(hex) {
  const c = hex.replace("#", "").match(/.{2}/g).map((v) => {
    const s = parseInt(v, 16) / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)];
  return { ratio: (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05), inverted: l1 > l2 };
}

function isFilled(kind, f) {
  switch (kind) {
    case "url": return !!f.url.trim();
    case "wifi": return !!f.ssid.trim();
    case "tel": case "sms": return !!f.phone.trim();
    case "email": return !!f.to.trim();
    case "text": return !!f.text.trim();
    default: return false;
  }
}

function describe(kind, f) {
  switch (kind) {
    case "url":
      try {
        const u = new URL(/^[a-z]+:/i.test(f.url) ? f.url : "https://" + f.url);
        return (u.hostname.replace(/^www\./, "") + u.pathname).replace(/\/$/, "");
      } catch { return f.url; }
    case "wifi": return `Wi-Fi: ${f.ssid}`;
    case "tel": return `Call ${f.phone}`;
    case "sms": return `Text ${f.phone}`;
    case "email": return f.to;
    case "text": return f.text.slice(0, 40);
    default: return "QR code";
  }
}

const slugify = (s) => (s || "code").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "code";

function useDebounced(value, ms) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch { return []; }
}
function saveHistory(list) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); } catch { /* storage full or blocked */ }
}

async function blobToThumb(blob, px = 120) {
  const img = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  const ratio = img.height / img.width;
  canvas.width = px; canvas.height = Math.round(px * ratio);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.8);
}

async function toPngBlob(blob) {
  if (blob.type === "image/png") return blob;
  const img = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = img.width; canvas.height = img.height;
  canvas.getContext("2d").drawImage(img, 0, 0);
  return new Promise((res) => canvas.toBlob(res, "image/png"));
}

function timeAgo(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  return new Date(ts).toLocaleDateString();
}

/* Rough guess at how easily phones will read the code. */
function scanStrength(s, payloadLen) {
  let score = 100;
  const tips = [];
  if (validHex(s.fg) && validHex(s.bg)) {
    const colors = s.gradient === "none" ? [s.fg] : [s.fg, s.fg2];
    const worst = colors.filter(validHex).map((c) => contrast(c, s.bg))
      .reduce((a, b) => (a.ratio < b.ratio ? a : b));
    if (worst.inverted) { score -= 45; tips.push("Use a code color darker than the background."); }
    else if (worst.ratio < 3) { score -= 40; tips.push("Colors are too close together."); }
    else if (worst.ratio < 4.5) { score -= 20; tips.push("A darker code color would scan faster."); }
    else if (worst.ratio < 7) { score -= 6; }
  }
  if (s.useLogo && s.logoScale > 0.28) { score -= 16; tips.push("A smaller logo leaves more of the code readable."); }
  else if (s.useLogo && s.logoScale > 0.25) { score -= 7; }
  if (payloadLen > 300) { score -= 18; tips.push("Long content makes a dense code. Try a shorter link."); }
  else if (payloadLen > 120) { score -= 8; }
  if (s.border < 2) { score -= 14; tips.push("Add more quiet zone around the code."); }
  else if (s.border < 3) { score -= 5; }
  if (["vbars", "hbars", "dots"].includes(s.style)) score -= 4;
  score = Math.max(5, Math.min(100, score));
  const level = score >= 80 ? "Strong" : score >= 55 ? "Okay" : "Risky";
  return { score, level, tip: tips[0] || "Looks good. Still test-scan before printing." };
}

/* =========================================================
   Icons
   ========================================================= */
const PATHS = {
  link: "M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1",
  wifi: "M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01",
  phone: "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z",
  sms: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2zM8 10h.01M12 10h.01M16 10h.01",
  mail: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 6l-10 7L2 6",
  note: "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5",
  palette: "M12 2a10 10 0 1 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.3A5.7 5.7 0 0 0 23 9.7C23 5.4 18 2 12 2zM6.5 12.5h.01M9.5 7.5h.01M14.5 7.5h.01M17.5 12h.01",
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM17 14v.01M14 17v.01M17 20v.01M20 17v.01M20 20h1",
  badge: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  type: "M4 7V4h16v3M9 20h6M12 4v16",
  export: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
  chevron: "M6 9l6 6 6-6",
  download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
  copy: "M9 9h11v11H9zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1",
  share: "M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13",
  print: "M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z",
  swap: "M7 16V4M7 4L3 8M7 4l4 4M17 8v12M17 20l4-4M17 20l-4-4",
  reset: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5",
  x: "M18 6L6 18M6 6l12 12",
  check: "M20 6L9 17l-5-5",
  alert: "M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  upload: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2",
};
function Icon({ name, size = 18, stroke = 2 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

/* Little previews for pattern, eye and frame tiles */
function PatternPreview({ id }) {
  const cells = [[0, 0], [1, 0], [3, 0], [0, 1], [2, 1], [3, 1], [1, 2], [2, 2], [0, 3], [2, 3], [3, 3]];
  const s = 7, g = 1;
  return (
    <svg width="34" height="34" viewBox="0 0 32 32" aria-hidden="true">
      {cells.map(([x, y], i) => {
        const cx = x * 8 + 4, cy = y * 8 + 4;
        if (id === "dots") return <circle key={i} cx={cx} cy={cy} r="3.4" fill="currentColor" />;
        if (id === "rounded") return <rect key={i} x={x * 8 + g / 2} y={y * 8 + g / 2} width={s} height={s} rx="3" fill="currentColor" />;
        if (id === "gapped") return <rect key={i} x={x * 8 + 1.5} y={y * 8 + 1.5} width="5" height="5" fill="currentColor" />;
        if (id === "vbars") return <rect key={i} x={x * 8 + 1} y={y * 8} width="6" height="8" rx="3" fill="currentColor" />;
        if (id === "hbars") return <rect key={i} x={x * 8} y={y * 8 + 1} width="8" height="6" rx="3" fill="currentColor" />;
        return <rect key={i} x={x * 8} y={y * 8} width="8" height="8" fill="currentColor" />;
      })}
    </svg>
  );
}
function EyePreview({ id }) {
  const r = id === "rounded" ? 7 : id === "dots" ? 14 : 0;
  const ri = id === "rounded" ? 3 : id === "dots" ? 5 : 0;
  return (
    <svg width="34" height="34" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="2.5" y="2.5" width="27" height="27" rx={r} fill="none" stroke="currentColor" strokeWidth="5" strokeDasharray={id === "dots" ? "0.1 6.4" : undefined} strokeLinecap="round" />
      <rect x="10" y="10" width="12" height="12" rx={ri} fill="currentColor" />
    </svg>
  );
}
function FramePreview({ id }) {
  return (
    <svg width="34" height="34" viewBox="0 0 32 32" aria-hidden="true">
      {id === "badge" && <rect x="1" y="1" width="30" height="30" rx="6" fill="currentColor" opacity=".35" />}
      <rect x={id === "badge" ? 5 : 6} y={id === "badge" ? 4 : 3} width={id === "badge" ? 22 : 20} height={id === "badge" ? 18 : 20} rx="2" fill="none" stroke="currentColor" strokeWidth="2.5" />
      {id !== "none" && <rect x="9" y="25" width="14" height="3" rx="1.5" fill="currentColor" />}
    </svg>
  );
}

/* =========================================================
   Small components
   ========================================================= */
function Section({ id, icon, title, summary, open, onToggle, children }) {
  return (
    <div className={"section" + (open ? " is-open" : "")}>
      <button type="button" className="section-toggle" aria-expanded={open} aria-controls={`sec-${id}`} onClick={() => onToggle(id)}>
        <span className="section-icon"><Icon name={icon} /></span>
        <span className="section-title">{title}</span>
        {summary && <span className="section-summary">{summary}</span>}
        <span className="chev"><Icon name="chevron" /></span>
      </button>
      <div className="section-body" id={`sec-${id}`} role="region" aria-label={title}>
        <div><div className="section-inner" inert={open ? undefined : ""}>{children}</div></div>
      </div>
    </div>
  );
}

function Segmented({ label, options, value, onChange }) {
  const i = Math.max(0, options.findIndex((o) => o.id === value));
  return (
    <div className="seg" role="radiogroup" aria-label={label} style={{ "--n": options.length, "--i": i }}>
      <span className="seg-indicator" aria-hidden="true" />
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={o.id === value}
          className={o.id === value ? "is-active" : ""} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Tiles({ label, options, value, onChange, Preview }) {
  return (
    <div className="tiles" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={o.id === value}
          className={"tile" + (o.id === value ? " is-active" : "")} onClick={() => onChange(o.id)}>
          <Preview id={o.id} />
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ColorField({ label, value, onChange }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const bad = !validHex(draft);
  return (
    <div className="color-field">
      <span className="field-label">{label}</span>
      <span className="color-row">
        <input type="color" value={validHex(value) ? value : "#000000"}
          onChange={(e) => onChange(e.target.value.toUpperCase())} aria-label={`${label} color picker`} />
        <input type="text" value={draft} maxLength={7} spellCheck="false" aria-label={`${label} hex value`}
          className={bad ? "is-bad" : ""}
          onChange={(e) => {
            let v = e.target.value.toUpperCase().replace(/[^#0-9A-F]/g, "");
            if (!v.startsWith("#")) v = "#" + v.replace(/#/g, "");
            setDraft(v);
            if (validHex(v)) onChange(v);
          }}
          onBlur={() => { if (!validHex(draft)) setDraft(value); }}
        />
      </span>
    </div>
  );
}

function Range({ id, label, min, max, step, value, onChange, display }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="group">
      <div className="label-row">
        <label className="field-label" htmlFor={id}>{label}</label>
        <span className="value-badge">{display(value)}</span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value}
        style={{ "--pct": pct + "%" }} onChange={(e) => onChange(parseFloat(e.target.value))} />
    </div>
  );
}

function TextInput({ id, label, optional, clearable, onClear, ...props }) {
  return (
    <div className="group">
      <label className="field-label" htmlFor={id}>
        {label} {optional && <span className="optional">(optional)</span>}
      </label>
      {clearable ? (
        <div className="input-wrap">
          <input id={id} {...props} />
          {props.value && (
            <button type="button" className="clear-btn" onClick={onClear} aria-label={`Clear ${label}`}>
              <Icon name="x" size={16} />
            </button>
          )}
        </div>
      ) : <input id={id} {...props} />}
    </div>
  );
}

function Toasts({ items }) {
  return (
    <div className="toasts" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={"toast" + (t.error ? " is-error" : "")}>
          <span className="toast-icon"><Icon name={t.error ? "alert" : "check"} size={14} stroke={3} /></span> {t.text}
        </div>
      ))}
    </div>
  );
}

/* =========================================================
   Content fields per code type
   ========================================================= */
function KindFields({ kind, f, set }) {
  const [showPw, setShowPw] = useState(false);
  const field = (k) => ({ value: f[k], onChange: (e) => set(k, e.target.value) });

  if (kind === "url") return (
    <div className="kind-panel" key="url">
      <TextInput id="url" label="Link" type="url" inputMode="url" className="big-input"
        placeholder="https://www.facebook.com/alaehfoodproducts" autoFocus
        clearable onClear={() => set("url", "")} {...field("url")} />
      <div className="chips" aria-label="Start with">
        {QUICK_LINKS.map((q) => (
          <button key={q.label} type="button" className="chip"
            onClick={() => { set("url", q.prefix); setTimeout(() => { const el = document.getElementById("url"); el?.focus(); el?.setSelectionRange(q.prefix.length, q.prefix.length); }, 0); }}>
            {q.label}
          </button>
        ))}
      </div>
      <p className="hint">Facebook page, Shopee store, order form, menu. Any link works.</p>
    </div>
  );

  if (kind === "wifi") return (
    <div className="kind-panel" key="wifi">
      <TextInput id="ssid" label="Network name" type="text" placeholder="AlaEh_Store" {...field("ssid")} />
      <div className="group">
        <label className="field-label" htmlFor="security">Security</label>
        <select id="security" {...field("security")}>
          <option value="WPA">WPA / WPA2 / WPA3</option>
          <option value="WEP">WEP (older routers)</option>
          <option value="nopass">None (open network)</option>
        </select>
      </div>
      {f.security !== "nopass" && (
        <div className="group reveal">
          <label className="field-label" htmlFor="password">Password</label>
          <div className="input-wrap">
            <input id="password" type={showPw ? "text" : "password"} autoComplete="off" {...field("password")} />
            <button type="button" className="clear-btn eye-btn" onClick={() => setShowPw((v) => !v)}>
              {showPw ? "Hide" : "Show"}
            </button>
          </div>
        </div>
      )}
      <label className="toggle">
        <span>Hidden network</span>
        <input type="checkbox" role="switch" checked={f.hidden} onChange={(e) => set("hidden", e.target.checked)} />
        <span className="toggle-track" aria-hidden="true" />
      </label>
      <p className="hint">Customers scan to join your store Wi-Fi without typing the password.</p>
    </div>
  );

  if (kind === "tel") return (
    <div className="kind-panel" key="tel">
      <TextInput id="phone" label="Phone number" type="tel" inputMode="tel" className="big-input"
        placeholder="+63 917 123 4567" {...field("phone")} />
      <p className="hint">Scanning opens the phone app with your number ready to call.</p>
    </div>
  );

  if (kind === "sms") return (
    <div className="kind-panel" key="sms">
      <TextInput id="phone" label="Send to" type="tel" inputMode="tel" placeholder="+63 917 123 4567" {...field("phone")} />
      <div className="group">
        <label className="field-label" htmlFor="message">Message <span className="optional">(optional)</span></label>
        <textarea id="message" maxLength={300} placeholder="Hi Ala Eh! Pa-order po ng..." {...field("message")} />
      </div>
    </div>
  );

  if (kind === "email") return (
    <div className="kind-panel" key="email">
      <TextInput id="to" label="Email address" type="email" inputMode="email" placeholder="orders@alaeh.ph" {...field("to")} />
      <TextInput id="subject" label="Subject" optional type="text" maxLength={150} placeholder="Order inquiry" {...field("subject")} />
      <div className="group">
        <label className="field-label" htmlFor="body">Message <span className="optional">(optional)</span></label>
        <textarea id="body" maxLength={500} {...field("body")} />
      </div>
    </div>
  );

  return (
    <div className="kind-panel" key="text">
      <div className="group">
        <div className="label-row">
          <label className="field-label" htmlFor="text">Text</label>
          <span className="hint">{f.text.length}/800</span>
        </div>
        <textarea id="text" maxLength={800} rows={4} placeholder="Promo code, product info, a thank-you note..." {...field("text")} />
      </div>
    </div>
  );
}

/* =========================================================
   App
   ========================================================= */
function App() {
  const [kind, setKind] = useState(DEFAULTS.kind);
  const [fields, setFields] = useState(DEFAULTS.fields);
  const [fg, setFg] = useState(DEFAULTS.fg);
  const [fg2, setFg2] = useState(DEFAULTS.fg2);
  const [bg, setBg] = useState(DEFAULTS.bg);
  const [gradient, setGradient] = useState(DEFAULTS.gradient);
  const [style, setStyle] = useState(DEFAULTS.style);
  const [eye, setEye] = useState(DEFAULTS.eye);
  const [useLogo, setUseLogo] = useState(DEFAULTS.useLogo);
  const [logoScale, setLogoScale] = useState(DEFAULTS.logoScale);
  const [logoFile, setLogoFile] = useState(null);
  const [caption, setCaption] = useState(DEFAULTS.caption);
  const [frame, setFrame] = useState(DEFAULTS.frame);
  const [border, setBorder] = useState(DEFAULTS.border);
  const [size, setSize] = useState(DEFAULTS.size);
  const [format, setFormat] = useState(DEFAULTS.format);

  const [open, setOpen] = useState({ content: true, colors: true, style: false, logo: false, frame: false, export: false });
  const [qrSrc, setQrSrc] = useState(null);
  const [qrBlob, setQrBlob] = useState(null);
  const [payloadLen, setPayloadLen] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toasts, setToasts] = useState([]);
  const [history, setHistory] = useState(loadHistory);
  const [swapSpin, setSwapSpin] = useState(false);
  const [bounce, setBounce] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  /* Large title collapses into the nav bar on scroll, like iOS */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 70);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const lastUrl = useRef(null);
  const reqId = useRef(0);
  const downloadRef = useRef(null);

  const logoPreview = useMemo(() => (logoFile ? URL.createObjectURL(logoFile) : null), [logoFile]);
  useEffect(() => () => { if (logoPreview) URL.revokeObjectURL(logoPreview); }, [logoPreview]);

  const setField = (k, v) => setFields((f) => ({ ...f, [k]: v }));
  const toggle = (id) => setOpen((o) => ({ ...o, [id]: !o[id] }));

  const toast = useCallback((text, err = false) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-2), { id, text, error: err }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }, []);

  const colorsOk = validHex(fg) && validHex(bg) && validHex(fg2);
  const c = colorsOk ? contrast(fg, bg) : null;
  const c2 = colorsOk && gradient !== "none" ? contrast(fg2, bg) : null;
  const worstC = c2 && c && c2.ratio < c.ratio ? c2 : c;

  const settings = { kind, fields, fg, fg2, bg, gradient, style, eye, useLogo, logoScale, caption, frame, border, size, format, logoFile };
  const debounced = useDebounced(settings, 350);
  const filled = isFilled(kind, fields);
  const strength = scanStrength(settings, payloadLen);

  /* ---------- generate ---------- */
  const generate = useCallback(async (s) => {
    if (!isFilled(s.kind, s.fields)) { setQrSrc(null); setQrBlob(null); setError(""); setLoading(false); return; }
    if (!validHex(s.fg) || !validHex(s.bg) || !validHex(s.fg2)) return;

    const id = ++reqId.current;
    setLoading(true);
    const form = new FormData();
    form.append("kind", s.kind);
    Object.entries(s.fields).forEach(([k, v]) => form.append(k, String(v)));
    ["fg", "fg2", "bg", "gradient", "style", "eye", "caption", "frame", "format"].forEach((k) => form.append(k, s[k]));
    form.append("logo", String(s.useLogo));
    form.append("logoScale", String(s.logoScale));
    form.append("border", String(s.border));
    form.append("size", String(s.size));
    if (s.useLogo && s.logoFile) form.append("logoFile", s.logoFile);

    try {
      const res = await fetch("/api/qr", { method: "POST", body: form });
      if (id !== reqId.current) return; // a newer request is on its way
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "The QR code couldn't be made.");
      }
      const blob = await res.blob();
      if (id !== reqId.current) return;
      if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
      lastUrl.current = URL.createObjectURL(blob);
      setQrSrc(lastUrl.current);
      setQrBlob(blob);
      setPayloadLen(parseInt(res.headers.get("X-Payload-Length") || "0", 10));
      setError("");
    } catch (e) {
      if (id === reqId.current) setError(e.message === "Failed to fetch" ? "Can't reach the server. Check that the app is running." : e.message);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, []);

  const depKey = JSON.stringify({ ...debounced, logoFile: debounced.logoFile ? debounced.logoFile.name + debounced.logoFile.size : null });
  useEffect(() => { generate(debounced); }, [depKey]);

  /* ---------- actions ---------- */
  const label = describe(kind, fields);
  const fileName = `alaeh-qr-${slugify(label)}.${format}`;
  const ready = !!qrSrc && !error;

  const addToHistory = useCallback(async () => {
    if (!qrBlob) return;
    try {
      const thumb = await blobToThumb(qrBlob);
      const { logoFile: _omit, ...rest } = settings;
      const entry = { id: Date.now(), label, kind, settings: rest, thumb, customLogo: !!logoFile, ts: Date.now() };
      setHistory((h) => {
        const next = [entry, ...h.filter((x) => JSON.stringify(x.settings) !== JSON.stringify(rest))].slice(0, 10);
        saveHistory(next);
        return next;
      });
    } catch { /* thumbnail failed, skip history */ }
  }, [qrBlob, settings, label, kind, logoFile]);

  const onDownload = () => {
    if (!ready) return;
    setBounce(true); setTimeout(() => setBounce(false), 650);
    toast(`Downloaded ${fileName}`);
    addToHistory();
  };

  const onCopy = async () => {
    if (!qrBlob) return;
    try {
      const png = await toPngBlob(qrBlob);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      toast("Copied image to clipboard");
    } catch {
      toast("Your browser blocked copying. Use Download instead.", true);
    }
  };

  const canShare = typeof navigator !== "undefined" && !!navigator.canShare;
  const onShare = async () => {
    if (!qrBlob) return;
    const file = new File([qrBlob], fileName, { type: qrBlob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "Ala Eh! QR code", text: label }); }
      catch (e) { if (e.name !== "AbortError") toast("Sharing didn't work. Use Download instead.", true); }
    } else {
      toast("Sharing files isn't supported here. Use Download instead.", true);
    }
  };

  const onPrint = () => { if (ready) window.print(); };

  const swapColors = () => {
    setFg(bg); setBg(fg); setFg2(bg);
    setSwapSpin((v) => !v);
  };

  const applyPreset = (p) => { setFg(p.fg); setFg2(p.fg2); setBg(p.bg); setGradient(p.gradient); };

  const reset = () => {
    setKind(DEFAULTS.kind); setFields(DEFAULTS.fields);
    setFg(DEFAULTS.fg); setFg2(DEFAULTS.fg2); setBg(DEFAULTS.bg); setGradient(DEFAULTS.gradient);
    setStyle(DEFAULTS.style); setEye(DEFAULTS.eye);
    setUseLogo(DEFAULTS.useLogo); setLogoScale(DEFAULTS.logoScale); setLogoFile(null);
    setCaption(DEFAULTS.caption); setFrame(DEFAULTS.frame);
    setBorder(DEFAULTS.border); setSize(DEFAULTS.size); setFormat(DEFAULTS.format);
    toast("Settings reset");
  };

  const restore = (entry) => {
    const s = entry.settings;
    setKind(s.kind); setFields({ ...DEFAULTS.fields, ...s.fields });
    setFg(s.fg); setFg2(s.fg2); setBg(s.bg); setGradient(s.gradient);
    setStyle(s.style); setEye(s.eye);
    setUseLogo(s.useLogo); setLogoScale(s.logoScale);
    setCaption(s.caption); setFrame(s.frame);
    setBorder(s.border); setSize(s.size); setFormat(s.format);
    if (!entry.customLogo) setLogoFile(null);
    toast(entry.customLogo && !logoFile ? "Restored. Upload the custom logo again." : "Restored from recent codes");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const removeHistory = (id) => setHistory((h) => { const next = h.filter((x) => x.id !== id); saveHistory(next); return next; });
  const clearHistory = () => { setHistory([]); saveHistory([]); toast("Recent codes cleared"); };

  const pickLogo = (file) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { toast("Use a PNG, JPG or WebP image.", true); return; }
    if (file.size > 5 * 1024 * 1024) { toast("Logo file is over 5 MB. Use a smaller image.", true); return; }
    setLogoFile(file); setUseLogo(true);
    toast("Logo updated");
  };

  /* Ctrl/Cmd + S downloads */
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (downloadRef.current && ready) downloadRef.current.click();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ready]);

  const meterColor = strength.score >= 80 ? "var(--green)" : strength.score >= 55 ? "var(--orange)" : "var(--red)";
  const kindIndex = KINDS.findIndex((k) => k.id === kind);
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || "");

  /* ---------- render ---------- */
  return (
    <>
      <nav className={"navbar" + (scrolled ? " is-scrolled" : "")} aria-label="App">
        <div className="navbar-inner">
          <img src={window.LOGO_URL} alt="" className="navbar-logo" />
          <span className="navbar-title" aria-hidden={!scrolled}>QR Code Maker</span>
          <button type="button" className="nav-btn" onClick={reset}>
            Start Over
          </button>
        </div>
      </nav>

      <div className="page">
        <header className="largetitle">
          <img src={window.LOGO_URL} alt="Ala Eh! Food Products logo" className="app-icon" />
          <div>
            <h1>QR Code Maker</h1>
            <p>Make a code for your page, store Wi-Fi, order number or menu, ready for labels, menus and tarpaulins.</p>
          </div>
        </header>

        <main className="workspace">
          <section className="controls" aria-label="QR code settings">
            <Section id="content" icon="link" title="Content" summary={filled ? label : KINDS[kindIndex].label} open={open.content} onToggle={toggle}>
              <div className="tabs">
                <div className="tabs-inner" role="tablist" aria-label="Code type" style={{ "--n": KINDS.length, "--i": kindIndex }}>
                  <span className="tabs-indicator" aria-hidden="true" />
                  {KINDS.map((k) => (
                    <button key={k.id} type="button" role="tab" aria-selected={kind === k.id}
                      className={"tab" + (kind === k.id ? " is-active" : "")} onClick={() => setKind(k.id)}>
                      <Icon name={k.icon} size={18} />
                      {k.label}
                    </button>
                  ))}
                </div>
              </div>
              <KindFields kind={kind} f={fields} set={setField} />
            </Section>

            <Section id="colors" icon="palette" title="Colors"
              summary={PRESETS.find((p) => p.fg === fg && p.bg === bg && p.fg2 === fg2 && p.gradient === gradient)?.name || "Custom"}
              open={open.colors} onToggle={toggle}>
              <div className="presets">
                {PRESETS.map((p) => {
                  const active = fg === p.fg && bg === p.bg && fg2 === p.fg2 && gradient === p.gradient;
                  return (
                    <button key={p.name} type="button" className={"preset" + (active ? " is-active" : "")}
                      onClick={() => applyPreset(p)} title={p.note} aria-pressed={active}>
                      <span className="swatch" style={{ background: p.bg }}>
                        <span style={{ background: p.gradient === "none" ? p.fg : `linear-gradient(${p.fg}, ${p.fg2})` }} />
                      </span>
                      {p.name}
                    </button>
                  );
                })}
              </div>

              <div className="color-grid">
                <ColorField label={gradient === "none" ? "Code" : "Code (start)"} value={fg} onChange={(v) => { setFg(v); if (gradient === "none") setFg2(v); }} />
                <button type="button" className={"icon-btn" + (swapSpin ? " spin" : "")} onClick={swapColors} aria-label="Swap code and background colors" title="Swap colors">
                  <Icon name="swap" />
                </button>
                <ColorField label="Background" value={bg} onChange={setBg} />
              </div>

              <div className="group">
                <span className="field-label">Code fill</span>
                <Segmented label="Code fill" options={GRADIENTS} value={gradient}
                  onChange={(g) => { setGradient(g); if (g !== "none" && fg2 === fg) setFg2(fg === "#000000" ? "#7A5A00" : "#000000"); }} />
              </div>
              <div className={"collapse" + (gradient !== "none" ? " is-open" : "")}>
                <div>
                  <ColorField label="Code (end)" value={fg2} onChange={setFg2} />
                </div>
              </div>

              {worstC && (worstC.inverted || worstC.ratio < 4) && (
                <p className="warn" role="alert">
                  <Icon name="alert" size={16} />
                  {worstC.inverted
                    ? "The code is lighter than its background. Many phone cameras won't read it. Tap the swap button."
                    : "These colors are close together. Pick a darker code color so phones can scan it reliably."}
                </p>
              )}
            </Section>

            <Section id="style" icon="grid" title="Pattern & Corners"
              summary={`${PATTERNS.find((p) => p.id === style).label}, ${EYES.find((e) => e.id === eye).label.toLowerCase()} corners`}
              open={open.style} onToggle={toggle}>
              <div className="group">
                <span className="field-label">Pattern</span>
                <Tiles label="Pattern" options={PATTERNS} value={style} onChange={setStyle} Preview={PatternPreview} />
              </div>
              <div className="group">
                <span className="field-label">Corner squares</span>
                <Tiles label="Corner squares" options={EYES} value={eye} onChange={setEye} Preview={EyePreview} />
              </div>
              <Range id="border" label="Quiet zone (space around the code)" min={1} max={8} step={1}
                value={border} onChange={setBorder} display={(v) => `${v} blocks`} />
            </Section>

            <Section id="logo" icon="badge" title="Center Logo"
              summary={useLogo ? `${logoFile ? "Custom" : "Ala Eh!"} logo, ${Math.round(logoScale * 100)}%` : "Off"}
              open={open.logo} onToggle={toggle}>
              <label className="toggle">
                <span>Put a logo in the center</span>
                <input type="checkbox" role="switch" checked={useLogo} onChange={(e) => setUseLogo(e.target.checked)} />
                <span className="toggle-track" aria-hidden="true" />
              </label>
              <div className={"collapse" + (useLogo ? " is-open" : "")}>
                <div inert={useLogo ? undefined : ""}>
                  <Range id="scale" label="Logo size" min={0.16} max={0.30} step={0.01}
                    value={logoScale} onChange={setLogoScale} display={(v) => `${Math.round(v * 100)}%`} />
                  <label
                    className={"dropzone" + (dragOver ? " is-over" : "")}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => { e.preventDefault(); setDragOver(false); pickLogo(e.dataTransfer.files[0]); }}
                  >
                    <img key={logoPreview || "default"} src={logoPreview || window.LOGO_URL} alt="" />
                    <div>
                      <strong>{logoFile ? logoFile.name : "Ala Eh! logo"}</strong>
                      <span>Drop an image here or tap to choose. PNG, JPG or WebP up to 5 MB.</span>
                    </div>
                    <input type="file" accept="image/png,image/jpeg,image/webp" aria-label="Choose a different logo"
                      onChange={(e) => { pickLogo(e.target.files[0]); e.target.value = ""; }} />
                  </label>
                  {logoFile && (
                    <button type="button" className="link-btn" onClick={() => setLogoFile(null)}>Back to Ala Eh! logo</button>
                  )}
                </div>
              </div>
            </Section>

            <Section id="frame" icon="type" title="Frame & Text"
              summary={FRAMES.find((f) => f.id === frame).label + (caption && frame !== "none" ? `: ${caption}` : "")}
              open={open.frame} onToggle={toggle}>
              <Tiles label="Frame" options={FRAMES} value={frame} onChange={setFrame} Preview={FramePreview} />
              <div className={"collapse" + (frame !== "none" ? " is-open" : "")}>
                <div inert={frame !== "none" ? undefined : ""}>
                  <TextInput id="caption" label="Text" optional type="text" maxLength={40}
                    placeholder={frame === "badge" ? "Scan me" : "Scan para umorder!"}
                    value={caption} onChange={(e) => setCaption(e.target.value)}
                    clearable onClear={() => setCaption("")} />
                  <div className="chips">
                    {["Scan para umorder!", "Scan me", "Order na!", "Free Wi-Fi", "I-follow kami!"].map((t) => (
                      <button key={t} type="button" className="chip" onClick={() => setCaption(t)}>{t}</button>
                    ))}
                  </div>
                </div>
              </div>
            </Section>

            <Section id="export" icon="export" title="File" summary={`${format.toUpperCase()}, ${size}px`} open={open.export} onToggle={toggle}>
              <div className="two-col">
                <div className="group">
                  <span className="field-label">Format</span>
                  <Segmented label="Format" options={FORMATS} value={format} onChange={setFormat} />
                </div>
                <div className="group">
                  <span className="field-label">Size (px)</span>
                  <Segmented label="Size" options={SIZES} value={size} onChange={setSize} />
                </div>
              </div>
              <p className="hint">PNG keeps the sticker frame's rounded corners see-through. Use 2048px for tarpaulins and large prints.</p>
            </Section>
          </section>

          <section className="stage" aria-label="Preview">
            <div className="sticker-wrap">
              <div className={"sticker" + (frame === "badge" && ready ? " is-framed" : "") + (bounce ? " bounce" : "")}
                style={{ backgroundColor: frame === "badge" && ready && validHex(fg) ? fg : validHex(bg) ? bg : "#fff" }}>
                {qrSrc ? (
                  <img key={qrSrc} src={qrSrc} alt={`QR code for ${label}`} className={"qr-img" + (loading ? " is-updating" : "")} />
                ) : (
                  <div className="empty">
                    <img src={window.LOGO_URL} alt="" />
                    <p>{kind === "url" ? "Paste a link and your code shows up here." : "Fill in the details and your code shows up here."}</p>
                  </div>
                )}
                {loading && <span className="spinner" aria-hidden="true" />}
              </div>
            </div>
            <span className="sr-only" aria-live="polite">{loading ? "Updating code" : ready ? "Code ready" : ""}</span>

            {error && <p className="error" role="alert"><Icon name="alert" size={18} /> {error}</p>}

            {ready && (
              <div className="meter reveal">
                <div className="meter-head">
                  <span>Scan strength</span>
                  <strong style={{ color: meterColor }}>{strength.level}</strong>
                </div>
                <div className="meter-track" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={strength.score} aria-label="Scan strength">
                  <div className="meter-fill" style={{ width: strength.score + "%", background: meterColor }} />
                </div>
                <p className="meter-tip">{strength.tip}</p>
              </div>
            )}

            <a ref={downloadRef}
              className={"download" + (ready ? "" : " is-disabled")}
              href={qrSrc || undefined}
              download={fileName}
              aria-disabled={!ready}
              onClick={onDownload}>
              <Icon name="download" size={20} stroke={2.4} />
              Download {format.toUpperCase()}
              <span className="kbd">{isMac ? "⌘S" : "Ctrl S"}</span>
            </a>

            <div className="actions">
              <button type="button" className="action" onClick={onCopy} disabled={!ready}><Icon name="copy" size={20} /><span>Copy</span></button>
              <button type="button" className="action" onClick={onShare} disabled={!ready || !canShare} title={canShare ? "" : "Not supported in this browser"}><Icon name="share" size={20} /><span>Share</span></button>
              <button type="button" className="action" onClick={onPrint} disabled={!ready}><Icon name="print" size={20} /><span>Print</span></button>
            </div>
            <p className="hint center">Test-scan with your phone before printing.</p>
          </section>
        </main>

        {history.length > 0 && (
          <section className="history" aria-label="Recent codes">
            <div className="history-head">
              <h2>Recent</h2>
              <button type="button" className="btn btn-ghost" onClick={clearHistory}>Clear</button>
            </div>
            <div className="history-list">
              {history.map((h, i) => (
                <div key={h.id} className="history-item" style={{ animationDelay: `${i * 40}ms` }}
                  role="button" tabIndex={0} onClick={() => restore(h)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); restore(h); } }}
                  aria-label={`Restore ${h.label}`}>
                  <img src={h.thumb} alt="" />
                  <strong>{h.label}</strong>
                  <span>{timeAgo(h.ts)}</span>
                  <button type="button" className="history-del" aria-label={`Remove ${h.label}`}
                    onClick={(e) => { e.stopPropagation(); removeHistory(h.id); }}>
                    <Icon name="x" size={14} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        <footer className="foot">Ala Eh! Food Products. Specially made recipe sa panlasang Pinoy.</footer>
      </div>

      {qrSrc && <img className="print-only" src={qrSrc} alt="" />}
      <Toasts items={toasts} />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);