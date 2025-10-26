# server/main.py
import cv2
import mediapipe as mp
import json
import numpy as np
import time
from typing import Tuple

from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware

# ---------- OPTIONAL: your own angle extraction if needed ----------
# from calculations import extract_joint_angles

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite default
        "http://localhost:3000",  # CRA
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Landmark:
    def __init__(self, x, y, z, visibility):
        self.x = x
        self.y = y
        self.z = z
        self.visibility = visibility


class DanceComparison:
    def __init__(self, reference_json_path, playback_speed=0.5):
        with open(reference_json_path, "r") as f:
            self.reference_data = json.load(f)

        self.reference_frames = self.reference_data["frames"]
        self.reference_fps = self.reference_data.get("fps", 30)
        self.playback_speed = playback_speed

        self.mp_holistic = mp.solutions.holistic
        self.mp_pose = mp.solutions.pose

        self.start_time = None
        self.current_ref_index = 0
        self.paused = False

    # ---------------- helpers: normalization & drawing ----------------
    @staticmethod
    def mp_to_np_xy(landmarks, W, H, min_vis=0.3):
        pts = np.full((33, 2), np.nan, dtype=np.float32)  # 33 pose landmarks
        for i, lm in enumerate(landmarks):
            if hasattr(lm, "visibility") and lm.visibility < min_vis:
                continue
            pts[i, 0] = lm.x * W
            pts[i, 1] = lm.y * H
        return pts

    @staticmethod
    def json_to_np_xy(lm_list, W=1.0, H=1.0, min_vis=0.0):
        pts = np.full((33, 2), np.nan, dtype=np.float32)
        for i, lm in enumerate(lm_list[:33]):
            vis = lm.get("visibility", 1.0)
            if vis < min_vis:
                continue
            pts[i, 0] = float(lm["x"]) * W
            pts[i, 1] = float(lm["y"]) * H
        return pts

    @staticmethod
    def center_and_scale(pts: np.ndarray) -> Tuple[np.ndarray, float, np.ndarray]:
        """Center on torso centroid and scale by shoulder-hip distance."""
        P = mp.solutions.pose.PoseLandmark
        idxs = [P.LEFT_SHOULDER.value, P.RIGHT_SHOULDER.value,
                P.LEFT_HIP.value, P.RIGHT_HIP.value]
        torso = pts[idxs]
        torso = torso[np.isfinite(torso).all(axis=1)]
        if len(torso) < 2:
            c = np.nanmean(pts, axis=0)
            s = 1.0
            return pts - c, s, c
        c = torso.mean(axis=0)
        d = 0.0
        # average of pair distances (shoulders & hips)
        if np.isfinite(pts[P.LEFT_SHOULDER.value]).all() and np.isfinite(pts[P.RIGHT_SHOULDER.value]).all():
            d += np.linalg.norm(pts[P.LEFT_SHOULDER.value] - pts[P.RIGHT_SHOULDER.value])
        if np.isfinite(pts[P.LEFT_HIP.value]).all() and np.isfinite(pts[P.RIGHT_HIP.value]).all():
            d += np.linalg.norm(pts[P.LEFT_HIP.value] - pts[P.RIGHT_HIP.value])
        d = d / 2.0 if d > 0 else 200.0
        s = d if d > 1e-5 else 200.0
        return (pts - c) / s, s, c

    @staticmethod
    def procrustes_2d(A: np.ndarray, B: np.ndarray):
        """
        Find similarity transform mapping A -> B (scale s, rotation R, translation t)
        using Procrustes on finite rows.
        """
        maskA = np.isfinite(A).all(axis=1)
        maskB = np.isfinite(B).all(axis=1)
        mask = maskA & maskB
        A2 = A[mask]
        B2 = B[mask]
        if len(A2) < 2:
            # identity fallback
            return 1.0, np.eye(2, dtype=np.float32), np.zeros(2, dtype=np.float32)

        # center
        muA = A2.mean(axis=0)
        muB = B2.mean(axis=0)
        A0 = A2 - muA
        B0 = B2 - muB

        # scale
        normA = np.sqrt((A0**2).sum())
        normB = np.sqrt((B0**2).sum())
        if normA < 1e-8 or normB < 1e-8:
            return 1.0, np.eye(2, dtype=np.float32), muB - muA

        A0 /= normA
        B0 /= normB

        # rotation
        H = A0.T @ B0
        U, _, VT = np.linalg.svd(H)
        R = U @ VT
        if np.linalg.det(R) < 0:
            U[:, -1] *= -1
            R = U @ VT

        s = (normB / normA)
        t = muB - (s * (R @ muA))
        return float(s), R.astype(np.float32), t.astype(np.float32)

    @staticmethod
    def apply_transform(pts: np.ndarray, s, R, t):
        out = np.full_like(pts, np.nan)
        mask = np.isfinite(pts).all(axis=1)
        out[mask] = (s * (pts[mask] @ R.T)) + t
        return out

    @staticmethod
    def draw_skeleton_np(frame, pts, color=(0, 255, 0), thickness=3, alpha=1.0):
        P = mp.solutions.pose.PoseLandmark
        connections = list(mp.solutions.pose.POSE_CONNECTIONS)
        h, w, _ = frame.shape
        overlay = frame.copy() if alpha < 1.0 else frame

        def ok(i):
            return i is not None and 0 <= i < len(pts) and np.isfinite(pts[i]).all()

        # lines
        for a, b in connections:
            if ok(a) and ok(b):
                pa = (int(pts[a, 0]), int(pts[a, 1]))
                pb = (int(pts[b, 0]), int(pts[b, 1]))
                cv2.line(overlay, pa, pb, color, thickness, lineType=cv2.LINE_AA)
        # joints
        for i in range(min(len(pts), 33)):
            if ok(i):
                p = (int(pts[i, 0]), int(pts[i, 1]))
                cv2.circle(overlay, p, 4, color, -1, lineType=cv2.LINE_AA)

        if alpha < 1.0:
            cv2.addWeighted(overlay, alpha, frame, 1 - alpha, 0, frame)

    # ------------------ streams ------------------
    def stream_live(self):
        """Camera + magenta reference ghost (aligned) + green live skeleton."""
        webcam = cv2.VideoCapture(0)
        with self.mp_holistic.Holistic(min_detection_confidence=0.5, min_tracking_confidence=0.5) as holistic:
            self.start_time = time.time()
            pause_time = 0
            while webcam.isOpened():
                ok, frame = webcam.read()
                if not ok:
                    break
                frame = cv2.flip(frame, 1)
                h, w, _ = frame.shape

                if not self.paused:
                    elapsed = time.time() - self.start_time - pause_time
                    adjusted = elapsed * self.playback_speed
                    self.current_ref_index = int(adjusted * self.reference_fps) % len(self.reference_frames)

                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                rgb.flags.writeable = False
                results = holistic.process(rgb)
                rgb.flags.writeable = True
                frame = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)

                # reference (normalized 0..1 → px)
                ref_frame = self.reference_frames[self.current_ref_index]
                ref_norm = None
                if "landmarks" in ref_frame:
                    ref_norm = self.json_to_np_xy(ref_frame["landmarks"], 1.0, 1.0, min_vis=0.3)

                if results.pose_landmarks:
                    live_px = self.mp_to_np_xy(results.pose_landmarks.landmark, w, h, min_vis=0.3)

                    # normalize both (center+scale) then align reference to live using Procrustes
                    if ref_norm is not None:
                        # map ref to px (0..1 to px first so we use same space)
                        ref_px = ref_norm * np.array([[w, h]], dtype=np.float32)

                        s, R, t = self.procrustes_2d(ref_px, live_px)
                        ref_aligned = self.apply_transform(ref_px, s, R, t)
                        # draw ghost (magenta) over live
                        self.draw_skeleton_np(frame, ref_aligned, (200, 120, 255), thickness=3, alpha=0.45)

                    # draw user (green)
                    self.draw_skeleton_np(frame, live_px, (80, 255, 120), thickness=3, alpha=1.0)

                ok, buf = cv2.imencode(".jpg", frame)
                if not ok:
                    continue
                yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + buf.tobytes() + b"\r\n")

        webcam.release()

    def stream_ref(self, width=280, height=460):
        """Skinny standalone reference avatar panel (for UI side card)."""
        webcam = cv2.VideoCapture(0)  # pace timer
        with self.mp_holistic.Holistic() as _:
            self.start_time = time.time()
            while True:
                _ = webcam.read()
                panel = np.zeros((height, width, 3), dtype=np.uint8)
                panel[:] = (26, 22, 46)  # deep slate bg

                # border glow
                cv2.rectangle(panel, (8, 8), (width - 8, height - 8), (180, 100, 220), 2)

                elapsed = time.time() - self.start_time
                adjusted = elapsed * self.playback_speed
                idx = int(adjusted * self.reference_fps) % len(self.reference_frames)
                ref_frame = self.reference_frames[idx]

                if "landmarks" in ref_frame:
                    ref_norm = np.clip(
                        np.array([[lm["x"], lm["y"]] for lm in ref_frame["landmarks"]], dtype=np.float32),
                        0.0, 1.0
                    )
                    # center & scale into panel
                    cx, cy = width // 2, height // 2
                    scale = int(min(width, height) * 0.38)
                    pts = (ref_norm - 0.5) * scale
                    pts[:, 0] += cx
                    pts[:, 1] += cy

                    self.draw_skeleton_np(panel, pts, (200, 120, 255), thickness=3, alpha=1.0)

                cv2.putText(panel, "COACH", (14, 34), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (230, 220, 255), 2)

                ok, buf = cv2.imencode(".jpg", panel)
                if not ok:
                    continue
                yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + buf.tobytes() + b"\r\n")
        webcam.release()


# Reusable instance
comparator = DanceComparison("reference_dance.json", playback_speed=0.5)

@app.get("/video_live")
def video_live():
    return StreamingResponse(
        comparator.stream_live(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )

@app.get("/video_ref")
def video_ref():
    return StreamingResponse(
        comparator.stream_ref(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )
