# server/main.py
import os, sys, cv2, json, time
import numpy as np
from collections import deque
from typing import List
from fastapi import FastAPI
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import mediapipe as mp

# ---------------- knobs ----------------
TARGET_FPS = 60
CAM_W, CAM_H = 1920, 1080
JPEG_QUALITY = 78
POSE_COMPLEXITY = 1
SMOOTH_LANDMARKS = True
MIN_VIS = 0.20

LM_EMA_ALPHA_POS = 0.35
LM_EMA_ALPHA_MISS_DECAY = 0.85
SMOOTH_TRANSFORM_ALPHA = 0.25

COACH_W, COACH_H = 320, 540
COACH_PANEL_TARGET_HEIGHT_FRAC = 0.52

ENABLE_CUDA_IF_AVAILABLE = True

MAX_OPEN_TRIES = 5
WARMUP_FRAMES = 6
READ_FAIL_REOPEN = 20
OPEN_RETRY_SLEEP = 0.35
# --------------------------------------

def log(*a): print("[server]", *a, file=sys.stderr, flush=True)

CUDA_OK = False
if ENABLE_CUDA_IF_AVAILABLE:
    try: CUDA_OK = cv2.cuda.getCudaEnabledDeviceCount() > 0
    except Exception: CUDA_OK = False
if os.environ.get("DISABLE_CUDA","0") == "1": CUDA_OK = False
log("CUDA_OK =", CUDA_OK)

PREFERRED_CAMERA_INDEX = os.environ.get("CAMERA_INDEX")
if PREFERRED_CAMERA_INDEX is not None:
    try: PREFERRED_CAMERA_INDEX = int(PREFERRED_CAMERA_INDEX)
    except: PREFERRED_CAMERA_INDEX = None
DEFAULT_PROBE = list(range(0, 10))
PROBE_INDICES = [PREFERRED_CAMERA_INDEX] + DEFAULT_PROBE if PREFERRED_CAMERA_INDEX is not None else DEFAULT_PROBE

OPEN_BACKENDS = []
if os.name == "nt":
    OPEN_BACKENDS = [cv2.CAP_DSHOW, cv2.CAP_MSMF, cv2.CAP_ANY]
else:
    OPEN_BACKENDS = [getattr(cv2, "CAP_V4L2", cv2.CAP_ANY), cv2.CAP_ANY]

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

mp_pose = mp.solutions.pose
PLM = mp_pose.PoseLandmark
POSE_CONNECTIONS = list(mp_pose.POSE_CONNECTIONS)

POSE_SUBSET_IDXS: List[int] = [
    PLM.LEFT_SHOULDER.value, PLM.RIGHT_SHOULDER.value,
    PLM.LEFT_HIP.value,      PLM.RIGHT_HIP.value,
    PLM.LEFT_ELBOW.value,    PLM.RIGHT_ELBOW.value,
    PLM.LEFT_WRIST.value,    PLM.RIGHT_WRIST.value,
    PLM.LEFT_KNEE.value,     PLM.RIGHT_KNEE.value,
    PLM.LEFT_ANKLE.value,    PLM.RIGHT_ANKLE.value,
]

COLOR_LIVE  = (60, 255, 120)
COLOR_COACH = (60, 180, 255)
COLOR_JOINT = (235, 235, 235)
THICK_LINE  = 3
R_JOINT     = 3
COACH_ALPHA = 0.45

SCALE_JOINTS = [
    PLM.LEFT_SHOULDER.value, PLM.RIGHT_SHOULDER.value,
    PLM.LEFT_HIP.value,      PLM.RIGHT_HIP.value,
    PLM.LEFT_KNEE.value,     PLM.RIGHT_KNEE.value,
    PLM.LEFT_ANKLE.value,    PLM.RIGHT_ANKLE.value,
]

# ---------- camera helpers ----------
def _try_open_with_backend(index: int, backend) -> cv2.VideoCapture | None:
    cap = cv2.VideoCapture(index, backend)
    if not cap or not cap.isOpened(): return None
    try: cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    except: pass
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, CAM_W)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, CAM_H)
    cap.set(cv2.CAP_PROP_FPS, TARGET_FPS)
    cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
    ok, _ = cap.read()
    if not ok: cap.release(); return None
    return cap

