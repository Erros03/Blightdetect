/**
 * Arduino & IoT Tomato Size Sorter Actuator Controller Modal
 * Supports Small, Medium, Large, and Reject bins via Web Serial API.
 */
import React, { useState, useEffect } from 'react';
import {
  Cpu,
  X,
  Zap,
  Play,
  CheckCircle2,
  AlertCircle,
  Copy,
  Terminal,
  RefreshCw,
  ExternalLink,
  Layers,
  Sparkles,
  ShieldCheck,
  Check,
  HelpCircle,
  Radio,
  Sliders,
} from 'lucide-react';
import {
  arduinoSerial,
  SerialLogEntry,
  SortingMode,
} from '../lib/arduino-serial.ts';

interface ArduinoConnectorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ARDUINO_SKETCH_CODE = `/*
 * =====================================================================
 * Tomato Conveyor Size Sorter (Small / Medium / Large)
 * Compatible with Arduino Uno, Nano, Mega, ESP32, etc.
 * =====================================================================
 * 
 * Hardware Setup:
 *   - Pin 9  : Sorter Servo Motor Signal (SG90 / MG996R)
 *   - Pin 3  : Blue LED   -> Small Tomato (< 60mm / < 4 oz)
 *   - Pin 4  : Green LED  -> Medium Slicing Tomato (60 - 75mm / 4 - 6 oz)
 *   - Pin 5  : Yellow LED -> Large Tomato (> 75mm / > 6 oz)
 *   - Pin 6  : Red LED    -> Defective / Cull (Optional)
 *   - Pin 7  : Buzzer     -> Alert on cull / gate action
 * 
 * Sorter Gate Angles (3-Way / 4-Way Chute):
 *   - 30°  : Chute 1 -> Small Bin
 *   - 90°  : Center  -> Medium Bin (Straight-through conveyor)
 *   - 150° : Chute 2 -> Large Bin
 *   - 180° : Chute 3 -> Cull / Reject Bin
 * 
 * Serial Commands (9600 Baud):
 *   'S' or '1' -> Route to SMALL Bin
 *   'M' or '2' -> Route to MEDIUM Bin
 *   'L' or '3' -> Route to LARGE Bin
 *   'R' or '4' -> Route to REJECT / DEFECT Bin
 *   'T'        -> Run diagnostic sweep of all 3 sizes
 * =====================================================================
 */

#include <Servo.h>

// --- Pin Definitions ---
const int SERVO_PIN   = 9;
const int LED_SMALL   = 3;  // Blue
const int LED_MEDIUM  = 4;  // Green
const int LED_LARGE   = 5;  // Yellow
const int LED_REJECT  = 6;  // Red
const int BUZZER_PIN  = 7;

// --- Chute Servo Angles ---
const int ANGLE_NEUTRAL = 90;   // Neutral idle position (Center)
const int ANGLE_SMALL   = 30;   // Divert left -> Small bin
const int ANGLE_MEDIUM  = 90;   // Straight pass -> Medium bin
const int ANGLE_LARGE   = 150;  // Divert right -> Large bin
const int ANGLE_REJECT  = 180;  // Full divert -> Reject bin

// --- Timing Configurations ---
const unsigned long GATE_DWELL_MS = 750; // Milliseconds gate stays open

Servo chuteServo;
unsigned long resetTimestamp = 0;
bool gateIsOpen = false;

void setup() {
  Serial.begin(9600);

  // Initialize Servo
  chuteServo.attach(SERVO_PIN);
  chuteServo.write(ANGLE_NEUTRAL);

  // Initialize LEDs & Buzzer
  pinMode(LED_SMALL, OUTPUT);
  pinMode(LED_MEDIUM, OUTPUT);
  pinMode(LED_LARGE, OUTPUT);
  pinMode(LED_REJECT, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);

  // Power-on Indicator Sequence
  digitalWrite(LED_SMALL, HIGH);
  delay(120);
  digitalWrite(LED_SMALL, LOW);
  digitalWrite(LED_MEDIUM, HIGH);
  delay(120);
  digitalWrite(LED_MEDIUM, LOW);
  digitalWrite(LED_LARGE, HIGH);
  delay(120);
  digitalWrite(LED_LARGE, LOW);

  Serial.println(F("{\\"ready\\":true,\\"system\\":\\"Tomato_Size_Sorter_v2\\",\\"modes\\":[\\"SMALL\\",\\"MEDIUM\\",\\"LARGE\\"]}"));
}

void loop() {
  // Listen for commands from the Computer Vision / Live Camera app
  if (Serial.available() > 0) {
    char input = Serial.read();

    if (input != '\\n' && input != '\\r') {
      routeTomatoBySize(input);
    }
  }

  // Non-blocking auto-reset back to neutral center after tomato has dropped into bin
  if (gateIsOpen && millis() >= resetTimestamp) {
    chuteServo.write(ANGLE_NEUTRAL);
    clearAllLEDs();
    gateIsOpen = false;
  }
}

void routeTomatoBySize(char sizeCode) {
  clearAllLEDs();

  switch (sizeCode) {
    // --- SMALL TOMATO ---
    case 'S':
    case 's':
    case '1':
      digitalWrite(LED_SMALL, HIGH);
      chuteServo.write(ANGLE_SMALL);
      gateIsOpen = true;
      resetTimestamp = millis() + GATE_DWELL_MS;
      Serial.println(F("{\\"size\\":\\"SMALL\\",\\"bin\\":1,\\"angle\\":30}"));
      break;

    // --- MEDIUM TOMATO ---
    case 'M':
    case 'm':
    case '2':
      digitalWrite(LED_MEDIUM, HIGH);
      chuteServo.write(ANGLE_MEDIUM);
      gateIsOpen = true;
      resetTimestamp = millis() + GATE_DWELL_MS;
      Serial.println(F("{\\"size\\":\\"MEDIUM\\",\\"bin\\":2,\\"angle\\":90}"));
      break;

    // --- LARGE TOMATO ---
    case 'L':
    case 'l':
    case '3':
      digitalWrite(LED_LARGE, HIGH);
      chuteServo.write(ANGLE_LARGE);
      gateIsOpen = true;
      resetTimestamp = millis() + GATE_DWELL_MS;
      Serial.println(F("{\\"size\\":\\"LARGE\\",\\"bin\\":3,\\"angle\\":150}"));
      break;

    // --- REJECT / DEFECTIVE ---
    case 'R':
    case 'r':
    case '4':
      digitalWrite(LED_REJECT, HIGH);
      digitalWrite(BUZZER_PIN, HIGH);
      chuteServo.write(ANGLE_REJECT);
      gateIsOpen = true;
      resetTimestamp = millis() + (GATE_DWELL_MS + 250);
      Serial.println(F("{\\"size\\":\\"REJECT\\",\\"bin\\":4,\\"angle\\":180}"));
      break;

    // --- SELF-TEST CYCLE ---
    case 'T':
    case 't':
      runSizeBenchmarkTest();
      break;

    default:
      Serial.print(F("{\\"unknown_command\\":\\""));
      Serial.print(sizeCode);
      Serial.println(F("\\"}"));
      break;
  }
}

void clearAllLEDs() {
  digitalWrite(LED_SMALL, LOW);
  digitalWrite(LED_MEDIUM, LOW);
  digitalWrite(LED_LARGE, LOW);
  digitalWrite(LED_REJECT, LOW);
  digitalWrite(BUZZER_PIN, LOW);
}

void runSizeBenchmarkTest() {
  Serial.println(F("{\\"status\\":\\"TESTING_SMALL_BIN\\"}"));
  digitalWrite(LED_SMALL, HIGH);
  chuteServo.write(ANGLE_SMALL);
  delay(600);
  digitalWrite(LED_SMALL, LOW);

  Serial.println(F("{\\"status\\":\\"TESTING_MEDIUM_BIN\\"}"));
  digitalWrite(LED_MEDIUM, HIGH);
  chuteServo.write(ANGLE_MEDIUM);
  delay(600);
  digitalWrite(LED_MEDIUM, LOW);

  Serial.println(F("{\\"status\\":\\"TESTING_LARGE_BIN\\"}"));
  digitalWrite(LED_LARGE, HIGH);
  chuteServo.write(ANGLE_LARGE);
  delay(600);
  digitalWrite(LED_LARGE, LOW);

  chuteServo.write(ANGLE_NEUTRAL);
  clearAllLEDs();
  Serial.println(F("{\\"status\\":\\"TEST_COMPLETED\\"}"));
}
`;

