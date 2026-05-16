import express from "express";
import { context, reddit, settings } from "@devvit/web/server";
import { summarizeBanAppeal } from "./gemini";

const app = express();
app.use(express.json({ limit: "1mb" }));

const APPEAL_HINTS = /\b(appeal|unban|banned|ban\s+lift|reconsider)\b/i;

app.post("/internal/triggers/modmail", async (req, res) => {
  const event = req.body as ModMailEvent;
  const conversationId = event?.conversationId;
  const messageAuthor = event?.messageAuthor?.name;
  const messageBody = event?.message?.bodyMarkdown ?? event?.message?.body ?? "";

  if (!conversationId || !messageBody) {
    res.json({ skipped: "no conversationId or body" });
    return;
  }

  if (!APPEAL_HINTS.test(messageBody)) {
    res.json({ skipped: "no appeal hint in body" });
    return;
  }

  const apiKey = await settings.get<string>("gemini_api_key");
  if (!apiKey) {
    res.json({ skipped: "gemini_api_key not configured" });
    return;
  }

  try {
    const userHistory = messageAuthor
      ? await fetchRecentHistory(messageAuthor)
      : undefined;

    const summary = await summarizeBanAppeal({
      apiKey,
      appealBody: messageBody,
      userHistory,
    });

    const replyBody = renderModFacingReply(summary.text, summary.tokens.total);

    await reddit.modMail.reply({
      conversationId,
      body: replyBody,
      isInternal: true,
    });

    res.json({ ok: true, tokens: summary.tokens.total });
  } catch (err: any) {
    console.error("modwingman error:", err?.message);
    res.json({ error: err?.message ?? String(err) });
  }
});

async function fetchRecentHistory(username: string): Promise<string> {
  try {
    const user = await reddit.getUserByUsername(username);
    if (!user) return "";
    const comments = await user
      .getComments({ limit: 10, sort: "new" })
      .all();
    return comments
      .map(
        (c) =>
          `[r/${c.subredditName} · ${c.score} score] ${c.body.slice(0, 200)}`
      )
      .join("\n");
  } catch {
    return "";
  }
}

function renderModFacingReply(summary: string, tokens: number): string {
  return [
    "🤖 **ModWingman summary** (private mod note)",
    "",
    summary,
    "",
    `_${tokens} tokens · gemini-2.5-flash_`,
  ].join("\n");
}

type ModMailEvent = {
  conversationId?: string;
  messageAuthor?: { id?: string; name?: string };
  message?: { id?: string; body?: string; bodyMarkdown?: string };
  subreddit?: { id?: string; name?: string };
};

const port = Number(process.env.WEBBIT_PORT) || 3000;
app.listen(port);
