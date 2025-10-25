export const MP = {
  LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13, RIGHT_ELBOW: 14,
  LEFT_HIP: 23, RIGHT_HIP: 24,
  LEFT_KNEE: 25, RIGHT_KNEE: 26,
  LEFT_ANKLE: 27, RIGHT_ANKLE: 28,
};
const WRIST_L = 15, WRIST_R = 16;

function angle3pts(a, b, c) {
  const ab = { x: a.x-b.x, y: a.y-b.y, z: (a.z??0)-(b.z??0) };
  const cb = { x: c.x-b.x, y: c.y-b.y, z: (c.z??0)-(b.z??0) };
  const dot = ab.x*cb.x + ab.y*cb.y + ab.z*cb.z;
  const m1 = Math.hypot(ab.x,ab.y,ab.z), m2 = Math.hypot(cb.x,cb.y,cb.z);
  if (!m1 || !m2) return 180;
  const cos = Math.min(1, Math.max(-1, dot/(m1*m2)));
  return (Math.acos(cos)*180)/Math.PI;
}

export function computeJointAngles(lms) {
  const get = (i) => lms[i];
  return {
    leftElbow:  angle3pts(get(MP.LEFT_SHOULDER), get(MP.LEFT_ELBOW), get(WRIST_L)),
    rightElbow: angle3pts(get(MP.RIGHT_SHOULDER), get(MP.RIGHT_ELBOW), get(WRIST_R)),
    leftKnee:   angle3pts(get(MP.LEFT_HIP), get(MP.LEFT_KNEE), get(MP.LEFT_ANKLE)),
    rightKnee:  angle3pts(get(MP.RIGHT_HIP), get(MP.RIGHT_KNEE), get(MP.RIGHT_ANKLE)),
  };
}

export function scoreAngles(current, target) {
  const keys = Object.keys(target ?? {});
  if (!keys.length) return 100;
  let sum = 0;
  for (const k of keys) {
    const err = Math.abs((current[k] ?? 180) - target[k]); // degrees
    sum += Math.max(0, 100*(1 - err/30)); // 30° tolerance window
  }
  return Math.round(sum/keys.length);
}
