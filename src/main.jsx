import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useScribe } from "@elevenlabs/react";
import "./styles.css";

function lastWords(text, count) {
  if (count <= 0) {
    return "";
  }

  const normalized = text.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return "";
  }

  if (typeof Intl?.Segmenter !== "function") {
    return normalized.split(" ").filter(Boolean).slice(-count).join(" ");
  }

  const segments = Array.from(new Intl.Segmenter(undefined, { granularity: "word" }).segment(normalized));
  let wordsSeen = 0;
  let startIndex = segments.length;

  for (let i = segments.length - 1; i >= 0; i -= 1) {
    if (segments[i].isWordLike) {
      wordsSeen += 1;
    }

    startIndex = i;

    if (wordsSeen === count) {
      break;
    }
  }

  return segments
    .slice(startIndex)
    .map((segment) => segment.segment)
    .join("")
    .trim();
}

function getLanguagePair() {
  const params = new URLSearchParams(window.location.search);
  return params.get("pair") || params.get("languagePair") || params.get("to") || params.get("target") || "English/Hindi";
}

function normalizePairLanguage(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (normalized === "en" || normalized === "eng" || normalized === "english") {
    return "English";
  }

  if (normalized === "hi" || normalized === "hin" || normalized === "hindi") {
    return "Hindi";
  }

  return "";
}

function parseLanguagePair(value) {
  const parts = String(value || "")
    .split(/\s*(?:\/|,|->|→|\bto\b|-)\s*/i)
    .map(normalizePairLanguage)
    .filter(Boolean);

  if (parts.length >= 2) {
    return [parts[0], parts[1]];
  }

  return ["English", "Hindi"];
}

function languageFromCode(code) {
  const normalized = String(code || "").trim().toLowerCase();

  if (normalized === "en" || normalized === "eng" || normalized.startsWith("en-")) {
    return "English";
  }

  if (normalized === "hi" || normalized === "hin" || normalized.startsWith("hi-")) {
    return "Hindi";
  }

  return "";
}

function inferLanguageFromText(text) {
  if (/[\u0900-\u097F]/.test(text)) {
    return "Hindi";
  }

  if (/[A-Za-z]/.test(text)) {
    return "English";
  }

  return "";
}

function oppositeLanguage(language, pair) {
  if (language === pair[0]) {
    return pair[1];
  }

  if (language === pair[1]) {
    return pair[0];
  }

  return pair[1];
}

