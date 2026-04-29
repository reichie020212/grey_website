/// <reference path="../pb_data/types.d.ts" />

// Raise guestbook.body length cap from 1000 → 2000 chars.
// Visitors were running into the limit when leaving longer notes.

migrate((app) => {
  const guestbook = app.findCollectionByNameOrId("guestbook");
  guestbook.fields.getByName("body").max = 2000;
  app.save(guestbook);
}, (app) => {
  const guestbook = app.findCollectionByNameOrId("guestbook");
  guestbook.fields.getByName("body").max = 1000;
  app.save(guestbook);
});
