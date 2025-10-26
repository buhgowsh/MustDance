import cv2
import mediapipe as mp
import json
from calculations import extract_joint_angles


def process_reference_video(video_path, output_json="reference_dance.json"):
    mp_holistic = mp.solutions.holistic
    cap = cv2.VideoCapture(video_path)

    frames_data = []
    frame_index = 0

    with mp_holistic.Holistic(min_detection_confidence=0.5, min_tracking_confidence=0.5) as holistic:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            # Process frame
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            frame_rgb.flags.writeable = False
            results = holistic.process(frame_rgb)

            # Extract angles if pose detected
            if results.pose_landmarks:
                try:
                    angles = extract_joint_angles(results.pose_landmarks.landmark)
                    frames_data.append({
                        "frame_index": frame_index,
                        "timestamp": cap.get(cv2.CAP_PROP_POS_MSEC) / 1000.0,  # seconds
                        "angles": angles
                    })
                except Exception as e:
                    print(f"Error processing frame {frame_index}: {e}")

            frame_index += 1

    cap.release()

    # Save to JSON
    fps = cap.get(cv2.CAP_PROP_FPS)
    with open(output_json, "w") as f:
        json.dump({
            "title": "Reference Dance",
            "fps": fps,
            "total_frames": frame_index,
            "frames": frames_data
        }, f, indent=2)

    print(f"Processed {len(frames_data)} frames from {video_path}")
    return output_json


if __name__ == "__main__":
    process_reference_video("september.mp4")
