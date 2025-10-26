// src/screens/Home.jsx
import { useEffect, useRef, useState } from "react";
import { getDanceConfig } from "../services/danceService";
import { useAuth0 } from "@auth0/auth0-react";

/* -------------------- RIGHT COLUMN: FULL-HEIGHT VISUALIZER -------------------- */
function RightColumnVisualizer({ src, playing, onEnded }) {
  const canvasRef = useRef(null);
  const audioRef = useRef(null);

  // Audio nodes/flags
  const acRef = useRef(null);
  const analyserRef = useRef(null);
  const dataRef = useRef(null);
  const sourceRef = useRef(null);
  const unlockedRef = useRef(false);   // user-gesture unlock happened
  const rafRef = useRef(0);            // for cleanup
  const playingRef = useRef(playing);  // track prop across handlers
  const initOnceRef = useRef(false);   // block duplicate handler wiring

  useEffect(() => { playingRef.current = playing; }, [playing]);

  // --- draw loop ---
  useEffect(() => {
    let t = 0;
    const c = canvasRef.current;
    const ctx = c.getContext("2d");

    const draw = () => {
      const W = (c.width = c.clientWidth);
      const H = (c.height = c.clientHeight);
      ctx.clearRect(0, 0, W, H);

      const analyser = analyserRef.current;
      const fft = dataRef.current;

      const rows = Math.min(160, Math.floor(H / 6));
      const step = H / rows;
      const lengths = new Array(rows);

      ctx.save();
      ctx.translate(W, H);
      ctx.scale(-1, -1);

      if (analyser && fft) {
        analyser.getByteFrequencyData(fft);
      }

      for (let i = 0; i < rows; i++) {
        const LOG_EXP = 0.55;
        const SMOOTH_NEIGH_BINS = 2;
        const HI_TILT = 1.05;

        let lively;
        if (fft && analyser) {
          const N = fft.length;
          const rNorm = i / (rows - 1 || 1);
          const idxFrac = Math.pow(rNorm, LOG_EXP);
          const idx = Math.min(N - 1, Math.floor(idxFrac * (N - 1)));

          let sum = 0, count = 0;
          for (let k = -SMOOTH_NEIGH_BINS; k <= SMOOTH_NEIGH_BINS; k++) {
            const j = Math.min(N - 1, Math.max(0, idx + k));
            sum += fft[j];
            count++;
          }
          let mag = (sum / count) / 255;
          const hiFactor = Math.pow(idx / (N - 1 || 1), HI_TILT);
          mag *= 0.8 + 0.7 * hiFactor;
          const floor = 0.06 + 0.05 * rNorm;
          lively = Math.min(1, Math.pow(Math.max(0, mag) + floor, 0.85));
        } else {
          // shimmer while locked / before analyser exists
          lively = 0.35 + 0.25 * Math.sin(t * 0.025 + i * 0.25);
        }

        const len = Math.max(W * 0.02, lively * (W * 0.98));
        lengths[i] = len;
      }

      // simple vertical smoothing
      const K = 2;
      for (let i = 0; i < rows; i++) {
        let sum = 0, cnt = 0;
        for (let k = -K; k <= K; k++) {
          const j = Math.min(rows - 1, Math.max(0, i + k));
          sum += lengths[j];
          cnt++;
        }
        const len = sum / cnt;
        const y = i * step;

        const grad = ctx.createLinearGradient(0, y, len, y);
        grad.addColorStop(0, "rgba(34,211,238,0.95)");
        grad.addColorStop(0.5, "rgba(168,85,247,0.92)");
        grad.addColorStop(1, "rgba(236,72,153,0.92)");
        ctx.fillStyle = grad;
        ctx.shadowColor = "rgba(56,189,248,0.65)";
        ctx.shadowBlur = 14;
        ctx.fillRect(0, y, len, step);
      }

      ctx.restore();

      // horizon
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(16,185,129,0.5)";
      ctx.fillRect(0, H - 3, W, 2);

      t++;
      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // Ensure AudioContext & graph exist (idempotent)
  const ensureAudioGraph = async () => {
    const a = audioRef.current;
    if (!a) return;

    // Create AudioContext lazily so StrictMode fake-mount cleanup doesn't kill it.
    if (!acRef.current) {
      const AC = window.AudioContext || window.webkitAudioContext;
      acRef.current = new AC();
    }
    const ac = acRef.current;

    // Build graph once
    if (!sourceRef.current || !analyserRef.current || !dataRef.current) {
      const node = ac.createMediaElementSource(a);
      const analyser = ac.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.6;
      analyser.minDecibels = -95;
      analyser.maxDecibels = -10;

      node.connect(analyser);
      analyser.connect(ac.destination);

      sourceRef.current = node;
      analyserRef.current = analyser;
      dataRef.current = new Uint8Array(analyser.frequencyBinCount);
    }

    // Set basic attrs once
    a.crossOrigin = "anonymous";
    a.playsInline = true;
    a.preload = "auto";

    // Wire handlers once
    if (!initOnceRef.current) {
      initOnceRef.current = true;

      // Unlock on first user gesture
      const unlock = async () => {
        try {
          if (acRef.current?.state === "suspended") await acRef.current.resume();
          a.muted = false;
          unlockedRef.current = true;
          if (playingRef.current) {
            try { await a.play(); } catch {}
          }
        } catch {}
        window.removeEventListener("pointerdown", unlock);
      };
      window.addEventListener("pointerdown", unlock, { once: true });

      // Tab visibility
      const onVis = async () => {
        if (!acRef.current) return;
        try {
          if (document.visibilityState === "visible") {
            if (acRef.current.state === "suspended") await acRef.current.resume();
            if (playingRef.current && unlockedRef.current) {
              try { await a.play(); } catch {}
            }
          } else {
            // Suspend to play nice with browsers and battery
            await acRef.current.suspend();
          }
        } catch {}
      };
      document.addEventListener("visibilitychange", onVis);

      // auto-advance if desired
      if (onEnded) {
        a.addEventListener("ended", onEnded);
      }

      // cleanup (do NOT close the AudioContext—just unhook listeners)
      return () => {
        window.removeEventListener("pointerdown", unlock);
        document.removeEventListener("visibilitychange", onVis);
        if (onEnded) a.removeEventListener("ended", onEnded);
      };
    }
  };

  // React to src / playing changes
  useEffect(() => {
    let cancelled = false;
    const apply = async () => {
      const a = audioRef.current;
      if (!a) return;

      await ensureAudioGraph();

      // resume the context if autopause happened
      try {
        if (acRef.current?.state === "suspended") await acRef.current.resume();
      } catch {}

      // set new src only when it truly changed
      if (src && a.dataset.src !== src) {
        a.pause();
        a.currentTime = 0;
        a.dataset.src = src;
        a.src = src;

        await new Promise((res) => {
          const onReady = () => { a.removeEventListener("canplay", onReady); res(); };
          a.addEventListener("canplay", onReady, { once: true });
          if (a.readyState >= 2) {
            a.removeEventListener("canplay", onReady);
            res();
          }
        });
      }

      if (cancelled) return;

      if (playing) {
        // Autoplay policy: keep muted until unlocked
        if (!unlockedRef.current) a.muted = true;
        try { await a.play(); } catch {}
      } else {
        a.pause();
      }
    };

    apply();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, playing]);

  // DO NOT tear down the audio context graph on unmount in dev (StrictMode double-mount).
  // If you really need to free resources on a real page change, you can listen to
  // a route-unload signal and close there.

  return (
    <div className="relative h-full w-full">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />
      <audio ref={audioRef} />
    </div>
  );
}

/* -------------------- LEFT ANGLED MENU STRIP -------------------- */
function DiagonalMenu({ children }) {
  const { isAuthenticated, user } = useAuth0();

  return (
    <div className="relative h-full w-600px">
      {/* angled gradient panel */}
      <div
        className="absolute -left-30 top-0 bottom-0 rounded-[18px] bg-gradient-to-b from-pink-500 via-rose-500 to-fuchsia-500 shadow-[0_0_100px_rgba(236,72,153,0.5)]"
        style={{ width: 600, transform: "skewX(-12deg)" }}
      />
      {/* content */}
      <div className="absolute inset-0 top-20" style={{ transform: "skewX(-12deg)" }}>
        <div className="pl-25 pr-6 flex flex-col items-start gap-6 w-[340px]">
          {/* Logo */}
          <div className="mb-4 w-full flex justify-center">
            <div className="w-40 h-40 bg-white/20 rounded-full flex items-center justify-center shadow-lg border border-white/30">
              <span className="text-3xl font-bold text-white tracking-wide">LOGO</span>
            </div>
          </div>

          {children}

          {/* Profile block (bottom-left) */}
          {isAuthenticated && (
            <div className="mt-10 flex items-center gap-3 bg-white/12 border border-white/20 rounded-xl px-3 py-2 shadow backdrop-blur">
              <img
                src={user?.picture}
                alt={user?.name || "Profile"}
                className="w-9 h-9 rounded-full border border-white/30 object-cover"
                referrerPolicy="no-referrer"
              />
              <div className="leading-tight">
                <div className="text-sm font-semibold">{user?.name}</div>
                <div className="text-xs text-white/70">{user?.email}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MenuButton({ children, onClick, active }) {
  return (
    <button
      onClick={onClick}
      className={[
        "text-left px-15 py-6 rounded-lg border font-semibold tracking-wide transition shadow",
        active
          ? "bg-white/30 border-white/30 text-white"
          : "bg-white/12 hover:bg-white/16 border-white/20 text-white/90",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

/* -------------------- MAIN PAGE -------------------- */
export default function Home({ onStart }) {
  const { logout } = useAuth0();
  const [query, setQuery] = useState("salsa-basic");

  const playlist = [
    { name: "NacreousSnowmelt-Camellia", path: "/audio/sample1.mp3" },
    { name: "IRemember-deadmau5", path: "/audio/sample2.mp3" },
    { name: "Judas-LadyGaga", path: "/audio/sample3.mp3" },
    { name: "NewWave-SamGellaitry", path: "/audio/sample4.mp3" },
    { name: "NightofNights-COOL&CREATE", path: "/audio/sample5.mp3" },
  ];
  const [trackIdx, setTrackIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const currentTrack = playlist[trackIdx];

  const prevTrack = () => {
    setTrackIdx((i) => (i - 1 + playlist.length) % playlist.length);
    setIsPlaying(true);
  };
  const nextTrack = () => {
    setTrackIdx((i) => (i + 1) % playlist.length);
    setIsPlaying(true);
  };
  const togglePlay = () => setIsPlaying((p) => !p);

  const handleStart = async () =>
    onStart(await getDanceConfig(query.trim().toLowerCase()));

  const handleLogout = () =>
    logout({ logoutParams: { returnTo: window.location.origin } });

  // auto-advance handler for the audio element
  const handleEnded = () => nextTrack();

  return (
    <main className="relative h-[100vh] bg-slate-950 text-white overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(1300px 800px at 0% 100%, rgba(56,189,248,0.28), transparent 60%)," +
            "radial-gradient(1200px 700px at 50% -10%, rgba(236,72,153,0.24), transparent 60%)",
        }}
      />

      <section className="grid grid-cols-[420px_1fr_28%] h-[100vh]">
        {/* LEFT */}
        <div className="relative">
          <DiagonalMenu>
            <MenuButton active onClick={handleStart}>New Song</MenuButton>
            <MenuButton>Options</MenuButton>
            <MenuButton onClick={handleLogout}>Log out</MenuButton>
          </DiagonalMenu>
        </div>

        {/* CENTER spacer */}
        <div className="relative" />

        {/* RIGHT visualizer with now-playing controls */}
        <div className="relative overflow-hidden">
          <RightColumnVisualizer
            src={currentTrack.path}
            playing={isPlaying}
            onEnded={handleEnded}
          />

          {/* now playing pill + controls */}
          <div className="absolute right-6 bottom-6 flex items-center gap-3 rounded-md bg-white/15 border border-white/20 px-3 py-2 text-sm backdrop-blur">
            <span className="opacity-80">now playing:</span>
            <span className="font-semibold">{currentTrack.name}</span>
            <div className="flex items-center gap-2 pl-2">
              <button
                onClick={prevTrack}
                className="px-2 py-1 rounded border border-white/20 hover:bg-white/10"
                title="Previous"
              >
                ◀
              </button>
              <button
                onClick={togglePlay}
                className="px-2 py-1 rounded border border-white/20 hover:bg-white/10"
                title={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? "⏸" : "▶"}
              </button>
              <button
                onClick={nextTrack}
                className="px-2 py-1 rounded border border-white/20 hover:bg-white/10"
                title="Next"
              >
                ▶
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className="absolute left-6 bottom-4 text-xs text-white/70">
        knighthacks VII 2025
      </div>
    </main>
  );
}
