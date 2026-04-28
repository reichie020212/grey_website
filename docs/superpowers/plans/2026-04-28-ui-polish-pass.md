# UI Polish Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three small, independent UI improvements to the Castiel/Grey biography site: (1) change the top-left brand text from `Castiel · Lulu` to `Grey · Lulu`, (2) make every inline-editable text field genuinely read-only for logged-out visitors, (3) add an optional polaroid photo per milestone styled to match The Album.

**Architecture:** All changes are confined to `app.jsx` (React components + tiny PocketBase REST helpers) and `styles.css`. No backend schema changes — milestone photos reuse the existing `photos` collection with index-derived slot keys (`timeline-0`, `timeline-1`, …), matching the precedent set by `gallery-{i}`. The `Editable` component grows an `editing` prop; when false it renders a plain non-editable element with no `contentEditable` and no `data-edit` attribute. The Timeline gets a 2-column grid layout that collapses to a single column under 720px.

**Tech Stack:** React 18.3.1 + Babel-standalone (no build step), plain JS/JSX, hand-rolled `fetch` against PocketBase REST. Verification is manual in a real browser against the running Docker stack — there is no JS test framework in this project, by design.

**Spec:** `docs/superpowers/specs/2026-04-28-ui-polish-pass-design.md`

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `app.jsx` | Modify | Brand text, `Editable` prop change + threading, Timeline polaroid wiring + remove-handler bookkeeping, two new PocketBase helpers (`deletePhoto`, `renamePhotoSlot`). |
| `styles.css` | Modify | New `.tl-item` grid layout + `.tl-polaroid` rules + mobile breakpoint. |

No new files. No changes to `pb_migrations/`, `Dockerfile`, `nginx.conf`, `docker-compose.yml`, `index.html`, or `tweaks-panel.jsx`.

---

## Project conventions the executor must respect

These come from `CLAUDE.md` and the global Claude config; violating them will cause the work to be rejected:

- **No build step.** JSX is compiled in-browser by Babel. Do not introduce a bundler. Do not add `import`/`export` ES module syntax to `app.jsx` or `tweaks-panel.jsx` — both files attach to `window` globals because there is no module loader.
- **No new npm dependencies.** The API client is hand-rolled `fetch`.
- **2-space indent.** Match the surrounding code style (function components, no class components).
- **Do not break the `EDITMODE-BEGIN` / `EDITMODE-END` JSON marker block** in `app.jsx` (around line 906). The Tweaks panel parses the source between those markers.
- **Do not rename existing files.**
- **Git commits MUST be signed twice** with both `-s` (Signed-off-by trailer) and `-S` (GPG signature). Use conventional-commit prefixes (`feat:`, `fix:`, `refactor:`, `chore:`). Do **not** add Claude self-attribution or "Generated with…" footers.
- **Work in a git worktree.** Never commit on `main` directly. The worktree is created in Task 0 below.
- **If anything looks wrong with the spec or you hit an unexpected blocker, stop and ask** — don't improvise around it.

---

## Task 0: Set up the worktree

**Goal:** Create an isolated branch off `main` so all implementation commits land on a feature branch, not on `main`.

- [ ] **Step 1: Create worktree + branch from `main`**

```bash
cd /Users/red/grey_website
git worktree add ../grey_website-ui-polish -b feat/ui-polish-pass main
```

Expected: `Preparing worktree (new branch 'feat/ui-polish-pass')` then `HEAD is now at 2281de3 docs: spec UI polish pass …`.

- [ ] **Step 2: Switch to the worktree for the rest of the plan**

```bash
cd /Users/red/grey_website-ui-polish
git status
```

Expected: `On branch feat/ui-polish-pass` and `nothing to commit, working tree clean`.

- [ ] **Step 3: Confirm the spec exists in the worktree**

```bash
ls docs/superpowers/specs/2026-04-28-ui-polish-pass-design.md
```

