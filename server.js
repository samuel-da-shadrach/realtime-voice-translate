import express from "express";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const httpPort = Number(process.env.HTTP_PORT || process.env.PORT || 80);
const httpsPort = Number(process.env.HTTPS_PORT || 443);
const certPath = process.env.TLS_CERT || path.join(__dirname, "certs", "origin.crt");
const keyPath = process.env.TLS_KEY || path.join(__dirname, "certs", "origin.key");

const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

app.use(express.json({ limit: "64kb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/scribe-token", async (_req, res) => {
  if (!process.env.ELEVENLABS_API_KEY) {
    res.status(500).json({ error: "ELEVENLABS_API_KEY is not set" });
    return;
  }

  try {
    const token = await elevenlabs.tokens.singleUse.create("realtime_scribe");
    res.json(token);
  } catch (error) {
    console.error("Failed to create Scribe token:", error);
    res.status(502).json({ error: "Failed to create Scribe token" });
  }
});

function extractOutputText(response) {
  if (typeof response.output_text === "string") {
    return response.output_text;
  }

  return (response.output || [])
    .flatMap((item) => item.content || [])
    .map((content) => content.text || "")
    .join("")
    .trim();
}

app.post("/translate", async (req, res) => {
  if (!process.env.OPENAI_API_KEY) {
    res.status(500).json({ error: "OPENAI_API_KEY is not set" });
    return;
  }

  const {
    text = "",
    sourceLanguage = "",
    targetLanguage = "English",
  } = req.body || {};

  const sourceText = String(text).trim();
  const source = String(sourceLanguage || "").trim();
  const destination = String(targetLanguage || "English").trim() || "English";

  if (!sourceText) {
    res.json({ translation: "" });
    return;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.4-mini",
        reasoning: { effort: "none" },
        max_output_tokens: 220,
        instructions: [
          `Translate speech transcription text from ${source || "the source language"} into ${destination}.`,
          "Return only the translated text, with no quotes, labels, markdown, notes, or alternatives.",
          "Preserve meaning, names, numbers, punctuation, and tone.",
        ].join(" "),
        input: [
          {
            role: "user",
            content: [
              `Source language: ${source || "unknown"}`,
              `Target language: ${destination}`,
              `Partial transcript: ${sourceText}`,
            ].join("\n"),
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenAI translation failed:", data);
      res.status(502).json({ error: "Translation failed" });
      return;
    }

    res.json({ translation: extractOutputText(data) });
  } catch (error) {
    console.error("OpenAI translation request failed:", error);
    res.status(502).json({ error: "Translation request failed" });
  }
});

app.use(
  "/.well-known",
  express.static(path.join(__dirname, "dist", ".well-known"), {
    dotfiles: "allow",
  }),
);
app.use(express.static(path.join(__dirname, "dist")));

app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

http.createServer(app).listen(httpPort, "0.0.0.0", () => {
  console.log(`Scribe app listening on http://0.0.0.0:${httpPort}`);
});

if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  https
    .createServer(
      {
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath),
      },
      app,
    )
    .listen(httpsPort, "0.0.0.0", () => {
      console.log(`Scribe app listening on https://0.0.0.0:${httpsPort}`);
    });
}