def _open_cam() -> cv2.VideoCapture:
    for _ in range(MAX_OPEN_TRIES):
        for idx in PROBE_INDICES:
            for backend in OPEN_BACKENDS:
                cap = _try_open_with_backend(idx, backend)
                if cap:
                    log(f"Camera open: index={idx}, backend={backend}")
                    for _ in range(WARMUP_FRAMES): cap.read()
                    return cap
        time.sleep(OPEN_RETRY_SLEEP)
    raise RuntimeError("Unable to open any camera")

# ---------- math utils ----------
def lm_to_px(landmarks, W, H, min_vis=MIN_VIS):
    pts = np.full((33,2), np.nan, np.float32); vis = np.zeros((33,), np.float32)
    for i, lm in enumerate(landmarks):
        v = getattr(lm, "visibility", 1.0); vis[i] = v
        if v >= min_vis:
            pts[i,0] = lm.x * W; pts[i,1] = lm.y * H
    return pts, vis

def centroid_fill(pts: np.ndarray) -> np.ndarray:
    out = pts.copy(); m = np.isfinite(out).all(axis=1)
    if m.sum() >= 2: out[~m] = out[m].mean(axis=0)
    return out

def procrustes_subset(A: np.ndarray, B: np.ndarray, subset=None):
    if subset is None:
        m = np.isfinite(A).all(axis=1) & np.isfinite(B).all(axis=1)
        A2, B2 = A[m], B[m]
    else:
        idxs = [i for i in subset if i < len(A)]
        A2, B2 = A[idxs], B[idxs]
        m = np.isfinite(A2).all(axis=1) & np.isfinite(B2).all(axis=1)
        A2, B2 = A2[m], B2[m]
    if len(A2) < 2: return 1.0, np.eye(2, np.float32), np.zeros(2, np.float32)
    muA, muB = A2.mean(axis=0), B2.mean(axis=0)
    A0, B0 = A2 - muA, B2 - muB
    nA, nB = np.sqrt((A0**2).sum()), np.sqrt((B0**2).sum())
    if nA < 1e-8 or nB < 1e-8: return 1.0, np.eye(2, np.float32), muB - muA
    A0 /= nA; B0 /= nB
    H = A0.T @ B0
    U,_,VT = np.linalg.svd(H)
    R = U @ VT
    if np.linalg.det(R) < 0: U[:,-1] *= -1; R = U @ VT
    s = (nB / nA); t = muB - (s * (R @ muA))
    return float(s), R.astype(np.float32), t.astype(np.float32)

def apply_sRt(pts, s, R, t):
    out = np.full_like(pts, np.nan); m = np.isfinite(pts).all(axis=1)
    out[m] = (s * (pts[m] @ R.T)) + t; return out

def draw_fast_skeleton(img, pts, line_color, joint_color):
    for a,b in POSE_CONNECTIONS:
        pa, pb = pts[a], pts[b]
        if np.isfinite(pa).all() and np.isfinite(pb).all():
            cv2.line(img,(int(pa[0]),int(pa[1])),(int(pb[0]),int(pb[1])), line_color, THICK_LINE, cv2.LINE_AA)
    for p in pts:
        if np.isfinite(p).all():
            cv2.circle(img,(int(p[0]),int(p[1])), R_JOINT, joint_color,-1, cv2.LINE_AA)

def draw_ghost(img, pts, lc, jc, alpha=COACH_ALPHA):
    ov = img.copy(); draw_fast_skeleton(ov, pts, lc, jc); cv2.addWeighted(ov, alpha, img, 1-alpha, 0, img)

# ---- height/width helpers ----
EYES = [PLM.LEFT_EYE.value, PLM.RIGHT_EYE.value]
ANKLES = [PLM.LEFT_ANKLE.value, PLM.RIGHT_ANKLE.value]
SHOULDERS = [PLM.LEFT_SHOULDER.value, PLM.RIGHT_SHOULDER.value]
HIPS = [PLM.LEFT_HIP.value, PLM.RIGHT_HIP.value]

