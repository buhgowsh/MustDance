import cv2
import mediapipe as mp
import json
import numpy as np
from calculations import extract_joint_angles
import time
from fastapi.responses import StreamingResponse
from fastapi import FastAPI
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
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
        with open(reference_json_path, 'r') as f:
            self.reference_data = json.load(f)

        self.reference_frames = self.reference_data['frames']
        self.reference_fps = self.reference_data.get('fps', 30)
        self.playback_speed = playback_speed  # 0.5 = half speed, 1.0 = normal, 2.0 = double

        self.mp_holistic = mp.solutions.holistic
        self.mp_drawing = mp.solutions.drawing_utils
        self.mp_pose = mp.solutions.pose

        self.start_time = None
        self.current_ref_index = 0
        self.paused = False

    def calculate_similarity_score(self, live_angles, ref_angles):
        if not live_angles or not ref_angles:
            return 0.0

        total_score = 0
        count = 0

        # weight for different joints (more important joints have higher weight)
        joint_weights = {
            'leftElbow': 1.0,
            'rightElbow': 1.0,
            'leftShoulder': 1.5,
            'rightShoulder': 1.5,
            'leftHip': 2.0,  # Core movements are most important
            'rightHip': 2.0,
            'leftKnee': 1.5,
            'rightKnee': 1.5,
            'torsoTilt': 2.5,  # Body position is critical
            'shoulderTilt': 1.5
        }

        for joint in live_angles.keys():
            if joint in ref_angles:
                diff = abs(live_angles[joint] - ref_angles[joint])

                # More aggressive scoring - penalize differences more
                # Perfect match (0 deg) = 100%, 15 deg = 75%, 30 deg = 50%, 45 deg = 25%, 60+ deg = 0%
                if diff <= 15:
                    score = 100 - (diff / 15 * 25)  # 100 to 75
                elif diff <= 30:
                    score = 75 - ((diff - 15) / 15 * 25)  # 75 to 50
                elif diff <= 45:
                    score = 50 - ((diff - 30) / 15 * 25)  # 50 to 25
                elif diff <= 60:
                    score = 25 - ((diff - 45) / 15 * 25)  # 25 to 0
                else:
                    score = 0

                weight = joint_weights.get(joint, 1.0)
                total_score += score * weight
                count += weight

        if count == 0:
            return 0.0

        similarity = total_score / count
        return max(0.0, min(100.0, similarity))

    def get_joint_scores(self, live_angles, ref_angles):
        """Get individual joint accuracy scores"""
        scores = {}
        for joint in live_angles.keys():
            if joint in ref_angles:
                diff = abs(live_angles[joint] - ref_angles[joint])

                # Same aggressive scoring as overall
                if diff <= 15:
                    score = 100 - (diff / 15 * 25)
                elif diff <= 30:
                    score = 75 - ((diff - 15) / 15 * 25)
                elif diff <= 45:
                    score = 50 - ((diff - 30) / 15 * 25)
                elif diff <= 60:
                    score = 25 - ((diff - 45) / 15 * 25)
                else:
                    score = 0

                scores[joint] = max(0, score)
        return scores

    def draw_skeleton(self, frame, landmarks, color, thickness=2, alpha=1.0):
        if landmarks is None:
            return

        connections = self.mp_pose.POSE_CONNECTIONS
        h, w, _ = frame.shape

        if alpha < 1.0:
            overlay = frame.copy()
        else:
            overlay = frame

        # draw connections
        for connection in connections:
            start_idx = connection[0]
            end_idx = connection[1]

            start = landmarks[start_idx]
            end = landmarks[end_idx]

            if hasattr(start, 'visibility') and hasattr(end, 'visibility'):
                if start.visibility < 0.5 or end.visibility < 0.5:
                    continue

            start_point = (int(start.x * w), int(start.y * h))
            end_point = (int(end.x * w), int(end.y * h))

            cv2.line(overlay, start_point, end_point, color, thickness)

        # draw landmarks
        for landmark in landmarks:
            if hasattr(landmark, 'visibility') and landmark.visibility < 0.5:
                continue
            point = (int(landmark.x * w), int(landmark.y * h))
            cv2.circle(overlay, point, 4, color, -1)

        # apply transparency
        if alpha < 1.0:
            cv2.addWeighted(overlay, alpha, frame, 1 - alpha, 0, frame)

    def draw_info_panel(self, frame, similarity_score, joint_scores, frame_number):
        # Draw information panel with scores
        h, w, _ = frame.shape
        panel_height = 250
        panel = np.zeros((panel_height, w, 3), dtype=np.uint8)

        cv2.putText(panel, f"Accuracy: {similarity_score:.1f}% | Speed: {self.playback_speed:.1f}x",
                    (10, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)

        # frame info
        total_frames = len(self.reference_frames)
        progress_pct = (frame_number / total_frames) * 100 if total_frames > 0 else 0
        cv2.putText(panel, f"Progress: {frame_number}/{total_frames} ({progress_pct:.0f}%)",
                    (10, 70), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 200, 200), 1)

        # Color code for accuracy - MORE STRICT THRESHOLDS
        if similarity_score >= 90:
            color = (0, 255, 0)  # green, excellent
            status = "Excellent!"
        elif similarity_score >= 75:
            color = (0, 255, 255)  # yellow, good
            status = "Good"
        elif similarity_score >= 60:
            color = (0, 165, 255)  # orange, fair
            status = "Fair"
        elif similarity_score >= 40:
            color = (0, 100, 255)  # dark orange, Poor
            status = "Needs Work"
        else:
            color = (0, 0, 255)  # red, very Poor
            status = "Try Again"

        cv2.putText(panel, status, (w - 200, 35),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, color, 2)

        # progress bar
        bar_width = int((similarity_score / 100) * (w - 40))
        cv2.rectangle(panel, (10, 90), (10 + bar_width, 115), color, -1)
        cv2.rectangle(panel, (10, 90), (w - 30, 115), (100, 100, 100), 2)

        cv2.putText(panel, "Live: GREEN | Reference: RED",
                    (10, 145), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)

        # individual joint scores
        if joint_scores:
            y_offset = 170
            sorted_joints = sorted(joint_scores.items(), key=lambda x: x[1])[:5]

            cv2.putText(panel, "Areas to improve:",
                        (10, y_offset), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 200, 100), 1)

            for i, (joint, score) in enumerate(sorted_joints):
                y_pos = y_offset + 25 + (i * 15)
                joint_color = (0, 255, 0) if score >= 80 else (0, 255, 255) if score >= 60 else (0, 0, 255)
                joint_name = joint.replace('left', 'L.').replace('right', 'R.')
                cv2.putText(panel, f"{joint_name}: {score:.0f}%",
                            (20, y_pos), cv2.FONT_HERSHEY_SIMPLEX, 0.45, joint_color, 1)

        # Controls
        cv2.putText(panel, "Controls: Q=Quit | R=Restart | SPACE=Pause | +/- Speed",
                    (w - 450, panel_height - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, (150, 150, 150), 1)

        return panel

    def run_comparison(self):
        # run real-time comparison with skeleton overlay
        webcam = cv2.VideoCapture(0)

        with self.mp_holistic.Holistic(min_detection_confidence=0.5, min_tracking_confidence=0.5) as holistic:

            self.start_time = time.time()
            pause_time = 0

            while webcam.isOpened():
                ret, frame = webcam.read()
                if not ret:
                    break

                # flip frame horizontally for mirror effect
                frame = cv2.flip(frame, 1)

                # calculate which reference frame to use
                if not self.paused:
                    elapsed_time = time.time() - self.start_time - pause_time
                    # apply playback speed
                    adjusted_time = elapsed_time * self.playback_speed
                    self.current_ref_index = int(adjusted_time * self.reference_fps) % len(self.reference_frames)

                # process live frame
                frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                frame_rgb.flags.writeable = False
                results = holistic.process(frame_rgb)
                frame_rgb.flags.writeable = True
                frame = cv2.cvtColor(frame_rgb, cv2.COLOR_RGB2BGR)

                similarity_score = 0
                joint_scores = {}

                # get reference frame data
                ref_frame = self.reference_frames[self.current_ref_index]

                # draw reference skeleton (RED, semi-transparent)
                if 'landmarks' in ref_frame:
                    ref_landmarks = [
                        Landmark(lm['x'], lm['y'], lm['z'], lm['visibility'])
                        for lm in ref_frame['landmarks']
                    ]
                    self.draw_skeleton(frame, ref_landmarks, (0, 0, 255), thickness=2, alpha=0.5)

                # process and draw live skeleton (GREEN)
                if results.pose_landmarks:
                    try:
                        # check if pose is valid (facing camera)
                        landmarks = results.pose_landmarks.landmark
                        mp_pose_landmarks = mp.solutions.pose.PoseLandmark

                        # check visibility of key landmarks
                        left_shoulder_vis = landmarks[mp_pose_landmarks.LEFT_SHOULDER].visibility
                        right_shoulder_vis = landmarks[mp_pose_landmarks.RIGHT_SHOULDER].visibility
                        left_hip_vis = landmarks[mp_pose_landmarks.LEFT_HIP].visibility
                        right_hip_vis = landmarks[mp_pose_landmarks.RIGHT_HIP].visibility

                        # if too many key points are not visible, person is likely sideways/turned away
                        key_visibility = [left_shoulder_vis, right_shoulder_vis, left_hip_vis, right_hip_vis]
                        avg_visibility = sum(key_visibility) / len(key_visibility)

                        if avg_visibility < 0.5:
                            # person is not facing camera properly
                            cv2.putText(frame, "FACE THE CAMERA!", (50, 100),
                                        cv2.FONT_HERSHEY_SIMPLEX, 1.5, (0, 0, 255), 3)
                            similarity_score = 0
                        else:
                            live_angles = extract_joint_angles(results.pose_landmarks.landmark)
                            ref_angles = ref_frame['angles']

                            similarity_score = self.calculate_similarity_score(live_angles, ref_angles)
                            joint_scores = self.get_joint_scores(live_angles, ref_angles)

                            # Draw live skeleton on top
                            self.draw_skeleton(frame, results.pose_landmarks.landmark,
                                               (0, 255, 0), thickness=3)

                    except Exception as e:
                        print(f"Error: {e}")

                info_panel = self.draw_info_panel(frame, similarity_score, joint_scores,
                                                  self.current_ref_index)

                combined = np.vstack([frame, info_panel])

                cv2.imshow("Dance Comparison: Overlay Mode", combined)

                # controls
                key = cv2.waitKey(1) & 0xFF
                if key == ord('q'):
                    break
                elif key == ord('r'):
                    self.start_time = time.time()
                    self.current_ref_index = 0
                    pause_time = 0
                    self.paused = False
                elif key == ord(' '):
                    self.paused = not self.paused
                    if self.paused:
                        pause_start = time.time()
                    else:
                        pause_time += time.time() - pause_start
                elif key == ord('+') or key == ord('='):  # Speed up
                    self.playback_speed = min(2.0, self.playback_speed + 0.1)
                    print(f"Speed: {self.playback_speed:.1f}x")
                elif key == ord('-') or key == ord('_'):  # Slow down
                    self.playback_speed = max(0.1, self.playback_speed - 0.1)
                    print(f"Speed: {self.playback_speed:.1f}x")

        _, buffer = cv2.imencode('.jpg', frame)
        frame = buffer.tobytes()

        # yields the frame in a format suitable for streaming
        yield b'--frame\r\n'b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n'


def video_feed():
    return StreamingResponse(DanceComparison.run_comparison, media_type='multipart/x-mixed-replace; boundary=frame')


@app.get('/video_feed')
def video_feed_endpoint():
    return video_feed()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
    comparator = DanceComparison("reference_dance.json", playback_speed=0.5)
    comparator.run_comparison()


