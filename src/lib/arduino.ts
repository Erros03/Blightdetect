/**
 * Web Serial Manager for College Thesis Prototype
 * Automated Tomato Detection and Sorting Conveyor System (Arduino Uno Firmware)
 * Uses native Uint8Array read/write streams without pipe locking
 */

export interface SerialLogItem {
  id: string;
  type: 'tx' | 'rx' | 'info' | 'err';
  message: string;
  timestamp: string;
}

export type ConveyorState =
  | 'STOPPED'
  | 'RUNNING'
  | 'PAUSED'
  | 'WAITING_POSITION'
  | 'SORTING_ACTIVE'
  | 'COOLDOWN';

export interface SerialStatus {
  isConnected: boolean;
  isSimulated: boolean;
  conveyorState: ConveyorState;
  isConveyorRunning: boolean;
  isMotorInverted: boolean;
  activeSortingArm: string | null;
  lastIrDetectedTime: string | null;
  lastCommand: string | null;
  error: string | null;
  logs: SerialLogItem[];
}

export interface SerialStatusListener {
  (status: SerialStatus): void;
}

let port: any = null;
let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
let keepReading = false;
let isConnected = false;
let isSimulated = false;
let isMotorInverted = false;
let conveyorState: ConveyorState = 'STOPPED';
let activeSortingArm: string | null = null;
let lastIrDetectedTime: string | null = null;
let lastSentCommand: string | null = null;
let lastError: string | null = null;
const serialLogs: SerialLogItem[] = [];
const listeners: SerialStatusListener[] = [];

function addLog(type: SerialLogItem['type'], message: string) {
  const item: SerialLogItem = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    type,
    message,
    timestamp: new Date().toLocaleTimeString(),
  };
  serialLogs.unshift(item);
  if (serialLogs.length > 80) {
    serialLogs.pop();
  }

  // Parse Arduino's thesis state feedback
  if (type === 'rx') {
    const upper = message.toUpperCase();
    if (upper.includes('CONVEYOR STARTED') || upper.includes('CONVEYOR RESUMED') || upper.includes('STATE: RUNNING')) {
      conveyorState = 'RUNNING';
    } else if (upper.includes('CONVEYOR STOPPED') || upper.includes('STATE: STOPPED')) {
      conveyorState = 'STOPPED';
    } else if (upper.includes('CONVEYOR PAUSED') || upper.includes('STATE: PAUSED')) {
      conveyorState = 'PAUSED';
    } else if (upper.includes('WAIT_SORT_POSITION') || upper.includes('STATE: WAITING_POSITION')) {
      conveyorState = 'WAITING_POSITION';
    } else if (upper.includes('STATE: SORTING_ACTIVE') || upper.includes('SORTING:')) {
      conveyorState = 'SORTING_ACTIVE';
    } else if (upper.includes('SORTING COMPLETE') || upper.includes('STATE: COOLDOWN')) {
      conveyorState = 'COOLDOWN';
      setTimeout(() => {
        if (conveyorState === 'COOLDOWN') conveyorState = 'RUNNING';
        notify();
      }, 500);
    }

    if (upper.includes('TOMATO DETECTED')) {
      lastIrDetectedTime = new Date().toLocaleTimeString();
    }

    if (upper.includes('SORTING:')) {
      activeSortingArm = upper.replace('SORTING:', '').trim();
    } else if (upper.includes('SORTING COMPLETE') || upper.includes('SYSTEM RESET COMPLETE')) {
      activeSortingArm = null;
    }
  }

  notify();
}

function notify() {
  const state: SerialStatus = {
    isConnected,
    isSimulated,
    conveyorState,
    isConveyorRunning: conveyorState === 'RUNNING',
    isMotorInverted,
    activeSortingArm,
    lastIrDetectedTime,
    lastCommand: lastSentCommand,
    error: lastError,
    logs: [...serialLogs],
  };
  listeners.forEach((cb) => {
    try {
      cb(state);
    } catch (e) {
      console.warn('Error in serial listener:', e);
    }
  });
}