def _brow_y(pts):
    m = [i for i in EYES if i < len(pts) and np.isfinite(pts[i]).all()]
    if not m: return np.nan
    y = float(np.mean([pts[i,1] for i in m]))
    span = np.nanmax(pts[:,1]) - np.nanmin(pts[:,1])
    return y - 0.02*span

def _feet_y(pts):
    m = [i for i in ANKLES if i < len(pts) and np.isfinite(pts[i]).all()]
    if not m: return np.nan
    return float(np.max([pts[i,1] for i in m]))

def _pelvis_center(pts):
    m = [i for i in HIPS if i < len(pts) and np.isfinite(pts[i]).all()]
    if len(m) < 2: return np.array([np.nan, np.nan], np.float32)
    return np.mean(pts[m], axis=0)

def _shoulder_vec(pts):
    m = [i for i in SHOULDERS if i < len(pts) and np.isfinite(pts[i]).all()]
    if len(m) < 2: return None
    return pts[m[1]] - pts[m[0]]  # R - L

def _shoulder_mid_width(pts):
    m = [i for i in SHOULDERS if i < len(pts) and np.isfinite(pts[i]).all()]
    if len(m) < 2: return None, np.nan
    midx = 0.5*(pts[m[0],0] + pts[m[1],0])
    width = float(np.linalg.norm(pts[m[1]] - pts[m[0]]))
    return midx, width

def _height_scale_rot_trans(ref_px, live_px):
    rb, rf = _brow_y(ref_px), _feet_y(ref_px)
    lb, lf = _brow_y(live_px), _feet_y(live_px)
    if not (np.isfinite([rb,rf,lb,lf]).all()): return None
    href = max(1e-4, rf - rb); hlive = max(1e-4, lf - lb)
    s = float(hlive / href)
    vR = _shoulder_vec(ref_px); vL = _shoulder_vec(live_px)
    if vR is None or vL is None: return None
    aR = np.arctan2(vR[1], vR[0]); aL = np.arctan2(vL[1], vL[0])
    ang = float(aL - aR)
    R = np.array([[np.cos(ang), -np.sin(ang)],[np.sin(ang), np.cos(ang)]], np.float32)
    cR, cL = _pelvis_center(ref_px), _pelvis_center(live_px)
    if not (np.isfinite(cR).all() and np.isfinite(cL).all()): return None
    t = cL - (s * (R @ cR))
    return s, R, t.astype(np.float32)

# ---- angles & scoring ----
def _angle(a, b, c):
    if not (np.isfinite(a).all() and np.isfinite(b).all() and np.isfinite(c).all()):
        return np.nan
    v1, v2 = a - b, c - b
    n1 = np.linalg.norm(v1); n2 = np.linalg.norm(v2)
    if n1 < 1e-6 or n2 < 1e-6: return np.nan
    cos = np.clip(np.dot(v1, v2) / (n1 * n2), -1.0, 1.0)
    return float(np.degrees(np.arccos(cos)))

def _vec_angle_deg(v, ref=(0, -1)):
    n = np.linalg.norm(v)
    if n < 1e-6: return np.nan
    vr = np.array(ref, np.float32)
    cos = np.clip(np.dot(v, vr) / (n * np.linalg.norm(vr)), -1.0, 1.0)
    return float(np.degrees(np.arccos(cos)))

