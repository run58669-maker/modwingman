import express from "express";
import { context, createServer, getServerPort, reddit, settings } from "@devvit/web/server";
import { summarizeBanAppeal } from "./gemini";

const app = express();
app.use(express.json({ limit: "1mb" }));

const APPEAL_HINTS = /\b(appeal|unban|banned|ban\s+lift|reconsider)\b/i;

app.post("/internal/triggers/modmail", async (req, res) => {
  console.log("[modwingman] modmail trigger received");
  const event = req.body as any;
  const conversationId: string | undefined = event?.conversationId;
  const messageId: string | undefined = event?.messageId;
  const messageAuthor: string | undefined = event?.messageAuthor?.name;

  if (!conversationId || !messageId) {
    console.log("[modwingman] skip: no conversationId/messageId");
    res.json({ skipped: "no conversationId/messageId" });
    return;
  }

  // Devvit modmail trigger gives us references; fetch the conversation to get the body
  let messageBody = "";
  try {
    const conv: any = await reddit.modMail.getConversation({ conversationId });
    const msgs = conv?.conversation?.messages || {};
    const msgKeys = Object.keys(msgs);
    const shortId = messageId.replace(/^ModmailMessage_/, "");
    const msg = msgs[messageId] || msgs[shortId] || Object.values(msgs)[msgKeys.length - 1];
    messageBody = msg?.bodyMarkdown ?? msg?.body ?? "";
    console.log(`[modwingman] msgKeys=${msgKeys.join(",")} pickedKeys=${Object.keys(msg||{}).join(",")} bodyLen=${messageBody.length}`);
  } catch (e: any) {
    console.error("[modwingman] getConversation err:", e?.message);
    res.json({ error: e?.message });
    return;
  }

  if (!messageBody) {
    console.log("[modwingman] skip: empty body after fetch");
    res.json({ skipped: "empty body after fetch" });
    return;
  }
  console.log(`[modwingman] conv=${conversationId} author=${messageAuthor} bodyLen=${messageBody.length}`);

  if (!APPEAL_HINTS.test(messageBody)) {
    console.log("[modwingman] skip: no appeal hint in body");
    res.json({ skipped: "no appeal hint in body" });
    return;
  }
  console.log("[modwingman] appeal hint matched, proceeding to LLM");

  // v0: read from gitignored src/server/secret.ts. Devvit settings flow
  // worked on the schema layer but Reddit's `settings set` server-side
  // validator rejected our gemini_api_key field on Devvit 0.12.23 +
  // @devvit/web; we time-boxed the fight and v0.2 will restore BYO.
  const { GEMINI_API_KEY } = await import("./secret.js");
  const apiKey = (await settings.get<string>("gemini_api_key")) || GEMINI_API_KEY;
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

    console.log(`[modwingman] gemini returned ${summary.tokens.total} tokens; calling modMail.reply`);
    await reddit.modMail.reply({
      conversationId,
      body: replyBody,
      isInternal: true,
    });
    console.log("[modwingman] modMail.reply succeeded");

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

const port = getServerPort();
createServer(app).listen(port);
