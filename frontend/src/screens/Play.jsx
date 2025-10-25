// src/screens/Play.jsx
import { useEffect, useRef, useState } from "react";
import { usePose } from "../pose/usePose";
import { scoreAngles } from "../pose/poseUtils";

// Simple skeleton connections (subset of MediaPipe body graph)
const EDGES = [
  // torso
  [11,12], [11,23], [12,24], [23,24],
  // left arm
  [11,13], [13,15],
  // right arm
  [12,14], [14,16],
  // left leg
  [23,25], [25,27],
  // right leg
  [24,26], [26,28],
];

export default function Play({ selection, onFinish, onQuit }) {
  const camRef = useRef(null);      // hidden webcam <video>
  const canvasRef = useRef(null);   // visible overlay <canvas>
  const [running, setRunning] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [stepTime, setStepTime] = useState(0);
  const [scoreTrail, setScoreTrail] = useState([]);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState("");

  // Start webcam (hidden <video> used only as a source)
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

  // Pose from webcam (landmarks + angles)
  const { landmarks, angles } = usePose(camRef);

  // Step timer
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setStepTime((t)=>t+0.1), 100);
    return () => clearInterval(id);
  }, [running]);

  // Advance to next step or finish
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

  // Draw pipeline: video → canvas; then HUD; then skeleton
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

        // 1) draw the webcam frame
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);

        // 2) compute per-frame score (from angles vs target)
        const currentStep = selection.steps[stepIdx];
        let stepScore = 0;
        if (angles && currentStep?.targetAngles) {
          stepScore = scoreAngles(angles, currentStep.targetAngles);
          // keep last ~200 points
          setScoreTrail((arr)=> (arr.length>200?arr.slice(1):arr).concat(stepScore));
        }

        // 3) HUD
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.fillRect(0,0,canvas.width,60);
        ctx.fillStyle = "#fff";
        ctx.font = "18px system-ui, sans-serif";
        ctx.fillText(`Step: ${currentStep?.label ?? "-"}`, 16, 24);
        ctx.fillText(`Score: ${stepScore}`, 16, 48);

        // progress bar
        const prog = Math.min(1, stepTime/(currentStep?.duration??1));
        ctx.fillStyle = "#10b981";
        ctx.fillRect(0, canvas.height-6, prog*canvas.width, 6);

        // 4) skeleton overlay (from the same landmarks used for scoring)
        if (landmarks?.length) {
          ctx.lineWidth = 3;
          ctx.strokeStyle = "#38bdf8"; // cyan-ish
          ctx.fillStyle = "#f59e0b";   // amber joints

          // draw bones
          ctx.beginPath();
          for (const [a,b] of EDGES) {
            const pa = landmarks[a], pb = landmarks[b];
            if (!pa || !pb) continue;
            ctx.moveTo(pa.x * canvas.width,  pa.y * canvas.height);
            ctx.lineTo(pb.x * canvas.width,  pb.y * canvas.height);
          }
          ctx.stroke();

          // draw joints (subset for clarity)
          const JOINTS = [11,12,13,14,15,16,23,24,25,26,27,28];
          for (const i of JOINTS) {
            const p = landmarks[i];
            if (!p) continue;
            ctx.beginPath();
            ctx.arc(p.x * canvas.width, p.y * canvas.height, 5, 0, Math.PI*2);
            ctx.fill();
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [ready, landmarks, angles, stepIdx, stepTime, selection]);

  return (
    <main className="max-w-5xl mx-auto p-4">
      {err && <div className="text-red-400 mb-2">Camera error: {err}</div>}

      <div className="relative">
        {/* Hidden: used only as a frame source so video never appears twice */}
        <video ref={camRef} className="hidden" playsInline autoPlay muted />
        {/* Visible: single canvas shows webcam + HUD + skeleton */}
        <canvas ref={canvasRef} className="w-full rounded border border-slate-800" />
      </div>

      <div className="mt-4 flex gap-2">
        {!running ? (
          <button className="btn" onClick={()=>{ setRunning(true); setStepIdx(0); setStepTime(0); setScoreTrail([]); }}>
            Start
          </button>
        ) : (
          <button className="btn bg-rose-600 hover:bg-rose-700" onClick={()=>{ setRunning(false); onQuit(); }}>
            Quit
          </button>
        )}
      </div>
    </main>
  );
}
