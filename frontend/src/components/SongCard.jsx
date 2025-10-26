// src/components/SongCard.jsx
import { useEffect, useRef, useState } from "react";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

/** 180° (straight) -> 0 bend, 90° -> 1 bend */
function angleToBend(angleDeg) {
  if (typeof angleDeg !== "number") return 0;
  return clamp((180 - angleDeg) / 90, 0, 1);
}

/** Draw stick figure at card center using elbow/knee bend factors. */
function drawSkeleton(ctx, W, H, angles, options = {}) {
  const {
    line = "#93c5fd",
    joint = "#fbbf24",
    lw = 5,
  } = options;

  ctx.clearRect(0, 0, W, H);

  // Layout anchors (card space)
  const cx = W * 0.50;        // hip center x
  const hipsY = H * 0.64;     // hip baseline
  const shoulderY = H * 0.36;
  const headY = H * 0.24;

  const hipGap = 38;
  const shoulderGap = 76;

  const upperLeg = 70;
  const lowerLeg = 70;
  const upperArm = 60;
  const lowerArm = 60;

  // Bend factors (0..1)
  const kL = angleToBend(angles?.leftKnee);
  const kR = angleToBend(angles?.rightKnee);
  const eL = angleToBend(angles?.leftElbow);
  const eR = angleToBend(angles?.rightElbow);

  // Base joints
  const hipL = { x: cx - hipGap / 2, y: hipsY };
  const hipR = { x: cx + hipGap / 2, y: hipsY };
  const shL = { x: cx - shoulderGap / 2, y: shoulderY };
  const shR = { x: cx + shoulderGap / 2, y: shoulderY };
  const head = { x: cx, y: headY };

  // Styles
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = line;
  ctx.lineWidth = lw;

  // Torso
  ctx.beginPath();
  ctx.moveTo(head.x, head.y);
  ctx.lineTo(cx, shoulderY - 6);
  ctx.lineTo(cx, hipsY);
  ctx.stroke();

  // Shoulders bar
  ctx.beginPath();
  ctx.moveTo(shL.x, shL.y);
  ctx.lineTo(shR.x, shR.y);
  ctx.stroke();

  // Hips bar
  ctx.beginPath();
  ctx.moveTo(hipL.x, hipL.y);
  ctx.lineTo(hipR.x, hipR.y);
  ctx.stroke();

  // Arms
  const elL = { x: shL.x - upperArm, y: shL.y };
  const wristL = {
    x: elL.x - lowerArm * (1 - 0.15 * eL),
    y: elL.y + lowerArm * (0.55 + 0.45 * eL),
  };
  ctx.beginPath();
  ctx.moveTo(shL.x, shL.y);
  ctx.lineTo(elL.x, elL.y);
  ctx.lineTo(wristL.x, wristL.y);
  ctx.stroke();

  const elR = { x: shR.x + upperArm, y: shR.y };
  const wristR = {
    x: elR.x + lowerArm * (1 - 0.15 * eR),
    y: elR.y + lowerArm * (0.55 + 0.45 * eR),
  };
  ctx.beginPath();
  ctx.moveTo(shR.x, shR.y);
  ctx.lineTo(elR.x, elR.y);
  ctx.lineTo(wristR.x, wristR.y);
  ctx.stroke();

  // Legs
  const kneeForward = 34;
  const kneeL = { x: hipL.x + kneeForward * kL, y: hipL.y + 70 * (0.7 + 0.3 * (1 - kL)) };
  const ankleL = { x: kneeL.x, y: kneeL.y + 70 };
  ctx.beginPath();
  ctx.moveTo(hipL.x, hipL.y);
  ctx.lineTo(kneeL.x, kneeL.y);
  ctx.lineTo(ankleL.x, ankleL.y);
  ctx.stroke();

  const kneeR = { x: hipR.x + kneeForward * kR, y: hipR.y + 70 * (0.7 + 0.3 * (1 - kR)) };
  const ankleR = { x: kneeR.x, y: kneeR.y + 70 };
  ctx.beginPath();
  ctx.moveTo(hipR.x, hipR.y);
  ctx.lineTo(kneeR.x, kneeR.y);
  ctx.lineTo(ankleR.x, ankleR.y);
  ctx.stroke();

  // Joints
  ctx.fillStyle = joint;
  const dots = [head, shL, shR, hipL, hipR, elL, wristL, elR, wristR, kneeL, ankleL, kneeR, ankleR];
  for (const p of dots) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

export default function SongCard({
  title = "Selected Song",
  bpm = 100,
  currentAngles,         // <-- REQUIRED: targetAngles for the *current step*
}) {
  // Smoothly blend between step poses so the change is readable
  const [displayAngles, setDisplayAngles] = useState({
    leftKnee: 175,
    rightKnee: 175,
    leftElbow: 175,
    rightElbow: 175,
  });

  const canvasRef = useRef(null);

  // Lerp toward the *target step* angles every frame
  useEffect(() => {
    let raf = 0;
    const step = () => {
      setDisplayAngles(prev => {
        const t = 0.25;
        const tgt = currentAngles || prev;
        return {
          leftKnee:  lerp(prev.leftKnee,  tgt.leftKnee  ?? prev.leftKnee,  t),
          rightKnee: lerp(prev.rightKnee, tgt.rightKnee ?? prev.rightKnee, t),
          leftElbow: lerp(prev.leftElbow, tgt.leftElbow ?? prev.leftElbow, t),
          rightElbow:lerp(prev.rightElbow,tgt.rightElbow?? prev.rightElbow,t),
        };
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [currentAngles]);

  // Draw
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    const W = (c.width = 380);
    const H = (c.height = 260);

    // Higher-contrast panel backdrop
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "rgba(3, 7, 18, 0.0)");
    bg.addColorStop(1, "rgba(3, 7, 18, 0.25)");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    drawSkeleton(ctx, W, H, displayAngles);
  }, [displayAngles]);

  return (
    <div
      className="
        rounded-2xl ring-1 ring-white/25 bg-gradient-to-br from-slate-900/95 to-slate-800/90
        backdrop-blur-sm shadow-[0_18px_70px_rgba(0,0,0,0.55)]
        px-5 py-4 w-[400px] text-white/95
      "
      style={{ zIndex: 30 }}
    >
      <div className="text-[10px] tracking-[0.28em] text-white/70 mb-1">
        NOW LEARNING
      </div>
      <div className="text-[20px] font-semibold leading-tight">{title}</div>
      <div className="text-sm text-white/80 mb-3">BPM: {bpm}</div>
      <div className="rounded-lg overflow-hidden bg-slate-950/40 ring-1 ring-white/10">
        <canvas ref={canvasRef} className="w-full h-[260px] block" />
      </div>
    </div>
  );
}
