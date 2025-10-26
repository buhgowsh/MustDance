// src/screens/Results.jsx
export default function Results({ score, onHome }) {
  // Accept either a number or the richer object from Play
  const s = typeof score === "object" && score !== null
    ? score
    : { score: score ?? 0, accuracy: 0, accuracySeries: [] };

  const avgAcc = Math.max(0, Math.min(100, Math.round(s.accuracy || 0)));
  const totalScore = Math.round(s.score || 0);

  // mini chart (green up, red down)
  const series = Array.isArray(s.accuracySeries) ? s.accuracySeries.slice(-600) : [];
  const W = 500, H = 140, pad = 10;
  const vals = series.map((d) => +d.a || 0);
  const toX = (i) => pad + (i * (W - 2 * pad)) / Math.max(1, series.length - 1);
  const toY = (v) => pad + (H - 2 * pad) * (1 - (v / 100));

  const pathUp = [];
  const pathDown = [];
  for (let i = 0; i < series.length; i++) {
    const x = toX(i);
    const y = toY(vals[i]);
    const prev = i > 0 ? vals[i - 1] : vals[i];
    (prev <= vals[i] ? pathUp : pathDown).push(`${i === 0 ? "M" : "L"}${x},${y}`);
  }

  return (
    <main className="relative min-h-screen bg-slate-950 text-white overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(1300px 800px at 0% 100%, rgba(56,189,248,0.25), transparent 60%)," +
            "radial-gradient(1200px 700px at 50% -10%, rgba(236,72,153,0.22), transparent 60%)",
        }}
      />
      <section className="mx-auto max-w-3xl px-6 py-12">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-[0_0_60px_rgba(236,72,153,0.12)]">
          <h2 className="text-2xl font-bold mb-1">Results</h2>
          <p className="text-white/70 mb-6">How you stacked up this round.</p>

          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="rounded-xl border border-white/10 bg-slate-900/40 p-4 text-center">
              <div className="text-xs uppercase tracking-wider text-white/60">Score</div>
              <div className="text-4xl font-extrabold text-emerald-400 mt-1">{totalScore}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-900/40 p-4 text-center">
              <div className="text-xs uppercase tracking-wider text-white/60">Avg Accuracy</div>
              <div className="text-4xl font-extrabold text-cyan-300 mt-1">{avgAcc}%</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-900/40 p-4 text-center">
              <div className="text-xs uppercase tracking-wider text-white/60">Frames</div>
              <div className="text-4xl font-extrabold text-fuchsia-300 mt-1">{series.length}</div>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-900/40 p-4">
            <div className="text-xs uppercase tracking-wider text-white/60 mb-2">Accuracy Over Time</div>
            <svg width={W} height={H} className="w-full h-[160px]">
              <defs>
                <linearGradient id="bggrad" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="rgba(56,189,248,0.24)" />
                  <stop offset="100%" stopColor="rgba(56,189,248,0.08)" />
                </linearGradient>
              </defs>
              <rect x="0" y="0" width={W} height={H} fill="url(#bggrad)" rx="8" />
              <line x1={pad} y1={toY(100)} x2={W - pad} y2={toY(100)} stroke="rgba(255,255,255,0.15)" />
              <line x1={pad} y1={toY(0)} x2={W - pad} y2={toY(0)} stroke="rgba(255,255,255,0.10)" />
              <path d={pathDown.join(" ")} stroke="#ef4444" strokeWidth="2.5" fill="none" />
              <path d={pathUp.join(" ")} stroke="#84cc16" strokeWidth="2.5" fill="none" />
            </svg>
          </div>

          <div className="mt-8 flex justify-center">
            <button className="px-4 py-2 rounded-lg border border-white/20 hover:bg-white/10 transition" onClick={onHome}>
              Back to Home
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
