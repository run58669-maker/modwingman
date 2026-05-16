const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

const SYSTEM_PROMPT = `You are ModWingman, an assistant for subreddit moderators reviewing ban appeals.
Read the ban appeal and the user's recent history below.
Produce a concise moderator-facing summary in EXACTLY this format:

TONE: [sincere / dismissive / aggressive / boilerplate]
KEY POINTS:
- [bullet 1]
- [bullet 2]
- [bullet 3 max]
RED FLAGS:
- [bullet, only if present, otherwise write "none"]
SUGGESTED ACTION: [approve / deny / escalate] — [one sentence reason]

Be terse. No preamble. The moderator wants signal not prose.`;

export type ModWingmanSummary = {
  text: string;
  tokens: { input: number; output: number; thoughts: number; total: number };
};

export async function summarizeBanAppeal(args: {
  apiKey: string;
  appealBody: string;
  banReason?: string;
  userHistory?: string;
}): Promise<ModWingmanSummary> {
  const userContent = [
    args.banReason ? `Original ban reason: ${args.banReason}` : "",
    args.userHistory ? `Recent user history:\n${args.userHistory}` : "",
    `Ban appeal:\n---\n${args.appealBody}\n---`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const body = {
    contents: [
      {
        parts: [{ text: `${SYSTEM_PROMPT}\n\n${userContent}` }],
      },
    ],
  };

  const res = await fetch(GEMINI_ENDPOINT, {
    method: "POST",
    headers: {
      "x-goog-api-key": args.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Gemini API ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as any;
  const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const meta = data?.usageMetadata ?? {};

  return {
    text: text.trim(),
    tokens: {
      input: meta.promptTokenCount ?? 0,
      output: meta.candidatesTokenCount ?? 0,
      thoughts: meta.thoughtsTokenCount ?? 0,
      total: meta.totalTokenCount ?? 0,
    },
  };
}
