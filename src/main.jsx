import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { useScribe } from "@elevenlabs/react";
import "./styles.css";

function lastFiveWords(text) {
  const normalized = text.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return "";
  }

  if (typeof Intl?.Segmenter !== "function") {
    return normalized.split(" ").filter(Boolean).slice(-5).join(" ");
  }

  const segments = Array.from(new Intl.Segmenter(undefined, { granularity: "word" }).segment(normalized));
  let wordsSeen = 0;
  let startIndex = segments.length;

  for (let i = segments.length - 1; i >= 0; i -= 1) {
    if (segments[i].isWordLike) {
      wordsSeen += 1;
    }

    startIndex = i;

    if (wordsSeen === 5) {
      break;
    }
  }

  return segments
    .slice(startIndex)
    .map((segment) => segment.segment)
    .join("")
    .trim();
}

function isIosSafari() {
  const ua = window.navigator.userAgent;
  const isiOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return isiOS && isSafari;
}

function isStandalone() {
  return window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
}

function nudgeIosFullscreen() {
  if (!isIosSafari() || isStandalone()) {
    return;
  }

  requestAnimationFrame(() => {
    window.scrollTo({ top: 80, left: 0, behavior: "instant" });
  });
}

function App() {
  const [committedText, setCommittedText] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    function syncViewportSize() {
      const viewport = window.visualViewport;
      const width = viewport?.width || window.innerWidth;
      const height = viewport?.height || window.innerHeight;
      document.documentElement.style.setProperty("--app-width", `${width}px`);
      document.documentElement.style.setProperty("--app-height", `${height}px`);
    }

    syncViewportSize();
    nudgeIosFullscreen();

    window.addEventListener("resize", syncViewportSize);
    window.addEventListener("orientationchange", nudgeIosFullscreen);
    window.visualViewport?.addEventListener("resize", syncViewportSize);

    return () => {
      window.removeEventListener("resize", syncViewportSize);
      window.removeEventListener("orientationchange", nudgeIosFullscreen);
      window.visualViewport?.removeEventListener("resize", syncViewportSize);
    };
  }, []);

  const scribe = useScribe({
    modelId: "scribe_v2_realtime",
    onCommittedTranscript: (data) => {
      setCommittedText((current) => `${current} ${data.text}`.trim());
    },
    onError: (event) => {
      setError(event?.message || event?.error || "Transcription error");
    },
  });

  const visibleText = useMemo(() => {
    const partial = scribe.partialTranscript || "";
    return lastFiveWords(`${committedText} ${partial}`);
  }, [committedText, scribe.partialTranscript]);

  async function start() {
    setError("");
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
      nudgeIosFullscreen();
      await start();
    } catch (err) {
      setError(err.message || "Could not start transcription");
    }
  }

  return (
    <main className="screen" onPointerDown={nudgeIosFullscreen} onDoubleClick={() => scribe.disconnect()}>
      {scribe.isConnected ? (
        <div className="words" aria-live="polite">
          {visibleText || " "}
        </div>
      ) : (
        <button className="start" type="button" onClick={handleStart}>
          {error || "Start"}
        </button>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
