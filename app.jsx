/* global React, ReactDOM, useTweaks, TweaksPanel, TweakSection, TweakSlider, TweakToggle, TweakRadio, TweakSelect, TweakColor, TweakButton, TweakText */
const { useState, useEffect, useRef, useMemo, useCallback } = React;

/* ============== Fallback content (used only if PocketBase is unreachable) ============== */
// The real source of truth lives in PocketBase. This shape is mirrored in the
// initial migration (pb/pb_migrations/0001_init.js) — keep them in sync. The
// `guestbook` field is intentionally absent here: guestbook entries live in
// their own collection so visitors can post without auth.
const DEFAULT_CONTENT = {
  baby: { fullName: "Castiel Grey Butay", nickname: "Lulu", tagline: "A small star, newly arrived — already the brightest thing in the room.", birthdate: "2025-11-16", birthplace: "—", weight: "—", height: "—", gender: "Boy", zodiac: "Scorpio" },
  facts: [
    { q: "Loudest at?", a: "3 AM, on the dot." },
    { q: "Superpower", a: "Turning milk into smiles." },
    { q: "Mood", a: "Sleepy, hungry, repeat." },
    { q: "Catchphrase", a: "WAAAH (translation: hold me)." },
    { q: "Favorite spot", a: "Mom's shoulder." },
    { q: "Specialty", a: "Falling asleep mid-burp." },
  ],
  stats: [
    { num: "—", unit: "", lbl: "Weight" },
    { num: "—", unit: "cm", lbl: "Height" },
    { num: "AUTO_DAYS", unit: "days", lbl: "Age" },
    { num: "AUTO_MONTHS", unit: "months", lbl: "On Earth" },
  ],
  timeline: [],
  family: [
    { rel: "Mama", name: "Chin Butay", note: "Snack provider, lullaby singer, biggest fan." },
    { rel: "Papa", name: "Red Butay", note: "Diaper engineer. Comedian-in-residence." },
  ],
  letter: { date: "", body: "", sign: "" },
  routine: [],
  wishes: [],
  gallery: [],
};

/* ============== PocketBase API client ============== */
const API = "/api";
const AUTH_COLLECTION = "_superusers";
const TOKEN_KEY = "castiel-pb-token-v1";

const apiToken = () => localStorage.getItem(TOKEN_KEY) || "";
const setApiToken = (t) => t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);

async function apiFetch(path, { method = "GET", json, form } = {}) {
  const headers = {};
  const tok = apiToken();
  if (tok) headers["Authorization"] = tok;
  let body;
  if (form) {
    body = form;
  } else if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  }
  const res = await fetch(API + path, { method, headers, body });
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    const err = new Error(`${res.status} ${res.statusText} — ${errBody}`);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

const pbFileUrl = (rec, filename) => `${API}/files/${rec.collectionId}/${rec.id}/${filename}`;

async function login(identity, password) {
  const out = await apiFetch(`/collections/${AUTH_COLLECTION}/auth-with-password`, {
    method: "POST",
    json: { identity, password },
  });
  setApiToken(out.token);
  return out;
}

const logout = () => setApiToken("");

// On startup, verify a stored token is still valid; otherwise drop it.
async function refreshAuth() {
  if (!apiToken()) return false;
  try {
    await apiFetch(`/collections/${AUTH_COLLECTION}/auth-refresh`, { method: "POST" });
    return true;
  } catch (_) {
    setApiToken("");
    return false;
  }
}

async function fetchContent() {
  const out = await apiFetch("/collections/content/records?perPage=1");
  const rec = out.items[0];
  if (!rec) throw new Error("No content record found — run migrations.");
  return { id: rec.id, data: { ...DEFAULT_CONTENT, ...rec.data } };
}

const saveContent = (recordId, data) =>
  apiFetch(`/collections/content/records/${recordId}`, { method: "PATCH", json: { data } });

async function fetchPhotos() {
  const out = await apiFetch("/collections/photos/records?perPage=200");
  const map = {};
  const ids = {};
  for (const rec of out.items) {
    map[rec.slot] = pbFileUrl(rec, rec.image);
    ids[rec.slot] = rec.id;
  }
  return { map, ids };
}

async function uploadPhoto(slot, file, existingId) {
  const fd = new FormData();
  fd.append("slot", slot);
  fd.append("image", file);
  const path = existingId
    ? `/collections/photos/records/${existingId}`
    : `/collections/photos/records`;
  const rec = await apiFetch(path, { method: existingId ? "PATCH" : "POST", form: fd });
  return { id: rec.id, url: pbFileUrl(rec, rec.image) };
}

const deletePhoto = (id) =>
  apiFetch(`/collections/photos/records/${id}`, { method: "DELETE" });

async function renamePhotoSlot(id, newSlot) {
  const fd = new FormData();
  fd.append("slot", newSlot);
  const rec = await apiFetch(`/collections/photos/records/${id}`, { method: "PATCH", form: fd });
  return { id: rec.id, url: pbFileUrl(rec, rec.image) };
}

const fetchGuestbook = () =>
  apiFetch("/collections/guestbook/records?sort=-created&perPage=200").then((o) => o.items);

const submitGuestbookEntry = (name, body) =>
  apiFetch("/collections/guestbook/records", { method: "POST", json: { name, body } });

