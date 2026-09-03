/**
 * Arduino & IoT Actuator Controller & Setup Guide Modal
 */
import React, { useState, useEffect } from 'react';
import {
  Cpu,
  Usb,
  CheckCircle2,
  AlertTriangle,
  Radio,
  Sliders,
  Copy,
  Check,
  RotateCw,
  Terminal,
  Zap,
  Volume2,
  X,
  Layers,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import {
  arduinoSerial,
  type SerialLogEntry,
  type ActuatorCommand,
} from '../lib/arduino-serial.ts';

interface ArduinoConnectorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ARDUINO_SKETCH_CODE = `/*
 * Tomato Auto-Sorter - Arduino Actuator Controller
 * Listens for serial commands from Web Vision App:
 * 'R' = Ripe (Servo 45 deg)
 * 'U' = Unripe (Servo 135 deg)
 * 'B' = Blight / Defect (Reject Servo 0 deg + Buzzer)
 * 'C' = Center / Neutral (90 deg)
 */

#include <Servo.h>

Servo sorterServo;
const int SERVO_PIN = 9;      // Servo PWM Signal Pin
const int LED_RIPE = 5;       // Green LED
const int LED_UNRIPE = 6;     // Yellow LED
const int LED_BLIGHT = 7;     // Red LED
const int BUZZER_PIN = 8;     // Piezo Buzzer

void setup() {
  Serial.begin(9600); // 9600 Baud Rate
  
  sorterServo.attach(SERVO_PIN);
  sorterServo.write(90); // Idle neutral position (Center)

  pinMode(LED_RIPE, OUTPUT);
  pinMode(LED_UNRIPE, OUTPUT);
  pinMode(LED_BLIGHT, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);

  // Initial power-on flash
  digitalWrite(LED_RIPE, HIGH);
  delay(150);
  digitalWrite(LED_RIPE, LOW);
}

void loop() {
  if (Serial.available() > 0) {
    char cmd = Serial.read();

    // Reset LED indicators
    digitalWrite(LED_RIPE, LOW);
    digitalWrite(LED_UNRIPE, LOW);
    digitalWrite(LED_BLIGHT, LOW);

    switch (cmd) {
      case 'R': // RIPE -> Bin 1
        digitalWrite(LED_RIPE, HIGH);
        sorterServo.write(45);
        delay(650);
        sorterServo.write(90); // Return to neutral
        break;

      case 'U': // UNRIPE -> Bin 2
        digitalWrite(LED_UNRIPE, HIGH);
        sorterServo.write(135);
        delay(650);
        sorterServo.write(90); // Return to neutral
        break;

      case 'B': // BLIGHT / DEFECT -> Reject Chute + Alarm
        digitalWrite(LED_BLIGHT, HIGH);
        tone(BUZZER_PIN, 1200, 250); // 1200Hz alarm tone
        sorterServo.write(0);        // Reject position
        delay(850);
        sorterServo.write(90);
        break;

      case 'C': // Center Neutral
        sorterServo.write(90);
        break;
    }
  }
}
`;

export const ArduinoConnectorModal: React.FC<ArduinoConnectorModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [isConnected, setIsConnected] = useState<boolean>(arduinoSerial.getConnected());
  const [logs, setLogs] = useState<SerialLogEntry[]>(arduinoSerial.getLogs());
  const [autoTrigger, setAutoTrigger] = useState<boolean>(arduinoSerial.getAutoTrigger());
  const [baudRate, setBaudRate] = useState<number>(9600);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'control' | 'guide' | 'code'>('control');
  const [copied, setCopied] = useState<boolean>(false);
  const [simulatedAngle, setSimulatedAngle] = useState<number>(90);
  const [activeAction, setActiveAction] = useState<string>('IDLE');

  const isWebSerialSupported = arduinoSerial.isSupported();

  useEffect(() => {
    const unsubscribe = arduinoSerial.subscribe((newLogs, connected) => {
      setLogs(newLogs);
      setIsConnected(connected);
    });
    return () => unsubscribe();
  }, []);

  if (!isOpen) return null;

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      await arduinoSerial.connect(baudRate);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    await arduinoSerial.disconnect();
  };

  const handleSendCommand = (cmd: ActuatorCommand, angle: number, actionName: string) => {
    setSimulatedAngle(angle);
    setActiveAction(actionName);
    arduinoSerial.sendCommand(cmd);

    // Auto-return to 90 deg after 800ms
    setTimeout(() => {
      setSimulatedAngle(90);
      setActiveAction('IDLE (90°)');
    }, 800);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(ARDUINO_SKETCH_CODE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleAutoTrigger = () => {
    const next = !autoTrigger;
    setAutoTrigger(next);
    arduinoSerial.setAutoTrigger(next);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        id="arduino-modal-container"
        className="relative flex flex-col w-full max-w-4xl max-h-[90vh] bg-white dark:bg-stone-900 rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 overflow-hidden text-stone-900 dark:text-stone-100"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-stone-200 dark:border-stone-800 px-6 py-4 bg-stone-50/70 dark:bg-stone-900/80">
          <div className="flex items-center space-x-3">
            <div className={`p-2.5 rounded-xl border ${
              isConnected 
                ? 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800' 
                : 'bg-stone-100 text-stone-700 border-stone-300 dark:bg-stone-800 dark:text-stone-300 dark:border-stone-700'
            }`}>
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-bold">Arduino / IoT Sorter Controller</h2>
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                  isConnected 
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800' 
                    : 'bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-400'
                }`}>
                  {isConnected ? '● Connected via USB' : '○ Disconnected / Standby'}
                </span>
              </div>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Direct Web Serial interface to control physical servo sorting gates & reject actuators
              </p>
            </div>
          </div>

          <button
            id="btn-close-arduino-modal"
            onClick={onClose}
            className="rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-stone-200 dark:border-stone-800 px-6 bg-white dark:bg-stone-900 gap-2 pt-2">
          <button
            id="tab-arduino-control"
            onClick={() => setActiveTab('control')}
            className={`flex items-center space-x-2 py-2.5 px-4 text-xs font-bold border-b-2 transition-all ${
              activeTab === 'control'
                ? 'border-red-600 text-red-600 dark:text-red-400'
                : 'border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-300'
            }`}
          >
            <Zap className="h-4 w-4" />
            <span>Live Hardware Control</span>
          </button>

          <button
            id="tab-arduino-guide"
            onClick={() => setActiveTab('guide')}
            className={`flex items-center space-x-2 py-2.5 px-4 text-xs font-bold border-b-2 transition-all ${
              activeTab === 'guide'
                ? 'border-red-600 text-red-600 dark:text-red-400'
                : 'border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-300'
            }`}
          >
            <Layers className="h-4 w-4" />
            <span>3-Step Quick Guide</span>
          </button>

          <button
            id="tab-arduino-code"
            onClick={() => setActiveTab('code')}
            className={`flex items-center space-x-2 py-2.5 px-4 text-xs font-bold border-b-2 transition-all ${
              activeTab === 'code'
                ? 'border-red-600 text-red-600 dark:text-red-400'
                : 'border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-300'
            }`}
          >
            <Terminal className="h-4 w-4" />
            <span>Arduino Sketch (.ino)</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: Hardware Control */}
          {activeTab === 'control' && (
            <div className="space-y-6">
              {/* Connection Status & Action Bar */}
              <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/80 dark:bg-stone-900/50 p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center space-x-3">
                  <div className="p-3 bg-white dark:bg-stone-800 rounded-lg shadow-xs border border-stone-200 dark:border-stone-700">
                    <Usb className="h-6 w-6 text-stone-700 dark:text-stone-300" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-stone-800 dark:text-stone-200">
                      USB Serial Connection
                    </div>
                    <div className="text-xs text-stone-500 dark:text-stone-400">
                      {!isWebSerialSupported ? (
                        <span className="text-amber-600 dark:text-amber-400 font-semibold">
                          Web Serial requires Chrome, Edge, or Opera desktop browser.
                        </span>
                      ) : isConnected ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                          Active & Transmitting at {baudRate} Baud.
                        </span>
                      ) : (
                        'Ready to connect to USB Arduino Uno/Nano/Mega/ESP32.'
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    id="select-baud-rate"
                    value={baudRate}
                    onChange={(e) => setBaudRate(Number(e.target.value))}
                    disabled={isConnected}
                    aria-label="Select Baud Rate"
                    className="rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-3 py-2 text-xs font-semibold text-stone-700 dark:text-stone-200 focus:ring-2 focus:ring-red-500"
                  >
                    <option value={9600}>9600 Baud (Standard)</option>
                    <option value={115200}>115200 Baud (High-Speed / ESP32)</option>
                    <option value={57600}>57600 Baud</option>
                  </select>

                  {!isConnected ? (
                    <button
                      id="btn-connect-serial-port"
                      onClick={handleConnect}
                      disabled={isConnecting || !isWebSerialSupported}
                      className="flex items-center space-x-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-2 text-xs font-bold shadow-xs transition-colors"
                    >
                      <Zap className="h-4 w-4" />
                      <span>{isConnecting ? 'Connecting...' : 'Connect USB Arduino'}</span>
                    </button>
                  ) : (
                    <button
                      id="btn-disconnect-serial-port"
                      onClick={handleDisconnect}
                      className="flex items-center space-x-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 text-xs font-bold shadow-xs transition-colors"
                    >
                      <span>Disconnect</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Automatic Vision Trigger Switch */}
              <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`p-2 rounded-lg ${autoTrigger ? 'bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400' : 'bg-stone-100 text-stone-400 dark:bg-stone-800'}`}>
                    <Radio className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold">Auto-Trigger Sorter on Live Camera Detection</div>
                    <div className="text-xs text-stone-500 dark:text-stone-400">
                      Sends serial sorting bytes automatically whenever a unique tomato passes the gate line
                    </div>
                  </div>
                </div>

                <button
                  id="toggle-auto-serial-trigger"
                  onClick={toggleAutoTrigger}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                    autoTrigger ? 'bg-red-600' : 'bg-stone-300 dark:bg-stone-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      autoTrigger ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Visual Servo Arm Simulation & Manual Actuator Trigger Panel */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Visual Servo Gate Visualizer */}
                <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/50 p-4 flex flex-col items-center justify-center text-center">
                  <div className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-2">
                    Actuator Gate Position
                  </div>

                  {/* SVG Servo Dial */}
                  <div className="relative w-48 h-32 flex items-center justify-center">
                    <svg viewBox="0 0 200 120" className="w-full h-full">
                      {/* Arc Base */}
                      <path
                        d="M 20 100 A 80 80 0 0 1 180 100"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="10"
                        className="text-stone-200 dark:text-stone-800"
                      />
                      {/* 0 deg (Reject / Blight) */}
                      <circle cx="20" cy="100" r="5" className="fill-rose-500" />
                      <text x="10" y="115" fontSize="10" className="fill-rose-500 font-bold">Reject (0°)</text>

                      {/* 45 deg (Ripe) */}
                      <circle cx="43" cy="43" r="5" className="fill-emerald-500" />
                      <text x="30" y="30" fontSize="10" className="fill-emerald-600 font-bold">Ripe (45°)</text>

                      {/* 90 deg (Idle Center) */}
                      <circle cx="100" cy="20" r="5" className="fill-stone-400" />
                      <text x="85" y="12" fontSize="10" className="fill-stone-500 font-bold">Idle (90°)</text>

                      {/* 135 deg (Unripe) */}
                      <circle cx="157" cy="43" r="5" className="fill-amber-500" />
                      <text x="145" y="30" fontSize="10" className="fill-amber-600 font-bold">Unripe (135°)</text>

                      {/* Servo Arm Needle */}
                      <g transform={`rotate(${simulatedAngle - 90} 100 100)`} className="transition-transform duration-300 ease-out">
                        <line
                          x1="100"
                          y1="100"
                          x2="100"
                          y2="28"
                          stroke="#ef4444"
                          strokeWidth="4"
                          strokeLinecap="round"
                        />
                        <circle cx="100" cy="100" r="10" className="fill-stone-800 dark:fill-white" />
                      </g>
                    </svg>
                  </div>

                  <div className="mt-2 text-sm font-bold text-stone-900 dark:text-white">
                    Current: <span className="text-red-600 dark:text-red-400 font-mono">{activeAction}</span>
                  </div>
                  <div className="text-[11px] text-stone-400">
                    Physical Pin 9 PWM Sorter Gate
                  </div>
                </div>

                {/* Manual Actuator Trigger Buttons */}
                <div className="flex flex-col justify-between space-y-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-stone-500">
                    Manual Actuator Test Triggers
                  </div>

                  <button
                    id="btn-test-serial-ripe"
                    onClick={() => handleSendCommand('R', 45, 'RIPE (45° -> Bin 1)')}
                    className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors shadow-xs"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></div>
                      <span className="font-bold text-xs">Test RIPE [ 'R' ]</span>
                    </div>
                    <span className="text-xs font-mono font-bold bg-emerald-200/80 dark:bg-emerald-800 px-2 py-0.5 rounded">
                      Servo: 45°
                    </span>
                  </button>

                  <button
                    id="btn-test-serial-unripe"
                    onClick={() => handleSendCommand('U', 135, 'UNRIPE (135° -> Bin 2)')}
                    className="flex items-center justify-between p-3 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/60 transition-colors shadow-xs"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                      <span className="font-bold text-xs">Test UNRIPE [ 'U' ]</span>
                    </div>
                    <span className="text-xs font-mono font-bold bg-amber-200/80 dark:bg-amber-800 px-2 py-0.5 rounded">
                      Servo: 135°
                    </span>
                  </button>

                  <button
                    id="btn-test-serial-blight"
                    onClick={() => handleSendCommand('B', 0, 'BLIGHT / DEFECT (0° + Buzzer)')}
                    className="flex items-center justify-between p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition-colors shadow-xs"
                  >
                    <div className="flex items-center space-x-3">
                      <Volume2 className="w-4 h-4 text-rose-600 dark:text-rose-400 animate-bounce" />
                      <span className="font-bold text-xs">Test BLIGHT / REJECT [ 'B' ]</span>
                    </div>
                    <span className="text-xs font-mono font-bold bg-rose-200/80 dark:bg-rose-800 px-2 py-0.5 rounded">
                      Reject: 0° + Tone
                    </span>
                  </button>

                  <button
                    id="btn-test-serial-center"
                    onClick={() => handleSendCommand('C', 90, 'CENTER (90° Neutral)')}
                    className="flex items-center justify-center p-2 rounded-xl bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors text-xs font-semibold"
                  >
                    <RotateCw className="w-3.5 h-3.5 mr-1.5" />
                    Reset to Center (90°)
                  </button>
                </div>
              </div>

              {/* Live Serial Command Output Stream */}
              <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-900 text-stone-100 p-4 font-mono text-xs">
                <div className="flex items-center justify-between mb-2 text-stone-400 border-b border-stone-800 pb-2">
                  <div className="flex items-center space-x-2">
                    <Terminal className="h-4 w-4 text-emerald-400" />
                    <span className="font-bold text-white">Live Serial Telemetry</span>
                  </div>
                  <span className="text-[11px] text-stone-500">Latest 50 events</span>
                </div>

                <div className="h-32 overflow-y-auto space-y-1.5 pr-2">
                  {logs.length === 0 ? (
                    <div className="text-stone-500 italic py-2">No commands sent yet. Click a test button above.</div>
                  ) : (
                    logs.map((log, idx) => (
                      <div key={idx} className="flex items-start space-x-2 text-[11px]">
                        <span className="text-stone-500 shrink-0">[{log.timestamp}]</span>
                        <span className={`font-bold px-1 rounded text-[10px] shrink-0 ${
                          log.type === 'sent' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                          log.type === 'error' ? 'bg-rose-950 text-rose-400 border border-rose-800' :
                          'bg-stone-800 text-stone-300'
                        }`}>
                          {log.command}
                        </span>
                        <span className="text-stone-300">{log.label}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: 3-Step Illustrated Guide */}
          {activeTab === 'guide' && (
            <div className="space-y-6">
              <div className="text-center max-w-xl mx-auto">
                <h3 className="text-lg font-bold">Connect Your Arduino in 3 Easy Steps</h3>
                <p className="text-xs text-stone-500 mt-1">
                  No complex setup required. The web app uses standard USB Serial to control your sorter.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Step 1 */}
                <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/60 dark:bg-stone-900/60 p-5 flex flex-col items-center text-center space-y-3">
                  <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400 flex items-center justify-center font-bold text-base">
                    1
                  </div>
                  <h4 className="font-bold text-sm">Plug in USB</h4>
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    Connect your Arduino Uno, Nano, or ESP32 to your computer with a standard USB cable.
                  </p>
                </div>

                {/* Step 2 */}
                <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/60 dark:bg-stone-900/60 p-5 flex flex-col items-center text-center space-y-3">
                  <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400 flex items-center justify-center font-bold text-base">
                    2
                  </div>
                  <h4 className="font-bold text-sm">Upload Arduino Code</h4>
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    Copy the code from the <strong className="text-stone-800 dark:text-stone-200">Arduino Sketch</strong> tab and upload it using the free Arduino IDE.
                  </p>
                </div>

                {/* Step 3 */}
                <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/60 dark:bg-stone-900/60 p-5 flex flex-col items-center text-center space-y-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400 flex items-center justify-center font-bold text-base">
                    3
                  </div>
                  <h4 className="font-bold text-sm">Click "Connect"</h4>
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    Click the green <strong className="text-emerald-600 dark:text-emerald-400">Connect USB Arduino</strong> button to start automated physical sorting!
                  </p>
                </div>
              </div>

              {/* Pin Wiring Table */}
              <div className="rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
                <div className="bg-stone-100 dark:bg-stone-800/80 px-4 py-2.5 font-bold text-xs flex items-center justify-between">
                  <span>Hardware Pin Wiring Diagram</span>
                  <span className="text-[11px] font-normal text-stone-500">Arduino Uno / Nano</span>
                </div>
                <div className="divide-y divide-stone-200 dark:divide-stone-800 text-xs">
                  <div className="p-3 grid grid-cols-3 gap-2">
                    <span className="font-mono font-bold text-red-600">Pin 9 (PWM)</span>
                    <span className="font-medium">Servo Signal (Orange wire)</span>
                    <span className="text-stone-500">Diverts tomato to correct bin</span>
                  </div>
                  <div className="p-3 grid grid-cols-3 gap-2">
                    <span className="font-mono font-bold text-emerald-600">Pin 5</span>
                    <span className="font-medium">Green LED</span>
                    <span className="text-stone-500">Lights on Ripe</span>
                  </div>
                  <div className="p-3 grid grid-cols-3 gap-2">
                    <span className="font-mono font-bold text-amber-600">Pin 6</span>
                    <span className="font-medium">Yellow LED</span>
                    <span className="text-stone-500">Lights on Unripe</span>
                  </div>
                  <div className="p-3 grid grid-cols-3 gap-2">
                    <span className="font-mono font-bold text-rose-600">Pin 7 & 8</span>
                    <span className="font-medium">Red LED & Piezo Buzzer</span>
                    <span className="text-stone-500">Alert on Blight Defect</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Arduino Code */}
          {activeTab === 'code' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold">Ready-to-Flash Arduino Sorter Sketch</h3>
                  <p className="text-xs text-stone-500">Works with Arduino Uno, Nano, Mega, or ESP32.</p>
                </div>

                <button
                  id="btn-copy-arduino-sketch"
                  onClick={handleCopyCode}
                  className="flex items-center space-x-2 rounded-lg bg-red-600 hover:bg-red-700 text-white px-3.5 py-1.5 text-xs font-bold shadow-xs transition-colors"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  <span>{copied ? 'Copied to Clipboard!' : 'Copy Code (.ino)'}</span>
                </button>
              </div>

              <div className="relative rounded-xl border border-stone-800 bg-stone-950 p-4 font-mono text-xs text-stone-200 overflow-x-auto max-h-96">
                <pre>{ARDUINO_SKETCH_CODE}</pre>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="border-t border-stone-200 dark:border-stone-800 px-6 py-3 bg-stone-50/70 dark:bg-stone-900/80 flex items-center justify-between">
          <div className="text-xs text-stone-500">
            Automated tomato gate dispatch • 9600 / 115200 Baud
          </div>

          <button
            onClick={onClose}
            className="rounded-lg bg-stone-200 dark:bg-stone-800 hover:bg-stone-300 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 px-4 py-1.5 text-xs font-bold transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
