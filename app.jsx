/* global React, ReactDOM, useTweaks, TweaksPanel, TweakSection, TweakSlider, TweakToggle, TweakRadio, TweakSelect, TweakColor, TweakButton, TweakText */
const { useState, useEffect, useRef, useMemo, useCallback } = React;

/* ============== Default content (the "database") ============== */
const DEFAULT_CONTENT = {
  baby: {
    fullName: "Castiel Grey Butay",
    nickname: "Lulu",
    tagline: "A small star, newly arrived — already the brightest thing in the room.",
    birthdate: "2025-11-16",
    birthplace: "—",
    weight: "—",
    height: "—",
    gender: "Boy",
    zodiac: "Scorpio",
  },
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
  timeline: [
    { date: "Nov 16, 2025", title: "Hello, world.", desc: "Castiel arrived — eyes wide, already curious." },
    { date: "Nov 18, 2025", title: "First trip home", desc: "Wrapped tight, slept the whole way." },
    { date: "Dec 2025", title: "First real smile", desc: "Or maybe gas. We're choosing to believe." },
    { date: "Jan 2026", title: "Discovered hands", desc: "Couldn't believe they belonged to him." },
  ],
  family: [
    { rel: "Mama", name: "Chin Butay", note: "Snack provider, lullaby singer, biggest fan." },
    { rel: "Papa", name: "Red Butay", note: "Diaper engineer. Comedian-in-residence." },
  ],
  letter: {
    date: "Written the night you came home",
    body:
      "Dear Lulu,\n\nWe waited so long for you. Today we counted your fingers, your toes, the freckle on your shoulder we already love.\n\nYou'll grow up faster than we want. So we're saving everything here — every milk-stain memory, every tiny yawn — so you can see, one day, how loved you were from the very first second.\n\nWelcome home, little one.",
    sign: "— Mama & Papa",
  },
  routine: [
    { time: "06:30", act: "Milk o'clock", note: "Eyes barely open. Still drinks like a champion." },
    { time: "08:00", act: "Tummy time", note: "Two minutes. Then a nap. Earned it." },
    { time: "10:00", act: "Morning nap", note: "Loud breathing. Tiny dreams." },
    { time: "12:30", act: "Lunch + cuddles", note: "Milk again. Surprise!" },
    { time: "15:00", act: "Walk in the carrier", note: "Best sleeper outdoors." },
    { time: "18:00", act: "Bath time", note: "Kicks first, complains second." },
    { time: "20:00", act: "Last feed", note: "Heavy eyelids, soft hums." },
    { time: "03:00", act: "Surprise party", note: "Hosted by Lulu. Refreshments served." },
  ],
  wishes: [
    "May you always come back to milk and naps when the world feels big.",
    "May you laugh the kind of laugh that startles strangers into smiling.",
    "May you be brave, even when bravery is just turning over for the first time.",
    "May you know — every single day — exactly how loved you are.",
    "May you find a friend who feels like home.",
    "May you grow into someone you, yourself, would adore.",
  ],
  guestbook: [
    { name: "Tita Joy", body: "He's perfect! Already winning at sleeping competitively.", when: "Nov 20, 2025" },
    { name: "Lolo", body: "Took one look at him and forgot every word I knew.", when: "Nov 22, 2025" },
  ],
  gallery: [
    { caption: "first day home", x: 6, y: 4, rot: -6 },
    { caption: "tiny toes", x: 32, y: 10, rot: 4 },
    { caption: "milk drunk", x: 58, y: 6, rot: -3 },
    { caption: "with mama", x: 14, y: 42, rot: 5 },
    { caption: "sleepy boy", x: 42, y: 48, rot: -7 },
    { caption: "with papa", x: 68, y: 42, rot: 3 },
  ],
};

const STORAGE_KEY = "castiel-content-v1";
const LOCK_KEY = "castiel-unlocked-v1";
const PASSCODE = "lulu1116"; // owner-only edit passcode

