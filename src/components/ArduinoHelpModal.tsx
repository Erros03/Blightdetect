import React, { useState } from 'react';
import { X, Copy, Check, Terminal, Cpu, AlertTriangle, ShieldCheck, Play, Power, RotateCcw } from 'lucide-react';

interface ArduinoHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const THESIS_ARDUINO_SKETCH = `/*
  ==================================================================================
  AUTOMATED TOMATO DETECTION AND SORTING CONVEYOR SYSTEM
  College Thesis Prototype - Arduino Uno Firmware
  ==================================================================================
  Hardware Connections:
    - 12V DC Motor via L298N Motor Driver (WITHOUT ENA PIN):
        * ENA -> Leave BLACK JUMPER ON the 2 ENA header pins (Permanently 100% 5V enabled!)
        * No wire needed to Arduino Pin 5!
        * IN1 -> Arduino Pin D4 (Forward: HIGH, Stop: LOW)
        * IN2 -> Arduino Pin D3 (Forward: LOW,  Stop: LOW)
    
    - IR / Photoelectric Obstacle Sensor (Active LOW):
        * OUT -> Arduino Pin D2 (Detection Zone under Camera)
        * VCC -> Arduino 5V
        * GND -> Common Ground
    
    - Servo Motors (Signal pins to Arduino, Power from 5V Buck Converter):
        * Blight / Reject Servo -> Arduino Pin D9
        * Ripe Servo            -> Arduino Pin D10
        * Unripe Servo          -> Arduino Pin D11
        * Size: Small Servo     -> Arduino Pin D6
        * Size: Medium Servo    -> Arduino Pin D7
        * Size: Large Servo     -> Arduino Pin D12
        * VCC (All Servos)      -> Buck Converter 5V Output Rail
        * GND (All Servos)      -> Common Ground
    
    CRITICAL NOTE: Connect the GND of the 12V Power Supply, Buck Converter 5V GND, 
                   L298N GND, and Arduino GND together (Common Ground).

  Baud Rate: 9600
  ==================================================================================
*/

#include <Servo.h>

// 1. PIN DEFINITIONS
// Note: Leave black jumper ON the ENA pins on L298N! No wire needed to ENA.
const uint8_t PIN_IN1 = 5;       // Motor speed & direction (PWM Pin D5 -> IN1 on L298N)
const uint8_t PIN_IN2 = 3;       // Motor direction (Arduino Pin D3 -> IN2 on L298N)
const uint8_t PIN_IR_CAMERA  = 2; // IR Sensor at camera detection zone (Active LOW)
const uint8_t PIN_STATUS_LED = 13; // Built-in indicator LED

// Servo Motor Pins
const uint8_t PIN_SERVO_BLIGHT = 9;   // Disease reject arm
const uint8_t PIN_SERVO_RIPE   = 10;  // Ripe sorter arm
const uint8_t PIN_SERVO_UNRIPE = 11;  // Unripe sorter arm
const uint8_t PIN_SERVO_SMALL  = 6;   // Size: Small sorter
const uint8_t PIN_SERVO_MEDIUM = 7;   // Size: Medium sorter
const uint8_t PIN_SERVO_LARGE  = 12;  // Size: Large sorter

// 2. ADJUSTABLE TUNING PARAMETERS
const bool AUTO_START_ON_BOOT = true; // Set to true: Conveyor starts immediately on power-on!
const uint8_t CONVEYOR_SPEED = 160;  // Set to 160 for smooth, controlled conveyor speed
const int SERVO_REST_ANGLE = 0;   // Retracted / normal position
const int SERVO_PUSH_ANGLE = 90;  // Extended position to divert tomato

const unsigned long SERVO_ACTION_TIME_MS   = 700;  // Extension duration
const unsigned long SERVO_RETURN_DELAY_MS  = 300;  // Settle time
const unsigned long SORT_TRAVEL_DELAY_MS   = 1200; // Camera to sorter transit time
const unsigned long DETECTION_COOLDOWN_MS = 2500; // Duplicate trigger lockout
const unsigned long SENSOR_DEBOUNCE_MS     = 100;  // Debounce time

// 3. SYSTEM STATES & ACTION DEFINITIONS
enum SystemState {
  STATE_STOPPED,
  STATE_RUNNING,
  STATE_PAUSED,
  STATE_WAIT_SORT_POSITION,
  STATE_SORTING_ACTIVE,
  STATE_COOLDOWN
};

enum SortAction {
  ACTION_NONE = 0,
  ACTION_BLIGHT,
  ACTION_RIPE,
  ACTION_UNRIPE,
  ACTION_SMALL,
  ACTION_MEDIUM,
  ACTION_LARGE
};

Servo servoBlight, servoRipe, servoUnripe, servoSmall, servoMedium, servoLarge;
SystemState currentState = STATE_STOPPED;

const uint8_t QUEUE_MAX = 4;
SortAction actionQueue[QUEUE_MAX];
uint8_t queueHead = 0, queueTail = 0, queueCount = 0;

enum ServoSubState { SERVO_SUB_IDLE, SERVO_SUB_PUSHING, SERVO_SUB_RETURNING };
ServoSubState servoSubState = SERVO_SUB_IDLE;
SortAction activeAction = ACTION_NONE;
Servo* activeServoPtr = nullptr;
unsigned long servoTimer = 0, stateTimer = 0, lastDetectionTime = 0, lastIrDebounceTime = 0;
bool tomatoDetectedFlag = false, awaitingAiClassification = false;

String inputString = "";
bool stringComplete = false;

void startConveyor();
void stopConveyor();
void pauseConveyor();
void resumeConveyor();
void resetSystem();
void readSerialInput();
void processSerialCommand(const String& cmd);
void checkSensors();
void updateServoStateMachine();
void enqueueAction(SortAction act);
SortAction dequeueAction();
void clearActionQueue();
void attachAllServos();
void returnAllServosToRest();
Servo* getServoForAction(SortAction act);
void printSortActionStatus(SortAction act);

void setup() {
  Serial.begin(9600);
  inputString.reserve(64);

  // Configure L298N pins (Leave black jumper ON ENA! Pin 5 -> IN1, Pin 3 -> IN2)
  pinMode(PIN_IN1, OUTPUT);
  pinMode(PIN_IN2, OUTPUT);
  stopConveyor();

  pinMode(PIN_IR_CAMERA, INPUT_PULLUP);
  pinMode(PIN_STATUS_LED, OUTPUT);
  digitalWrite(PIN_STATUS_LED, LOW);

  attachAllServos();
  returnAllServosToRest();
  delay(500);

  if (AUTO_START_ON_BOOT) {
    startConveyor();
    Serial.println(F("SYSTEM READY: AUTO_RUNNING"));
  } else {
    currentState = STATE_STOPPED;
    Serial.println(F("SYSTEM READY: STOPPED"));
  }
}

void loop() {
  readSerialInput();
  if (stringComplete) {
    processSerialCommand(inputString);
    inputString = "";
    stringComplete = false;
  }

  checkSensors();
  unsigned long now = millis();

  switch (currentState) {
    case STATE_STOPPED:
    case STATE_PAUSED:
      analogWrite(PIN_IN1, 0);
      digitalWrite(PIN_IN2, LOW);
      digitalWrite(PIN_STATUS_LED, LOW);
      break;

    case STATE_RUNNING:
      digitalWrite(PIN_STATUS_LED, HIGH);
      if (awaitingAiClassification && queueCount > 0) {
        stateTimer = now;
        currentState = STATE_WAIT_SORT_POSITION;
      }
      break;

    case STATE_WAIT_SORT_POSITION:
      if (now - stateTimer >= SORT_TRAVEL_DELAY_MS) {
        stopConveyor();
        Serial.println(F("CONVEYOR STOPPED"));
        currentState = STATE_SORTING_ACTIVE;
        servoSubState = SERVO_SUB_IDLE;
      }
      break;

    case STATE_SORTING_ACTIVE:
      updateServoStateMachine();
      break;

    case STATE_COOLDOWN:
      if (now - stateTimer >= 400) {
        awaitingAiClassification = false;
        tomatoDetectedFlag = false;
        lastDetectionTime = now;
        startConveyor();
        Serial.println(F("CONVEYOR RESUMED"));
        currentState = STATE_RUNNING;
      }
      break;
  }
}

void startConveyor() {
  if (currentState == STATE_SORTING_ACTIVE) return;
  // Brief 120ms kickstart to overcome belt static friction
  analogWrite(PIN_IN1, 255);
  digitalWrite(PIN_IN2, LOW);
  delay(120);

  // Settle at calibrated 160 speed
  analogWrite(PIN_IN1, CONVEYOR_SPEED);
  digitalWrite(PIN_IN2, LOW);
  currentState = STATE_RUNNING;
  digitalWrite(PIN_STATUS_LED, HIGH);
  Serial.println(F("CONVEYOR STARTED (SPEED 160)"));
}

void stopConveyor() {
  analogWrite(PIN_IN1, 0);
  digitalWrite(PIN_IN2, LOW);
  digitalWrite(PIN_STATUS_LED, LOW);
}

void pauseConveyor() {
  stopConveyor();
  currentState = STATE_PAUSED;
  Serial.println(F("CONVEYOR PAUSED"));
}

void resumeConveyor() {
  if (currentState == STATE_PAUSED || currentState == STATE_STOPPED) {
    startConveyor();
    Serial.println(F("CONVEYOR RESUMED"));
  }
}

void resetSystem() {
  stopConveyor();
  clearActionQueue();
  returnAllServosToRest();
  awaitingAiClassification = false;
  tomatoDetectedFlag = false;
  lastDetectionTime = millis();
  currentState = STATE_STOPPED;
  Serial.println(F("SYSTEM RESET COMPLETE"));
  Serial.println(F("SYSTEM READY"));
}

void checkSensors() {
  if (currentState != STATE_RUNNING) return;
  unsigned long now = millis();
  if (now - lastDetectionTime < DETECTION_COOLDOWN_MS) return;

  int reading = digitalRead(PIN_IR_CAMERA);
  if (reading == LOW && !tomatoDetectedFlag) {
    if (now - lastIrDebounceTime > SENSOR_DEBOUNCE_MS) {
      tomatoDetectedFlag = true;
      awaitingAiClassification = true;
      lastDetectionTime = now;
      clearActionQueue();
      Serial.println(F("TOMATO DETECTED"));
    }
  } else if (reading == HIGH) {
    lastIrDebounceTime = now;
  }
}

void updateServoStateMachine() {
  unsigned long now = millis();
  switch (servoSubState) {
    case SERVO_SUB_IDLE:
      if (queueCount > 0) {
        activeAction = dequeueAction();
        activeServoPtr = getServoForAction(activeAction);
        if (activeServoPtr != nullptr) {
          printSortActionStatus(activeAction);
          activeServoPtr->write(SERVO_PUSH_ANGLE);
          servoTimer = now;
          servoSubState = SERVO_SUB_PUSHING;
        }
      } else {
        Serial.println(F("SORTING COMPLETE"));
        stateTimer = now;
        currentState = STATE_COOLDOWN;
      }
      break;

    case SERVO_SUB_PUSHING:
      if (now - servoTimer >= SERVO_ACTION_TIME_MS) {
        if (activeServoPtr != nullptr) {
          activeServoPtr->write(SERVO_REST_ANGLE);
        }
        servoTimer = now;
        servoSubState = SERVO_SUB_RETURNING;
      }
      break;

    case SERVO_SUB_RETURNING:
      if (now - servoTimer >= SERVO_RETURN_DELAY_MS) {
        activeServoPtr = nullptr;
        activeAction = ACTION_NONE;
        servoSubState = SERVO_SUB_IDLE;
      }
      break;
  }
}

Servo* getServoForAction(SortAction act) {
  switch (act) {
    case ACTION_BLIGHT: return &servoBlight;
    case ACTION_RIPE:   return &servoRipe;
    case ACTION_UNRIPE: return &servoUnripe;
    case ACTION_SMALL:  return &servoSmall;
    case ACTION_MEDIUM: return &servoMedium;
    case ACTION_LARGE:  return &servoLarge;
    default:            return nullptr;
  }
}

void printSortActionStatus(SortAction act) {
  switch (act) {
    case ACTION_BLIGHT: Serial.println(F("SORTING: BLIGHT")); break;
    case ACTION_RIPE:   Serial.println(F("SORTING: RIPE"));   break;
    case ACTION_UNRIPE: Serial.println(F("SORTING: UNRIPE")); break;
    case ACTION_SMALL:  Serial.println(F("SORTING: SMALL"));  break;
    case ACTION_MEDIUM: Serial.println(F("SORTING: MEDIUM")); break;
    case ACTION_LARGE:  Serial.println(F("SORTING: LARGE"));  break;
    default: break;
  }
}

void enqueueAction(SortAction act) {
  if (queueCount < QUEUE_MAX) {
    actionQueue[queueTail] = act;
    queueTail = (queueTail + 1) % QUEUE_MAX;
    queueCount++;
  }
}

SortAction dequeueAction() {
  if (queueCount == 0) return ACTION_NONE;
  SortAction act = actionQueue[queueHead];
  queueHead = (queueHead + 1) % QUEUE_MAX;
  queueCount--;
  return act;
}

void clearActionQueue() {
  queueHead = 0; queueTail = 0; queueCount = 0;
}

void attachAllServos() {
  if (!servoBlight.attached()) servoBlight.attach(PIN_SERVO_BLIGHT);
  if (!servoRipe.attached())   servoRipe.attach(PIN_SERVO_RIPE);
  if (!servoUnripe.attached()) servoUnripe.attach(PIN_SERVO_UNRIPE);
  if (!servoSmall.attached())  servoSmall.attach(PIN_SERVO_SMALL);
  if (!servoMedium.attached()) servoMedium.attach(PIN_SERVO_MEDIUM);
  if (!servoLarge.attached())  servoLarge.attach(PIN_SERVO_LARGE);
}

void returnAllServosToRest() {
  servoBlight.write(SERVO_REST_ANGLE);
  servoRipe.write(SERVO_REST_ANGLE);
  servoUnripe.write(SERVO_REST_ANGLE);
  servoSmall.write(SERVO_REST_ANGLE);
  servoMedium.write(SERVO_REST_ANGLE);
  servoLarge.write(SERVO_REST_ANGLE);
}

void readSerialInput() {
  while (Serial.available()) {
    char inChar = (char)Serial.read();
    if (inChar == '\\n' || inChar == '\\r') {
      if (inputString.length() > 0) {
        stringComplete = true;
        break;
      }
    } else {
      inputString += inChar;
    }
  }
}

void processSerialCommand(const String& rawCmd) {
  String cmd = rawCmd;
  cmd.trim();
  cmd.toUpperCase();
  if (cmd.length() == 0) return;

  if (cmd == "START") {
    startConveyor();
    Serial.println(F("CONVEYOR STARTED"));
  }
  else if (cmd == "MOTOR_FWD") {
    analogWrite(PIN_IN1, CONVEYOR_SPEED);
    digitalWrite(PIN_IN2, LOW);
    currentState = STATE_RUNNING;
    Serial.println(F("MOTOR FORWARD (SPEED 160)"));
  }
  else if (cmd == "MOTOR_REV") {
    analogWrite(PIN_IN1, 0);
    digitalWrite(PIN_IN2, HIGH);
    currentState = STATE_RUNNING;
    Serial.println(F("MOTOR REVERSE"));
  }
  else if (cmd == "STOP") {
    stopConveyor();
    currentState = STATE_STOPPED;
    Serial.println(F("CONVEYOR STOPPED"));
  }
  else if (cmd == "PAUSE") {
    pauseConveyor();
  }
  else if (cmd == "RESUME") {
    resumeConveyor();
  }
  else if (cmd == "RESET") {
    resetSystem();
  }
  else if (cmd == "BLIGHT") {
    Serial.println(F("AI RESULT: BLIGHT"));
    enqueueAction(ACTION_BLIGHT);
    if (currentState == STATE_RUNNING) {
      stateTimer = millis();
      currentState = STATE_WAIT_SORT_POSITION;
    }
  }
  else if (cmd == "HEALTHY") {
    Serial.println(F("AI RESULT: HEALTHY"));
  }
  else if (cmd == "RIPE") {
    Serial.println(F("RIPENESS: RIPE"));
    enqueueAction(ACTION_RIPE);
    if (currentState == STATE_RUNNING) {
      stateTimer = millis();
      currentState = STATE_WAIT_SORT_POSITION;
    }
  }
  else if (cmd == "UNRIPE") {
    Serial.println(F("RIPENESS: UNRIPE"));
    enqueueAction(ACTION_UNRIPE);
    if (currentState == STATE_RUNNING) {
      stateTimer = millis();
      currentState = STATE_WAIT_SORT_POSITION;
    }
  }
  else if (cmd == "SMALL") {
    Serial.println(F("SIZE: SMALL"));
    enqueueAction(ACTION_SMALL);
  }
  else if (cmd == "MEDIUM") {
    Serial.println(F("SIZE: MEDIUM"));
    enqueueAction(ACTION_MEDIUM);
  }
  else if (cmd == "LARGE") {
    Serial.println(F("SIZE: LARGE"));
    enqueueAction(ACTION_LARGE);
  }
  else if (cmd.startsWith("TEST_")) {
    String testTarget = cmd.substring(5);
    stopConveyor();
    if (testTarget == "BLIGHT") enqueueAction(ACTION_BLIGHT);
    else if (testTarget == "RIPE") enqueueAction(ACTION_RIPE);
    else if (testTarget == "UNRIPE") enqueueAction(ACTION_UNRIPE);
    else if (testTarget == "SMALL") enqueueAction(ACTION_SMALL);
    else if (testTarget == "MEDIUM") enqueueAction(ACTION_MEDIUM);
    else if (testTarget == "LARGE") enqueueAction(ACTION_LARGE);
    
    currentState = STATE_SORTING_ACTIVE;
    servoSubState = SERVO_SUB_IDLE;
  }
  else if (cmd == "STATUS") {
    Serial.print(F("STATE: "));
    switch (currentState) {
      case STATE_STOPPED: Serial.println(F("STOPPED")); break;
      case STATE_RUNNING: Serial.println(F("RUNNING")); break;
      case STATE_PAUSED:  Serial.println(F("PAUSED")); break;
      case STATE_WAIT_SORT_POSITION: Serial.println(F("WAITING_POSITION")); break;
      case STATE_SORTING_ACTIVE:     Serial.println(F("SORTING_ACTIVE")); break;
      case STATE_COOLDOWN:           Serial.println(F("COOLDOWN")); break;
    }
  }
  else {
    Serial.print(F("UNKNOWN COMMAND: "));
    Serial.println(cmd);
  }
}`;