Expected: the file path, no error. If missing, stop — the worktree was branched from the wrong commit.

- [ ] **Step 4: Confirm the running stack is reachable from this checkout**

```bash
curl -s http://localhost:8082/api/health
```

Expected: `{"code":200,"message":"API is healthy.","data":{}}`. If the stack isn't running, run `docker compose up -d` from the **main checkout** (`/Users/red/grey_website`), not the worktree — the volume bind in `docker-compose.yml` is relative to the original directory.

---

## Task 1: Brand text — `Castiel · Lulu` → `Grey · Lulu`

**Files:**
- Modify: `app.jsx:303`

**Why first:** Smallest, lowest-risk change. Builds confidence the Babel transform / hard-reload loop works in the executor's browser.

- [ ] **Step 1: Edit the brand span in `TopBar`**

Change `app.jsx:303`:

```jsx
        <span>Castiel · Lulu</span>
```

to

```jsx
        <span>Grey · Lulu</span>
```

(Use the `Edit` tool, exact match on `<span>Castiel · Lulu</span>`. The `·` is a middle-dot U+00B7, not a regular period.)

- [ ] **Step 2: Hard-reload the site and verify**

Open http://localhost:8082/ in a browser, hard-reload (Cmd-Shift-R on macOS). The top-left brand should read `● Grey · Lulu`.

If the page is blank or the console shows a Babel error (`SyntaxError: …` from `babel.min.js`), revert the change and re-check the edit — the most likely cause is an accidental change to nearby JSX.

- [ ] **Step 3: Commit**

```bash
git add app.jsx
git commit -s -S -m "feat(ui): rename top-left brand from Castiel to Grey"
```

Expected: commit succeeds; `git log -1` shows `Signed-off-by: Red <…>` in the trailer and `gpg: Signature made …` in the verbose output.

---

## Task 2: `Editable` short-circuit when not editing

**Files:**
- Modify: `app.jsx:151-178` (the `Editable` component itself)

**Goal:** When `editing` is false, render a plain non-editable element. No `contentEditable`, no `data-edit`, no `onBlur`/`onKeyDown` handlers.

- [ ] **Step 1: Replace the `Editable` component**

Find this block at `app.jsx:151-178`:

```jsx
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
```

Replace it with:

```jsx
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
```

The diff is two lines: `editing = false` added to the prop list, and the early `if (!editing) return …` short-circuit. Don't change anything else in the function.

- [ ] **Step 2: Verify the regression as a logged-out visitor**

Hard-reload http://localhost:8082/ in a logged-out browser (or open a private window). Click on the hero name "Castiel Grey Butay". Try to type. **You should not be able to type.** No cursor, no character shows up.

If typing still works, the short-circuit didn't take — check the edit landed and Babel didn't error.

**Note:** No `Editable` invocations have been updated yet, so they are all calling `<Editable …>` without an `editing` prop, which now defaults to `false`. That means **every** `Editable` is read-only at this point — including for the logged-in admin. That's intentional and gets fixed in Task 3.

- [ ] **Step 3: Commit (work-in-progress, will be uneditable for admin too — Task 3 fixes that)**

```bash
git add app.jsx
git commit -s -S -m "refactor(editable): short-circuit to plain element when not editing"
```

---

## Task 3: Thread `editing` to every `Editable` invocation

**Files:**
- Modify: `app.jsx` (each section component that renders `Editable`)

**Goal:** Pass `editing={editing}` to every `Editable` instance so admins can edit again. Add an `editing` prop to the four section components that don't currently accept one (`About`, `Stats`, `Letter`, `Wishes`) and thread it through from `App`.

There are eleven `Editable` call sites total. List by component:

| Component | `Editable` call sites in current code | Currently receives `editing`? |
|---|---|---|
| `Hero` | Lines ~348, ~353, ~357, ~359, ~378, ~383 (6 sites) | Yes |
| `About` | Lines ~436, ~441 (2 sites: `fact-q`, `fact-a`) | Yes (signature already has it) |
| `Stats` | Lines ~482, ~486 (2 sites: `stat-num`, `stat-unit`) | **No — add prop** |
| `Timeline` | Lines ~523, ~524, ~525 (3 sites: `tl-date`, `tl-title`, `tl-desc`) | Yes |
| `Gallery` | Line ~621 (`pcap`) | Yes |
| `Family` | Lines ~666, ~667, ~668 (3 sites) | Yes |
| `Letter` | Lines ~700, ~701, ~702 (3 sites) | **No — add prop** |
| `Routine` | Lines ~728, ~729, ~730 (3 sites) | Yes |
| `Wishes` | Line ~758 | **No — add prop** |

**Verified by grep before plan was finalized:**

```
405:function About({ content, setContent, editing }) {     ← already has it
453:function Stats({ content, setContent }) {               ← needs it
688:function Letter({ content, setContent }) {              ← needs it
739:function Wishes({ content, setContent }) {              ← needs it
```

(Line numbers approximate; use grep to find them precisely.)

- [ ] **Step 1: Locate every `Editable` invocation**

```bash
grep -n '<Editable' app.jsx
```

Expected: ~24 hits. Don't get distracted by a number that doesn't match — components like `Hero` use `<Editable as="span" …>` over multiple lines.

- [ ] **Step 2: Thread `editing` down inside `About` (signature already has it)**

`About`'s signature already accepts `editing`, and `App` already passes it. The work here is just to add `editing={editing}` to the two `<Editable>` calls inside `About` (the `fact-q` and `fact-a` ones).

After edit:

```jsx
<Editable as="div" className="fact-q" editing={editing} value={f.q} onChange={(v) => updateFact(i, "q", v)} />
```

```jsx
<Editable as="div" className="fact-a" editing={editing} value={f.a} onChange={(v) => updateFact(i, "a", v)} multiline />
```

The `App` already passes `editing={editing}` to `<About …>` at the bottom of the file (around line 1037), so no change is needed there — but verify after editing that the call site still has it.

- [ ] **Step 3: Add `editing` prop to `Stats`**

Find:

```jsx
function Stats({ content, setContent }) {
```

Change to:

```jsx
function Stats({ content, setContent, editing }) {
```

Then update the two `Editable` calls inside `Stats` to pass `editing={editing}`:

```jsx
<Editable as="span" className="stat-num" editing={editing} value={String(s.num)} onChange={(v) => updateStat(i, "num", v)} />
```

```jsx
<Editable as="span" className="stat-unit" editing={editing} value={s.unit || ""} onChange={(v) => updateStat(i, "unit", v)} placeholder="unit" />
```

Then update the call site in `App` (around line 1038):

```jsx
<Stats content={content} setContent={setContent} editing={editing} />
```

- [ ] **Step 4: Add `editing` prop to `Letter`**

Signature:

```jsx
function Letter({ content, setContent, editing }) {
```

The three `Editable` calls inside (`letter-date`, `letter-body`, `letter-sign`) each get `editing={editing}` added.

Call site in `App`:

```jsx
<Letter content={content} setContent={setContent} editing={editing} />
```

- [ ] **Step 5: Add `editing` prop to `Wishes`**

Signature:

```jsx
function Wishes({ content, setContent, editing }) {
```

The single `Editable` for `wish-text` gets `editing={editing}` added.

Call site in `App`:

```jsx
<Wishes content={content} setContent={setContent} editing={editing} />
```

- [ ] **Step 6: Update every remaining `<Editable …>` to pass `editing={editing}`**

For each section that already had `editing` as a prop, the `<Editable …>` tags inside still need `editing={editing}` added. Sections to update: `Hero` (6 sites), `Timeline` (3 sites), `Gallery` (1 site for `pcap`), `Family` (3 sites), `Routine` (3 sites).

