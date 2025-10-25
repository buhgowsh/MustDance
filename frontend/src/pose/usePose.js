// src/pose/usePose.js
import { useEffect, useRef, useState } from "react";
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import { computeJointAngles } from "./poseUtils";

export function usePose(videoEl) {
  const lmkrRef = useRef(null);
  const [landmarks, setLandmarks] = useState(null);
  const [angles, setAngles] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );
      const pose = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task"
        },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      lmkrRef.current = pose;

      const loop = () => {
        if (cancelled) return;
        const v = videoEl?.current;
        if (v && !v.paused && !v.ended) {
          const result = lmkrRef.current.detectForVideo(v, Date.now());
          const lms = result?.landmarks?.[0] || null;
          if (lms) {
            setLandmarks(lms);
            setAngles(computeJointAngles(lms));
          }
        }
        requestAnimationFrame(loop);
      };
      loop();
    })();

    return () => { lmkrRef.current?.close(); };
  }, [videoEl]);

  return { landmarks, angles };
}
