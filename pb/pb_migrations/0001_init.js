/// <reference path="../pb_data/types.d.ts" />

// Initial schema for Castiel's site:
//   - content   : singleton record holding the full editable content blob
//   - photos    : one record per photo slot, with an uploaded image file
//   - guestbook : append-only list, anyone can create, only owner can moderate
//
// Public reads on all three. Owner (superuser) bypasses rules for writes.
// Guestbook additionally allows public create so visitors can sign without auth.

migrate((app) => {
  // ---- content ----
  const content = new Collection({
    type: "base",
    name: "content",
    listRule: "",
    viewRule: "",
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { name: "data", type: "json", maxSize: 2000000, required: true },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
  });
  app.save(content);

  // Seed the singleton with the same defaults the prototype shipped with.
  const seed = new Record(content);
  seed.set("data", {
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
      body: "Dear Lulu,\n\nWe waited so long for you. Today we counted your fingers, your toes, the freckle on your shoulder we already love.\n\nYou'll grow up faster than we want. So we're saving everything here — every milk-stain memory, every tiny yawn — so you can see, one day, how loved you were from the very first second.\n\nWelcome home, little one.",
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
    gallery: [
      { caption: "first day home", x: 6, y: 4, rot: -6 },
      { caption: "tiny toes", x: 32, y: 10, rot: 4 },
      { caption: "milk drunk", x: 58, y: 6, rot: -3 },
      { caption: "with mama", x: 14, y: 42, rot: 5 },
      { caption: "sleepy boy", x: 42, y: 48, rot: -7 },
      { caption: "with papa", x: 68, y: 42, rot: 3 },
    ],
  });
  app.save(seed);

  // ---- photos ----
  const photos = new Collection({
    type: "base",
    name: "photos",
    listRule: "",
    viewRule: "",
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { name: "slot", type: "text", required: true, max: 100 },
      {
        name: "image",
        type: "file",
        required: true,
        maxSize: 10485760, // 10 MB per file
        maxSelect: 1,
        mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
      },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_photos_slot ON photos (slot)"],
  });
  app.save(photos);

  // ---- guestbook ----
  const guestbook = new Collection({
    type: "base",
    name: "guestbook",
    listRule: "",
    viewRule: "",
    createRule: "",
    updateRule: null,
    deleteRule: null,
    fields: [
      { name: "name", type: "text", required: true, max: 80 },
      { name: "body", type: "text", required: true, max: 1000 },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    // Sort guestbook by `created` desc — declare an index for the common path.
    indexes: ["CREATE INDEX idx_guestbook_created ON guestbook (created)"],
  });
  app.save(guestbook);

  // Seed a couple of guestbook entries from the prototype.
  const seedEntries = [
    { name: "Tita Joy", body: "He's perfect! Already winning at sleeping competitively." },
    { name: "Lolo", body: "Took one look at him and forgot every word I knew." },
  ];
  for (const e of seedEntries) {
    const r = new Record(guestbook);
    r.set("name", e.name);
    r.set("body", e.body);
    app.save(r);
  }
}, (app) => {
  for (const name of ["guestbook", "photos", "content"]) {
    try { app.delete(app.findCollectionByNameOrId(name)); } catch (_) {}
  }
});
