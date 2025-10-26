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

            # process frame
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            frame_rgb.flags.writeable = False
            results = holistic.process(frame_rgb)

            # extract angles and landmarks if pose detected
            if results.pose_landmarks:
                try:
                    angles = extract_joint_angles(results.pose_landmarks.landmark)

                    # Store landmark coordinates for skeleton overlay
                    landmarks = []
                    for landmark in results.pose_landmarks.landmark:
                        landmarks.append({
                            "x": landmark.x,
                            "y": landmark.y,
                            "z": landmark.z,
                            "visibility": landmark.visibility
                        })

                    frames_data.append({
                        "frame_index": frame_index,
                        "timestamp": cap.get(cv2.CAP_PROP_POS_MSEC) / 1000.0,
                        "angles": angles,
                        "landmarks": landmarks  # Added for skeleton overlay
                    })
                except Exception as e:
                    print(f"Error processing frame {frame_index}: {e}")

            frame_index += 1

    fps = cap.get(cv2.CAP_PROP_FPS)
    cap.release()

    with open(output_json, "w") as f:
        json.dump({
            "title": "Reference Dance",
            "fps": fps,
            "total_frames": frame_index,
            "frames": frames_data
        }, f, indent=2)

    print(f"Processed {len(frames_data)} frames from {video_path}")
    print(f"Saved to {output_json}")
    return output_json


if __name__ == "__main__":
    process_reference_video("test.mp4")