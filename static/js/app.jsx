const { useState, useEffect, useRef, useCallback } = React;

const PRESETS = [
  { name: "Uling",  fg: "#1E1410", bg: "#FFFFFF", note: "Charcoal on white" },
  { name: "Sili",   fg: "#C8201A", bg: "#FFFFFF", note: "Chili red on white" },
  { name: "Salakot",fg: "#1E1410", bg: "#F6C641", note: "Charcoal on gold" },
  { name: "Banig",  fg: "#6B3A12", bg: "#FFF4DA", note: "Brown on rice cream" },
];

const STYLES = [
  { id: "rounded", label: "Rounded" },
  { id: "square",  label: "Square" },
  { id: "dots",    label: "Dots" },
  { id: "gapped",  label: "Tiles" },
  { id: "bars",    label: "Bars" },
];

const SIZES = [512, 1024, 2048];

// WCAG-style contrast ratio, to warn when a QR may not scan.
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

function useDebounced(value, ms) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function ColorField({ label, value, onChange }) {
  return (
    <label className="color-field">
      <span className="field-label">{label}</span>
      <span className="color-row">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} aria-label={`${label} picker`} />
        <input
          type="text"
          value={value}
          maxLength={7}
          spellCheck="false"
          onChange={(e) => {
            let v = e.target.value.toUpperCase();
            if (!v.startsWith("#")) v = "#" + v;
            onChange(v);
          }}
        />
      </span>
    </label>
  );
}