function loadContent() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONTENT;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONTENT, ...parsed };
  } catch (e) {
    return DEFAULT_CONTENT;
  }
}
function saveContent(c) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(c)); } catch (e) {}
}

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
function Editable({ value, onChange, multiline = false, className = "", as = "span", placeholder = "" }) {
  const Tag = as;
  const ref = useRef(null);
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
function Photo({ id, label, photos, setPhotos, editing, className = "" }) {
  const inputRef = useRef(null);
  const src = photos[id];
  const onPick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhotos({ ...photos, [id]: reader.result });
    reader.readAsDataURL(file);
  };
  return (
    <div
      className={`photo-placeholder ${src ? "has-img" : ""} ${className}`}
      data-edit-photo={editing ? "" : null}
      onClick={() => editing && inputRef.current?.click()}
    >
      {src ? <img src={src} alt={label} /> : <span className="ph-label">{label}</span>}
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
function TopBar({ dark, setDark, music, setMusic, editing, unlocked, onLockClick, onSaveStatus }) {
  return (
    <div className="topbar">
      <div className="topbar-brand">
        <span className="dot"></span>
        <span>Castiel · Lulu</span>
      </div>
      <nav className="topbar-nav">
        <a href="#about">About</a>
        <a href="#timeline">Timeline</a>
        <a href="#gallery">Gallery</a>
        <a href="#family">Family</a>
        <a href="#letter">Letter</a>
        <a href="#guestbook">Guestbook</a>
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
      </div>
    </div>
  );
}

/* ============== Hero ============== */
function Hero({ content, setContent, photos, setPhotos, editing }) {
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
          }} />
          <br/>
          <Editable as="span" value={baby.fullName.split(" ").slice(1).join(" ")} onChange={(v) => {
            const first = baby.fullName.split(" ")[0];
            update("fullName", `${first} ${v}`.trim());
          }} />
          <Editable as="span" className="lulu" value={`"${baby.nickname}"`} onChange={(v) => update("nickname", v.replace(/"/g, ""))} />
        </h1>
        <Editable as="p" className="hero-tag" value={baby.tagline} onChange={(v) => update("tagline", v)} multiline />

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
              <Editable value={content.family.map(f => f.name.split(" ")[0]).join(" & ")} onChange={() => {}} />
            </div>
          </div>
          <div className="meta-item">
            <div className="lbl">Gender</div>
            <div className="val"><Editable value={baby.gender} onChange={(v) => update("gender", v)} /></div>
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
          <Photo id="hero" label="Hero portrait — drop a favorite photo here" photos={photos} setPhotos={setPhotos} editing={editing} />
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
                <Editable as="div" className="fact-q" value={f.q} onChange={(v) => updateFact(i, "q", v)} />
                <div className="flip-hint">tap to flip</div>
              </div>
              <div className="fact-face back">
                <div className="fact-icon" style={{ background: "var(--paper)" }}>↻</div>
                <Editable as="div" className="fact-a" value={f.a} onChange={(v) => updateFact(i, "a", v)} multiline />
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
function Stats({ content }) {
  const age = ageFromBirth(content.baby.birthdate);
  const stats = content.stats.map((s) => {
    if (s.num === "AUTO_DAYS") return { ...s, num: age.days };
    if (s.num === "AUTO_MONTHS") return { ...s, num: age.months };
    if (s.num === "AUTO_WEEKS") return { ...s, num: age.weeks };
    return s;
  });
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
              <span className="stat-num">{s.num}</span>
              {s.unit && <span className="stat-unit">{s.unit}</span>}
            </div>
            <div className="stat-lbl">{s.lbl}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ============== Timeline ============== */
function Timeline({ content, setContent, editing }) {
  const update = (i, k, v) => {
    const next = [...content.timeline];
    next[i] = { ...next[i], [k]: v };
    setContent({ ...content, timeline: next });
  };
  const add = () => setContent({
    ...content,
    timeline: [...content.timeline, { date: "Today", title: "A new milestone", desc: "Tell the story…" }],
  });
  const remove = (i) => {
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
            <Editable as="div" className="tl-date" value={t.date} onChange={(v) => update(i, "date", v)} />
            <Editable as="div" className="tl-title display" value={t.title} onChange={(v) => update(i, "title", v)} />
            <Editable as="div" className="tl-desc" value={t.desc} onChange={(v) => update(i, "desc", v)} multiline />
            {editing && (
              <button className="tl-add edit-only" style={{ marginTop: 8, background: "transparent" }} onClick={() => remove(i)}>
                × remove
              </button>
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
function Gallery({ content, setContent, photos, setPhotos, editing }) {
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
              <Photo id={`gallery-${i}`} label={g.caption} photos={photos} setPhotos={setPhotos} editing={editing} />
            </div>
            <Editable as="div" className="pcap" value={g.caption} onChange={(v) => updateCap(i, v)} />
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
            <Photo id={`gallery-${slideIdx}`} label={content.gallery[slideIdx]?.caption || ""} photos={photos} setPhotos={setPhotos} editing={false} />
          </div>
          <div className="ss-cap">{content.gallery[slideIdx]?.caption}</div>
        </div>
        <button className="ss-arrow next" onClick={() => navSlide(1)}>›</button>
      </div>
    </section>
  );
}

/* ============== Family ============== */
function Family({ content, setContent, photos, setPhotos, editing }) {
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
              <Photo id={`fam-${i}`} label={p.rel} photos={photos} setPhotos={setPhotos} editing={editing} />
            </div>
            <div>
              <div className="family-rel"><Editable value={p.rel} onChange={(v) => updateFam(i, "rel", v)} /></div>
              <div className="family-name display"><Editable value={p.name} onChange={(v) => updateFam(i, "name", v)} /></div>
              <div className="family-note"><Editable value={p.note} onChange={(v) => updateFam(i, "note", v)} multiline /></div>
            </div>
          </div>
        ))}
        <div className="family-card baby">
          <div className="family-avatar">
            <Photo id="fam-baby" label="Castiel" photos={photos} setPhotos={setPhotos} editing={editing} />
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
function Letter({ content, setContent }) {
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
        <Editable as="div" className="letter-date" value={content.letter.date} onChange={(v) => update("date", v)} />
        <Editable as="div" className="letter-body" value={content.letter.body} onChange={(v) => update("body", v)} multiline />
        <Editable as="div" className="letter-sign" value={content.letter.sign} onChange={(v) => update("sign", v)} />
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
            <Editable className="r-time mono" value={r.time} onChange={(v) => update(i, "time", v)} />
            <Editable className="r-act" value={r.act} onChange={(v) => update(i, "act", v)} />
            <Editable className="r-note" value={r.note} onChange={(v) => update(i, "note", v)} multiline />
          </div>
        ))}
      </div>
    </section>
  );
}

/* ============== Wishes ============== */
function Wishes({ content, setContent }) {
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
            <Editable as="div" className="wish-text" value={w} onChange={(v) => update(i, v)} multiline />
          </div>
        ))}
      </div>
    </section>
  );
}

