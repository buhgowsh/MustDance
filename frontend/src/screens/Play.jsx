// src/screens/Play.jsx
import { useEffect, useRef, useState } from "react";
import MjpegViewer from "../components/MjpegViewer";

export default function Play({ selection, onFinish, onQuit }) {
  const [counting, setCounting] = useState(false);
  const [count, setCount] = useState(3);
  const [running, setRunning] = useState(false);

  // live metrics from SSE
  const [accuracy, setAccuracy] = useState(0);
  const [score, setScore] = useState(0);

  // client averages + series for Results
  const [accSum, setAccSum] = useState(0);
  const [accFrames, setAccFrames] = useState(0);
  const accSeriesRef = useRef([]);

  const esRef = useRef(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 30);
    return () => clearTimeout(t);
  }, []);

  // 3-sec countdown → start server play + metrics
  useEffect(() => {
    if (!counting) return;
    setCount(3);

    const id = setInterval(() => {
      setCount((c) => {
        if (c <= 1) {
          clearInterval(id);
          setCounting(false);

          // kick off the backend playback AFTER the countdown
          fetch("http://localhost:8000/control?play=1").catch(() => {});
          setRunning(true);

          // start metrics stream (SSE)
          if (!esRef.current) {
            const es = new EventSource("http://localhost:8000/metrics");
            es.onmessage = (e) => {
              try {
                const d = JSON.parse(e.data || "{}");
                const a = Number.isFinite(d.accuracy) ? d.accuracy : 0;
                const s = Number.isFinite(d.score) ? d.score : 0;
                setAccuracy(a);
                setScore(s);
                setAccSum((p) => p + a);
                setAccFrames((p) => p + 1);
                accSeriesRef.current.push({ t: Date.now(), a });
                if (accSeriesRef.current.length > 7200) accSeriesRef.current.shift(); // ~2min @60fps
              } catch {}
            };
            es.onerror = () => {
              es.close();
              esRef.current = null;
            };
            esRef.current = es;
          }
          return 0;
        }
        return c - 1;
      });
    }, 1000);

    return () => clearInterval(id);
  }, [counting]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      try { fetch("http://localhost:8000/control?play=0"); } catch {}
      if (esRef.current) { esRef.current.close(); esRef.current = null; }
    };
  }, []);

  const handleStart = () => {
    // reset both client & server
    fetch("http://localhost:8000/control?play=0").finally(() => {
      setAccuracy(0); setScore(0);
      setAccSum(0); setAccFrames(0);
      accSeriesRef.current = [];
      setCounting(true);
    });
  };

  const handleQuit = () => {
    fetch("http://localhost:8000/control?play=0").catch(() => {});
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
    const avgAccuracy = accFrames > 0 ? accSum / accFrames : 0;
    setRunning(false);
    onFinish?.({
      score: Math.round(score),
      accuracy: Math.round(avgAccuracy),
      accuracySeries: accSeriesRef.current.slice(),
    });
  };

  return (
    <main className="relative min-h-screen bg-slate-950 text-white overflow-hidden">
      {/* ambient vibe */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 transition-opacity duration-500"
        style={{
          background:
            "radial-gradient(1300px 800px at 0% 100%, rgba(56,189,248,0.25), transparent 60%)," +
            "radial-gradient(1200px 700px at 50% -10%, rgba(236,72,153,0.22), transparent 60%)",
          opacity: mounted ? 1 : 0,
        }}
      />

      {/* top bar */}
      <div className="sticky top-0 z-10 backdrop-blur border-b border-white/10 bg-white/5">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-pink-500 to-sky-400 shadow" />
            <div className="leading-tight">
              <div className="text-xs uppercase tracking-widest text-white/70">Play</div>
              <div className="font-semibold">
                {selection?.title || "Dance"}{" "}
                <span className="text-white/70">•</span>{" "}
                <span className="text-white/80">BPM {selection?.bpm ?? "-"}</span>
              </div>
            </div>
          </div>

          {/* live stat pills */}
          <div className="flex items-center gap-3">
            <div className="px-3 py-1 rounded-md border border-white/15 bg-white/10 text-sm transition-all duration-200">
              Acc: <span className="font-semibold">{accuracy.toFixed(1)}%</span>
            </div>
            <div className="px-3 py-1 rounded-md border border-white/15 bg-white/10 text-sm">
              Score: <span className="font-semibold">{score.toFixed(1)}</span>
            </div>
            <button
              onClick={() => { handleQuit(); onQuit?.(); }}
              className="px-3 py-1.5 rounded-md border border-white/20 hover:bg-white/10 transition"
            >
              ← Home
            </button>
          </div>
        </div>
      </div>

      {/* body */}
      <section className="mx-auto max-w-7xl px-6 py-8 grid grid-cols-[360px_1fr] gap-8 items-start">
        {/* Coach (smaller; subtle slide in) */}
        <div
          className={`rounded-2xl border border-white/10 bg-white/5 overflow-hidden shadow-[0_0_60px_rgba(236,72,153,0.18)] transform transition duration-500
          ${mounted ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4"}`}
        >
          <div className="px-4 py-3 text-xs tracking-wider uppercase text-white/70">Coach</div>
          <MjpegViewer
            src="http://localhost:8000/video_ref"
            className="w-full h-[460px] object-cover bg-black"
            alt="reference"
          />
          <div className="px-4 py-3 text-xs text-white/70 border-t border-white/10">
            {selection?.title || "Dance"} • BPM {selection?.bpm ?? "-"}
          </div>
        </div>

        {/* Live camera (same height as coach) */}
        <div
          className={`relative rounded-2xl border border-white/10 bg-white/5 overflow-hidden shadow-[0_0_60px_rgba(34,211,238,0.18)] flex items-center justify-center transform transition duration-500
          ${mounted ? "opacity-100 translate-x-0" : "opacity-0 translate-x-4"}`}
        >
          <MjpegViewer
            src="http://localhost:8000/video_live"
            className="h-[460px] w-full max-w-[1200px] object-contain bg-black"
            alt="live"
          />

          {/* countdown overlay */}
          {counting && (
            <div className="absolute inset-0 grid place-items-center bg-black/40 backdrop-blur-sm">
              <div className="text-8xl font-extrabold tracking-widest animate-pulse scale-110">
                {count || "GO!"}
              </div>
            </div>
          )}

          {/* CTA */}
          <div className="absolute right-5 bottom-5 flex items-center gap-3">
            {!running ? (
              <button
                className="px-5 py-2 rounded-xl border border-emerald-300/30 bg-emerald-400/10 hover:bg-emerald-400/20 shadow transition"
                onClick={handleStart}
              >
                Start
              </button>
            ) : (
              <button
                className="px-5 py-2 rounded-xl border border-rose-300/30 bg-rose-400/10 hover:bg-rose-400/20 shadow transition"
                onClick={handleQuit}
              >
                Quit
              </button>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
