// src/components/PosePreview.jsx
import { useEffect, useRef } from "react";

/**
 * PosePreview
 * Renders a looping, animated stick-figure using your step JSON.
 *
 * Props:
 *  - steps: Array<{ label, duration, targetAngles: Record<string, number> }>
 *  - bpm?: number (optional; if omitted, uses each step.duration in seconds)
 *  - width?: number, height?: number (canvas size; defaults to 300x300)
 */
export default function PosePreview({ steps = [], bpm, width = 300, height = 300 }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(0);

  // ---- simple skeleton lengths (px)
  const BONE = {
    torso: 90,
    shoulder: 58,   // half shoulder width per side
    upperArm: 68,
    lowerArm: 66,
    upperLeg: 86,
    lowerLeg: 86,
    neck: 18,
    head: 16,
    hipHalf: 20,    // half-width pelvis
  };

  const deg2rad = (d) => (d * Math.PI) / 180;
  const easeInOut = (x) => x * x * (3 - 2 * x);
  const lerpAngleDeg = (a, b, t) => {
    let diff = ((b - a + 540) % 360) - 180; // shortest arc
    return a + diff * t;
  };
  const pick = (obj, key, def = 0) =>
    typeof obj?.[key] === "number" ? obj[key] : def;

  useEffect(() => {
    if (!steps?.length) return;
    const c = canvasRef.current;
    const ctx = c.getContext("2d");
    let start = performance.now();

    // Which two steps are we between, and how far (0..1)?
    const stepAt = (timeMs) => {
      if (bpm) {
        const secPerBeat = 60 / bpm;
        const stepDur = secPerBeat; // 1 beat per step (tweak if you want)
        const total = stepDur * steps.length;
        const t = ((timeMs / 1000) % total);
        const idx = Math.floor(t / stepDur);
        const next = (idx + 1) % steps.length;
        const a = easeInOut((t - idx * stepDur) / stepDur);
        return { idx, next, a };
      } else {
        const durs = steps.map(s => Math.max(0.001, s?.duration ?? 1));
        const total = durs.reduce((x,y)=>x+y,0);
        const t = ((timeMs / 1000) % total);
        let acc = 0, idx = 0;
        for (; idx < durs.length; idx++) {
          if (t < acc + durs[idx]) break;
          acc += durs[idx];
        }
        const next = (idx + 1) % steps.length;
        const a = easeInOut((t - acc) / durs[idx]);
        return { idx, next, a };
      }
    };

    const draw = (now) => {
      const { idx, next, a } = stepAt(now - start);
      const A = steps[idx]?.targetAngles || {};
      const B = steps[next]?.targetAngles || {};

      // Interpolated angles (DEGREES). Defaults are neutral poses.
      const angles = {
        torso: lerpAngleDeg(pick(A,"torso", 90), pick(B,"torso", 90), a), // 90° = vertical up
        neck:  lerpAngleDeg(pick(A,"neck", 0), pick(B,"neck", 0), a),

        lShoulder: lerpAngleDeg(pick(A,"left_shoulder", 40),  pick(B,"left_shoulder", 40),  a),
        rShoulder: lerpAngleDeg(pick(A,"right_shoulder",-40), pick(B,"right_shoulder",-40), a),

        lElbow: lerpAngleDeg(pick(A,"left_elbow",  15), pick(B,"left_elbow",  15), a),
        rElbow: lerpAngleDeg(pick(A,"right_elbow", 15), pick(B,"right_elbow", 15), a),

        lHip:   lerpAngleDeg(pick(A,"left_hip",  10), pick(B,"left_hip",  10), a),
        rHip:   lerpAngleDeg(pick(A,"right_hip", 10), pick(B,"right_hip", 10), a),

        lKnee:  lerpAngleDeg(pick(A,"left_knee", 15), pick(B,"left_knee", 15), a),
        rKnee:  lerpAngleDeg(pick(A,"right_knee",15), pick(B,"right_knee",15), a),
      };

      // Canvas & clear
      c.width = width;
      c.height = height;
      ctx.clearRect(0,0,width,height);

      // Center pelvis
      const cx = width/2, cy = height/2 + 40;

      // Helpers
      const toXY = (x,y) => [x,y];

      // Torso line up from pelvis
      const torsoRad = deg2rad(angles.torso);
      const neckBase = toXY(cx + BONE.torso * Math.cos(torsoRad),
                            cy - BONE.torso * Math.sin(torsoRad));

      // Neck/head
      const neckRad = deg2rad(angles.torso + angles.neck);
      const headCtr = toXY(neckBase[0] + BONE.neck * Math.cos(neckRad),
                           neckBase[1] - BONE.neck * Math.sin(neckRad));

      // Shoulder line (perp to torso)
      const perp = torsoRad + Math.PI/2;
      const lShoulderPos = toXY(neckBase[0] + BONE.shoulder * Math.cos(perp),
                                neckBase[1] - BONE.shoulder * Math.sin(perp));
      const rShoulderPos = toXY(neckBase[0] - BONE.shoulder * Math.cos(perp),
                                neckBase[1] + BONE.shoulder * Math.sin(perp));

      // Arms (angles relative to torso)
      const lUpperArmRad = deg2rad(angles.torso + angles.lShoulder);
      const rUpperArmRad = deg2rad(angles.torso + angles.rShoulder);

      const lElbowPos = toXY(lShoulderPos[0] + BONE.upperArm * Math.cos(lUpperArmRad),
                             lShoulderPos[1] - BONE.upperArm * Math.sin(lUpperArmRad));
      const rElbowPos = toXY(rShoulderPos[0] + BONE.upperArm * Math.cos(rUpperArmRad),
                             rShoulderPos[1] - BONE.upperArm * Math.sin(rUpperArmRad));

      const lForearmRad = deg2rad(angles.torso + angles.lShoulder + angles.lElbow);
      const rForearmRad = deg2rad(angles.torso + angles.rShoulder + angles.rElbow);

      const lHandPos = toXY(lElbowPos[0] + BONE.lowerArm * Math.cos(lForearmRad),
                            lElbowPos[1] - BONE.lowerArm * Math.sin(lForearmRad));
      const rHandPos = toXY(rElbowPos[0] + BONE.lowerArm * Math.cos(rForearmRad),
                            rElbowPos[1] - BONE.lowerArm * Math.sin(rForearmRad));

      // Hips (pelvis left/right from center)
      const lHipPos = toXY(cx + BONE.hipHalf * Math.cos(perp), cy - BONE.hipHalf * Math.sin(perp));
      const rHipPos = toXY(cx - BONE.hipHalf * Math.cos(perp), cy + BONE.hipHalf * Math.sin(perp));

      // Legs (relative to torso)
      const lUpperLegRad = deg2rad(angles.torso - angles.lHip);
      const rUpperLegRad = deg2rad(angles.torso - angles.rHip);

      const lKneePos = toXY(lHipPos[0] + BONE.upperLeg * Math.cos(lUpperLegRad),
                            lHipPos[1] - BONE.upperLeg * Math.sin(lUpperLegRad));
      const rKneePos = toXY(rHipPos[0] + BONE.upperLeg * Math.cos(rUpperLegRad),
                            rHipPos[1] - BONE.upperLeg * Math.sin(rUpperLegRad));

      const lLowerLegRad = deg2rad(angles.torso - angles.lHip + angles.lKnee);
      const rLowerLegRad = deg2rad(angles.torso - angles.rHip + angles.rKnee);

      const lFootPos = toXY(lKneePos[0] + BONE.lowerLeg * Math.cos(lLowerLegRad),
                            lKneePos[1] - BONE.lowerLeg * Math.sin(lLowerLegRad));
      const rFootPos = toXY(rKneePos[0] + BONE.lowerLeg * Math.cos(rLowerLegRad),
                            rKneePos[1] - BONE.lowerLeg * Math.sin(rLowerLegRad));

      // ---- Draw
      const drawBone = (a,b) => { ctx.beginPath(); ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]); ctx.stroke(); };
      const drawJoint = (p,r=4) => { ctx.beginPath(); ctx.arc(p[0],p[1],r,0,Math.PI*2); ctx.fill(); };

      ctx.lineWidth = 4;
      ctx.strokeStyle = "#38bdf8";
      ctx.fillStyle = "#f59e0b";

      drawBone([cx,cy], neckBase);               // torso
      drawBone(lShoulderPos, rShoulderPos);      // shoulders
      drawBone(lShoulderPos, lElbowPos);
      drawBone(lElbowPos, lHandPos);
      drawBone(rShoulderPos, rElbowPos);
      drawBone(rElbowPos, rHandPos);
      drawBone(lHipPos, rHipPos);                // pelvis
      drawBone(lHipPos, lKneePos);
      drawBone(lKneePos, lFootPos);
      drawBone(rHipPos, rKneePos);
      drawBone(rKneePos, rFootPos);

      [ [cx,cy], neckBase, lShoulderPos, lElbowPos, lHandPos, rShoulderPos, rElbowPos, rHandPos,
        lHipPos, lKneePos, lFootPos, rHipPos, rKneePos, rFootPos
      ].forEach(p => drawJoint(p, 4));

      // head outline
      ctx.beginPath();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#ffffffaa";
      ctx.arc(headCtr[0], headCtr[1], BONE.head, 0, Math.PI * 2);
      ctx.stroke();

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [steps, bpm, width, height]);

  return <canvas ref={canvasRef} width={width} height={height} className="bg-transparent" />;
}