def compute_angles(pts):
    J = PLM
    def P(i): return pts[i] if i < len(pts) else np.array([np.nan, np.nan])
    ang = {}
    ang["leftElbow"]  = _angle(P(J.LEFT_SHOULDER.value),  P(J.LEFT_ELBOW.value),  P(J.LEFT_WRIST.value))
    ang["rightElbow"] = _angle(P(J.RIGHT_SHOULDER.value), P(J.RIGHT_ELBOW.value), P(J.RIGHT_WRIST.value))
    ang["leftKnee"]   = _angle(P(J.LEFT_HIP.value),       P(J.LEFT_KNEE.value),   P(J.LEFT_ANKLE.value))
    ang["rightKnee"]  = _angle(P(J.RIGHT_HIP.value),      P(J.RIGHT_KNEE.value),  P(J.RIGHT_ANKLE.value))
    ang["leftHip"]    = _angle(P(J.LEFT_SHOULDER.value),  P(J.LEFT_HIP.value),    P(J.LEFT_KNEE.value))
    ang["rightHip"]   = _angle(P(J.RIGHT_SHOULDER.value), P(J.RIGHT_HIP.value),   P(J.RIGHT_KNEE.value))
    ang["leftShoulder"]  = _angle(P(J.LEFT_HIP.value),    P(J.LEFT_SHOULDER.value),  P(J.LEFT_ELBOW.value))
    ang["rightShoulder"] = _angle(P(J.RIGHT_HIP.value),   P(J.RIGHT_SHOULDER.value), P(J.RIGHT_ELBOW.value))
    # torso tilt: angle between pelvis->shoulder-center and up
    s_mid = (P(J.LEFT_SHOULDER.value) + P(J.RIGHT_SHOULDER.value)) * 0.5
    h_mid = (P(J.LEFT_HIP.value)      + P(J.RIGHT_HIP.value))      * 0.5
    torso_v = s_mid - h_mid
    ang["torsoTilt"] = _vec_angle_deg(torso_v, (0, -1))
    return ang

def score_from_angles(live, ref):
    weights = {
        "leftElbow":1.0, "rightElbow":1.0,
        "leftKnee":1.5, "rightKnee":1.5,
        "leftHip":1.5, "rightHip":1.5,
        "leftShoulder":1.2, "rightShoulder":1.2,
        "torsoTilt":2.0,
    }
    def map_diff(d):
        d = abs(d)
        if d <= 15:  return 100 - (d/15)*25     # 100..75
        if d <= 30:  return 75  - ((d-15)/15)*25# 75..50
        if d <= 45:  return 50  - ((d-30)/15)*25# 50..25
        if d <= 60:  return 25  - ((d-45)/15)*25# 25..0
        return 0
    total=w_sum=0.0
    for k,w in weights.items():
        if k in live and k in ref and np.isfinite(live[k]) and np.isfinite(ref[k]):
            total += map_diff(live[k]-ref[k]) * w
            w_sum += w
    return (total / w_sum) if w_sum>0 else 0.0