/* ============== Helpers ============== */
function ageFromBirth(dateStr) {
  if (!dateStr) return { days: 0, months: 0, years: 0, weeks: 0 };
  const birth = new Date(dateStr);
  const now = new Date();
  const diffMs = now - birth;
  const days = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  const weeks = Math.floor(days / 7);
  let months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
  if (now.getDate() < birth.getDate()) months -= 1;
  months = Math.max(0, months);
  const years = Math.floor(months / 12);
  return { days, weeks, months, years };
}

function formatBirthdate(d) {
  if (!d) return "";
  const date = new Date(d);
  if (isNaN(date)) return d;
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/* ============== Editable text component ============== */
function Editable({ value, onChange, editing = false, multiline = false, className = "", as = "span", placeholder = "" }) {
  const Tag = as;
  const ref = useRef(null);
  if (!editing) {
    return <Tag className={className}>{value}</Tag>;
  }
  const onBlur = () => {
    if (!ref.current) return;
    const v = multiline ? ref.current.innerText : ref.current.innerText.replace(/\n/g, " ").trim();
    if (v !== value) onChange(v);
  };
  const onKey = (e) => {
    if (!multiline && e.key === "Enter") { e.preventDefault(); ref.current.blur(); }
    if (e.key === "Escape") { ref.current.innerText = value; ref.current.blur(); }
  };
  return (
    <Tag
      ref={ref}
      className={className}
      data-edit
      contentEditable={true}
      suppressContentEditableWarning={true}
      onBlur={onBlur}
      onKeyDown={onKey}
      data-placeholder={placeholder}
    >
      {value}
    </Tag>
  );
}

/* ============== Photo placeholder w/ swap ============== */
function Photo({ id, label, photos, onUpload, editing, className = "" }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const src = photos[id];
  const onPick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      await onUpload(id, file);
    } catch (err) {
      alert(`Photo upload failed: ${err.message}`);
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };
  return (
    <div
      className={`photo-placeholder ${src ? "has-img" : ""} ${busy ? "busy" : ""} ${className}`}
      data-edit-photo={editing ? "" : null}
      onClick={() => editing && !busy && inputRef.current?.click()}
    >
      {src ? <img src={src} alt={label} /> : <span className="ph-label">{busy ? "uploading…" : label}</span>}
      {editing && (
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={onPick}
        />
      )}
    </div>
  );
}

/* ============== Confetti ============== */
function fireConfetti(count = 80) {
  const colors = ["#f4c9a8", "#b8d6e8", "#c5d4b8", "#f6e3a4", "#e8b8b0", "#d8895a"];
  for (let i = 0; i < count; i++) {
    const el = document.createElement("div");
    el.className = "confetti";
    el.style.left = Math.random() * 100 + "vw";
    el.style.background = colors[Math.floor(Math.random() * colors.length)];
    el.style.animationDuration = 3 + Math.random() * 3 + "s";
    el.style.animationDelay = Math.random() * 0.6 + "s";
    el.style.transform = `rotate(${Math.random() * 360}deg)`;
    el.style.borderRadius = Math.random() > 0.5 ? "50%" : "2px";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 7000);
  }
}

/* ============== Hearts on hover ============== */
function spawnParticle(x, y) {
  const symbols = ["♥", "✦", "❀", "✿", "★"];
  const colors = ["#d8895a", "#6fa6c4", "#809974", "#e8b8b0"];
  const el = document.createElement("div");
  el.className = "particle";
  el.textContent = symbols[Math.floor(Math.random() * symbols.length)];
  el.style.left = x + "px";
  el.style.top = y + "px";
  el.style.color = colors[Math.floor(Math.random() * colors.length)];
  el.style.setProperty("--dx", (Math.random() * 80 - 40) + "px");
  el.style.setProperty("--rot", (Math.random() * 60 - 30) + "deg");
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1900);
}

/* ============== Music (lullaby — synthesized) ============== */
function useLullaby(playing) {
  const ctxRef = useRef(null);
  const timerRef = useRef(null);
  useEffect(() => {
    if (!playing) {
      if (timerRef.current) clearInterval(timerRef.current);
      if (ctxRef.current) { try { ctxRef.current.close(); } catch (e) {} ctxRef.current = null; }
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    ctxRef.current = ctx;
    // Twinkle Twinkle Little Star — simple tones
    const notes = [
      [523.25, 0.5], [523.25, 0.5], [783.99, 0.5], [783.99, 0.5],
      [880.00, 0.5], [880.00, 0.5], [783.99, 1.0],
      [698.46, 0.5], [698.46, 0.5], [659.25, 0.5], [659.25, 0.5],
      [587.33, 0.5], [587.33, 0.5], [523.25, 1.0],
    ];
    let i = 0;
    const playNext = () => {
      if (!ctxRef.current) return;
      const [freq, dur] = notes[i % notes.length];
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.03);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + dur * 0.9);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur);
      i++;
      timerRef.current = setTimeout(playNext, dur * 700);
    };
    playNext();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      try { ctx.close(); } catch (e) {}
    };
  }, [playing]);
}

/* ============== Top bar ============== */
const NAV_LINKS = [
  ["#about", "About"],
  ["#timeline", "Timeline"],
  ["#gallery", "Gallery"],
  ["#family", "Family"],
  ["#letter", "Letter"],
  ["#guestbook", "Guestbook"],
];

