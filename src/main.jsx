import React, { useEffect, useRef, useState } from "react";
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

const LANGUAGE_PAIR_OPTIONS = ["English/Hindi", "English/Russian"];

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

function normalizeLanguagePairValue(value) {
  const parsed = parseLanguagePair(value);
  const normalized = parsed.join("/");
  return LANGUAGE_PAIR_OPTIONS.includes(normalized) ? normalized : LANGUAGE_PAIR_OPTIONS[0];
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
  const [languagePair, setLanguagePair] = useState(() => normalizeLanguagePairValue(getLanguagePair()));
  const [displayText, setDisplayText] = useState("");
  const [error, setError] = useState("");
  const [showSettings, setShowSettings] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [isWakeLockUnsupported, setIsWakeLockUnsupported] = useState(() => !("wakeLock" in navigator));
  const parsedLanguagePair = parseLanguagePair(languagePair);
  const conversationRef = useRef(0);
  const wakeLockRef = useRef(null);
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

  async function releaseWakeLock() {
    const wakeLock = wakeLockRef.current;
    wakeLockRef.current = null;

    if (!wakeLock) {
      return;
    }

    try {
      await wakeLock.release();
    } catch (err) {
      console.warn("Wake lock release failed:", err);
    }
  }

  async function requestWakeLock() {
    if (!("wakeLock" in navigator)) {
      setIsWakeLockUnsupported(true);
      return;
    }

    try {
      await releaseWakeLock();
      const wakeLock = await navigator.wakeLock.request("screen");
      wakeLockRef.current = wakeLock;
      setIsWakeLockUnsupported(false);
      wakeLock.addEventListener("release", () => {
        if (wakeLockRef.current === wakeLock) {
          wakeLockRef.current = null;
        }
      });
    } catch (err) {
      console.warn("Wake lock request failed:", err);
    }
  }

  function resetConversation() {
    const conversation = conversationRef.current + 1;
    conversationRef.current = conversation;
    void releaseWakeLock();
    setError("");
    setDisplayText("");
    currentSegmentRef.current = 0;
    nextPartialStartsSegmentRef.current = false;
    latestPartialOrderRef.current = 0;
    displayedPartialOrderRef.current = 0;
    return conversation;
  }

  async function translatePartial({ text, sourceLanguage, targetLanguage, conversation, segment, order }) {
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

      if (
        conversation !== conversationRef.current ||
        segment !== currentSegmentRef.current ||
        order <= displayedPartialOrderRef.current
      ) {
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
      conversation: conversationRef.current,
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

  useEffect(() => {
    function clearForLifecycleChange() {
      resetConversation();
      scribe.disconnect();
      setIsStarting(false);
      setShowSettings(true);
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        clearForLifecycleChange();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", clearForLifecycleChange);
    window.addEventListener("beforeunload", clearForLifecycleChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", clearForLifecycleChange);
      window.removeEventListener("beforeunload", clearForLifecycleChange);
    };
  }, [scribe]);

  async function start() {
    const conversation = resetConversation();

    const response = await fetch("/scribe-token");
    if (!response.ok) {
      throw new Error("Could not create Scribe token");
    }

    if (conversation !== conversationRef.current) {
      return;
    }

    const tokenResponse = await response.json();
    const token = tokenResponse.token || tokenResponse;

    if (conversation !== conversationRef.current) {
      return;
    }

    await scribe.connect({
      token,
      commitStrategy: CommitStrategy.VAD,
      microphone: {
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
    await requestWakeLock();

    if (conversation !== conversationRef.current) {
      scribe.disconnect();
      return;
    }

    setShowSettings(false);
  }

  async function handleStart() {
    if (isStarting) {
      return;
    }

    setIsStarting(true);
    try {
      await start();
    } catch (err) {
      setError(err.message || "Could not start transcription");
    } finally {
      setIsStarting(false);
    }
  }

  function handleSettings() {
    resetConversation();
    scribe.disconnect();
    setIsStarting(false);
    setShowSettings(true);
  }

  return (
    <main className="screen" onDoubleClick={handleSettings}>
      {scribe.isConnected && !showSettings ? (
        <>
          <button className="settings-button" type="button" onClick={handleSettings}>
            Settings
          </button>
          <div className="caption" aria-live="polite">
            {displayText || " "}
          </div>
        </>
      ) : (
        <form className="settings" onSubmit={(event) => event.preventDefault()}>
          <label className="field">
            <span>Language pair</span>
            <select
              value={languagePair}
              onChange={(event) => setLanguagePair(event.target.value)}
            >
              {LANGUAGE_PAIR_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <button className="start" type="button" onClick={handleStart} disabled={isStarting}>
            {error || (isStarting ? "Starting..." : "Start")}
          </button>
          <p className="setup-note">Recommended: Hold phone horizontally. Add to Home Screen for fullscreen mode</p>
          {isWakeLockUnsupported ? (
            <p className="setup-note">If the screen dims, disable Auto-Lock while using this app.</p>
          ) : null}
        </form>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
