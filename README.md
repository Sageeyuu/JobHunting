# JobHunting

A private website for making fewer, better job applications.

| Stage | What it does |
|---|---|
| 1. Your profile | Holds your CV, goals, must-haves and deal-breakers |
| 2. Add jobs | Saves links or pasted descriptions and lists their requirements |
| 3. Evaluate matches | Sorts requirements into strengths, gaps and unknowns, with evidence from your CV, and advises apply, consider or skip |
| 4. Shortlist | Compares jobs and builds a prioritised application queue from your decisions |
| 5. Prepare | Builds editable CVs, cover letters and answers from your actual experience |
| 6. Track progress | Records applications, replies, interviews, outcomes and next actions |

## Run it

Open `index.html` in a browser, or publish it with GitHub Pages: **Settings → Pages → Deploy from a branch → `main` / root**.

## Where your data goes

Everything you enter stays in your browser's local storage and is never written to this repository. Records don't move between browsers or devices. Use **Download backup** and **Restore backup** to move them or keep a copy, and don't commit the backup file, because it contains your CV.

## Limits

- A web page can't read other websites, so links are saved and the description is pasted in. Alternatively, copy the prompt into Claude and paste its reply back.
- The built-in check compares words. It can't judge how strong your experience is, so review each result or use the Claude prompt.
