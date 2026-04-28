# UI polish pass: brand text, read-only lockdown, milestone polaroids

**Date:** 2026-04-28
**Status:** Approved (brainstorming complete; awaiting plan)
**Scope:** Three small, independent UI improvements to `app.jsx` (and `styles.css` for item 3). No backend, schema, or build-system changes.

---

## Motivation

Three issues observed during day-to-day use of the site:

1. The top-left brand text reads `Castiel · Lulu`. The owner wants it to read `Grey · Lulu` (using the middle name, which the family already uses informally).
2. Logged-out visitors can type into any inline-editable text field. Their changes don't persist (the save effect bails when not authenticated), but the typing visibly works until reload — which looks like a bug and is one. Non-admins should never see editable affordances.
3. The Timeline ("Milestones") section is text-only. The owner wants an optional photo per milestone, styled to match the polaroids in The Album.

---

## Design decisions (resolved during brainstorming)

| # | Decision | Choice | Why |
|---|---|---|---|
| 1 | Brand text | Replace `Castiel · Lulu` with `Grey · Lulu` | Owner preference; one-word, mirrors the rest of the family's spoken usage. |
| 2 | Read-only mode for `Editable` | Render a plain non-editable element when not in editing mode | Guarantees no `contentEditable` for non-admins; also drops the dashed-underline edit affordance via the existing `[data-edit]` CSS hook. |
| 3 | Milestone photo: required vs. optional | **Optional** | Some milestones won't have a photo at hand. |
| 4 | Layout | **Polaroid on the right of each milestone** | Keeps the existing left-rail chronological scan intact; the slight tilt echoes The Album without making Timeline feel like a second gallery. |
| 5 | Empty-state UX for admins | **Always-visible empty polaroid frame** in edit mode | Matches the existing photo-slot pattern (Hero, Family, Album) and makes "every milestone *can* have a photo" visually obvious. |
| 6 | Storage shape | **Index-based slot keys** (`timeline-0`, `timeline-1`, ...), no schema change | Reuses the existing `photos` collection unchanged; matches the `gallery-{i}` precedent. The reorder/delete bookkeeping is handled in the remove handler (see "Edge cases"). |

---

## Architecture

### Item 1 — Brand text

Single string change in `TopBar` (`app.jsx:303`):

```diff
- <span>Castiel · Lulu</span>
+ <span>Grey · Lulu</span>
```

That's the entire change.

### Item 2 — Read-only `Editable` for non-admins

The `Editable` component (`app.jsx:152`) currently renders `contentEditable={true}` unconditionally. Add an `editing` prop and short-circuit when it's false:

```jsx
function Editable({ value, onChange, editing, multiline = false, className = "", as = "span", placeholder = "" }) {
  const Tag = as;
  if (!editing) {
    return <Tag className={className}>{value}</Tag>;
  }
  // existing contentEditable branch unchanged below
}
```

Effect on non-admins:
- No `contentEditable` attribute on the rendered element → cursor never enters the field.
- No `data-edit` attribute → the dashed-underline CSS hook in `styles.css` does not apply, so the field looks like ordinary text.
- No `onBlur`/`onKeyDown` handlers → no chance of `onChange` firing client-side either.

#### Threading `editing` everywhere

The four section components that don't currently receive `editing` need it added so they can pass it down to every `Editable` they render:

- `About` (`app.jsx:405`) — fact cards (q + a).
- `Stats` (`app.jsx:453`) — stat number and unit.
- `Letter` (`app.jsx:688`) — date, body, signature.
- `Wishes` (`app.jsx:739`) — wish text.

Each gets a new `editing` prop, threaded from `App` (where it already exists). Every `Editable` invocation in those components and in the components that already receive `editing` (Hero, Timeline, Gallery, Family, Routine) is updated to pass `editing={editing}`.

Notes:
- The Hero "Parents" `Editable` at `app.jsx:378` already has `onChange={() => {}}` (a deliberate no-op since parent names are derived from `family[]`). Adding `editing` to it just removes the misleading edit cursor for non-admins.
- The Stats component currently has no `editing` prop *and* no edit-only branches (date inputs etc.). Threading it in is purely for `Editable`.

### Item 3 — Optional polaroid per milestone

#### Component changes (`app.jsx`)