function TopBar({ dark, setDark, music, setMusic, editing, unlocked, onLockClick, onSaveStatus }) {
  const [menuOpen, setMenuOpen] = useState(false);
  // Lock body scroll while the mobile drawer is open, and close on Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => { if (e.key === "Escape") setMenuOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <div className="topbar">
      <div className="topbar-brand">
        <span className="dot"></span>
        <span>Grey · Lulu</span>
      </div>
      <nav className="topbar-nav">
        {NAV_LINKS.map(([href, label]) => (
          <a key={href} href={href}>{label}</a>
        ))}
      </nav>
      <div className="topbar-actions">
        {editing && <span className="lock-pill unlocked">edit mode · {onSaveStatus}</span>}
        <button
          className={`icon-btn ${music ? "active" : ""}`}
          onClick={() => setMusic(!music)}
          title="Lullaby"
        >
          {music ? (
            <span className="music-bars"><span></span><span></span><span></span></span>
          ) : "♪"}
        </button>
        <button
          className="icon-btn"
          onClick={() => setDark(!dark)}
          title="Theme"
        >{dark ? "☀" : "☾"}</button>
        <button
          className={`icon-btn ${unlocked ? "active" : ""}`}
          onClick={onLockClick}
          title={unlocked ? "Lock editing" : "Unlock to edit"}
        >{unlocked ? "✎" : "🔒"}</button>
        <button
          className={`icon-btn topbar-burger ${menuOpen ? "active" : ""}`}
          onClick={() => setMenuOpen((o) => !o)}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
        >
          <span className={`burger-icon ${menuOpen ? "open" : ""}`}>
            <span></span><span></span><span></span>
          </span>
        </button>
      </div>

      <div
        className={`mobile-menu-backdrop ${menuOpen ? "open" : ""}`}
        onClick={() => setMenuOpen(false)}
      />
      <nav className={`mobile-menu ${menuOpen ? "open" : ""}`} aria-hidden={!menuOpen}>
        {NAV_LINKS.map(([href, label]) => (
          <a key={href} href={href} onClick={() => setMenuOpen(false)}>{label}</a>
        ))}
      </nav>
    </div>
  );
}