export function subscribeSerial(cb: SerialStatusListener): () => void {
  listeners.push(cb);
  cb({
    isConnected,
    isSimulated,
    conveyorState,
    isConveyorRunning: conveyorState === 'RUNNING',
    isMotorInverted,
    activeSortingArm,
    lastIrDetectedTime,
    lastCommand: lastSentCommand,
    error: lastError,
    logs: [...serialLogs],
  });
  return () => {
    const idx = listeners.indexOf(cb);
    if (idx !== -1) listeners.splice(idx, 1);
  };
}

export function getIsConnected(): boolean {
  return isConnected;
}

export function getIsConveyorRunning(): boolean {
  return conveyorState === 'RUNNING';
}

export function getIsMotorInverted(): boolean {
  return isMotorInverted;
}

export function toggleMotorInversion(): boolean {
  isMotorInverted = !isMotorInverted;
  addLog('info', `Motor driver polarity: ${isMotorInverted ? 'INVERTED' : 'NORMAL'}`);
  notify();
  return isMotorInverted;
}

export async function toggleConveyor(): Promise<boolean> {
  if (conveyorState === 'RUNNING') {
    return stopConveyor();
  } else {
    return startConveyor();
  }
}

export function isSimulationMode(): boolean {
  return isSimulated;
}

export function isRunningInIframe(): boolean {
  try {
    return typeof window !== 'undefined' && window.self !== window.top;
  } catch {
    return true;
  }
}

export function isSerialSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

export function clearSerialLogs(): void {
  serialLogs.length = 0;
  notify();
}

/**
 * Enable simulation mode for embedded preview frames
 */
export function enableSimulationMode(): void {
  isConnected = true;
  isSimulated = true;
  lastError = null;
  conveyorState = 'STOPPED';
  lastSentCommand = 'SIMULATION_READY';
  addLog('info', 'Simulation mode activated. Commands will emulate Arduino Uno prototype.');
}

/**
 * Inbound read loop from raw USB ReadableStream<Uint8Array>
 */
async function startReadLoop(stream: ReadableStream<Uint8Array>) {
  keepReading = true;
  reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (keepReading) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) {
            addLog('rx', trimmed);
          }
        }
      }
    }
  } catch (err: any) {
    if (keepReading) {
      console.warn('Serial read stream notice:', err);
    }
  } finally {
    if (reader) {
      try {
        reader.releaseLock();
      } catch {}
      reader = null;
    }
  }
}

/**
 * Request port access from user and establish 9600 baud direct serial connection
 */
export async function connectSerial(): Promise<{
  success: boolean;
  message: string;
  isIframeRestricted?: boolean;
}> {
  if (!isSerialSupported()) {
    const msg = 'Web Serial API is not supported in this browser. Please use Google Chrome, Microsoft Edge, or Opera.';
    lastError = msg;
    addLog('err', msg);
    return { success: false, message: msg };
  }

  try {
    lastError = null;
    addLog('info', 'Requesting USB device from browser...');

    // Request port access from user (requires click gesture)
    // @ts-ignore - Web Serial API
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 9600 });

    // Directly acquire raw streams without transformer pipe lock
    if (port.writable) {
      writer = port.writable.getWriter();
    }

    if (port.readable) {
      startReadLoop(port.readable);
    }

    isConnected = true;
    isSimulated = false;
    addLog('info', 'USB Serial opened on 9600 baud! Waiting for Arduino bootloader handshake...');

    // Arduino Uno DTR reset takes ~1.5 - 1.8 seconds before sketch setup() runs
    setTimeout(() => {
      if (isConnected && !isSimulated) {
        sendCommand('STATUS');
      }
    }, 1800);

    return { success: true, message: 'Serial connection established.' };
  } catch (error: any) {
    const isSecurity =
      error?.name === 'SecurityError' ||
      String(error?.message || '').toLowerCase().includes('permissions policy') ||
      String(error?.message || '').toLowerCase().includes('disallowed');
    const isNotFound = error?.name === 'NotFoundError';

    isConnected = false;
    isSimulated = false;

    let msg = error?.message || 'Failed to connect to serial port.';
    if (isSecurity) {
      msg =
        'Web Serial hardware access is disallowed inside embedded preview frames by browser permissions policy. Open in a standalone tab to grant USB access, or use Simulation Mode.';
      console.warn('Web Serial restricted by iframe permissions policy. Standalone tab required.');
    } else if (isNotFound) {
      msg = 'Connection cancelled: No serial port selected in device picker.';
    } else {
      console.warn('Serial connection error:', error);
    }

    lastError = msg;
    addLog('err', msg);
    return { success: false, message: msg, isIframeRestricted: isSecurity };
  }
}

