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

function getTargetLanguage() {
  const params = new URLSearchParams(window.location.search);
  return params.get("to") || params.get("target") || params.get("lang") || "English";
}

function getWordCount(defaultValue, ...names) {
  const params = new URLSearchParams(window.location.search);

  for (const name of names) {
    const raw = params.get(name);

    if (raw === null) {
      continue;
    }

    const parsed = Number.parseInt(raw, 10);

    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  return defaultValue;
}

function App() {
  const [committedText, setCommittedText] = useState("");
  const [committedTranslation, setCommittedTranslation] = useState("");
  const [partialTranslation, setPartialTranslation] = useState("");
  const [error, setError] = useState("");
  const [targetLanguage, setTargetLanguage] = useState(getTargetLanguage);
  const [transcriptWordCount, setTranscriptWordCount] = useState(() => getWordCount(0, "transcriptWords", "sourceWords"));
  const [translationWordCount, setTranslationWordCount] = useState(() =>
    getWordCount(30, "translationWords", "translatedWords"),
  );
  const committedTextRef = useRef("");
  const committedTranslationRef = useRef("");
  const partialTimerRef = useRef(null);
  const translationSequenceRef = useRef(0);
  const latestRenderedTranslationRef = useRef(0);

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

  async function translateText({ text, mode }) {
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
        stableTranslation: committedTranslationRef.current,
      }),
    });

    if (!response.ok) {
      throw new Error("Translation failed");
    }

    const data = await response.json();
    return data.translation || "";
  }

  async function translateLatest({ text, mode }) {
    const source = text.trim();

    if (!source) {
      return;
    }

    const sequence = translationSequenceRef.current + 1;
    translationSequenceRef.current = sequence;

    try {
      const translation = await translateText({ text: source, mode });

      if (sequence < latestRenderedTranslationRef.current) {
        return;
      }

      latestRenderedTranslationRef.current = sequence;
      if (mode === "committed") {
        committedTranslationRef.current = translation;
        setCommittedTranslation(translation);
      }
      setPartialTranslation(translation);
    } catch (err) {
      console.warn(`${mode} translation failed:`, err);
    }
  }

  function translatePartial(text) {
    const partial = text.trim();

    window.clearTimeout(partialTimerRef.current);

    if (!partial) {
      setPartialTranslation("");
      return;
    }

    partialTimerRef.current = window.setTimeout(() => {
      translateLatest({
        text: `${committedTextRef.current} ${partial}`.trim(),
        mode: "partial",
      });
    }, 220);
  }

  function translateCommitted(text) {
    const segment = text.trim();

    if (!segment) {
      return;
    }

    window.clearTimeout(partialTimerRef.current);

    translateLatest({
      text: committedTextRef.current,
      mode: "committed",
    });
  }

  const scribe = useScribe({
    modelId: "scribe_v2_realtime",
    onPartialTranscript: (data) => {
      translatePartial(data.text || "");
    },
    onCommittedTranscript: (data) => {
      const next = `${committedTextRef.current} ${data.text}`.trim();
      committedTextRef.current = next;
      setCommittedText(next);
      translateCommitted(data.text || "");
    },
    onError: (event) => {
      setError(event?.message || event?.error || "Transcription error");
    },
  });

  const visibleText = useMemo(() => {
    const partial = scribe.partialTranscript || "";
    return lastWords(`${committedText} ${partial}`, transcriptWordCount);
  }, [committedText, scribe.partialTranscript, transcriptWordCount]);

  const visibleTranslation = useMemo(() => {
    return lastWords(partialTranslation || committedTranslation, translationWordCount);
  }, [committedTranslation, partialTranslation, translationWordCount]);

  async function start() {
    setError("");
    setCommittedText("");
    setCommittedTranslation("");
    setPartialTranslation("");
    committedTextRef.current = "";
    committedTranslationRef.current = "";
    translationSequenceRef.current += 1;
    latestRenderedTranslationRef.current = translationSequenceRef.current;
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
          {transcriptWordCount > 0 ? <div className="words transcript">{visibleText || " "}</div> : null}
          {translationWordCount > 0 ? <div className="words translation">{visibleTranslation || " "}</div> : null}
        </div>
      ) : (
        <form className="settings" onSubmit={(event) => event.preventDefault()}>
          <label className="field">
            <span>Translate to</span>
            <input
              type="text"
              value={targetLanguage}
              autoCapitalize="words"
              autoComplete="off"
              onChange={(event) => setTargetLanguage(event.target.value)}
            />
          </label>
          <label className="field">
            <span>Transcript words</span>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              value={transcriptWordCount}
              onChange={(event) => setTranscriptWordCount(Math.max(0, Number.parseInt(event.target.value || "0", 10)))}
            />
          </label>
          <label className="field">
            <span>Translation words</span>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              value={translationWordCount}
              onChange={(event) => setTranslationWordCount(Math.max(0, Number.parseInt(event.target.value || "0", 10)))}
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
