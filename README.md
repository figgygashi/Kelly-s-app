# Kelly's Memory 🧠

A gentle, private helper that makes Kelly's day-to-day life easier by remembering things for him.
It runs in the browser on any phone or computer, works offline, and can be added to the home screen like a normal app.

## What it does

| Tab | Helps with |
|---|---|
| 🏠 **Today** | Big, clear day and date. Reminders due today and overdue. Daily routine checklist with progress. Upcoming birthdays and appointments. One-tap "Where I put…" and note capture. |
| 📝 **Remember** | **Where things are** (passport → top desk drawer, saved with when it was last updated) and **Notes** (pin important ones, add tags). Search across both. |
| 👥 **People** | Names plus how he knows each person and details worth remembering (partner's and kids' names, what you last talked about). Can also add them to Practice to learn their names. |
| 📅 **Dates** | Birthdays (with "turns 66"), anniversaries and appointments, sorted by how many days away they are. |
| 🎯 **Practice** | Flashcards with spaced repetition. Things he knows come back less often and tricky ones come back sooner. A few minutes a day helps new information stick. |
| ⚙️ **Settings** | Name, reminder alerts, backup and restore, and erase everything. |

## Privacy

Everything is stored **only on the device** (browser storage). There's no account, server or tracking.
That also means data doesn't sync between devices. Use **Settings → Download backup** now and then to keep a copy.

## Putting it on Kelly's phone

1. Host the folder somewhere. The easiest option is GitHub Pages: in this repo, go to **Settings → Pages**, pick the branch and `/ (root)`, then save. You get a link like `https://<user>.github.io/Kelly-s-app/`.
2. Open the link on Kelly's phone:
   - **iPhone (Safari):** Share → **Add to Home Screen**
   - **Android (Chrome):** ⋮ menu → **Add to Home screen / Install app**
3. Open it from the home screen icon. Go to ⚙️ and tap **Turn on alerts**.

> **Note about alerts:** reminder pop-ups fire while the app is open or in the background recently.
> The app has no server, so it can't wake a locked phone the way the built-in Reminders/Clock app can.
> For must-not-miss things like medication, also set a phone alarm.

## Running locally

No build step and no dependencies:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Files

- `index.html`: page shell and tab bar
- `styles.css`: large, readable, touch-friendly styles with automatic dark mode
- `app.js`: all app logic (views, forms, storage, reminders, spaced repetition)
- `sw.js`: service worker for offline use
- `manifest.webmanifest`, `icons/`: home-screen install