# -------------- comparator --------------
class DanceComparison:
    def __init__(self, reference_json_path: str, playback_speed: float = 0.5):
        with open(reference_json_path,"r") as f:
            ref = json.load(f)
        self.ref_fps = ref.get("fps", 30)
        raw = ref["frames"]

        self.ref_norm = []
        for fr in raw:
            arr = np.full((33,2), np.nan, np.float32)
            if "landmarks" in fr:
                for i,lm in enumerate(fr["landmarks"][:33]):
                    if lm.get("visibility",1.0) >= 0.0:
                        arr[i] = [float(lm["x"]), float(lm["y"])]
            self.ref_norm.append(arr)

        def norm_h(a: np.ndarray):
            y = [a[i,1] for i in SCALE_JOINTS if i < len(a) and np.isfinite(a[i]).all()]
            return float(np.max(y) - np.min(y)) if len(y)>=2 else 0.6
        hs = [norm_h(a) for a in self.ref_norm]
        good = [h for h in hs if h>0]
        self.ref_base_h_norm = float(np.median(good)) if good else 0.6

        self.playback_speed = playback_speed
        self.s_hist, self.R_hist, self.t_hist = deque(maxlen=5), deque(maxlen=5), deque(maxlen=5)
        self.live_ema = None
        self.start_time = None

        # metrics
        self._score = 0.0
        self._accuracy = 0.0
        self._frames = 0

        self._play = False

        # shoulder width EMA for width-correction
        self._xscale_ema = 1.0

    def _reset_metrics(self):
        self._score = 0.0
        self._accuracy = 0.0
        self._frames = 0

    def set_play(self, flag: bool):
        was = self._play
        self._play = bool(flag)
        if (not was) and self._play:
            self._reset_metrics()
            self.start_time = time.time()

    def _ema_sRt(self, s, R, t):
        if len(self.s_hist) == 0:
            s_s, R_s, t_s = s, R, t
        else:
            a = SMOOTH_TRANSFORM_ALPHA
            s_s = (1-a)*self.s_hist[-1] + a*s
            R_mix = (1-a)*self.R_hist[-1] + a*R
            U,_,VT = np.linalg.svd(R_mix); R_s = U @ VT
            t_s = (1-a)*self.t_hist[-1] + a*t
        self.s_hist.append(s_s); self.R_hist.append(R_s); self.t_hist.append(t_s)
        return s_s, R_s, t_s

    def _align_ref_to_live_blended(self, ref_px: np.ndarray, live_px: np.ndarray) -> np.ndarray:
        htr = _height_scale_rot_trans(ref_px, live_px)
        sp, Rp, tp = procrustes_subset(ref_px, live_px, POSE_SUBSET_IDXS)
        if htr is not None:
            sh, Rh, th = htr
            s = 0.6*sh + 0.4*sp
            R = 0.6*Rh + 0.4*Rp
            U,_,VT = np.linalg.svd(R); R = U @ VT
            t = 0.6*th + 0.4*tp
        else:
            s, R, t = sp, Rp, tp
        s, R, t = self._ema_sRt(s, R, t)
        out = apply_sRt(ref_px, s, R, t)

        # shoulder-width correction (smoothed): keeps overlay from looking "too wide"
        cx_l, w_l = _shoulder_mid_width(live_px)
        cx_r, w_r = _shoulder_mid_width(out)
        if np.isfinite([cx_l, w_l, cx_r, w_r]).all() and w_r > 1e-4:
            k = float(np.clip(w_l / w_r, 0.85, 1.15))
            self._xscale_ema = 0.75*self._xscale_ema + 0.25*k
            cx = cx_l
            out[:,0] = cx + (out[:,0] - cx) * self._xscale_ema
        return out

    def stream_live(self):
        cap = _open_cam()
        with mp_pose.Pose(model_complexity=POSE_COMPLEXITY,
                          smooth_landmarks=SMOOTH_LANDMARKS,
                          enable_segmentation=False,
                          min_detection_confidence=0.5,
                          min_tracking_confidence=0.5) as pose:

            self.start_time = time.time()
            frame_interval = 1.0 / TARGET_FPS
            last = 0.0
            stream = cv2.cuda.Stream() if CUDA_OK else None
            fail_count = 0

            while True:
                ok, frame = cap.read()
                if not ok:
                    fail_count += 1
                    if fail_count >= READ_FAIL_REOPEN:
                        try: cap.release()
                        except: pass
                        try:
                            cap = _open_cam(); fail_count = 0; continue
                        except Exception:
                            time.sleep(0.5); continue
                    time.sleep(0.02); continue
                fail_count = 0

                now = time.time()
                if now - last < frame_interval:
                    time.sleep(max(0, frame_interval - (now - last)))
                last = time.time()

                if CUDA_OK:
                    g = cv2.cuda_GpuMat(); g.upload(frame, stream)
                    g = cv2.cuda.flip(g, 1)
                    g_rgb = cv2.cuda.cvtColor(g, cv2.COLOR_BGR2RGB, stream=stream)
                    frame = g.download(stream); rgb = g_rgb.download(stream)
                    stream.waitForCompletion()
                else:
                    frame = cv2.flip(frame, 1); rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

                h, w, _ = frame.shape

                elapsed = time.time() - self.start_time
                speed = self.playback_speed if self._play else 0.0
                idx = int(elapsed * speed * self.ref_fps) % len(self.ref_norm)
                ref = self.ref_norm[idx]
                ref_px = ref * np.array([[w, h]], np.float32)

                rgb.flags.writeable = False
                res = pose.process(rgb)
                rgb.flags.writeable = True

                if res.pose_landmarks:
                    live_px_raw, vis = lm_to_px(res.pose_landmarks.landmark, w, h, MIN_VIS)
                    if self.live_ema is None:
                        self.live_ema = centroid_fill(live_px_raw)
                    else:
                        a = np.where(vis >= MIN_VIS, LM_EMA_ALPHA_POS,
                                     LM_EMA_ALPHA_MISS_DECAY * LM_EMA_ALPHA_POS).reshape(-1,1)
                        live_safe = np.where(np.isfinite(live_px_raw), live_px_raw, self.live_ema)
                        self.live_ema = (1 - a) * self.live_ema + a * live_safe

                    ref_aligned = self._align_ref_to_live_blended(ref_px, self.live_ema)

                    # draw
                    draw_fast_skeleton(frame, self.live_ema, COLOR_LIVE, COLOR_JOINT)
                    draw_ghost(frame, ref_aligned, COLOR_COACH, COLOR_JOINT, alpha=COACH_ALPHA)

                    # --- scoring ---
                    live_ang = compute_angles(self.live_ema)
                    ref_ang  = compute_angles(ref_aligned)
                    frame_acc = score_from_angles(live_ang, ref_ang)  # 0..100
                    # EMA for on-screen stability + accumulate score
                    self._accuracy = 0.85*self._accuracy + 0.15*frame_acc
                    self._score += (frame_acc / 10.0) * (1.0 if self._play else 0.0)
                    self._frames += 1
                else:
                    cv2.putText(frame, "Step into view", (24,48),
                                cv2.FONT_HERSHEY_SIMPLEX, 1.2, (230,230,230), 2, cv2.LINE_AA)

                ok, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), JPEG_QUALITY])
                if not ok: continue
                yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + buf.tobytes() + b"\r\n")

        cap.release()

    def stream_ref(self, width=COACH_W, height=COACH_H):
        self.start_time = time.time()
        frame_interval = 1.0 / TARGET_FPS
        last = 0.0
        target_h_px = COACH_PANEL_TARGET_HEIGHT_FRAC * height
        pixels_per_unit = target_h_px / max(self.ref_base_h_norm, 1e-4)

        while True:
            now = time.time()
            if now - last < frame_interval:
                time.sleep(max(0, frame_interval - (now - last)))
            last = time.time()

            panel = np.zeros((height, width, 3), np.uint8)
            panel[:] = (18,18,24)

            elapsed = time.time() - self.start_time
            speed = self.playback_speed if self._play else 0.0
            idx = int(elapsed * speed * self.ref_fps) % len(self.ref_norm)
            ref = self.ref_norm[idx]

            pts = ref.copy()
            pts[:,0] = (pts[:,0]-0.5)*pixels_per_unit + width*0.5
            pts[:,1] = (pts[:,1]-0.5)*pixels_per_unit + height*0.5

            draw_fast_skeleton(panel, pts, COLOR_COACH, COLOR_JOINT)

            ok, buf = cv2.imencode(".jpg", panel, [int(cv2.IMWRITE_JPEG_QUALITY), 76])
            if not ok: continue
            yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + buf.tobytes() + b"\r\n")