function App() {
  const [url, setUrl] = useState("");
  const [fg, setFg] = useState(PRESETS[0].fg);
  const [bg, setBg] = useState(PRESETS[0].bg);
  const [style, setStyle] = useState("rounded");
  const [useLogo, setUseLogo] = useState(true);
  const [logoScale, setLogoScale] = useState(0.24);
  const [caption, setCaption] = useState("");
  const [size, setSize] = useState(1024);
  const [logoFile, setLogoFile] = useState(null);

  const [qrSrc, setQrSrc] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const lastBlob = useRef(null);
  const reqId = useRef(0);

  const validHex = (h) => /^#[0-9A-F]{6}$/i.test(h);
  const colorsOk = validHex(fg) && validHex(bg);
  const c = colorsOk ? contrast(fg, bg) : null;

  const settings = { url, fg, bg, style, useLogo, logoScale, caption, size, logoFile };
  const debounced = useDebounced(settings, 400);

  const generate = useCallback(async (s) => {
    if (!s.url.trim()) { setQrSrc(null); setError(""); return; }
    if (!validHex(s.fg) || !validHex(s.bg)) return;

    const id = ++reqId.current;
    setLoading(true);
    const form = new FormData();
    form.append("url", s.url);
    form.append("fg", s.fg);
    form.append("bg", s.bg);
    form.append("style", s.style);
    form.append("logo", String(s.useLogo));
    form.append("logoScale", String(s.logoScale));
    form.append("caption", s.caption);
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
      if (lastBlob.current) URL.revokeObjectURL(lastBlob.current);
      lastBlob.current = URL.createObjectURL(blob);
      setQrSrc(lastBlob.current);
      setError("");
    } catch (e) {
      if (id === reqId.current) setError(e.message);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, []);

  useEffect(() => { generate(debounced); }, [JSON.stringify({ ...debounced, logoFile: debounced.logoFile?.name }), debounced.logoFile]);

  const slug = (() => {
    try {
      const u = new URL(/^[a-z]+:/i.test(url) ? url : "https://" + url);
      return u.hostname.replace(/^www\./, "").replace(/[^a-z0-9]+/gi, "-");
    } catch { return "link"; }
  })();

  const applyPreset = (p) => { setFg(p.fg); setBg(p.bg); };

  return (
    <div className="page">
      <header className="masthead">
        <img src={window.LOGO_URL} alt="Ala Eh! Food Products logo" className="masthead-logo" />
        <div>
          <h1>QR code maker</h1>
          <p>Paste a link, make it look like Ala Eh!, and download a code ready for labels, menus and tarpaulins.</p>
        </div>
      </header>

      <main className="workspace">
        <section className="controls" aria-label="QR code settings">
          <div className="group">
            <label className="field-label" htmlFor="url">Link</label>
            <input
              id="url"
              className="url-input"
              type="url"
              inputMode="url"
              placeholder="https://www.facebook.com/alaehfoodproducts"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              autoFocus
            />
            <p className="hint">Facebook page, Shopee store, order form, menu — any link works.</p>
          </div>

          <div className="group">
            <span className="field-label">Colors</span>
            <div className="presets" role="list">
              {PRESETS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  role="listitem"
                  className={"preset" + (fg === p.fg && bg === p.bg ? " is-active" : "")}
                  onClick={() => applyPreset(p)}
                  title={p.note}
                >
                  <span className="swatch" style={{ background: p.bg }}>
                    <span style={{ background: p.fg }} />
                  </span>
                  {p.name}
                </button>
              ))}
            </div>
            <div className="color-pair">
              <ColorField label="Code" value={fg} onChange={setFg} />
              <ColorField label="Background" value={bg} onChange={setBg} />
            </div>
            {c && (c.inverted || c.ratio < 4) && (
              <p className="warn">
                {c.inverted
                  ? "The code is lighter than its background. Many phone cameras won't read it — swap the two colors."
                  : "These colors are close together. Pick a darker code color so phones can scan it reliably."}
              </p>
            )}
          </div>

          <div className="group">
            <span className="field-label">Pattern</span>
            <div className="segmented">
              {STYLES.map((s) => (
                <button key={s.id} type="button" className={style === s.id ? "is-active" : ""} onClick={() => setStyle(s.id)}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="group">
            <label className="toggle">
              <input type="checkbox" checked={useLogo} onChange={(e) => setUseLogo(e.target.checked)} />
              <span className="toggle-track" aria-hidden="true" />
              Put the logo in the center
            </label>

            {useLogo && (
              <div className="logo-options">
                <label className="field-label" htmlFor="scale">Logo size</label>
                <input
                  id="scale" type="range" min="0.16" max="0.30" step="0.01"
                  value={logoScale} onChange={(e) => setLogoScale(parseFloat(e.target.value))}
                />
                <div className="file-row">
                  <label className="file-btn">
                    Use a different logo
                    <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setLogoFile(e.target.files[0] || null)} />
                  </label>
                  {logoFile && (
                    <button type="button" className="link-btn" onClick={() => setLogoFile(null)}>
                      Back to Ala Eh! logo
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="group">
            <label className="field-label" htmlFor="caption">Text under the code <span className="optional">(optional)</span></label>
            <input
              id="caption" type="text" maxLength={40}
              placeholder="Scan para umorder!"
              value={caption} onChange={(e) => setCaption(e.target.value)}
            />
          </div>

          <div className="group">
            <span className="field-label">Download size</span>
            <div className="segmented">
              {SIZES.map((s) => (
                <button key={s} type="button" className={size === s ? "is-active" : ""} onClick={() => setSize(s)}>
                  {s}px
                </button>
              ))}
            </div>
            <p className="hint">Use 2048px for tarpaulins and large prints.</p>
          </div>
        </section>

        <section className="stage" aria-live="polite">
          <div className="sticker" style={{ background: bg }}>
            {qrSrc ? (
              <img src={qrSrc} alt={`QR code for ${url}`} className={loading ? "is-updating" : ""} />
            ) : (
              <div className="empty">
                <img src={window.LOGO_URL} alt="" />
                <p>Your QR code shows up here as soon as you paste a link.</p>
              </div>
            )}
          </div>

          {error && <p className="error">{error}</p>}

          <a
            className={"download" + (qrSrc && !error ? "" : " is-disabled")}
            href={qrSrc || undefined}
            download={`alaeh-qr-${slug}.png`}
            aria-disabled={!qrSrc || !!error}
          >
            Download PNG
          </a>
          <p className="hint center">Test-scan with your phone before printing.</p>
        </section>
      </main>

      <footer className="foot">Ala Eh! Food Products · Specially made recipe sa panlasang Pinoy</footer>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