export const ArduinoConnectorModal: React.FC<ArduinoConnectorModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'control' | 'guide' | 'code'>('control');
  const [isConnected, setIsConnected] = useState<boolean>(arduinoSerial.getConnected());
  const [logs, setLogs] = useState<SerialLogEntry[]>(arduinoSerial.getLogs());
  const [autoTrigger, setAutoTrigger] = useState<boolean>(arduinoSerial.getAutoTrigger());
  const [sortingMode, setSortingMode] = useState<SortingMode>(arduinoSerial.getSortingMode());
  const [baudRate, setBaudRate] = useState<number>(9600);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  const isWebSerialSupported = arduinoSerial.isSupported();
  const isInIframe = typeof window !== 'undefined' && window.self !== window.top;

  useEffect(() => {
    const unsubscribe = arduinoSerial.subscribe((newLogs, connected) => {
      setLogs([...newLogs]);
      setIsConnected(connected);
      if (connected) {
        setConnectError(null);
      }
      setAutoTrigger(arduinoSerial.getAutoTrigger());
      setSortingMode(arduinoSerial.getSortingMode());
    });
    return () => unsubscribe();
  }, []);

  if (!isOpen) return null;

  const handleConnect = async () => {
    setIsConnecting(true);
    setConnectError(null);
    const result = await arduinoSerial.connect(baudRate);
    setIsConnecting(false);
    if (!result.success) {
      setConnectError(result.message);
    }
  };

  const handleDisconnect = async () => {
    await arduinoSerial.disconnect();
  };

  const handleSendTestCommand = (cmd: string, name: string) => {
    setLastAction(name);
    arduinoSerial.sendCommand(cmd);
    setTimeout(() => setLastAction(null), 1200);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(ARDUINO_SKETCH_CODE);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleToggleAutoTrigger = () => {
    const next = !autoTrigger;
    setAutoTrigger(next);
    arduinoSerial.setAutoTrigger(next);
  };

  const handleChangeSortingMode = (mode: SortingMode) => {
    setSortingMode(mode);
    arduinoSerial.setSortingMode(mode);
  };

  return (
    <div
      id="arduino-modal-container"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-3xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-2xl overflow-hidden transition-all text-stone-900 dark:text-stone-100">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/60">
          <div className="flex items-center space-x-3">
            <div className={`p-2.5 rounded-2xl ${isConnected ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400' : 'bg-stone-200 dark:bg-stone-800 text-stone-600 dark:text-stone-400'}`}>
              <Cpu className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-bold">Arduino / IoT Tomato Size Sorter</h2>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                    isConnected
                      ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                      : 'bg-stone-200 dark:bg-stone-800 text-stone-600 dark:text-stone-400'
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full mr-1.5 ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-stone-400'}`} />
                  {isConnected ? 'USB Connected' : 'Disconnected / Standby'}
                </span>
              </div>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Direct Web Serial interface to control physical servo sorting gates (Small, Medium, Large)
              </p>
            </div>
          </div>

          <button
            id="btn-close-arduino-modal"
            onClick={onClose}
            className="p-2 rounded-xl text-stone-400 hover:text-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800 dark:hover:text-stone-200 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-stone-200 dark:border-stone-800 px-6 bg-stone-100/50 dark:bg-stone-900/40 text-xs font-semibold">
          <button
            id="tab-arduino-control"
            onClick={() => setActiveTab('control')}
            className={`flex items-center space-x-2 py-3 px-4 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'control'
                ? 'border-red-600 text-red-600 dark:border-red-500 dark:text-red-400'
                : 'border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
            }`}
          >
            <Zap className="h-4 w-4" />
            <span>Live Hardware Control</span>
          </button>
          <button
            id="tab-arduino-guide"
            onClick={() => setActiveTab('guide')}
            className={`flex items-center space-x-2 py-3 px-4 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'guide'
                ? 'border-red-600 text-red-600 dark:border-red-500 dark:text-red-400'
                : 'border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
            }`}
          >
            <HelpCircle className="h-4 w-4" />
            <span>3-Step Quick Guide</span>
          </button>
          <button
            id="tab-arduino-code"
            onClick={() => setActiveTab('code')}
            className={`flex items-center space-x-2 py-3 px-4 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'code'
                ? 'border-red-600 text-red-600 dark:border-red-500 dark:text-red-400'
                : 'border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
            }`}
          >
            <Terminal className="h-4 w-4" />
            <span>Arduino Sketch (.ino)</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* TAB 1: Live Hardware Control */}
          {activeTab === 'control' && (
            <div className="space-y-6">
              
              {/* Web Serial Browser Notice */}
              {!isWebSerialSupported && (
                <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 flex items-start space-x-3 text-amber-800 dark:text-amber-300">
                  <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <p className="font-bold">Web Serial API not detected</p>
                    <p>
                      Your current browser does not support native direct USB serial connection. Please use{' '}
                      <strong>Google Chrome, Microsoft Edge, or Opera</strong> on desktop. You can still test the commands below in simulation mode.
                    </p>
                  </div>
                </div>
              )}

              {/* USB Connection Card */}
              <div className="p-5 rounded-2xl bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-700/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                    Serial Connection
                  </div>
                  <div className="text-sm font-semibold">
                    {isConnected ? (
                      <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4" /> Connected to USB Sorter Controller
                      </span>
                    ) : (
                      'Ready to connect to USB Arduino Uno/Nano/Mega/ESP32.'
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-stone-500">Baud:</span>
                    <select
                      value={baudRate}
                      disabled={isConnected}
                      onChange={(e) => setBaudRate(Number(e.target.value))}
                      className="text-xs font-mono bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-xl px-2.5 py-1.5 focus:outline-none"
                    >
                      <option value={9600}>9600 (Standard)</option>
                      <option value={115200}>115200 (High Speed)</option>
                    </select>
                  </div>

                  {isConnected ? (
                    <button
                      onClick={handleDisconnect}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40 border border-red-200 dark:border-red-900/60 transition-colors cursor-pointer"
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      id="btn-connect-usb-arduino"
                      onClick={handleConnect}
                      disabled={isConnecting}
                      className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 shadow-md transition-all flex items-center space-x-2 cursor-pointer disabled:opacity-50"
                    >
                      <Zap className="h-4 w-4" />
                      <span>{isConnecting ? 'Connecting...' : 'Connect USB Arduino'}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Error or Iframe Guidance Banner */}
              {connectError && (
                <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-900 dark:text-red-200 text-xs space-y-2">
                  <div className="flex items-start space-x-2">
                    <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
                    <div>
                      <span className="font-bold">Connection Note: </span>
                      <span>{connectError}</span>
                    </div>
                  </div>
                  {isInIframe && (
                    <div className="pt-2 flex items-center gap-2">
                      <button
                        onClick={() => window.open(window.location.href, '_blank')}
                        className="px-3.5 py-1.5 rounded-xl font-bold bg-red-600 hover:bg-red-500 text-white flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        <span>Open in Dedicated Tab for Direct USB Access</span>
                      </button>
                      <span className="text-stone-500">
                        Chrome requires top-level window access to select USB devices.
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Automation & Sorting Mode Controls */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Auto-Dispatch Toggle */}
                <div className="p-4 rounded-2xl bg-stone-50 dark:bg-stone-800/40 border border-stone-200 dark:border-stone-700/60 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300 flex items-center gap-1.5">
                      <Radio className="h-3.5 w-3.5 text-red-500" />
                      Automated Vision Trigger
                    </div>
                    <div className="text-xs text-stone-500 dark:text-stone-400">
                      Dispatches servo commands when camera identifies tomatoes
                    </div>
                  </div>
                  <button
                    onClick={handleToggleAutoTrigger}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      autoTrigger ? 'bg-red-600' : 'bg-stone-300 dark:bg-stone-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        autoTrigger ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Sorting Mode Selector */}
                <div className="p-4 rounded-2xl bg-stone-50 dark:bg-stone-800/40 border border-stone-200 dark:border-stone-700/60 space-y-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300 flex items-center gap-1.5">
                    <Sliders className="h-3.5 w-3.5 text-blue-500" />
                    Sorting Logic Rule
                  </div>
                  <div className="flex gap-2 text-xs">
                    <button
                      onClick={() => handleChangeSortingMode('size')}
                      className={`flex-1 py-1.5 px-2 rounded-xl font-semibold border transition-all cursor-pointer ${
                        sortingMode === 'size'
                          ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700'
                          : 'bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-400 border-stone-200 dark:border-stone-700'
                      }`}
                    >
                      Size Only (S / M / L)
                    </button>
                    <button
                      onClick={() => handleChangeSortingMode('health_and_size')}
                      className={`flex-1 py-1.5 px-2 rounded-xl font-semibold border transition-all cursor-pointer ${
                        sortingMode === 'health_and_size'
                          ? 'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border-red-300 dark:border-red-700'
                          : 'bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-400 border-stone-200 dark:border-stone-700'
                      }`}
                    >
                      Blight Cull + Size
                    </button>
                  </div>
                </div>

              </div>

              {/* Direct Size Actuator Trigger Buttons */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-stone-400">
                    Manual Size Gate Actuation
                  </span>
                  {lastAction && (
                    <span className="text-xs font-mono font-bold text-red-600 dark:text-red-400 animate-pulse">
                      Actuated: {lastAction}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {/* SMALL */}
                  <button
                    onClick={() => handleSendTestCommand('S', 'Route SMALL (30°)')}
                    className="p-4 rounded-2xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-200 text-left transition-all hover:scale-[1.02] cursor-pointer"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider bg-blue-200 dark:bg-blue-900 px-2 py-0.5 rounded-full text-blue-800 dark:text-blue-300">
                        Bin 1
                      </span>
                      <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400">30°</span>
                    </div>
                    <div className="font-bold text-sm">Route SMALL</div>
                    <div className="text-[11px] text-blue-700 dark:text-blue-300">&lt; 60mm (&lt; 4 oz)</div>
                  </button>

                  {/* MEDIUM */}
                  <button
                    onClick={() => handleSendTestCommand('M', 'Route MEDIUM (90°)')}
                    className="p-4 rounded-2xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-left transition-all hover:scale-[1.02] cursor-pointer"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider bg-emerald-200 dark:bg-emerald-900 px-2 py-0.5 rounded-full text-emerald-800 dark:text-emerald-300">
                        Bin 2
                      </span>
                      <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">90°</span>
                    </div>
                    <div className="font-bold text-sm">Route MEDIUM</div>
                    <div className="text-[11px] text-emerald-700 dark:text-emerald-300">60 - 75mm (4 - 6 oz)</div>
                  </button>

                  {/* LARGE */}
                  <button
                    onClick={() => handleSendTestCommand('L', 'Route LARGE (150°)')}
                    className="p-4 rounded-2xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/50 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-left transition-all hover:scale-[1.02] cursor-pointer"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider bg-amber-200 dark:bg-amber-900 px-2 py-0.5 rounded-full text-amber-800 dark:text-amber-300">
                        Bin 3
                      </span>
                      <span className="text-xs font-mono font-bold text-amber-600 dark:text-amber-400">150°</span>
                    </div>
                    <div className="font-bold text-sm">Route LARGE</div>
                    <div className="text-[11px] text-amber-700 dark:text-amber-300">&gt; 75mm (&gt; 6 oz)</div>
                  </button>

                  {/* REJECT */}
                  <button
                    onClick={() => handleSendTestCommand('R', 'Route REJECT (180°)')}
                    className="p-4 rounded-2xl bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/50 border border-red-200 dark:border-red-800 text-red-900 dark:text-red-200 text-left transition-all hover:scale-[1.02] cursor-pointer"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider bg-red-200 dark:bg-red-900 px-2 py-0.5 rounded-full text-red-800 dark:text-red-300">
                        Bin 4
                      </span>
                      <span className="text-xs font-mono font-bold text-red-600 dark:text-red-400">180°</span>
                    </div>
                    <div className="font-bold text-sm">Route REJECT</div>
                    <div className="text-[11px] text-red-700 dark:text-red-300">Defect / Blight Cull</div>
                  </button>
                </div>

                <div className="pt-1 flex items-center justify-end">
                  <button
                    onClick={() => handleSendTestCommand('T', 'Self-Test Benchmark Sweep')}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Run Sorter Self-Test Sweep ('T')</span>
                  </button>
                </div>
              </div>

              {/* Live Serial Terminal Monitor */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-stone-500">
                  <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider">
                    <Terminal className="h-3.5 w-3.5" />
                    Live Serial Monitor Output
                  </span>
                  <span>{logs.length} entries</span>
                </div>

                <div className="h-40 overflow-y-auto font-mono text-[11px] p-3 rounded-2xl bg-stone-950 text-stone-300 border border-stone-800 space-y-1">
                  {logs.length === 0 ? (
                    <div className="text-stone-500 italic p-2">
                      No serial communication logged yet. Press a button above or connect USB Arduino.
                    </div>
                  ) : (
                    logs.map((log) => (
                      <div key={log.id} className="flex items-start space-x-2">
                        <span className="text-stone-600 shrink-0">[{log.timestamp}]</span>
                        <span
                          className={`font-semibold shrink-0 ${
                            log.type === 'tx'
                              ? 'text-cyan-400'
                              : log.type === 'rx'
                              ? 'text-emerald-400'
                              : log.type === 'error'
                              ? 'text-red-400'
                              : 'text-stone-400'
                          }`}
                        >
                          {log.message}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          )}

          {/* TAB 2: Quick Wiring Guide */}
          {activeTab === 'guide' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-bold text-stone-900 dark:text-white">
                  3-Step Sorter Hardware Setup
                </h3>
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  Wire your Arduino to the sorting conveyor with servo gate and LED indicators.
                </p>
              </div>

              {/* Pinout Table */}
              <div className="overflow-hidden rounded-2xl border border-stone-200 dark:border-stone-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-stone-100 dark:bg-stone-800/80 font-bold uppercase tracking-wider text-[10px] text-stone-600 dark:text-stone-400">
                    <tr>
                      <th className="p-3">Pin</th>
                      <th className="p-3">Component</th>
                      <th className="p-3">Sorting Purpose</th>
                      <th className="p-3">Wiring Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200 dark:divide-stone-800 font-mono">
                    <tr className="hover:bg-stone-50 dark:hover:bg-stone-800/30">
                      <td className="p-3 font-bold text-red-600 dark:text-red-400">D9 (PWM)</td>
                      <td className="p-3 font-sans font-semibold">Servo PWM Signal</td>
                      <td className="p-3 font-sans">Multi-angle divert chute</td>
                      <td className="p-3 font-sans text-stone-500">Orange/Yellow wire (SG90/MG996R)</td>
                    </tr>
                    <tr className="hover:bg-stone-50 dark:hover:bg-stone-800/30">
                      <td className="p-3 font-bold text-blue-600 dark:text-blue-400">D3</td>
                      <td className="p-3 font-sans font-semibold">Blue LED</td>
                      <td className="p-3 font-sans">Small Tomato (&lt; 60mm / &lt; 4 oz)</td>
                      <td className="p-3 font-sans text-stone-500">Via 220Ω resistor to GND</td>
                    </tr>
                    <tr className="hover:bg-stone-50 dark:hover:bg-stone-800/30">
                      <td className="p-3 font-bold text-emerald-600 dark:text-emerald-400">D4</td>
                      <td className="p-3 font-sans font-semibold">Green LED</td>
                      <td className="p-3 font-sans">Medium Tomato (60-75mm / 4-6 oz)</td>
                      <td className="p-3 font-sans text-stone-500">Via 220Ω resistor to GND</td>
                    </tr>
                    <tr className="hover:bg-stone-50 dark:hover:bg-stone-800/30">
                      <td className="p-3 font-bold text-amber-600 dark:text-amber-400">D5</td>
                      <td className="p-3 font-sans font-semibold">Yellow LED</td>
                      <td className="p-3 font-sans">Large Tomato (&gt; 75mm / &gt; 6 oz)</td>
                      <td className="p-3 font-sans text-stone-500">Via 220Ω resistor to GND</td>
                    </tr>
                    <tr className="hover:bg-stone-50 dark:hover:bg-stone-800/30">
                      <td className="p-3 font-bold text-red-600 dark:text-red-400">D6</td>
                      <td className="p-3 font-sans font-semibold">Red LED</td>
                      <td className="p-3 font-sans">Defect / Cull Indicator</td>
                      <td className="p-3 font-sans text-stone-500">Via 220Ω resistor to GND</td>
                    </tr>
                    <tr className="hover:bg-stone-50 dark:hover:bg-stone-800/30">
                      <td className="p-3 font-bold text-purple-600 dark:text-purple-400">D7</td>
                      <td className="p-3 font-sans font-semibold">Active Buzzer</td>
                      <td className="p-3 font-sans">Audio Alarm on Reject</td>
                      <td className="p-3 font-sans text-stone-500">Positive to D7, negative to GND</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* 3 Step Instruction */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className="p-4 rounded-2xl bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-700/60 space-y-2">
                  <div className="h-6 w-6 rounded-full bg-red-600 text-white flex items-center justify-center font-bold">1</div>
                  <div className="font-bold text-sm">Upload Arduino Code</div>
                  <p className="text-stone-500 dark:text-stone-400">
                    Switch to the <strong>Arduino Sketch</strong> tab, click Copy, and flash it to your board using the free Arduino IDE.
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-700/60 space-y-2">
                  <div className="h-6 w-6 rounded-full bg-red-600 text-white flex items-center justify-center font-bold">2</div>
                  <div className="font-bold text-sm">Connect via USB</div>
                  <p className="text-stone-500 dark:text-stone-400">
                    Plug your Arduino into your PC. Click <strong>Connect USB Arduino</strong> on the Live Hardware Control tab.
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-700/60 space-y-2">
                  <div className="h-6 w-6 rounded-full bg-red-600 text-white flex items-center justify-center font-bold">3</div>
                  <div className="font-bold text-sm">Automatic Size Sorting</div>
                  <p className="text-stone-500 dark:text-stone-400">
                    Launch the <strong>Live Camera</strong>. Every detected tomato will automatically actuate the gate into the Small, Medium, or Large bin!
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Arduino Code */}
          {activeTab === 'code' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold">Ready-to-Flash Arduino Size Sorter Sketch</h3>
                  <p className="text-xs text-stone-500">Supports Small (30°), Medium (90°), and Large (150°) sorting.</p>
                </div>
                <button
                  id="btn-copy-arduino-sketch"
                  onClick={handleCopyCode}
                  className="flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-500 transition-colors shadow-xs cursor-pointer"
                >
                  {copiedCode ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  <span>{copiedCode ? 'Copied Code!' : 'Copy Code (.ino)'}</span>
                </button>
              </div>

              <div className="relative rounded-2xl bg-stone-950 p-4 border border-stone-800 font-mono text-xs text-stone-300 max-h-[50vh] overflow-y-auto">
                <pre>{ARDUINO_SKETCH_CODE}</pre>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/60 flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
          <div className="flex items-center space-x-2">
            <span>Size Basis: S (&lt;60mm / &lt;4oz) | M (60-75mm / 4-6oz / 110-170g) | L (&gt;75mm / &gt;6oz)</span>
            <span>•</span>
            <span>9600 Baud</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl font-semibold bg-stone-200 hover:bg-stone-300 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
};