/**
 * Disconnect cleanly by releasing raw stream locks
 */
export async function disconnectSerial(): Promise<void> {
  try {
    keepReading = false;
    if (reader) {
      try {
        await reader.cancel();
        reader.releaseLock();
      } catch {}
      reader = null;
    }
    if (writer) {
      try {
        await writer.close();
        writer.releaseLock();
      } catch {}
      writer = null;
    }
    if (port) {
      try {
        await port.close();
      } catch {}
      port = null;
    }
    isConnected = false;
    isSimulated = false;
    conveyorState = 'STOPPED';
    activeSortingArm = null;
    lastSentCommand = null;
    lastError = null;
    addLog('info', 'Disconnected from Arduino.');
  } catch (err: any) {
    console.warn('Error disconnecting serial:', err);
    isConnected = false;
    isSimulated = false;
    notify();
  }
}

/**
 * Send command string with CRLF termination to Arduino as raw bytes
 */
export async function sendCommand(commandString: string): Promise<boolean> {
  const cleanCmd = commandString.trim().toUpperCase();

  if (isSimulated) {
    lastSentCommand = cleanCmd;
    addLog('tx', `[SIMULATED TX] -> ${cleanCmd}`);

    // Emulate Arduino thesis firmware response in simulation mode
    if (cleanCmd === 'START') {
      conveyorState = 'RUNNING';
      addLog('rx', 'CONVEYOR STARTED');
    } else if (cleanCmd === 'STOP') {
      conveyorState = 'STOPPED';
      addLog('rx', 'CONVEYOR STOPPED');
    } else if (cleanCmd === 'PAUSE') {
      conveyorState = 'PAUSED';
      addLog('rx', 'CONVEYOR PAUSED');
    } else if (cleanCmd === 'RESUME') {
      conveyorState = 'RUNNING';
      addLog('rx', 'CONVEYOR RESUMED');
    } else if (cleanCmd === 'RESET') {
      conveyorState = 'STOPPED';
      activeSortingArm = null;
      addLog('rx', 'SYSTEM RESET COMPLETE');
      addLog('rx', 'SYSTEM READY');
    } else if (cleanCmd === 'BLIGHT') {
      addLog('rx', 'AI RESULT: BLIGHT -> PASS STRAIGHT (NO SERVO ACTIVATION)');
      // Blight tomatoes continue straight along the conveyor without activating any sorting servos
    } else if (cleanCmd === 'UNRIPE' || cleanCmd === 'SMALL' || cleanCmd === 'MEDIUM' || cleanCmd === 'LARGE') {
      const servoMap: Record<string, string> = {
        UNRIPE: 'Servo 1 (Unripe / D9)',
        SMALL: 'Servo 2 (Small / D10)',
        MEDIUM: 'Servo 3 (Medium / D11)',
        LARGE: 'Servo 4 (Large / D6)',
      };
      const armLabel = servoMap[cleanCmd] || cleanCmd;
      addLog('rx', `SORTING TARGET: ${cleanCmd} -> ${armLabel}`);
      if (conveyorState === 'RUNNING') {
        conveyorState = 'WAITING_POSITION';
        setTimeout(() => {
          conveyorState = 'SORTING_ACTIVE';
          activeSortingArm = armLabel;
          addLog('rx', `SORTING: ${cleanCmd} (90° ACTUATION)`);
          setTimeout(() => {
            addLog('rx', `SORTING COMPLETE (RETURNED TO 0°)`);
            conveyorState = 'RUNNING';
            activeSortingArm = null;
            notify();
          }, 1000);
          notify();
        }, 1200);
      }
    } else if (cleanCmd.startsWith('TEST_')) {
      const target = cleanCmd.replace('TEST_', '');
      const servoMap: Record<string, string> = {
        UNRIPE: 'Servo 1 (Unripe / D9)',
        SMALL: 'Servo 2 (Small / D10)',
        MEDIUM: 'Servo 3 (Medium / D11)',
        LARGE: 'Servo 4 (Large / D6)',
      };
      const armLabel = servoMap[target] || target;
      addLog('rx', `MANUAL TEST: ${target} -> ${armLabel}`);
      activeSortingArm = armLabel;
      conveyorState = 'SORTING_ACTIVE';
      setTimeout(() => {
        addLog('rx', `TEST COMPLETE: ${target} RETURNED TO 0°`);
        activeSortingArm = null;
        conveyorState = 'STOPPED';
        notify();
      }, 1000);
      setTimeout(() => {
        addLog('rx', 'SORTING COMPLETE');
        activeSortingArm = null;
        conveyorState = 'STOPPED';
        notify();
      }, 1000);
    } else if (cleanCmd === 'STATUS') {
      addLog('rx', `STATE: ${conveyorState}`);
    } else if (cleanCmd.startsWith('SPEED')) {
      addLog('rx', `CONVEYOR SPEED SET TO: ${cleanCmd.replace('SPEED', '').trim()}`);
    }
    notify();
    return true;
  }

  if (writer) {
    try {
      const encoder = new TextEncoder();
      // Send with \r\n to ensure Arduino readSerialInput() triggers immediately
      const data = encoder.encode(cleanCmd + '\r\n');
      await writer.write(data);
      lastSentCommand = cleanCmd;
      addLog('tx', `[TX] -> ${cleanCmd}`);
      return true;
    } catch (err: any) {
      console.warn(`Error sending command '${cleanCmd}':`, err);
      lastError = err?.message || 'Error writing to serial port';
      addLog('err', `Failed to send '${cleanCmd}': ${lastError}`);
      return false;
    }
  } else {
    const warn = `Serial port not connected. Please click 'Connect Arduino (USB)'.`;
    console.warn(warn);
    addLog('err', warn);
    return false;
  }
}

