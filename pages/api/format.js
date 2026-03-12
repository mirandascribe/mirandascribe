import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "../../lib/prompts";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { transcript, preferences, styleProfile, followUp, originalReport, queries, queryAnswers } = req.body;

  if (!transcript && !followUp) return res.status(400).json({ error: "No transcript provided" });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prefStr = preferences?.length
    ? "\n\nRADIOLOGIST PERSONAL PREFERENCES (apply on top of all rules):\n" + preferences.map(p => "- " + p).join("\n")
    : "";

  const styleStr = styleProfile
    ? "\n\nRADIOLOGIST STYLE PROFILE (match this writing style and terminology):\n" + styleProfile.slice(0, 2000)
    : "";

  let userMessage;

  if (followUp) {
    userMessage = `The radiologist has answered the queries. Merge the answers into the report draft and return one complete, clean, query-free formatted report. Do not include the query block.

ORIGINAL REPORT DRAFT:
${originalReport}

QUERIES THAT WERE RAISED:
${queries.map((q, i) => `[QUERY ${i + 1}] ${q}`).join("\n")}

RADIOLOGIST ANSWERS:
${queryAnswers}

Return the complete final report as plain ASCII text only. No markdown. No special characters.`;
  } else {
    userMessage = `AUTO-DETECT the modality and anatomy from the dictation below. If modality is not explicitly stated but anatomy suggests MSK, default to MRI and note the assumption.

AUTO-CORRECT any obvious dictation errors silently before formatting.

FORMAT the complete structured report using the appropriate Miranda Scribe template.

CHECK for missing mandatory fields. If the dictation contains a general normal statement (rest is unremarkable, no other findings, otherwise unremarkable, etc.) then add "Remaining structures are unremarkable." globally and do NOT raise queries for individual fields. Otherwise list ALL missing fields as queries at the end.
${prefStr}${styleStr}

DICTATION:
${transcript}

Return plain ASCII text only. No markdown. No special characters. If queries are needed place them at the very end.`;
  }

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-5-20251001",
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const text = message.content[0].text;

    // Parse out queries if present
    const qi = text.indexOf("---QUERIES---");
    const qe = text.indexOf("---END QUERIES---");

    if (qi > -1 && qe > -1) {
      const reportBody = text.slice(0, qi).trim();
      const queryBlock = text.slice(qi + 13, qe).trim();
      const queries = queryBlock
        .split("\n")
        .filter(l => l.trim().startsWith("[QUERY"))
        .map(l => l.replace(/^\[QUERY \d+\]\s*/, "").trim());

      return res.status(200).json({ report: reportBody, queries, hasQueries: true });
    }

    return res.status(200).json({ report: text, queries: [], hasQueries: false });
  } catch (error) {
    console.error("Claude error:", error);
    return res.status(500).json({ error: error.message || "Formatting failed" });
  }
}
