import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { CommitStrategy, useScribe } from "@elevenlabs/react";
import "./styles.css";

const SCRIPT_BY_LANGUAGE = {
  English: "Latin",
  Hindi: "Devanagari",
  Russian: "Cyrillic",
  Ukrainian: "Cyrillic",
  Bulgarian: "Cyrillic",
  Serbian: "Cyrillic",
  Arabic: "Arabic",
  Persian: "Arabic",
  Urdu: "Arabic",
  Chinese: "Han",
  Japanese: "Han",
  Korean: "Hangul",
};

const SCRIPT_PATTERNS = [
  ["Devanagari", /\p{Script=Devanagari}/u],
  ["Latin", /\p{Script=Latin}/u],
  ["Cyrillic", /\p{Script=Cyrillic}/u],
  ["Arabic", /\p{Script=Arabic}/u],
  ["Han", /\p{Script=Han}/u],
  ["Hangul", /\p{Script=Hangul}/u],
  ["Hebrew", /\p{Script=Hebrew}/u],
  ["Thai", /\p{Script=Thai}/u],
];

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

function normalizeLanguage(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (normalized === "en" || normalized === "eng" || normalized === "english") {
    return "English";
  }

  if (normalized === "hi" || normalized === "hin" || normalized === "hindi") {
    return "Hindi";
  }

  if (normalized === "ru" || normalized === "rus" || normalized === "russian") {
    return "Russian";
  }

  return "";
}

function parseLanguagePair(value) {
  const parts = String(value || "")
    .split(/\s*(?:\/|,|->|→|\bto\b|-)\s*/i)
    .map(normalizeLanguage)
    .filter(Boolean);

  if (parts.length >= 2) {
    return [parts[0], parts[1]];
  }

  return ["English", "Hindi"];
}

function detectDominantScript(text) {
  const counts = new Map();

  for (const char of text) {
    for (const [script, pattern] of SCRIPT_PATTERNS) {
      if (pattern.test(char)) {
        counts.set(script, (counts.get(script) || 0) + 1);
        break;
      }
    }
  }

  let bestScript = "";
  let bestCount = 0;

  for (const [script, count] of counts) {
    if (count > bestCount) {
      bestScript = script;
      bestCount = count;
    }
  }

  return bestScript;
}

function detectLanguageByScript(text, pair) {
  const script = detectDominantScript(text);

  if (!script) {
    return "";
  }

  return pair.find((language) => SCRIPT_BY_LANGUAGE[language] === script) || "";
}

function oppositeLanguage(language, pair) {
  return language === pair[0] ? pair[1] : pair[0];
}

function App() {
  const [languagePair, setLanguagePair] = useState(getLanguagePair);
  const [displayText, setDisplayText] = useState("");
  const [error, setError] = useState("");
  const parsedLanguagePair = useMemo(() => parseLanguagePair(languagePair), [languagePair]);
  const currentSegmentRef = useRef(0);
  const nextPartialStartsSegmentRef = useRef(false);
  const latestPartialOrderRef = useRef(0);
  const displayedPartialOrderRef = useRef(0);

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

  async function translatePartial({ text, sourceLanguage, targetLanguage, segment, order }) {
    try {
      const response = await fetch("/translate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          sourceLanguage,
          targetLanguage,
        }),
      });

      if (!response.ok) {
        throw new Error("Translation failed");
      }

      const data = await response.json();

      if (segment !== currentSegmentRef.current || order <= displayedPartialOrderRef.current) {
        return;
      }

      displayedPartialOrderRef.current = order;
      setDisplayText(data.translation || "");
    } catch (err) {
      console.warn("Partial translation failed:", err);
    }
  }

  function handlePartialTranscript(data) {
    const text = (data.text || "").trim();

    if (!text) {
      return;
    }

    if (nextPartialStartsSegmentRef.current) {
      currentSegmentRef.current += 1;
      latestPartialOrderRef.current = 0;
      displayedPartialOrderRef.current = 0;
      nextPartialStartsSegmentRef.current = false;
    }

    const order = latestPartialOrderRef.current + 1;
    latestPartialOrderRef.current = order;

    const sourceLanguage = detectLanguageByScript(text, parsedLanguagePair);

    if (!sourceLanguage) {
      if (order > displayedPartialOrderRef.current) {
        displayedPartialOrderRef.current = order;
        setDisplayText("???");
      }
      return;
    }

    const targetLanguage = oppositeLanguage(sourceLanguage, parsedLanguagePair);

    translatePartial({
      text,
      sourceLanguage,
      targetLanguage,
      segment: currentSegmentRef.current,
      order,
    });
  }

  function handleCommittedTranscript() {
    nextPartialStartsSegmentRef.current = true;
  }

  const scribe = useScribe({
    modelId: "scribe_v2_realtime",
    commitStrategy: CommitStrategy.VAD,
    onPartialTranscript: handlePartialTranscript,
    onCommittedTranscript: handleCommittedTranscript,
    onError: (event) => {
      setError(event?.message || event?.error || "Transcription error");
    },
  });

  const visibleText = useMemo(() => {
    return lastWords(displayText, 30);
  }, [displayText]);

  async function start() {
    setError("");
    setDisplayText("");
    currentSegmentRef.current = 0;
    nextPartialStartsSegmentRef.current = false;
    latestPartialOrderRef.current = 0;
    displayedPartialOrderRef.current = 0;

    const response = await fetch("/scribe-token");
    if (!response.ok) {
      throw new Error("Could not create Scribe token");
    }

    const tokenResponse = await response.json();
    const token = tokenResponse.token || tokenResponse;

    await scribe.connect({
      token,
      commitStrategy: CommitStrategy.VAD,
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
        <div className="caption" aria-live="polite">
          {visibleText || " "}
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
          <p className="setup-note">Recommended: Hold phone horizontally. Add to Home Screen for fullscreen mode</p>
        </form>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