// Master Conveyor System Helpers
export const startConveyor = () => sendCommand('START');
export const stopConveyor = () => sendCommand('STOP');
export const pauseConveyor = () => sendCommand('PAUSE');
export const resumeConveyor = () => sendCommand('RESUME');
export const resetSystem = () => sendCommand('RESET');
export const queryStatus = () => sendCommand('STATUS');
export const testServo = (target: string) => sendCommand(`TEST_${target.toUpperCase()}`);
export const testMotorFwd = () => sendCommand('MOTOR_FWD');
export const testMotorRev = () => sendCommand('MOTOR_REV');
export const setConveyorSpeed = (speed: number = 160) => sendCommand(`SPEED ${speed}`);

/**
 * Trigger based on YOLO inference results for 4-Servo Sorter:
 * - Blight: No servo activation (continue straight along conveyor)
 * - Unripe: Servo 1
 * - Small: Servo 2
 * - Medium: Servo 3
 * - Large: Servo 4
 */
export function handleYoloDetection(detectionResult: {
  disease?: string;
  ripeness: string;
  size: string;
}): void {
  const isBlight = detectionResult.disease === 'blight' || detectionResult.ripeness === 'blight';

  if (isBlight) {
    // Blight tomato: do not activate any of the four sorting servos; allow to continue straight
    sendCommand('BLIGHT');
  } else if (detectionResult.ripeness === 'unripe') {
    // Unripe tomato: activate Servo 1 (Unripe container)
    sendCommand('UNRIPE');
  } else {
    // Eligible for size sorting: Servos 2, 3, or 4
    const sz = (detectionResult.size || '').toLowerCase();
    if (sz === 'small') {
      sendCommand('SMALL');
    } else if (sz === 'large') {
      sendCommand('LARGE');
    } else {
      // Medium or standard size
      sendCommand('MEDIUM');
    }
  }
}