/* ============== Hero ============== */
function Hero({ content, setContent, photos, onUpload, editing }) {
  const baby = content.baby;
  const update = (k, v) => setContent({ ...content, baby: { ...content.baby, [k]: v } });
  return (
    <header className="hero" id="top">
      <div className="hero-text">
        <div className="eyebrow mono">EST. 11 · 16 · 2025</div>
        <h1 className="hero-name display">
          <Editable as="span" value={baby.fullName.split(" ")[0]} onChange={(v) => {
            const rest = baby.fullName.split(" ").slice(1).join(" ");
            update("fullName", `${v} ${rest}`.trim());
          }} editing={editing} />
          <br/>
          <Editable as="span" value={baby.fullName.split(" ").slice(1).join(" ")} onChange={(v) => {
            const first = baby.fullName.split(" ")[0];
            update("fullName", `${first} ${v}`.trim());
          }} editing={editing} />
          <Editable as="span" className="lulu" value={`"${baby.nickname}"`} onChange={(v) => update("nickname", v.replace(/"/g, ""))} editing={editing} />
        </h1>
        <Editable as="p" className="hero-tag" value={baby.tagline} onChange={(v) => update("tagline", v)} multiline editing={editing} />

        <div className="hero-meta">
          <div className="meta-item">
            <div className="lbl">Born</div>
            <div className="val">
              {editing ? (
                <input
                  type="date"
                  value={baby.birthdate}
                  onChange={(e) => update("birthdate", e.target.value)}
                  style={{ font: "inherit", background: "transparent", border: "1px dashed var(--ink-mute)", borderRadius: 4, padding: "2px 4px" }}
                />
              ) : formatBirthdate(baby.birthdate)}
            </div>
          </div>
          <div className="meta-item">
            <div className="lbl">Parents</div>
            <div className="val">
              <Editable value={content.family.map(f => f.name.split(" ")[0]).join(" & ")} onChange={() => {}} editing={editing} />
            </div>
          </div>
          <div className="meta-item">
            <div className="lbl">Gender</div>
            <div className="val"><Editable value={baby.gender} onChange={(v) => update("gender", v)} editing={editing} /></div>
          </div>
          <div className="meta-item">
            <div className="lbl">Hobbies</div>
            <div className="val">milk · sleeping · crying</div>
          </div>
        </div>
      </div>

      <div className="hero-portrait">
        <div className="portrait-floating f1">tiny human</div>
        <div className="portrait-floating f2">est. 2025</div>
        <div className="portrait-frame">
          <Photo id="hero" label="Hero portrait — drop a favorite photo here" photos={photos} onUpload={onUpload} editing={editing} />
        </div>
        <div className="portrait-stamp">freshly<br/>baked<br/>★ ★ ★</div>
      </div>
    </header>
  );
}

/* ============== About / facts (flippable) ============== */
function About({ content, setContent, editing }) {
  const [flipped, setFlipped] = useState({});
  const toggle = (i) => setFlipped({ ...flipped, [i]: !flipped[i] });
  const updateFact = (i, k, v) => {
    const next = [...content.facts];
    next[i] = { ...next[i], [k]: v };
    setContent({ ...content, facts: next });
  };
  return (
    <section className="s" id="about">
      <div className="s-head">
        <div>
          <div className="s-eyebrow">01 · About this little person</div>
          <h2 className="s-title">Six things, six flips.</h2>
        </div>
        <p className="s-sub">Tap a card to peek behind it. The full story of Lulu, in tiny chapters.</p>
      </div>
      <div className="fact-grid">
        {content.facts.map((f, i) => (
          <div
            key={i}
            className={`fact-card ${flipped[i] ? "flipped" : ""}`}
            onClick={(e) => {
              if (editing) return; // don't flip while editing
              if (e.target.closest("[data-edit]")) return;
              toggle(i);
            }}
          >
            <div className="fact-card-inner">
              <div className="fact-face">
                <div className="fact-icon">{String(i + 1).padStart(2, "0")}</div>
                <Editable as="div" className="fact-q" value={f.q} onChange={(v) => updateFact(i, "q", v)} editing={editing} />
                <div className="flip-hint">tap to flip</div>
              </div>
              <div className="fact-face back">
                <div className="fact-icon" style={{ background: "var(--paper)" }}>↻</div>
                <Editable as="div" className="fact-a" value={f.a} onChange={(v) => updateFact(i, "a", v)} multiline editing={editing} />
                <div className="flip-hint">tap to flip back</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ============== Stats card ============== */
function Stats({ content, setContent, editing }) {
  const age = ageFromBirth(content.baby.birthdate);
  const stats = content.stats.map((s) => {
    if (s.num === "AUTO_DAYS") return { ...s, num: age.days, computed: true };
    if (s.num === "AUTO_MONTHS") return { ...s, num: age.months, computed: true };
    if (s.num === "AUTO_WEEKS") return { ...s, num: age.weeks, computed: true };
    return s;
  });
  const updateStat = (i, k, v) => {
    const next = [...content.stats];
    next[i] = { ...next[i], [k]: v };
    setContent({ ...content, stats: next });
  };
  return (
    <section className="s">
      <div className="s-head">
        <div>
          <div className="s-eyebrow">02 · Vital statistics</div>
          <h2 className="s-title">By the numbers.</h2>
        </div>
        <p className="s-sub">Updated live. He's bigger by the time you finish reading this.</p>
      </div>
      <div className="stats-block">
        {stats.map((s, i) => (
          <div className="stat" key={i}>
            <div>
              {s.computed ? (
                <span className="stat-num">{s.num}</span>
              ) : (
                <Editable as="span" className="stat-num" value={String(s.num)} onChange={(v) => updateStat(i, "num", v)} editing={editing} />
              )}
              {s.computed
                ? s.unit && <span className="stat-unit">{s.unit}</span>
                : <Editable as="span" className="stat-unit" value={s.unit || ""} onChange={(v) => updateStat(i, "unit", v)} placeholder="unit" editing={editing} />}
            </div>
            <div className="stat-lbl">{s.lbl}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ============== Timeline ============== */
function Timeline({ content, setContent, editing, photos, photoIds, onUpload, onRemovePhoto, onRenamePhotoSlot }) {
  const update = (i, k, v) => {
    const next = [...content.timeline];
    next[i] = { ...next[i], [k]: v };
    setContent({ ...content, timeline: next });
  };
  const add = () => setContent({
    ...content,
    timeline: [...content.timeline, { date: "Today", title: "A new milestone", desc: "Tell the story…" }],
  });
  const remove = async (i) => {
    try {
      if (photoIds[`timeline-${i}`]) {
        await onRemovePhoto(`timeline-${i}`);
      }
      // Rename downward only; safe with the render-time photoIds snapshot because
      // each source slot is read before any later iteration touches it.
      for (let j = i + 1; j < content.timeline.length; j++) {
        if (photoIds[`timeline-${j}`]) {
          await onRenamePhotoSlot(`timeline-${j}`, `timeline-${j - 1}`);
        }
      }
    } catch (err) {
      alert(`Couldn't update photos for milestone removal: ${err.message}`);
      return;
    }
    const next = content.timeline.filter((_, idx) => idx !== i);
    setContent({ ...content, timeline: next });
  };
  return (
    <section className="s" id="timeline">
      <div className="s-head">
        <div>
          <div className="s-eyebrow">03 · Milestones</div>
          <h2 className="s-title">A small, growing list.</h2>
        </div>
        <p className="s-sub">Every first. The big ones, the silly ones, the ones only we'll remember.</p>
      </div>
      <div className="timeline">
        {content.timeline.map((t, i) => (
          <div className="tl-item" key={i}>
            <div className="tl-item-text">
              <Editable as="div" className="tl-date" value={t.date} onChange={(v) => update(i, "date", v)} editing={editing} />
              <Editable as="div" className="tl-title display" value={t.title} onChange={(v) => update(i, "title", v)} editing={editing} />
              <Editable as="div" className="tl-desc" value={t.desc} onChange={(v) => update(i, "desc", v)} multiline editing={editing} />
              {editing && (
                <button className="tl-add edit-only" style={{ marginTop: 8, background: "transparent" }} onClick={() => remove(i)}>
                  × remove
                </button>
              )}
            </div>
            {(editing || photos[`timeline-${i}`]) && (
              <div className="tl-polaroid">
                <Photo
                  id={`timeline-${i}`}
                  label="add a photo"
                  photos={photos}
                  onUpload={onUpload}
                  editing={editing}
                />
              </div>
            )}
          </div>
        ))}
        {editing && (
          <button className="tl-add edit-only" onClick={add}>
            + add milestone
          </button>
        )}
      </div>
    </section>
  );
}

/* ============== Gallery (polaroids + slideshow) ============== */
function Gallery({ content, setContent, photos, onUpload, editing }) {
  const stageRef = useRef(null);
  const [dragId, setDragId] = useState(null);
  const [showSlide, setShowSlide] = useState(false);
  const [slideIdx, setSlideIdx] = useState(0);

  const onMouseDown = (i) => (e) => {
    if (e.target.closest("[data-edit]")) return;
    if (e.target.tagName === "INPUT") return;
    const stage = stageRef.current.getBoundingClientRect();
    const card = e.currentTarget.getBoundingClientRect();
    const offX = e.clientX - card.left;
    const offY = e.clientY - card.top;
    setDragId(i);
    const move = (ev) => {
      const x = ((ev.clientX - stage.left - offX) / stage.width) * 100;
      const y = ((ev.clientY - stage.top - offY) / stage.height) * 100;
      const next = [...content.gallery];
      next[i] = { ...next[i], x: Math.max(0, Math.min(85, x)), y: Math.max(0, Math.min(90, y)) };
      setContent((c) => ({ ...c, gallery: next }));
    };
    const up = () => {
      setDragId(null);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const updateCap = (i, v) => {
    const next = [...content.gallery];
    next[i] = { ...next[i], caption: v };
    setContent({ ...content, gallery: next });
  };

  const openSlide = (i) => { setSlideIdx(i); setShowSlide(true); };
  const navSlide = (dir) => setSlideIdx((s) => (s + dir + content.gallery.length) % content.gallery.length);

  useEffect(() => {
    if (!showSlide) return;
    const onKey = (e) => {
      if (e.key === "Escape") setShowSlide(false);
      if (e.key === "ArrowRight") navSlide(1);
      if (e.key === "ArrowLeft") navSlide(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showSlide, content.gallery.length]);

  return (
    <section className="s" id="gallery">
      <div className="s-head">
        <div>
          <div className="s-eyebrow">04 · The album</div>
          <h2 className="s-title">Polaroids on the table.</h2>
        </div>
        <p className="s-sub">Drag them around. Double-click any photo to swap it. Click the slideshow button for a closer look.</p>
      </div>
      <div className="gallery-stage" ref={stageRef}>
        <button className="slide-fab" onClick={() => openSlide(0)}>▶ slideshow</button>
        {content.gallery.map((g, i) => (
          <div
            key={i}
            className={`polaroid ${dragId === i ? "dragging" : ""}`}
            style={{
              left: g.x + "%",
              top: g.y + "%",
              transform: `rotate(${g.rot}deg)`,
              zIndex: dragId === i ? 10 : 1,
            }}
            onMouseDown={onMouseDown(i)}
            onDoubleClick={() => openSlide(i)}
          >
            <div className="pphoto">
              <Photo id={`gallery-${i}`} label={g.caption} photos={photos} onUpload={onUpload} editing={editing} />
            </div>
            <Editable as="div" className="pcap" value={g.caption} onChange={(v) => updateCap(i, v)} editing={editing} />
          </div>
        ))}
        <div className="gallery-help">drag · drop · double-click to enlarge</div>
      </div>

      <div className={`slideshow ${showSlide ? "open" : ""}`} onClick={(e) => { if (e.target.classList.contains("slideshow")) setShowSlide(false); }}>
        <div className="ss-counter">{slideIdx + 1} / {content.gallery.length}</div>
        <button className="ss-close" onClick={() => setShowSlide(false)}>×</button>
        <button className="ss-arrow prev" onClick={() => navSlide(-1)}>‹</button>
        <div className="ss-frame">
          <div className="ss-photo">
            <Photo id={`gallery-${slideIdx}`} label={content.gallery[slideIdx]?.caption || ""} photos={photos} onUpload={onUpload} editing={false} />
          </div>
          <div className="ss-cap">{content.gallery[slideIdx]?.caption}</div>
        </div>
        <button className="ss-arrow next" onClick={() => navSlide(1)}>›</button>
      </div>
    </section>
  );
}

/* ============== Family ============== */
function Family({ content, setContent, photos, onUpload, editing }) {
  const updateFam = (i, k, v) => {
    const next = [...content.family];
    next[i] = { ...next[i], [k]: v };
    setContent({ ...content, family: next });
  };
  return (
    <section className="s" id="family">
      <div className="s-head">
        <div>
          <div className="s-eyebrow">05 · The people</div>
          <h2 className="s-title">A small, sturdy family.</h2>
        </div>
        <p className="s-sub">The two grown-ups whose hearts now live outside their bodies.</p>
      </div>
      <div className="family">
        {content.family.map((p, i) => (
          <div className="family-card" key={i}>
            <div className="family-avatar">
              <Photo id={`fam-${i}`} label={p.rel} photos={photos} onUpload={onUpload} editing={editing} />
            </div>
            <div>
              <div className="family-rel"><Editable value={p.rel} onChange={(v) => updateFam(i, "rel", v)} editing={editing} /></div>
              <div className="family-name display"><Editable value={p.name} onChange={(v) => updateFam(i, "name", v)} editing={editing} /></div>
              <div className="family-note"><Editable value={p.note} onChange={(v) => updateFam(i, "note", v)} multiline editing={editing} /></div>
            </div>
          </div>
        ))}
        <div className="family-card baby">
          <div className="family-avatar">
            <Photo id="fam-baby" label="Castiel" photos={photos} onUpload={onUpload} editing={editing} />
          </div>
          <div>
            <div className="family-rel">Their whole world</div>
            <div className="family-name display">{content.baby.fullName}</div>
            <div className="family-note">b. {formatBirthdate(content.baby.birthdate)}</div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============== Letter ============== */
function Letter({ content, setContent, editing }) {
  const update = (k, v) => setContent({ ...content, letter: { ...content.letter, [k]: v } });
  return (
    <section className="s" id="letter">
      <div className="s-head">
        <div>
          <div className="s-eyebrow">06 · A letter</div>
          <h2 className="s-title">Dear Lulu.</h2>
        </div>
        <p className="s-sub">From the people who waited the longest.</p>
      </div>
      <div className="letter">
        <Editable as="div" className="letter-date" value={content.letter.date} onChange={(v) => update("date", v)} editing={editing} />
        <Editable as="div" className="letter-body" value={content.letter.body} onChange={(v) => update("body", v)} multiline editing={editing} />
        <Editable as="div" className="letter-sign" value={content.letter.sign} onChange={(v) => update("sign", v)} editing={editing} />
      </div>
    </section>
  );
}

/* ============== Routine ============== */
function Routine({ content, setContent, editing }) {
  const colors = ["#c5d4b8", "#b8d6e8", "#f4c9a8", "#f6e3a4", "#e8b8b0"];
  const update = (i, k, v) => {
    const next = [...content.routine];
    next[i] = { ...next[i], [k]: v };
    setContent({ ...content, routine: next });
  };
  return (
    <section className="s">
      <div className="s-head">
        <div>
          <div className="s-eyebrow">07 · Daily orbit</div>
          <h2 className="s-title">A day in the life.</h2>
        </div>
        <p className="s-sub">A loose schedule, mostly observed by everyone except him.</p>
      </div>
      <div className="routine">
        {content.routine.map((r, i) => (
          <div className="routine-block" key={i} style={{ "--accent": colors[i % colors.length] }}>
            <Editable className="r-time mono" value={r.time} onChange={(v) => update(i, "time", v)} editing={editing} />
            <Editable className="r-act" value={r.act} onChange={(v) => update(i, "act", v)} editing={editing} />
            <Editable className="r-note" value={r.note} onChange={(v) => update(i, "note", v)} multiline editing={editing} />
          </div>
        ))}
      </div>
    </section>
  );
}

/* ============== Wishes ============== */
function Wishes({ content, setContent, editing }) {
  const update = (i, v) => {
    const next = [...content.wishes];
    next[i] = v;
    setContent({ ...content, wishes: next });
  };
  return (
    <section className="s">
      <div className="s-head">
        <div>
          <div className="s-eyebrow">08 · For the future</div>
          <h2 className="s-title">Wishes, written in pencil.</h2>
        </div>
        <p className="s-sub">Quiet hopes, easy to revise.</p>
      </div>
      <div className="wishes">
        {content.wishes.map((w, i) => (
          <div className="wish" key={i}>
            <div className="wish-num display">{String(i + 1).padStart(2, "0")}</div>
            <Editable as="div" className="wish-text" value={w} onChange={(v) => update(i, v)} multiline editing={editing} />
          </div>
        ))}
      </div>
    </section>
  );
}

/* ============== Guestbook ============== */
const GB_COLORS = ["#809974", "#6fa6c4", "#d8895a", "#e8b8b0", "#f6e3a4"];
const formatGuestbookWhen = (created) => {
  const d = new Date(created);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

function Guestbook({ entries, onSubmit }) {
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !body.trim() || busy) return;
    setBusy(true);
    try {
      await onSubmit(name.trim(), body.trim());
      setName(""); setBody("");
    } catch (err) {
      alert(`Couldn't sign the book: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="s" id="guestbook">
      <div className="s-head">
        <div>
          <div className="s-eyebrow">09 · Guestbook</div>
          <h2 className="s-title">Leave him a note.</h2>
        </div>
        <p className="s-sub">A wish, a memory, a piece of advice for when he's older. He'll read these one day.</p>
      </div>
      <div className="guestbook">
        <form className="gb-form" onSubmit={submit}>
          <input
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            disabled={busy}
          />
          <textarea
            placeholder="Write something kind for Castiel…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            maxLength={400}
            disabled={busy}
          />
          <button type="submit" disabled={busy}>{busy ? "Signing…" : "Sign the book ✒"}</button>
        </form>
        <div className="gb-list">
          {entries.map((m, i) => (
            <div className="gb-msg" key={m.id || i} style={{ "--accent": GB_COLORS[i % GB_COLORS.length] }}>
              <div className="gb-from">
                <div className="gb-name display">{m.name}</div>
                <div className="gb-when">{formatGuestbookWhen(m.created)}</div>
              </div>
              <div className="gb-body">"{m.body}"</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============== Lock modal ============== */
function LockModal({ open, onClose, onLogin, onLogout, unlocked }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  useEffect(() => { if (open && !unlocked) setTimeout(() => inputRef.current?.focus(), 100); }, [open, unlocked]);

  const submit = async (e) => {
    e?.preventDefault();
    if (busy) return;
    setBusy(true); setErr("");
    try {
      await onLogin(email, pw);
      setEmail(""); setPw("");
    } catch (ex) {
      setErr(ex.status === 400 ? "Wrong email or password." : `Login failed: ${ex.message}`);
    } finally {
      setBusy(false);
    }
  };

  if (unlocked) {
    return (
      <div className={`lock-modal ${open ? "open" : ""}`}>
        <div className="lock-card">
          <h3>Lock editing?</h3>
          <p>Visitors will see the site as read-only.</p>
          <div className="lock-actions">
            <button className="primary" onClick={() => { onLogout(); onClose(); }}>Lock it</button>
            <button className="ghost" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className={`lock-modal ${open ? "open" : ""}`}>
      <form className="lock-card" onSubmit={submit}>
        <h3>Owner only ✎</h3>
        <p>Sign in with your PocketBase superuser account to edit Castiel's page.</p>
        <input
          ref={inputRef}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email"
          autoComplete="username"
          disabled={busy}
        />
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="password"
          autoComplete="current-password"
          disabled={busy}
          style={{ marginTop: 8 }}
        />
        <div className="lock-actions">
          <button type="submit" className="primary" disabled={busy}>{busy ? "Signing in…" : "Unlock"}</button>
          <button type="button" className="ghost" onClick={onClose} disabled={busy}>Cancel</button>
        </div>
        {err ? <div className="lock-hint" style={{ color: "#c8553d" }}>{err}</div> : <div className="lock-hint">Manage admins at <a href="/_/" target="_blank" rel="noreferrer">/_/</a></div>}
      </form>
    </div>
  );
}

/* ============== Main App ============== */
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "primaryAccent": "#d8895a",
  "secondaryAccent": "#6fa6c4",
  "fontScale": 1,
  "showHearts": true,
  "showConfettiOnLoad": true,
  "darkMode": false,
  "musicOnLoad": false
}/*EDITMODE-END*/;

function App() {
  const [content, setContent] = useState(DEFAULT_CONTENT);
  const [contentId, setContentId] = useState(null);
  const [photos, setPhotos] = useState({});
  const [photoIds, setPhotoIds] = useState({});
  const [guestbook, setGuestbook] = useState([]);
  const [unlocked, setUnlocked] = useState(() => !!apiToken());
  const [editing, setEditing] = useState(false);
  const [lockOpen, setLockOpen] = useState(false);
  const [music, setMusic] = useState(false);
  const [saveStatus, setSaveStatus] = useState("saved");
  const [loaded, setLoaded] = useState(false);
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [dark, setDark] = useState(t.darkMode);

  useLullaby(music);

  // Initial fetch — content, photos, guestbook in parallel + token refresh.
  useEffect(() => {
    let alive = true;
    Promise.all([
      fetchContent().catch((e) => { console.warn("content fetch failed:", e); return null; }),
      fetchPhotos().catch((e) => { console.warn("photos fetch failed:", e); return { map: {}, ids: {} }; }),
      fetchGuestbook().catch((e) => { console.warn("guestbook fetch failed:", e); return []; }),
      refreshAuth(),
    ]).then(([c, ph, gb, authValid]) => {
      if (!alive) return;
      if (c) { setContent(c.data); setContentId(c.id); }
      setPhotos(ph.map); setPhotoIds(ph.ids);
      setGuestbook(gb);
      if (!authValid) setUnlocked(false);
      setLoaded(true);
    });
    return () => { alive = false; };
  }, []);

  // Persist content (debounced PATCH). Only fires when the owner is signed in;
  // anonymous visitors triggering setContent (e.g. on the initial fetch) would
  // 403 against PB's update rule.
  useEffect(() => {
    if (!loaded || !contentId || !unlocked) return;
    setSaveStatus("saving…");
    const tid = setTimeout(() => {
      saveContent(contentId, content)
        .then(() => setSaveStatus("saved"))
        .catch((e) => setSaveStatus(`save failed: ${e.message}`));
    }, 400);
    return () => clearTimeout(tid);
  }, [content, contentId, loaded, unlocked]);

  useEffect(() => { document.documentElement.setAttribute("data-theme", dark ? "dark" : "light"); }, [dark]);

  useEffect(() => {
    document.documentElement.style.setProperty("--peach-deep", t.primaryAccent);
    document.documentElement.style.setProperty("--sky-deep", t.secondaryAccent);
    document.documentElement.style.fontSize = (t.fontScale * 17) + "px";
  }, [t.primaryAccent, t.secondaryAccent, t.fontScale]);

  useEffect(() => {
    if (t.showConfettiOnLoad) setTimeout(() => fireConfetti(60), 400);
    if (t.musicOnLoad) setMusic(true);
  }, []); // eslint-disable-line

  useEffect(() => {
    if (!t.showHearts) return;
    let last = 0;
    const onMove = (e) => {
      const now = Date.now();
      if (now - last < 80) return;
      last = now;
      if (Math.random() < 0.25) spawnParticle(e.clientX + (Math.random() * 20 - 10), e.clientY + 10);
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [t.showHearts]);

  useEffect(() => { setEditing(unlocked); }, [unlocked]);

  const onLockClick = () => {
    if (unlocked) {
      logout();
      setUnlocked(false);
    } else {
      setLockOpen(true);
    }
  };

  const handleLogin = async (email, password) => {
    await login(email, password);
    setUnlocked(true);
    setLockOpen(false);
  };

  const handleLogout = () => {
    logout();
    setUnlocked(false);
  };

  const onPhotoUpload = useCallback(async (slot, file) => {
    const existing = photoIds[slot];
    const { id, url } = await uploadPhoto(slot, file, existing);
    setPhotos((p) => ({ ...p, [slot]: url }));
    setPhotoIds((m) => ({ ...m, [slot]: id }));
  }, [photoIds]);

  const onRemovePhoto = useCallback(async (slot) => {
    const id = photoIds[slot];
    if (!id) return;
    await deletePhoto(id);
    setPhotos((p) => { const n = { ...p }; delete n[slot]; return n; });
    setPhotoIds((m) => { const n = { ...m }; delete n[slot]; return n; });
  }, [photoIds]);

  const onRenamePhotoSlot = useCallback(async (oldSlot, newSlot) => {
    const id = photoIds[oldSlot];
    if (!id) return;
    const { url } = await renamePhotoSlot(id, newSlot);
    setPhotos((p) => { const n = { ...p }; delete n[oldSlot]; n[newSlot] = url; return n; });
    setPhotoIds((m) => { const n = { ...m }; delete n[oldSlot]; n[newSlot] = id; return n; });
  }, [photoIds]);

  const onGuestbookSubmit = useCallback(async (name, body) => {
    await submitGuestbookEntry(name, body);
    const items = await fetchGuestbook();
    setGuestbook(items);
  }, []);

  return (
    <div className={editing ? "edit-on" : ""}>
      <TopBar
        dark={dark} setDark={(v) => { setDark(v); setTweak("darkMode", v); }}
        music={music} setMusic={setMusic}
        editing={editing} unlocked={unlocked}
        onLockClick={onLockClick}
        onSaveStatus={saveStatus}
      />
      <Hero content={content} setContent={setContent} photos={photos} onUpload={onPhotoUpload} editing={editing} />
      <About content={content} setContent={setContent} editing={editing} />
      <Stats content={content} setContent={setContent} editing={editing} />
      <Timeline content={content} setContent={setContent} editing={editing} photos={photos} photoIds={photoIds} onUpload={onPhotoUpload} onRemovePhoto={onRemovePhoto} onRenamePhotoSlot={onRenamePhotoSlot} />
      <Gallery content={content} setContent={setContent} photos={photos} onUpload={onPhotoUpload} editing={editing} />
      <Family content={content} setContent={setContent} photos={photos} onUpload={onPhotoUpload} editing={editing} />
      <Letter content={content} setContent={setContent} editing={editing} />
      <Routine content={content} setContent={setContent} editing={editing} />
      <Wishes content={content} setContent={setContent} editing={editing} />
      <Guestbook entries={guestbook} onSubmit={onGuestbookSubmit} />

      <footer className="footer">
        <div className="hand" style={{ fontSize: 32, color: "var(--peach-deep)" }}>Welcome, Lulu.</div>
        <div style={{ marginTop: 12, color: "var(--ink-mute)", fontStyle: "italic" }}>
          Made with <span className="heart">♥</span> by your family.
        </div>
        <div className="mono" style={{ marginTop: 20, fontSize: 11, color: "var(--ink-mute)" }}>
          {ageFromBirth(content.baby.birthdate).days} days of you · and counting
        </div>
      </footer>

      <LockModal
        open={lockOpen}
        onClose={() => setLockOpen(false)}
        onLogin={handleLogin}
        onLogout={handleLogout}
        unlocked={unlocked}
      />

      <TweaksPanel>
        <TweakSection label="Theme" />
        <TweakColor label="Primary accent" value={t.primaryAccent} onChange={(v) => setTweak("primaryAccent", v)} />
        <TweakColor label="Secondary accent" value={t.secondaryAccent} onChange={(v) => setTweak("secondaryAccent", v)} />
        <TweakToggle label="Dark mode" value={dark} onChange={(v) => { setDark(v); setTweak("darkMode", v); }} />
        <TweakSlider label="Font scale" value={t.fontScale} min={0.85} max={1.2} step={0.05} unit="×" onChange={(v) => setTweak("fontScale", v)} />

        <TweakSection label="Atmosphere" />
        <TweakToggle label="Floating hearts" value={t.showHearts} onChange={(v) => setTweak("showHearts", v)} />
        <TweakToggle label="Confetti on load" value={t.showConfettiOnLoad} onChange={(v) => setTweak("showConfettiOnLoad", v)} />
        <TweakToggle label="Lullaby on load" value={t.musicOnLoad} onChange={(v) => setTweak("musicOnLoad", v)} />
        <TweakButton label="🎉 Throw confetti now" onClick={() => fireConfetti(120)} />

        <TweakSection label="Editing" />
        <TweakButton label={unlocked ? "🔒 Lock editing" : "✎ Unlock to edit"} onClick={onLockClick} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
