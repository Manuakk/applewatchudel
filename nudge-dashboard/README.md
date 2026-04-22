# TrackAndText — Nudge Dashboard

Interactive dashboard showing per-participant, per-day nudge and interaction counts from the TrackAndText WatchOS study.

## Live demo

Once deployed, your app will be at:
`https://<your-github-username>.github.io/<repo-name>/`

---

## Deploy to GitHub Pages (5 steps)

### 1. Create a new GitHub repo
Go to github.com → New repository. Name it anything (e.g. `nudge-dashboard`). Keep it public.

### 2. Push this code
```bash
cd nudge-dashboard
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main
```

### 3. Enable GitHub Pages
In your repo → **Settings** → **Pages** → under **Source**, select **GitHub Actions**.

### 4. Done
The deploy workflow runs automatically on every push to `main`.
Your site will be live at the URL shown in the Pages settings within ~1 minute.

---

## Run locally

```bash
npm install
npm run dev
```

Then open http://localhost:5173

---

## CSV format

Upload your `confirmation_log.csv` with these columns:

| Column | Example values |
|---|---|
| `userId` | `P01`, `P02` |
| `timestamp` | `2025-03-01 14:23:00` |
| `eventType` | `prompt_sent` or `prompt_response` |
| `confirmedLabel` | `Standing`, `Sitting`, `Walking`, `ignored` |
| `source` | `guided_label`, `prediction`, `stand_prompt` |