After all edits, run:

```bash
grep -c 'editing={editing}' app.jsx
```

Expected: at least 22 hits (one per `<Editable …>` plus the existing `<Photo … editing={editing}>` tags). If you get fewer, you missed some sites — re-grep `<Editable` and visually check each.

```bash
grep -n '<Editable' app.jsx | wc -l
```

Expected: a count matching the number of `editing={editing}` occurrences inside `<Editable …>` tags. (Some `editing={editing}` props will be on `<Photo …>` tags; that's expected, those were already there.)

- [ ] **Step 7: Verify in the browser**

Hard-reload http://localhost:8082/.

**Logged out:** Click any text in Hero, About, Stats, Timeline, Family, Letter, Routine, or Wishes. **No cursor appears, no typing possible.** Hover: no dashed underline (the `.edit-on` class is absent on the wrapper, so the underline rule never matches anyway, but the cursor changes were the bug).

**Logged in:** Open the lock modal, sign in with the `.env` superuser credentials. The dashed underlines reappear. Click any text. **You can type, and it saves** (watch the `edit mode · saving… → saved` pill in the top bar). Hard-reload — the change persisted.

If the saved value reverts on reload, the persistence path is broken — check the browser console for 4xx responses on `PATCH /api/collections/content/records/{id}`.

- [ ] **Step 8: Commit**

```bash
git add app.jsx
git commit -s -S -m "fix(editable): thread editing prop so non-admins can't type into fields"
```

---

## Task 4: Wire `Timeline` for photo upload

**Files:**
- Modify: `app.jsx` — add helpers, thread `photos`/`onUpload` to `Timeline`, add `Photo` per milestone, update `remove(i)` handler.

**Goal:** Make milestone photos work end-to-end at the data layer, without the visual polish (that comes in Task 5).

- [ ] **Step 1: Add `deletePhoto` and `renamePhotoSlot` helpers**

Find the existing `uploadPhoto` function (around `app.jsx:112-121`):

```jsx
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
```

Immediately after it, add:

```jsx
const deletePhoto = (id) =>
  apiFetch(`/collections/photos/records/${id}`, { method: "DELETE" });

async function renamePhotoSlot(id, newSlot) {
  const fd = new FormData();
  fd.append("slot", newSlot);
  const rec = await apiFetch(`/collections/photos/records/${id}`, { method: "PATCH", form: fd });
  return { id: rec.id, url: pbFileUrl(rec, rec.image) };
}
```

Both reuse the existing `apiFetch` so the auth token is sent automatically. Both will 403 for anonymous callers (the `photos` collection's `delete` and `update` rules are owner-only) — that's the desired behavior.

- [ ] **Step 2: Pass `photos`, `onUpload`, and a new `onRemovePhoto` to `Timeline` from `App`**

Find the `Timeline` call site in `App` (around `app.jsx:1039`):

```jsx
      <Timeline content={content} setContent={setContent} editing={editing} />
```

Change to:

```jsx
      <Timeline content={content} setContent={setContent} editing={editing} photos={photos} photoIds={photoIds} onUpload={onPhotoUpload} onRemovePhoto={onRemovePhoto} />
```

- [ ] **Step 3: Add `onRemovePhoto` to `App`**

Find `onPhotoUpload` (around `app.jsx:1014`):

```jsx
  const onPhotoUpload = useCallback(async (slot, file) => {
    const existing = photoIds[slot];
    const { id, url } = await uploadPhoto(slot, file, existing);
    setPhotos((p) => ({ ...p, [slot]: url }));
    setPhotoIds((m) => ({ ...m, [slot]: id }));
  }, [photoIds]);
```

Immediately after it, add:

```jsx
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
```

Update the `Timeline` JSX call site again to also pass `onRenamePhotoSlot`:

```jsx
      <Timeline content={content} setContent={setContent} editing={editing} photos={photos} photoIds={photoIds} onUpload={onPhotoUpload} onRemovePhoto={onRemovePhoto} onRenamePhotoSlot={onRenamePhotoSlot} />
```

- [ ] **Step 4: Update the `Timeline` component**

Find the existing `Timeline`:

```jsx
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
    // ...
  );
}
```

Replace the signature and `remove` to handle photo bookkeeping. The new `remove` is async:

```jsx
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
    // unchanged JSX from here, see Step 5
  );
}
```

- [ ] **Step 5: Add the `Photo` element inside each `.tl-item`**

The current `.tl-item` JSX:

```jsx
        {content.timeline.map((t, i) => (
          <div className="tl-item" key={i}>
            <Editable as="div" className="tl-date" editing={editing} value={t.date} onChange={(v) => update(i, "date", v)} />
            <Editable as="div" className="tl-title display" editing={editing} value={t.title} onChange={(v) => update(i, "title", v)} />
            <Editable as="div" className="tl-desc" editing={editing} value={t.desc} onChange={(v) => update(i, "desc", v)} multiline />
            {editing && (
              <button className="tl-add edit-only" style={{ marginTop: 8, background: "transparent" }} onClick={() => remove(i)}>
                × remove
              </button>
            )}
          </div>
        ))}
```

(The `editing={editing}` on `Editable` should already be there from Task 3.)

Wrap the date/title/desc/remove in a `.tl-item-text` div and add the polaroid sibling. Replace the block above with:

```jsx
        {content.timeline.map((t, i) => (
          <div className="tl-item" key={i}>
            <div className="tl-item-text">
              <Editable as="div" className="tl-date" editing={editing} value={t.date} onChange={(v) => update(i, "date", v)} />
              <Editable as="div" className="tl-title display" editing={editing} value={t.title} onChange={(v) => update(i, "title", v)} />
              <Editable as="div" className="tl-desc" editing={editing} value={t.desc} onChange={(v) => update(i, "desc", v)} multiline />
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
```

The `.tl-item-text` wrapper is what the new grid layout in Task 5 keys off (left column). The polaroid is the right column.

- [ ] **Step 6: Verify the data path works (admin)**

Hard-reload, sign in as admin. In the Timeline section:

1. Click "+ add milestone" — a new milestone appears with placeholder text. An empty polaroid frame should appear next to it (the "add a photo" placeholder will look unstyled — that's fine, Task 5 styles it).
2. Click the empty polaroid frame, pick a small image. After a moment the image appears.
3. Hard-reload — the image is still there.
4. Click "× remove" on the milestone with the photo. Confirm the photo is gone (no orphan).
5. Open `/_/` admin UI → `photos` collection → confirm there's no `timeline-N` record for the removed milestone.

If step 4 leaves an orphan photo record, the `onRemovePhoto` call didn't run — recheck Step 4's `remove` function and that `photoIds` is being passed in.

- [ ] **Step 7: Verify the data path is closed (logged out)**

Lock the site (click the lock icon → "Lock it"). The Timeline polaroids should disappear except for milestones that have a photo uploaded. There should be **no** empty/upload-able polaroid frame visible to a logged-out visitor.

- [ ] **Step 8: Commit**

```bash
git add app.jsx
git commit -s -S -m "feat(timeline): add optional photo per milestone with slot bookkeeping"
```

---

## Task 5: Polaroid styles

**Files:**
- Modify: `styles.css` — add `.tl-item` grid layout, `.tl-polaroid` rules, mobile breakpoint.

**Goal:** Make the milestone polaroid look like an actual polaroid (white card, soft tilt, shadow), match The Album's style language at a smaller scale, and collapse cleanly on mobile.

- [ ] **Step 1: Add the new rules to `styles.css`**

Find the existing Timeline block (`styles.css:343-374`):

```css
/* ============== Timeline ============== */
.timeline {
  position: relative; padding-left: 40px;
  border-left: 1px dashed var(--ink-mute);
  max-width: 720px; margin: 0 auto;
}
.tl-item {
  position: relative; padding: 14px 0 36px;
}
.tl-item::before {
  content: ""; position: absolute; left: -47px; top: 22px;
  width: 14px; height: 14px; border-radius: 50%;
  background: var(--peach-deep);
  border: 3px solid var(--cream);
  box-shadow: 0 0 0 1px var(--peach-deep);
}
.tl-date {
  font-family: var(--mono); font-size: 11px; color: var(--ink-mute);
  text-transform: uppercase; letter-spacing: 0.1em;
}
.tl-title {
  font-family: var(--display); font-size: 26px; margin: 4px 0 6px;
}
.tl-desc { color: var(--ink-soft); font-style: italic; }

.tl-add {
  display: inline-flex; align-items: center; gap: 6px;
  font-family: var(--mono); font-size: 11px; color: var(--peach-deep);
  text-transform: uppercase; letter-spacing: 0.1em;
  margin-top: 10px; cursor: default;
  padding: 6px 12px; border: 1px dashed var(--peach-deep); border-radius: 999px;
}
```

Two changes:

(a) Update `.timeline` `max-width` from `720px` to `860px` so the new right column fits without crowding the rail. Change:

```css
.timeline {
  position: relative; padding-left: 40px;
  border-left: 1px dashed var(--ink-mute);
  max-width: 720px; margin: 0 auto;
}
```

to:

```css
.timeline {
  position: relative; padding-left: 40px;
  border-left: 1px dashed var(--ink-mute);
  max-width: 860px; margin: 0 auto;
}
```

(b) Update `.tl-item` to use grid, and append the new `.tl-polaroid` rules and the mobile breakpoint. Change:

```css
.tl-item {
  position: relative; padding: 14px 0 36px;
}
```

to:

```css
.tl-item {
  position: relative; padding: 14px 0 36px;
  display: grid;
  grid-template-columns: 1fr 220px;
  gap: 28px;
  align-items: start;
}
.tl-item-text {
  min-width: 0;
}
.tl-polaroid {
  width: 220px;
  background: var(--paper);
  padding: 12px 12px 18px;
  box-shadow: var(--shadow-pop);
  border-radius: 3px;
  transform: rotate(-2deg);
}
.tl-polaroid .photo-placeholder {
  aspect-ratio: 1 / 1;
  background: var(--cream-deep);
  border-radius: 2px;
  overflow: hidden;
  position: relative;
}
.tl-polaroid .photo-placeholder img {
  width: 100%; height: 100%; object-fit: cover;
}
@media (max-width: 720px) {
  .tl-item {
    grid-template-columns: 1fr;
  }
  .tl-polaroid {
    width: 100%;
    max-width: 280px;
    transform: rotate(-1deg);
    margin-bottom: 8px;
    order: -1;
  }
}
```

(`order: -1` on the mobile polaroid moves it above the text in the grid — photo-forward on small screens, as the spec calls for.)

- [ ] **Step 2: Verify desktop layout**

Hard-reload, sign in as admin. The Timeline section should now show each milestone's text on the left and the polaroid on the right, slightly tilted, with a soft drop-shadow. The dashed left rail and orange dot should still be in place.

If the polaroid is full-width or wraps below the text, the grid didn't apply — check there's no stray `.tl-item { display: block; }` elsewhere overriding.

- [ ] **Step 3: Verify mobile layout**

In the browser DevTools, set the viewport to 375px (iPhone SE) or any width below 720px. The polaroid should now stack above the text, at full width (capped at 280px), with a gentler tilt.

- [ ] **Step 4: Verify the empty-state placeholder is reasonable**

For a milestone with no photo, in admin mode, the polaroid frame should show the "add a photo" label centered in the cream-colored placeholder. Click it — file picker opens. Pick an image — placeholder is replaced by the cropped photo (`object-fit: cover`).

- [ ] **Step 5: Commit**

```bash
git add styles.css
git commit -s -S -m "feat(timeline): polaroid styling for milestone photos"
```

---

## Task 6: End-to-end verification against the spec checklist

**Goal:** Walk every item from the spec's verification checklist before declaring done.

The full list lives in `docs/superpowers/specs/2026-04-28-ui-polish-pass-design.md` under "Verification checklist" — eleven items. Walk each in order:

- [ ] **Step 1: Run the eleven checklist items**

For each, record pass/fail. The eleven items are:

1. Top-left brand reads `Grey · Lulu` (logged in and logged out).
2. Logged out: clicking any text in Hero/About/Stats/Timeline/Family/Letter/Routine/Wishes does not show a cursor and does not allow typing. No dashed underline on hover.
3. Logged out: the guestbook form still works (separate `<input>`/`<textarea>` — should be unaffected).
4. Logged in: every previously editable field is still editable; saves persist across reload.
5. Logged in: Timeline shows an empty polaroid placeholder on the right of every milestone. Click → file picker. Upload → image shows immediately, survives reload.
6. Logged out: Timeline shows polaroids only for milestones with a photo.
7. Logged in: remove a milestone with a photo → photo record gone (verify in `/_/`); subsequent milestones' photos still align with their text.
8. Logged in: remove a milestone *without* a photo → no photo API calls fired (DevTools Network tab — no `DELETE`/`PATCH` to `/api/collections/photos/records/`).
9. Mobile width (< 720px): polaroid stacks above text, single column.
10. No console errors. No CSP violations. No SRI hash mismatches.
11. The `EDITMODE-BEGIN/END` parser still works — open the Tweaks panel (cog icon, bottom right), confirm defaults load and toggles work.

- [ ] **Step 2: Smoke-check the API health endpoint**

```bash
curl -s http://localhost:8082/api/health
```

Expected: `{"code":200,"message":"API is healthy.","data":{}}`.

- [ ] **Step 3: Confirm no uncommitted changes remain**

```bash
git status
```

Expected: `nothing to commit, working tree clean` on `feat/ui-polish-pass`.

- [ ] **Step 4: Confirm commit log**

```bash
git log --oneline main..HEAD
```

Expected: 5 commits (one per Task 1–5; Task 6 doesn't commit), most recent first:

```
<hash> feat(timeline): polaroid styling for milestone photos
<hash> feat(timeline): add optional photo per milestone with slot bookkeeping
<hash> fix(editable): thread editing prop so non-admins can't type into fields
<hash> refactor(editable): short-circuit to plain element when not editing
<hash> feat(ui): rename top-left brand from Castiel to Grey
```

If any item from Step 1's checklist failed, **do not** proceed to merge. Stop and report which checklist item failed and what the observed behavior was, so the user can decide whether to debug or revise the spec.

- [ ] **Step 5: Hand back to the user**

Stop here. Do **not** merge the worktree to `main` yet. Per the workflow rules in the global config: merging the worktree into the feature branch / main happens only after the user explicitly says it's done. Report the work as complete and ask the user to verify in their browser before merge.

Suggested message:

> All five tasks complete on `feat/ui-polish-pass`. Spec checklist passes locally (or: spec checklist failed at item N — see below). The worktree at `../grey_website-ui-polish` is ready for your review. Want me to merge into `main` once you've confirmed it looks right?

---

## What's NOT in this plan

- Drag-to-reorder for milestones (would change the index-based slot key assumption).
- Captions on milestone polaroids (the milestone title is the caption).
- Slideshow integration for milestone photos.
- Migrating other photo slots (Hero, Family, Album) to a different storage shape.
- Changes to `EDITMODE-BEGIN/END` or the Tweaks panel.
- Automated browser/E2E tests — this project has none, by design.
