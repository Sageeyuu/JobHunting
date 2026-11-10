# JobHunting

Jinghui Yu's profile and job application tracker.

| Page | What it does |
|---|---|
| My profile | Shows the CV, with a Copy button on each section for pasting into application forms |
| Applications | A spreadsheet of every job applied to: company, role, link, dates, status, contact, next action and notes, plus a history for each one |

## Using the tracker

- Type a company in the bottom row to add an application. It's dated today and marked Applied.
- Paste one or more links into the bottom row's Link cell to add one row for each link.
- Click any cell to edit it. Move with the arrow keys or Enter, and click a column heading to sort.
- Open a row with ▸ to log an email, call or interview. Logging one also updates the status.
- **Alert** flags actions that are due, and applications with no reply after three weeks.

## Run it

Open `index.html` in a browser, or publish it with GitHub Pages: **Settings → Pages → Deploy from a branch → `main` / root**.

## Where your data goes

- The profile is stored in `profile.js` in this public repository, so anyone can read it. Edit that file to update the profile.
- Your applications are saved only in your browser's local storage, never in this repository. Use **Download backup** and **Restore backup** to move them between browsers or devices.
