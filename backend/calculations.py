import math
import mediapipe as mp

# ----- Utility function -----
def calculate_angle(a, b, c):
    a, b, c = (a[0]-b[0], a[1]-b[1]), (0, 0), (c[0]-b[0], c[1]-b[1])
    dot = a[0]*c[0] + a[1]*c[1]
    mag_a = math.sqrt(a[0]**2 + a[1]**2)
    mag_c = math.sqrt(c[0]**2 + c[1]**2)
    if mag_a == 0 or mag_c == 0:
        return 0.0
    cosine = dot / (mag_a * mag_c)
    cosine = max(-1.0, min(1.0, cosine))
    return math.degrees(math.acos(cosine))


def extract_joint_angles(landmarks):
    mp_pose = mp.solutions.pose

    def pt(name):
        l = landmarks[mp_pose.PoseLandmark[name].value]
        return (l.x, l.y)

    # Basic landmarks
    LS, LE, LW = pt('LEFT_SHOULDER'), pt('LEFT_ELBOW'), pt('LEFT_WRIST')
    RS, RE, RW = pt('RIGHT_SHOULDER'), pt('RIGHT_ELBOW'), pt('RIGHT_WRIST')
    LH, LK, LA = pt('LEFT_HIP'), pt('LEFT_KNEE'), pt('LEFT_ANKLE')
    RH, RK, RA = pt('RIGHT_HIP'), pt('RIGHT_KNEE'), pt('RIGHT_ANKLE')
    NO = pt('NOSE')

    mid_shoulder = ((LS[0] + RS[0]) / 2, (LS[1] + RS[1]) / 2)
    mid_hip = ((LH[0] + RH[0]) / 2, (LH[1] + RH[1]) / 2)

    angles = {
        "leftElbow":   calculate_angle(LS, LE, LW),
        "rightElbow":  calculate_angle(RS, RE, RW),
        "leftShoulder": calculate_angle(LE, LS, LH),
        "rightShoulder": calculate_angle(RE, RS, RH),
        "leftHip":     calculate_angle(LS, LH, LK),
        "rightHip":    calculate_angle(RS, RH, RK),
        "leftKnee":    calculate_angle(LH, LK, LA),
        "rightKnee":   calculate_angle(RH, RK, RA),
        "torsoTilt":   calculate_angle(NO, mid_hip, (mid_hip[0], mid_hip[1]-1)),  # vs vertical
        "shoulderTilt": calculate_angle(LS, RS, (RS[0], RS[1]-1))                # vs horizontal
    }

    return angles