function App() {
  const [committedText, setCommittedText] = useState("");
  const [englishTranslation, setEnglishTranslation] = useState("");
  const [hindiTranslation, setHindiTranslation] = useState("");
  const [error, setError] = useState("");
  const [languagePair, setLanguagePair] = useState(getLanguagePair);
  const parsedLanguagePair = useMemo(() => parseLanguagePair(languagePair), [languagePair]);
  const committedTextRef = useRef("");
  const englishTranslationRef = useRef("");
  const hindiTranslationRef = useRef("");
  const partialTimerRef = useRef(null);
  const translationSequenceRef = useRef({ English: 0, Hindi: 0 });
  const latestRenderedTranslationRef = useRef({ English: 0, Hindi: 0 });

  useEffect(() => {
    function syncViewportSize() {
      const viewport = window.visualViewport;
      const width = viewport?.width || window.innerWidth;
      const height = viewport?.height || window.innerHeight;
      document.documentElement.style.setProperty("--app-width", `${width}px`);
      document.documentElement.style.setProperty("--app-height", `${height}px`);
    }

    syncViewportSize();
    window.addEventListener("resize", syncViewportSize);
    window.visualViewport?.addEventListener("resize", syncViewportSize);

    return () => {
      window.removeEventListener("resize", syncViewportSize);
      window.visualViewport?.removeEventListener("resize", syncViewportSize);
    };
  }, []);

  function getTargetLanguageForText(text, languageHint) {
    const sourceLanguage = normalizePairLanguage(languageHint) || inferLanguageFromText(text);

    if (!sourceLanguage) {
      window.alert("Could not detect whether the transcript is English or Hindi.");
      return "";
    }

    return oppositeLanguage(sourceLanguage, parsedLanguagePair);
  }

  async function translateText({ text, mode, targetLanguage }) {
    const response = await fetch("/translate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        mode,
        targetLanguage,
        stableSource: committedTextRef.current,
        stableTranslation: targetLanguage === "English" ? englishTranslationRef.current : hindiTranslationRef.current,
      }),
    });

    if (!response.ok) {
      throw new Error("Translation failed");
    }

    const data = await response.json();
    return data.translation || "";
  }

  async function translateLatest({ text, mode, targetLanguage }) {
    const source = text.trim();

    if (!source) {
      return;
    }

    const sequence = (translationSequenceRef.current[targetLanguage] || 0) + 1;
    translationSequenceRef.current[targetLanguage] = sequence;

    try {
      const translation = await translateText({ text: source, mode, targetLanguage });

      if (sequence < (latestRenderedTranslationRef.current[targetLanguage] || 0)) {
        return;
      }

      latestRenderedTranslationRef.current[targetLanguage] = sequence;
      if (targetLanguage === "English") {
        englishTranslationRef.current = translation;
        setEnglishTranslation(translation);
      } else if (targetLanguage === "Hindi") {
        hindiTranslationRef.current = translation;
        setHindiTranslation(translation);
      }
    } catch (err) {
      console.warn(`${mode} translation failed:`, err);
    }
  }

  function translatePartial(text, languageHint = "") {
    const partial = text.trim();

    window.clearTimeout(partialTimerRef.current);

    if (!partial) {
      return;
    }

    partialTimerRef.current = window.setTimeout(() => {
      const targetLanguage = getTargetLanguageForText(partial, languageHint);

      if (!targetLanguage) {
        return;
      }

      translateLatest({
        text: `${committedTextRef.current} ${partial}`.trim(),
        mode: "partial",
        targetLanguage,
      });
    }, 220);
  }

  function translateCommitted(text, languageHint = "") {
    const segment = text.trim();

    if (!segment) {
      return;
    }

    window.clearTimeout(partialTimerRef.current);

    const targetLanguage = getTargetLanguageForText(segment, languageHint);

    if (!targetLanguage) {
      return;
    }

    translateLatest({
      text: committedTextRef.current,
      mode: "committed",
      targetLanguage,
    });
  }

  function handleCommittedTranscript(data) {
    const text = data.text || "";
    const sourceLanguage = languageFromCode(data.language_code || data.languageCode);

    const next = `${committedTextRef.current} ${text}`.trim();
    committedTextRef.current = next;
    setCommittedText(next);
    translateCommitted(text, sourceLanguage);
  }

  const scribe = useScribe({
    modelId: "scribe_v2_realtime",
    includeTimestamps: true,
    onPartialTranscript: (data) => {
      translatePartial(data.text || "", languageFromCode(data.language_code || data.languageCode));
    },
    onCommittedTranscriptWithTimestamps: handleCommittedTranscript,
    onError: (event) => {
      setError(event?.message || event?.error || "Transcription error");
    },
  });

  const visibleEnglishTranslation = useMemo(() => {
    return lastWords(englishTranslation, 15);
  }, [englishTranslation]);

  const visibleHindiTranslation = useMemo(() => {
    return lastWords(hindiTranslation, 15);
  }, [hindiTranslation]);

  async function start() {
    setError("");
    setCommittedText("");
    setEnglishTranslation("");
    setHindiTranslation("");
    committedTextRef.current = "";
    englishTranslationRef.current = "";
    hindiTranslationRef.current = "";
    translationSequenceRef.current = {
      English: translationSequenceRef.current.English + 1,
      Hindi: translationSequenceRef.current.Hindi + 1,
    };
    latestRenderedTranslationRef.current = { ...translationSequenceRef.current };
    window.clearTimeout(partialTimerRef.current);
    const response = await fetch("/scribe-token");
    if (!response.ok) {
      throw new Error("Could not create Scribe token");
    }

    const tokenResponse = await response.json();
    const token = tokenResponse.token || tokenResponse;

    await scribe.connect({
      token,
      microphone: {
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
  }

  async function handleStart() {
    try {
      await start();
    } catch (err) {
      setError(err.message || "Could not start transcription");
    }
  }

  return (
    <main className="screen" onDoubleClick={() => scribe.disconnect()}>
      {scribe.isConnected ? (
        <div className="captions" aria-live="polite">
          <div className="words translation english">{visibleEnglishTranslation || " "}</div>
          <div className="words translation hindi">{visibleHindiTranslation || " "}</div>
        </div>
      ) : (
        <form className="settings" onSubmit={(event) => event.preventDefault()}>
          <label className="field">
            <span>Language pair</span>
            <input
              type="text"
              value={languagePair}
              autoCapitalize="words"
              autoComplete="off"
              onChange={(event) => setLanguagePair(event.target.value)}
            />
          </label>
          <button className="start" type="button" onClick={handleStart}>
            {error || "Start"}
          </button>
        </form>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