/* ============== Guestbook ============== */
function Guestbook({ content, setContent }) {
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const submit = (e) => {
    e.preventDefault();
    if (!name.trim() || !body.trim()) return;
    const when = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    setContent({ ...content, guestbook: [{ name: name.trim(), body: body.trim(), when }, ...content.guestbook] });
    setName(""); setBody("");
  };
  const colors = ["#809974", "#6fa6c4", "#d8895a", "#e8b8b0", "#f6e3a4"];
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
          />
          <textarea
            placeholder="Write something kind for Castiel…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            maxLength={400}
          />
          <button type="submit">Sign the book ✒</button>
        </form>
        <div className="gb-list">
          {content.guestbook.map((m, i) => (
            <div className="gb-msg" key={i} style={{ "--accent": colors[i % colors.length] }}>
              <div className="gb-from">
                <div className="gb-name display">{m.name}</div>
                <div className="gb-when">{m.when}</div>
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
function LockModal({ open, onClose, onUnlock, unlocked }) {
  const [val, setVal] = useState("");
  const [err, setErr] = useState(false);
  const inputRef = useRef(null);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 100); }, [open]);
  const submit = (e) => {
    e?.preventDefault();
    if (val === PASSCODE) { onUnlock(); setVal(""); setErr(false); }
    else { setErr(true); setTimeout(() => setErr(false), 600); }
  };
  if (unlocked) {
    return (
      <div className={`lock-modal ${open ? "open" : ""}`}>
        <div className="lock-card">
          <h3>Lock editing?</h3>
          <p>Visitors will see the site as read-only.</p>
          <div className="lock-actions">
            <button className="primary" onClick={() => { onUnlock(); onClose(); }}>Lock it</button>
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
        <p>Enter the passcode to edit Castiel's page.</p>
        <input
          ref={inputRef}
          type="password"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="passcode"
          style={err ? { borderColor: "#c8553d", animation: "shake 0.4s" } : {}}
        />
        <div className="lock-actions">
          <button type="submit" className="primary">Unlock</button>
          <button type="button" className="ghost" onClick={onClose}>Cancel</button>
        </div>
        <div className="lock-hint">hint: lulu's nickname + birthday (mmdd)</div>
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
  const [content, setContent] = useState(loadContent);
  const [photos, setPhotos] = useState(() => {
    try { return JSON.parse(localStorage.getItem("castiel-photos-v1") || "{}"); } catch (e) { return {}; }
  });
  const [unlocked, setUnlocked] = useState(() => localStorage.getItem(LOCK_KEY) === "1");
  const [editing, setEditing] = useState(false); // edit mode active (only available if unlocked)
  const [lockOpen, setLockOpen] = useState(false);
  const [music, setMusic] = useState(false);
  const [saveStatus, setSaveStatus] = useState("saved");
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [dark, setDark] = useState(t.darkMode);

  useLullaby(music);

  // Persist content
  useEffect(() => {
    setSaveStatus("saving…");
    const id = setTimeout(() => {
      saveContent(content);
      setSaveStatus("saved");
    }, 400);
    return () => clearTimeout(id);
  }, [content]);

  // Persist photos
  useEffect(() => {
    try { localStorage.setItem("castiel-photos-v1", JSON.stringify(photos)); } catch (e) {}
  }, [photos]);

  // Apply theme
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  }, [dark]);

  // Apply tweaks
  useEffect(() => {
    document.documentElement.style.setProperty("--peach-deep", t.primaryAccent);
    document.documentElement.style.setProperty("--sky-deep", t.secondaryAccent);
    document.documentElement.style.fontSize = (t.fontScale * 17) + "px";
  }, [t.primaryAccent, t.secondaryAccent, t.fontScale]);

  // Confetti on load
  useEffect(() => {
    if (t.showConfettiOnLoad) setTimeout(() => fireConfetti(60), 400);
    if (t.musicOnLoad) setMusic(true);
  }, []); // eslint-disable-line

  // Hearts on hover
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

  // Toggle edit when unlocked changes
  useEffect(() => {
    if (!unlocked) setEditing(false);
    else setEditing(true);
  }, [unlocked]);

  const onLockClick = () => {
    if (unlocked) {
      // lock it
      setUnlocked(false);
      localStorage.removeItem(LOCK_KEY);
    } else {
      setLockOpen(true);
    }
  };

  const handleUnlock = () => {
    setUnlocked(true);
    localStorage.setItem(LOCK_KEY, "1");
    setLockOpen(false);
  };

  const resetContent = () => {
    if (confirm("Reset all content to defaults? This can't be undone.")) {
      setContent(DEFAULT_CONTENT);
      setPhotos({});
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem("castiel-photos-v1");
    }
  };

  return (
    <div className={editing ? "edit-on" : ""}>
      <TopBar
        dark={dark} setDark={(v) => { setDark(v); setTweak("darkMode", v); }}
        music={music} setMusic={setMusic}
        editing={editing} unlocked={unlocked}
        onLockClick={onLockClick}
        onSaveStatus={saveStatus}
      />
      <Hero content={content} setContent={setContent} photos={photos} setPhotos={setPhotos} editing={editing} />
      <About content={content} setContent={setContent} editing={editing} />
      <Stats content={content} />
      <Timeline content={content} setContent={setContent} editing={editing} />
      <Gallery content={content} setContent={setContent} photos={photos} setPhotos={setPhotos} editing={editing} />
      <Family content={content} setContent={setContent} photos={photos} setPhotos={setPhotos} editing={editing} />
      <Letter content={content} setContent={setContent} />
      <Routine content={content} setContent={setContent} editing={editing} />
      <Wishes content={content} setContent={setContent} />
      <Guestbook content={content} setContent={setContent} />

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
        onUnlock={unlocked ? () => { setUnlocked(false); localStorage.removeItem(LOCK_KEY); } : handleUnlock}
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
        {unlocked && <TweakButton label="↺ Reset all content" onClick={resetContent} />}
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