# -------- endpoints --------
comparator = DanceComparison("reference_dance.json", playback_speed=0.5)

@app.get("/video_live")
def video_live():
    return StreamingResponse(comparator.stream_live(),
        media_type="multipart/x-mixed-replace; boundary=frame")

@app.get("/video_ref")
def video_ref():
    return StreamingResponse(comparator.stream_ref(),
        media_type="multipart/x-mixed-replace; boundary=frame")

@app.get("/control")
def control(play: int = 0):
    comparator.set_play(bool(play))
    return JSONResponse({"ok": True, "play": bool(play)})

@app.get("/metrics")
def metrics():
    def gen():
        while True:
            time.sleep(1/30)
            yield "data: " + json.dumps({
                "accuracy": float(comparator._accuracy),
                "score": float(comparator._score),
            }) + "\n\n"
    return StreamingResponse(gen(), media_type="text/event-stream")

@app.get("/health/camera")
def health_camera():
    for idx in PROBE_INDICES:
        for backend in OPEN_BACKENDS:
            cap = cv2.VideoCapture(idx, backend)
            if cap and cap.isOpened():
                ok, _ = cap.read()
                cap.release()
                if ok:
                    return JSONResponse({"ok": True, "index": idx, "backend": int(backend)})
    return JSONResponse({"ok": False}, status_code=503)