- `Timeline` now receives `photos` and `onUpload` from `App` (currently it doesn't):
  ```jsx
  <Timeline content={content} setContent={setContent} editing={editing} photos={photos} onUpload={onPhotoUpload} />
  ```
- Inside each `.tl-item`, add a polaroid after the existing date/title/desc block:
  ```jsx
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
  ```
  - **Admin (editing):** the polaroid frame always renders, with the existing `Photo` empty-state placeholder ("add a photo") that opens a file picker on click.
  - **Non-admin:** the polaroid renders only when a photo is uploaded for that slot.

#### Layout (`styles.css`)

`.tl-item` becomes a 2-column grid on desktop. The new rules sit alongside the existing `.tl-item` block (don't replace it — just add layout):

```css
.tl-item {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 24px;
  align-items: start;
}

.tl-polaroid {
  width: 200px;
  background: var(--paper);
  padding: 12px 12px 16px;
  box-shadow: var(--shadow-pop);
  border-radius: 3px;
  transform: rotate(-2deg);
  grid-column: 2;
  grid-row: 1 / span 3;       /* spans date + title + desc */
}

.tl-polaroid .photo-placeholder {
  aspect-ratio: 1 / 1;
  background: var(--cream-deep);
  border-radius: 2px;
}

@media (max-width: 720px) {
  .tl-item {
    grid-template-columns: 1fr;
  }
  .tl-polaroid {
    grid-column: 1;
    grid-row: auto;
    margin-bottom: 8px;
    transform: rotate(-1deg);
    width: 100%;
    max-width: 280px;
  }
}
```

Visual notes:
- No caption (`.pcap`) — the milestone title already labels the photo.
- Tilt is subtle (`-2deg`); strong tilt belongs to The Album.
- The shared `.photo-placeholder` rules from the existing Hero/Family slots already handle hover, busy, and `has-img` states — no per-section duplication needed.

#### Remove-milestone bookkeeping (`Timeline`)

Today's `remove(i)` handler just splices the milestone out of `content.timeline`. With photos bound by index, deleting milestone `i` would orphan `timeline-${i}`'s photo and shift every subsequent milestone's photo by one slot.

Updated `remove(i)`:
1. If `photos[`timeline-${i}`]` exists, `DELETE /collections/photos/records/${photoIds[`timeline-${i}`]}` to drop the orphan record.
2. For each remaining milestone `j > i` that has a photo, rename its slot from `timeline-${j}` to `timeline-${j-1}` via `PATCH /collections/photos/records/{id}` with the new `slot` value.
3. Splice the milestone out of `content.timeline` and persist as today.

This requires two new tiny API helpers in `app.jsx`'s PocketBase client section:

```js
const deletePhoto = (id) =>
  apiFetch(`/collections/photos/records/${id}`, { method: "DELETE" });

const renamePhotoSlot = (id, newSlot) => {
  const fd = new FormData();
  fd.append("slot", newSlot);
  return apiFetch(`/collections/photos/records/${id}`, { method: "PATCH", form: fd });
};
```

Both reuse the auth-token-bearing `apiFetch` and so are owner-only (matches the `update`/`delete` rules on the `photos` collection).

---

## File-level changes

| File | Change |
|---|---|
| `app.jsx` | Brand text (1 line). `Editable` short-circuit + `editing` prop threading through `About`, `Stats`, `Letter`, `Wishes`. New `Photo` slot per milestone in `Timeline`. New `deletePhoto` / `renamePhotoSlot` helpers. Updated `Timeline.remove`. |
| `styles.css` | New `.tl-item` grid layout, new `.tl-polaroid` rules (desktop + mobile breakpoint). |
| `pb/pb_migrations/*` | **No change.** Photo slots are arbitrary text keys, the schema already accepts `timeline-*`. |
| `docker-compose.yml`, `nginx.conf`, `Dockerfile` | **No change.** |

---

## Edge cases

1. **Reordering milestones in edit mode.** Out of scope; no current UI to reorder. If we ever add drag-to-reorder in Timeline, this index-based binding will need to migrate to a per-milestone photo-slot string in the content record. Documented but not implemented.
2. **Removing a milestone with N subsequent photos.** Handled by the bookkeeping in `Timeline.remove` above. Worst case: one DELETE + (N-1) PATCH calls fired in sequence; for a baby's milestone list this is single-digit at most.
3. **Photo upload fails mid-remove.** The remove handler awaits each rename before splicing the milestone. If a rename fails, the milestone is *not* spliced and the user sees the existing `alert("Photo upload failed: …")` failure path. The timeline content stays in sync with the photo slot keys.
4. **Stale `data-edit` CSS targeting non-admins.** Verified: the dashed-underline rules in `styles.css` key off the `[data-edit]` attribute, which the new read-only branch of `Editable` no longer emits. No CSS change needed.
5. **The hero parents field becomes read-only for non-admins too.** This is correct — it was already a no-op `onChange={() => {}}`. Removing the cursor affordance is the goal.
6. **`EDITMODE-BEGIN`/`EDITMODE-END` block.** Untouched. The Tweaks panel parser is unaffected.
7. **`localStorage` token key.** Untouched. No re-login required for existing owners.

---

## Out of scope

- Drag-to-reorder for milestones (would change the storage-by-index assumption).
- Captions/handwriting on milestone polaroids (the milestone title is the caption).
- Slideshow integration for milestone photos (The Album's slideshow remains the only one).
- Migrating other section photo slots to a different storage shape.
- Any change to `EDITMODE-BEGIN/END` tweaks or the Tweaks panel.

---

## Verification checklist

After implementation, the following must all pass:

1. Top-left brand reads `Grey · Lulu` (logged in and logged out).
2. Logged out: clicking any text in Hero, About, Stats, Timeline, Family, Letter, Routine, Wishes does **not** show a text cursor and does **not** allow typing. No dashed underline appears on hover.
3. Logged out: the guestbook form still works (it uses regular `<input>`/`<textarea>`, not `Editable` — should be unaffected).
4. Logged in: every previously editable field is still editable; saves still persist across reload.
5. Logged in: Timeline section shows an empty polaroid placeholder on the right of every milestone. Clicking opens the file picker; uploading shows the image immediately and survives reload.
6. Logged out: Timeline shows polaroids only for milestones that have a photo. Milestones without one render with no right-column.
7. Logged in: remove a milestone with a photo → photo record gone (verifiable via `/_/`); subsequent milestones' photos still align with their text.
8. Logged in: remove a milestone *without* a photo → no photo API calls fired.
9. Mobile width (< 720px): polaroid stacks above text, single column.
10. No console errors. CSP allows everything as before. Babel parses `app.jsx` (no syntax regressions).
11. The `EDITMODE-BEGIN/END` parser in the Tweaks panel still works (panel opens, defaults load).
