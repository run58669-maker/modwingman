# ModWingman privacy policy

ModWingman is a Devvit-based moderator assistance app. When a non-moderator
sends a modmail message that contains ban-appeal keywords (e.g. "appeal",
"banned", "reconsider"), ModWingman forwards the message body and limited
public user context (recent comment snippets, scores, subreddits) to Google
AI Studio (Gemini 2.5 Flash) to generate a private mod note.

We do **not** store user data persistently outside of Reddit's own modmail
storage. ModWingman writes only a single internal moderator reply per
appeal-triggering message, visible only to the subreddit moderation team.

For questions, open an issue at https://github.com/run58669-maker/modwingman.
