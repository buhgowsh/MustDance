// src/screens/Play.jsx
import { useEffect, useRef, useState } from "react";
import { usePose } from "../pose/usePose";
import { scoreAngles } from "../pose/poseUtils";
import SongCard from "../components/SongCard";

// MediaPipe subset connections
const EDGES = [
  [11,12], [11,23], [12,24], [23,24],
  [11,13], [13,15],
  [12,14], [14,16],
  [23,25], [25,27],
  [24,26], [26,28],
];

// ---------- helpers to render the target "ghost" aligned to the user ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angleToBend = (deg) => (typeof deg !== "number" ? 0 : clamp((180 - deg) / 90, 0, 1));

function drawGhost(ctx, anchor, scale, angles) {
  // Base model geometry
  const hipGap = 38 * scale;
  const shoulderGapModel = 76;               // model shoulder gap (unscaled)
  const shoulderGap = shoulderGapModel * scale;

  const upperLeg = 70 * scale;
  const lowerLeg = 70 * scale;
  const upperArm = 60 * scale;
  const lowerArm = 60 * scale;

  const kL = angleToBend(angles?.leftKnee);
  const kR = angleToBend(angles?.rightKnee);
  const eL = angleToBend(angles?.leftElbow);
  const eR = angleToBend(angles?.rightElbow);

  // Place hips at anchor
  const hipL = { x: anchor.x - hipGap / 2, y: anchor.y };
  const hipR = { x: anchor.x + hipGap / 2, y: anchor.y };
  const shoulderY = anchor.y - 1.2 * upperLeg; // rough torso height
  const headY = shoulderY - 0.6 * upperLeg;

  const shL = { x: anchor.x - shoulderGap / 2, y: shoulderY };
  const shR = { x: anchor.x + shoulderGap / 2, y: shoulderY };
  const head = { x: anchor.x, y: headY };

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(56,189,248,0.75)"; // cyan
  ctx.lineWidth = 4;
  ctx.shadowColor = "rgba(56,189,248,0.45)";
  ctx.shadowBlur = 10;

  // Torso
  ctx.beginPath();
  ctx.moveTo(head.x, head.y);
  ctx.lineTo(anchor.x, shoulderY - 6);
  ctx.lineTo(anchor.x, anchor.y);
  ctx.stroke();

  // Shoulders / hips
  ctx.beginPath();
  ctx.moveTo(shL.x, shL.y); ctx.lineTo(shR.x, shR.y);
  ctx.moveTo(hipL.x, hipL.y); ctx.lineTo(hipR.x, hipR.y);
  ctx.stroke();

  // Arms
  const elL = { x: shL.x - upperArm, y: shL.y };
  const wristL = {
    x: elL.x - lowerArm * (1 - 0.15 * eL),
    y: elL.y + lowerArm * (0.55 + 0.45 * eL),
  };
  ctx.beginPath(); ctx.moveTo(shL.x, shL.y); ctx.lineTo(elL.x, elL.y); ctx.lineTo(wristL.x, wristL.y); ctx.stroke();

  const elR = { x: shR.x + upperArm, y: shR.y };
  const wristR = {
    x: elR.x + lowerArm * (1 - 0.15 * eR),
    y: elR.y + lowerArm * (0.55 + 0.45 * eR),
  };
  ctx.beginPath(); ctx.moveTo(shR.x, shR.y); ctx.lineTo(elR.x, elR.y); ctx.lineTo(wristR.x, wristR.y); ctx.stroke();

  // Legs
  const kneeForward = 34 * scale;
  const kneeL = { x: hipL.x + kneeForward * kL, y: hipL.y + upperLeg * (0.7 + 0.3 * (1 - kL)) };
  const ankleL = { x: kneeL.x, y: kneeL.y + lowerLeg };
  ctx.beginPath(); ctx.moveTo(hipL.x, hipL.y); ctx.lineTo(kneeL.x, kneeL.y); ctx.lineTo(ankleL.x, ankleL.y); ctx.stroke();

  const kneeR = { x: hipR.x + kneeForward * kR, y: hipR.y + upperLeg * (0.7 + 0.3 * (1 - kR)) };
  const ankleR = { x: kneeR.x, y: kneeR.y + lowerLeg };
  ctx.beginPath(); ctx.moveTo(hipR.x, hipR.y); ctx.lineTo(kneeR.x, kneeR.y); ctx.lineTo(ankleR.x, ankleR.y); ctx.stroke();
}

