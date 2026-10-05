/**
 * Ultralytics YOLOv11 Edge Pipeline Script Template for BlightDetect+
 * Production-ready Python script for local conveyor sorting hardware.
 */

export const YOLO11_PYTHON_SCRIPT = `"""
BlightDetect+ Autonomous Conveyor Sorter & Blight Detection Pipeline
Ultralytics YOLOv11 Engine with Real-Time Calibration, Sizing, and Cloud Sync
"""

import time
import json
import threading
from queue import Queue
from dataclasses import dataclass, asdict
from typing import Optional, Tuple, Dict, Any

import cv2
import numpy as np
import requests
import serial
from ultralytics import YOLO

# Optional Firebase Admin SDK (if serviceAccountKey.json is present)
try:
    import firebase_admin
    from firebase_admin import credentials, firestore, db
    FIREBASE_AVAILABLE = True
except ImportError:
    FIREBASE_AVAILABLE = False

# ==============================================================================
# CONFIGURATION & CONSTANTS
# ==============================================================================
MODEL_WEIGHTS_PATH = "weights/best_yolo11n.pt"  # Custom trained YOLOv11 weights
CONF_THRESHOLD_TRACKING = 0.35                  # Tracking candidate threshold
CONF_THRESHOLD_ACTUATION = 0.95                 # 95% threshold for autonomous actuation
IOU_THRESHOLD = 0.45
CAMERA_INDEX = 0                                # USB Camera or RTSP Stream
FRAME_WIDTH = 640
FRAME_HEIGHT = 480

# Physical Camera Calibration (Millimeters per pixel at fixed conveyor height)
# (known object diameter in mm) / (observed bounding diameter in px)
MM_PER_PIXEL = 0.35

# Conveyor Virtual Actuation Trigger Plane (Y-coordinate across frame)
TRIGGER_LINE_Y = 240
TRIGGER_MARGIN = 22

# Serial Actuator (Arduino / ESP32 Relay Coils)
SERIAL_PORT = "/dev/ttyACM0"  # or 'COM3' on Windows
SERIAL_BAUD = 115200

# BlightDetect+ Web App Telemetry Ingest URL
WEB_APP_INGEST_URL = "http://localhost:3000/api/edge/ingest"

# Firebase Cloud Config
FIREBASE_CREDENTIALS_PATH = "serviceAccountKey.json"
FIREBASE_DATABASE_URL = "https://your-blightdetect-project.firebaseio.com"

# ==============================================================================
# DATA MODELS
# ==============================================================================
@dataclass
class DetectionRecord:
    session_id: str
    track_id: int
    timestamp: float
    created_at: str
    raw_class: str
    ripeness: str              # 'ripe' | 'unripe' | 'blight'
    blight_type: str           # 'early_blight' | 'late_blight' | 'none'
    severity: str              # 'mild' | 'moderate' | 'severe' | 'none'
    confidence: float
    confidence_percentage: float
    diameter_mm: float
    size_category: str         # 'small' | 'medium' | 'large'
    quality_grade: str         # 'Grade A' | 'Grade B' | 'Grade C'
    sorting_action: str        # 'ACCEPT' | 'REJECT_QUARANTINE' | 'MANUAL_REVIEW'
    bbox: Dict[str, float]


# ==============================================================================
# HARDWARE & CLOUD INTEGRATION
# ==============================================================================
class HardwareActuator:
    """Manages low-latency UART commands to Arduino/ESP32 relay coils."""
    def __init__(self, port: str, baud: int):
        self.ser: Optional[serial.Serial] = None
        try:
            self.ser = serial.Serial(port, baud, timeout=0.1)
            time.sleep(2.0)
            print(f"[Hardware] Connected to actuator MCU on {port}")
        except Exception as e:
            print(f"[Hardware Warning] Could not open serial port {port}: {e}")

    def trigger(self, action: str):
        if not self.ser or not self.ser.is_open:
            return
        cmd = b'A' if action == 'ACCEPT' else (b'R' if action == 'REJECT_QUARANTINE' else b'M')
        try:
            self.ser.write(cmd)
            self.ser.flush()
        except Exception as e:
            print(f"[Hardware Error] Command write failed: {e}")


class TelemetryDispatcher:
    """Dispatches detection records asynchronously to Web App and Firebase."""
    def __init__(self, web_url: str, cred_path: str, db_url: str):
        self.web_url = web_url
        self.queue = Queue(maxsize=1000)
        self.is_running = True
        self.firestore_db = None
        self.rtdb_ref = None

        if FIREBASE_AVAILABLE:
            try:
                cred = credentials.Certificate(cred_path)
                firebase_admin.initialize_app(cred, {'databaseURL': db_url})
                self.firestore_db = firestore.client()
                self.rtdb_ref = db.reference("live_conveyor_telemetry")
                print("[Firebase] Authenticated with Cloud Firestore & Realtime DB.")
            except Exception as e:
                print(f"[Firebase] Running without Cloud Admin credentials: {e}")

        self.thread = threading.Thread(target=self._worker, daemon=True)
        self.thread.start()

    def enqueue(self, record: DetectionRecord):
        if not self.queue.full():
            self.queue.put(record)

    def _worker(self):
        while self.is_running:
            try:
                record = self.queue.get(timeout=1.0)
            except Exception:
                continue

            payload = asdict(record)

            # 1. Post to BlightDetect+ Web App Ingest Endpoint
            try:
                requests.post(self.web_url, json=payload, timeout=0.8)
            except Exception:
                pass

            # 2. Update Firebase Cloud if enabled
            if self.firestore_db:
                try:
                    doc_id = f"det_{int(record.timestamp * 1000)}_{record.track_id}"
                    self.firestore_db.collection("detections").document(doc_id).set(payload)
                except Exception:
                    pass

            if self.rtdb_ref:
                try:
                    self.rtdb_ref.child("latest_item").set(payload)
                except Exception:
                    pass

            self.queue.task_done()


# ==============================================================================
# CLASSIFICATION, SIZING, AND GATING
# ==============================================================================
def parse_tomato_classification(label: str) -> Tuple[str, str, str]:
    clean = label.lower().replace("-", " ").replace("_", " ")
    if "late blight" in clean or "phytophthora" in clean:
        return "blight", "late_blight", "severe"
    elif "early blight" in clean or "alternaria" in clean:
        return "blight", "early_blight", "moderate"
    elif "blight" in clean or "defect" in clean or "rot" in clean:
        return "blight", "early_blight", "mild"
    elif "unripe" in clean or "green" in clean:
        return "unripe", "none", "none"
    else:
        return "ripe", "none", "none"


def classify_size(width_px: float, height_px: float) -> Tuple[float, str]:
    avg_px = (width_px + height_px) / 2.0
    diameter_mm = round(avg_px * MM_PER_PIXEL, 1)
    if diameter_mm < 50.0:
        size_category = "small"
    elif diameter_mm <= 70.0:
        size_category = "medium"
    else:
        size_category = "large"
    return diameter_mm, size_category


def evaluate_sorting_decision(ripeness: str, confidence: float, severity: str) -> Tuple[str, str]:
    # Strictly enforces Capstone 95% minimum confidence gating
    if confidence < CONF_THRESHOLD_ACTUATION:
        return "MANUAL_REVIEW", "Grade B"
    if ripeness == "blight":
        return "REJECT_QUARANTINE", "Grade C"
    elif ripeness == "unripe":
        return "ACCEPT", "Grade B"
    else:
        return "ACCEPT", "Grade A"


# ==============================================================================
# PIPELINE ENTRY POINT
# ==============================================================================
def main():
    session_id = f"yolo11_conveyor_{int(time.time())}"
    print(f"[*] Initializing Ultralytics YOLOv11 Engine: {session_id}")

    try:
        model = YOLO(MODEL_WEIGHTS_PATH)
    except Exception as e:
        print(f"[!] Custom weights '{MODEL_WEIGHTS_PATH}' not found. Downloading base yolo11n.pt...")
        model = YOLO("yolo11n.pt")

    actuator = HardwareActuator(port=SERIAL_PORT, baud=SERIAL_BAUD)
    dispatcher = TelemetryDispatcher(
        web_url=WEB_APP_INGEST_URL,
        cred_path=FIREBASE_CREDENTIALS_PATH,
        db_url=FIREBASE_DATABASE_URL
    )

    cap = cv2.VideoCapture(CAMERA_INDEX)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, FRAME_WIDTH)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, FRAME_HEIGHT)
    cap.set(cv2.CAP_PROP_FPS, 30)

    if not cap.isOpened():
        print(f"[!] Error: Could not open camera {CAMERA_INDEX}")
        return

    counted_tracks = set()
    prev_time = time.time()
    print("[*] YOLOv11 conveyor inspection loop active. Press 'q' to quit.")

    while True:
        ret, frame = cap.read()
        if not ret:
            continue

        fps = 1.0 / max(1e-5, (time.time() - prev_time))
        prev_time = time.time()

        # YOLOv11 Multi-Object Tracking
        results = model.track(
            source=frame,
            conf=CONF_THRESHOLD_TRACKING,
            iou=IOU_THRESHOLD,
            persist=True,
            tracker="bytetrack.yaml",
            verbose=False
        )

        annotated = frame.copy()
        cv2.line(annotated, (0, TRIGGER_LINE_Y), (FRAME_WIDTH, TRIGGER_LINE_Y), (255, 200, 0), 2)
        cv2.putText(annotated, "INSPECTION TRIGGER (95% CRITERIA)", (10, TRIGGER_LINE_Y - 8),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 200, 0), 1)

        if results and results[0].boxes and results[0].boxes.id is not None:
            boxes = results[0].boxes.xyxy.cpu().numpy()
            track_ids = results[0].boxes.id.int().cpu().numpy()
            confs = results[0].boxes.conf.cpu().numpy()
            classes = results[0].boxes.cls.int().cpu().numpy()

            for box, track_id, conf, cls_idx in zip(boxes, track_ids, confs, classes):
                x1, y1, x2, y2 = box
                width_px = x2 - x1
                height_px = y2 - y1
                center_y = (y1 + y2) / 2.0
                center_x = (x1 + x2) / 2.0

                label_name = model.names[cls_idx]
                ripeness, blight_type, severity = parse_tomato_classification(label_name)
                diameter_mm, size_category = classify_size(width_px, height_px)
                sorting_action, quality_grade = evaluate_sorting_decision(ripeness, float(conf), severity)

                # Actuation Plane Gating Check
                if (TRIGGER_LINE_Y - TRIGGER_MARGIN) <= center_y <= (TRIGGER_LINE_Y + TRIGGER_MARGIN):
                    if track_id not in counted_tracks:
                        counted_tracks.add(track_id)
                        actuator.trigger(sorting_action)

                        record = DetectionRecord(
                            session_id=session_id,
                            track_id=int(track_id),
                            timestamp=time.time(),
                            created_at=time.strftime("%Y-%m-%d %H:%M:%S"),
                            raw_class=label_name,
                            ripeness=ripeness,
                            blight_type=blight_type,
                            severity=severity,
                            confidence=round(float(conf), 4),
                            confidence_percentage=round(float(conf) * 100.0, 1),
                            diameter_mm=diameter_mm,
                            size_category=size_category,
                            quality_grade=quality_grade,
                            sorting_action=sorting_action,
                            bbox={"x": float(center_x), "y": float(center_y), "width": float(width_px), "height": float(height_px)}
                        )
                        dispatcher.enqueue(record)
                        print(f"[{sorting_action}] #{track_id} {label_name.upper()} {conf*100:.1f}% | {diameter_mm}mm ({size_category})")

                # Visual HUD
                color = (0, 220, 0) if sorting_action == 'ACCEPT' else ((0, 0, 230) if sorting_action == 'REJECT_QUARANTINE' else (0, 180, 255))
                cv2.rectangle(annotated, (int(x1), int(y1)), (int(x2), int(y2)), color, 2)
                cv2.putText(annotated, f"#{track_id} {label_name} {conf*100:.0f}% [{diameter_mm}mm]",
                            (int(x1), int(y1) - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 2)

        cv2.putText(annotated, f"YOLOv11 | FPS: {fps:.1f} | Sorted: {len(counted_tracks)}",
                    (15, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)

        cv2.imshow("BlightDetect+ YOLOv11 Edge Feed", annotated)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()
    dispatcher.is_running = False

if __name__ == "__main__":
    main()
`;