export const ArduinoHelpModal: React.FC<ArduinoHelpModalProps> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(THESIS_ARDUINO_SKETCH);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 dark:border-stone-800">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-stone-900 dark:text-white">
                Thesis Prototype Arduino Firmware & Wiring Reference
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                L298N Conveyor Motor + IR Camera Trigger + 6-Servo Routing (Blight, Ripe, Unripe, Small, Medium, Large)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="overflow-y-auto p-6 space-y-6">
          {/* Why it was not moving checklist */}
          <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-900 dark:text-amber-200 flex items-center space-x-1.5">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <span>Crucial Operating Details for this Firmware:</span>
            </h3>
            <ul className="text-xs space-y-1.5 text-amber-950 dark:text-amber-200 list-disc list-inside leading-relaxed">
              <li>
                <strong>Conveyor starts in STOPPED state on boot:</strong> The Arduino code enforces that sorting actions only trigger when the conveyor is actively running (<code className="font-mono font-bold bg-amber-100 dark:bg-amber-900/60 px-1 py-0.5 rounded">STATE_RUNNING</code>). Click the green <strong>&ldquo;Start Conveyor&rdquo;</strong> button in the web app to engage the motor!
              </li>
              <li>
                <strong>Testing Individual Servos:</strong> To test arms while stopped, use the <strong>&ldquo;Test Arms&rdquo;</strong> buttons in the web app (which send <code className="font-mono bg-amber-100 dark:bg-amber-900/60 px-1 py-0.5 rounded">TEST_BLIGHT</code>, <code className="font-mono bg-amber-100 dark:bg-amber-900/60 px-1 py-0.5 rounded">TEST_RIPE</code>, etc.).
              </li>
              <li>
                <strong>Common Ground Warning:</strong> Make sure the GND of the 12V Motor Power Supply, 5V Servo Buck Converter, L298N, and Arduino Uno are all tied together!
              </li>
            </ul>
          </div>

          {/* Pinout Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="p-3.5 rounded-2xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700/60 space-y-1.5">
              <h4 className="font-bold text-stone-900 dark:text-white flex items-center gap-1.5">
                <Play className="h-3.5 w-3.5 text-blue-500" /> L298N Conveyor Motor
              </h4>
              <p className="text-stone-600 dark:text-stone-300 font-mono text-[11px]">• ENA: Black Jumper ON</p>
              <p className="text-stone-600 dark:text-stone-300 font-mono text-[11px]">• IN1: Pin D5 (Speed 145 PWM)</p>
              <p className="text-stone-600 dark:text-stone-300 font-mono text-[11px]">• IN2: Pin D3 (Direction)</p>
            </div>

            <div className="p-3.5 rounded-2xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700/60 space-y-1.5">
              <h4 className="font-bold text-stone-900 dark:text-white flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-amber-500" /> Servos 1 & 2
              </h4>
              <p className="text-stone-600 dark:text-stone-300 font-mono text-[11px]">• Servo 1 (Unripe): Pin D9</p>
              <p className="text-stone-600 dark:text-stone-300 font-mono text-[11px]">• Servo 2 (Small): Pin D10</p>
              <p className="text-stone-600 dark:text-stone-300 font-mono text-[11px]">• Blight: Rolls straight (No Servo)</p>
            </div>

            <div className="p-3.5 rounded-2xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700/60 space-y-1.5">
              <h4 className="font-bold text-stone-900 dark:text-white flex items-center gap-1.5">
                <Cpu className="h-3.5 w-3.5 text-emerald-500" /> Servos 3, 4 & IR
              </h4>
              <p className="text-stone-600 dark:text-stone-300 font-mono text-[11px]">• Servo 3 (Medium): Pin D11</p>
              <p className="text-stone-600 dark:text-stone-300 font-mono text-[11px]">• Servo 4 (Large): Pin D6</p>
              <p className="text-stone-600 dark:text-stone-300 font-mono text-[11px]">• IR Sensor: Pin D2 (Active LOW)</p>
            </div>
          </div>

          {/* Code Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-xs font-bold text-stone-900 dark:text-white">
                <Terminal className="h-4 w-4 text-emerald-600" />
                <span>Your Thesis Arduino Firmware (.ino)</span>
              </div>
              <button
                onClick={handleCopy}
                className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? 'Copied to Clipboard!' : 'Copy Thesis Sketch'}</span>
              </button>
            </div>
            <pre className="p-4 rounded-2xl bg-stone-900 text-emerald-400 font-mono text-[11px] overflow-x-auto max-h-72 border border-stone-800 leading-relaxed selection:bg-emerald-700 selection:text-white">
              {THESIS_ARDUINO_SKETCH}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-stone-50 dark:bg-stone-800/40 border-t border-stone-200 dark:border-stone-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-stone-900 text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white transition-colors cursor-pointer"
          >
            Close Reference
          </button>
        </div>
      </div>
    </div>
  );
};