export default function Play({ selection, onFinish, onQuit }) {
  const camRef = useRef(null);
  const canvasRef = useRef(null);
  const [running, setRunning] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [stepTime, setStepTime] = useState(0);
  const [scoreTrail, setScoreTrail] = useState([]);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState("");

  // Webcam
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false
        });
        if (cancelled) return;
        const v = camRef.current;
        v.srcObject = s;
        v.addEventListener("loadedmetadata", () => {
          v.play().catch(()=>{});
          setReady(true);
        }, { once: true });
      } catch (e) {
        console.error(e);
        setErr(e?.message || String(e));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Live pose
  const { landmarks, angles } = usePose(camRef);

  // Timer
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setStepTime((t)=>t+0.1), 100);
    return () => clearInterval(id);
  }, [running]);

  // Advance steps / finish
  useEffect(() => {
    const step = selection.steps[stepIdx];
    if (!step) return;
    if (stepTime >= step.duration) {
      setStepTime(0);
      if (stepIdx + 1 < selection.steps.length) setStepIdx(stepIdx+1);
      else {
        setRunning(false);
        const avg = Math.round(scoreTrail.reduce((a,b)=>a+b,0)/Math.max(1,scoreTrail.length));
        onFinish(avg);
      }
    }
  }, [stepTime, stepIdx, selection, scoreTrail, onFinish]);

  // Draw webcam + user skeleton + TARGET ghost aligned to user
  useEffect(() => {
    if (!ready) return;
    const v = camRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let raf;

    const draw = () => {
      if (v.readyState >= 2 && v.videoWidth && v.videoHeight) {
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;

        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);

        const currentStep = selection.steps[stepIdx];
        let stepScore = 0;
        if (angles && currentStep?.targetAngles) {
          stepScore = scoreAngles(angles, currentStep.targetAngles);
          setScoreTrail((arr)=> (arr.length>200?arr.slice(1):arr).concat(stepScore));
        }

        // HUD
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.fillRect(0,0,canvas.width,60);
        ctx.fillStyle = "#fff";
        ctx.font = "18px system-ui, sans-serif";
        ctx.fillText(`Step: ${currentStep?.label ?? "-"}`, 16, 24);
        ctx.fillText(`Score: ${stepScore}`, 16, 48);

        // Progress
        const prog = Math.min(1, stepTime/(currentStep?.duration??1));
        ctx.fillStyle = "#10b981";
        ctx.fillRect(0, canvas.height-6, prog*canvas.width, 6);

        // --- draw live skeleton (as before)
        if (landmarks?.length) {
          ctx.lineWidth = 3;
          ctx.strokeStyle = "#38bdf8";
          ctx.fillStyle = "#f59e0b";
          ctx.beginPath();
          for (const [a,b] of EDGES) {
            const pa = landmarks[a], pb = landmarks[b];
            if (!pa || !pb) continue;
            ctx.moveTo(pa.x * canvas.width,  pa.y * canvas.height);
            ctx.lineTo(pb.x * canvas.width,  pb.y * canvas.height);
          }
          ctx.stroke();

          const JOINTS = [11,12,13,14,15,16,23,24,25,26,27,28];
          for (const i of JOINTS) {
            const p = landmarks[i];
            if (!p) continue;
            ctx.beginPath();
            ctx.arc(p.x * canvas.width, p.y * canvas.height, 5, 0, Math.PI*2);
            ctx.fill();
          }

          // --- TARGET GHOST: follow user's body (anchor + scale per frame)
          const LSH = landmarks[11], RSH = landmarks[12];
          const LHIP = landmarks[23], RHIP = landmarks[24];
          if (LSH && RSH && LHIP && RHIP && currentStep?.targetAngles) {
            const shoulderGapPx =
              Math.hypot((RSH.x-LSH.x)*canvas.width, (RSH.y-LSH.y)*canvas.height);
            const anchor = {
              x: ((LHIP.x + RHIP.x) / 2) * canvas.width,
              y: ((LHIP.y + RHIP.y) / 2) * canvas.height,
            };
            // Model shoulder gap was ~76; derive scale from the user's actual width
            const scale = clamp(shoulderGapPx / 76, 0.5, 2.2);
            drawGhost(ctx, anchor, scale, currentStep.targetAngles);
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [ready, landmarks, angles, stepIdx, stepTime, selection]);

  return (
    <main className="relative min-h-screen bg-slate-950 text-white overflow-hidden">
      {/* Target-pose card (shows current step’s pose) */}
      <div className="absolute left-6 top-6 z-30">
        <SongCard
          title={selection?.title ?? "Selected Song"}
          bpm={selection?.bpm ?? 100}
          currentAngles={selection?.steps?.[stepIdx]?.targetAngles}
        />
      </div>

      {/* Camera centered */}
      <div className="max-w-[1100px] mx-auto pt-28 pb-24">
        <div className="relative">
          <video ref={camRef} className="hidden" playsInline autoPlay muted />
          <canvas
            ref={canvasRef}
            className="w-full rounded-2xl border border-slate-800 shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
          />
        </div>

        <div className="mt-6 flex gap-3">
          {!running ? (
            <button
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 transition"
              onClick={()=>{ setRunning(true); setStepIdx(0); setStepTime(0); setScoreTrail([]); }}
            >
              Start
            </button>
          ) : (
            <button
              className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 transition"
              onClick={()=>{ setRunning(false); onQuit(); }}
            >
              Quit
            </button>
          )}
        </div>

        {err && <div className="mt-3 text-rose-400">Camera error: {err}</div>}
      </div>
    </main>
  );
}
