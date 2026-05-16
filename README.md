# ModWingman

AI-assisted ban appeal triage for subreddit moderators. Built on Devvit for the **Reddit Mod Tools and Migrated Apps Hackathon** (deadline 2026-05-27).

## What it does

When a user submits a ban appeal in modmail:

1. `onModMail` trigger fires on Devvit server
2. ModWingman pulls the user's recent comment history (10 most recent)
3. Calls Google Gemini 2.5 Flash to produce a moderator-facing summary:
   - **TONE** — sincere / dismissive / aggressive / boilerplate
   - **KEY POINTS** — 3 bullets max
   - **RED FLAGS** — deflection / accusations / inconsistencies
   - **SUGGESTED ACTION** — approve / deny / escalate + one-sentence reason
4. Posts the summary as a private mod note inside the modmail conversation

## Why

Existing Devvit modmail apps (Modmail Automator etc.) use YAML rules. ModWingman uses an LLM to read tone and context, catching things rules miss — repeated boilerplate appeals, escalation language, user-history mismatch.

## Architecture

- **Trigger**: `onModMail` → POST `/internal/triggers/modmail`
- **LLM**: Google Gemini 2.5 Flash (free tier covers hackathon dev; `generativelanguage.googleapis.com` is in Reddit's global fetch allowlist)
- **BYO key**: moderator installs the app, opens app settings, pastes their own Gemini API key. Stored as Devvit setting.
- **No persistent state** required for v0 (Redis available if we add caching later).

## Setup (dev)

```powershell
cd modwingman
npx devvit login          # one-time Reddit OAuth
npm install
npx devvit playtest r/<your-test-sub>
```

In app settings (Developer Settings on developers.reddit.com), set `gemini_api_key`.

## Project impact (hackathon submission section)

Ban-appeal triage is one of the most frequently cited modmail pain points in
r/ModSupport: large subs receive dozens of appeals daily, most are
boilerplate or repeat offenders, and reading each one in full burns mod
hours that should go toward actual moderation. The competing Devvit mod
apps (Reddit's Comment Mop / Remove Macro / Flair Assistant, fsvreddit's
Modmail Automator) handle bulk-action and YAML-rule cases well but don't
help with the *semantic* read of an appeal — tone, sincerity,
consistency with the user's recent history.

ModWingman targets that gap. It runs in the background, fires only on
modmail messages that match an appeal-keyword filter, and produces a
short, deterministic summary (`TONE / KEY POINTS / RED FLAGS / SUGGESTED
ACTION`) that mods scan in 5–10 seconds instead of reading the full
appeal thread. The summary is posted as a private mod note inside the
existing modmail conversation, so adoption requires zero workflow
change.

Target communities for v0:
- One small test subreddit (run by the dev team) for the demo.
- After hackathon: pitch r/AskReddit-scale subs whose mod teams already
  use Modmail Automator (proven appetite for automation).

## Limitations / known issues

- 30s max request time (LLM call + history fetch + reply must fit)
- BYO key — mods must provide their own Gemini API key (free tier sufficient for typical sub volume)
- Triggers on any modmail message matching `appeal|unban|banned|reconsider` — false-positive rate TBD
- Subreddit-scope settings can't be marked `isSecret` in the Devvit schema, so the API key lives in the `global` settings namespace for v0. For multi-tenant prod we'd switch to per-install storage via Redis.
