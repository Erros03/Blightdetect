/**
 * Web Serial API Controller for Arduino / ESP32 Hardware Sorting Actuators
 */

export interface SerialLogEntry {
  timestamp: string;
  command: string;
  type: 'sent' | 'received' | 'info' | 'error';
  label: string;
}

export type ActuatorCommand = 'R' | 'U' | 'B' | 'C';

class ArduinoSerialController {
  private port: any = null;
  private writer: WritableStreamDefaultWriter<string> | null = null;
  private reader: ReadableStreamDefaultReader<string> | null = null;
  private isConnected: boolean = false;
  private logs: SerialLogEntry[] = [];
  private listeners: ((logs: SerialLogEntry[], connected: boolean) => void)[] = [];
  private lastTriggerTime: number = 0;
  private autoTriggerEnabled: boolean = true;

  public isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  public getConnected(): boolean {
    return this.isConnected;
  }

  public getAutoTrigger(): boolean {
    return this.autoTriggerEnabled;
  }

  public setAutoTrigger(enabled: boolean) {
    this.autoTriggerEnabled = enabled;
  }

  public getLogs(): SerialLogEntry[] {
    return [...this.logs];
  }

  public subscribe(listener: (logs: SerialLogEntry[], connected: boolean) => void) {
    this.listeners.push(listener);
    listener(this.getLogs(), this.isConnected);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    const currentLogs = this.getLogs();
    this.listeners.forEach((l) => l(currentLogs, this.isConnected));
  }

  private addLog(command: string, type: 'sent' | 'received' | 'info' | 'error', label: string) {
    const entry: SerialLogEntry = {
      timestamp: new Date().toLocaleTimeString(),
      command,
      type,
      label,
    };
    this.logs = [entry, ...this.logs.slice(0, 49)]; // keep latest 50 logs
    this.notify();
  }

  /**
   * Request user to select Arduino Serial Port (Chrome / Edge / Opera)
   */
  public async connect(baudRate: number = 9600): Promise<{ success: boolean; message: string }> {
    if (!this.isSupported()) {
      const errorMsg = 'Web Serial API is not supported in this browser. Please use Google Chrome, Microsoft Edge, or Opera on desktop.';
      this.addLog('N/A', 'error', errorMsg);
      return { success: false, message: errorMsg };
    }

    try {
      this.addLog('SELECT_PORT', 'info', 'Opening browser serial port selector...');
      this.port = await (navigator as any).serial.requestPort();
      await this.port.open({ baudRate });

      const textEncoder = new TextEncoderStream();
      textEncoder.readable.pipeTo(this.port.writable);
      this.writer = textEncoder.writable.getWriter();

      this.isConnected = true;
      this.addLog(`BAUD_${baudRate}`, 'info', `Connected successfully to Arduino at ${baudRate} baud.`);
      this.notify();
      return { success: true, message: 'Arduino connected successfully!' };
    } catch (err: any) {
      this.isConnected = false;
      const msg = err?.message || 'Failed to connect to Serial Port or selection was cancelled.';
      this.addLog('ERR', 'error', msg);
      this.notify();
      return { success: false, message: msg };
    }
  }

  /**
   * Disconnect from Arduino
   */
  public async disconnect() {
    try {
      if (this.writer) {
        await this.writer.close();
        this.writer = null;
      }
      if (this.port) {
        await this.port.close();
        this.port = null;
      }
    } catch (e) {
      console.warn('Error during serial close', e);
    } finally {
      this.isConnected = false;
      this.addLog('DISCONNECT', 'info', 'Arduino disconnected.');
      this.notify();
    }
  }

  /**
   * Send single byte sorting command to Arduino
   * 'R' = RIPE (Servo to Bin 1)
   * 'U' = UNRIPE (Servo to Bin 2)
   * 'B' = BLIGHT (Reject Solenoid + Alarm)
   * 'C' = CENTER / RESET (90 deg)
   */
  public async sendCommand(cmd: ActuatorCommand, customLabel?: string): Promise<boolean> {
    const labels: Record<ActuatorCommand, string> = {
      R: 'RIPE -> Divert to Bin 1 (45°)',
      U: 'UNRIPE -> Divert to Bin 2 (135°)',
      B: 'BLIGHT / DEFECT -> Reject Chute (0°) + Alarm',
      C: 'CENTER -> Idle Position (90°)',
    };

    const label = customLabel || labels[cmd] || `Command: ${cmd}`;

    if (!this.isConnected || !this.writer) {
      // In simulation mode (or when not yet connected), still log to visual simulator
      this.addLog(cmd, 'sent', `[Simulated] ${label}`);
      return false;
    }

    try {
      await this.writer.write(`${cmd}\n`);
      this.addLog(cmd, 'sent', label);
      return true;
    } catch (err: any) {
      this.addLog(cmd, 'error', `Failed sending: ${err?.message || 'Write error'}`);
      return false;
    }
  }

  /**
   * Auto-trigger from detection pipeline with debouncing (minimum 800ms between triggers)
   */
  public handleDetectionEvent(ripeness: 'ripe' | 'unripe' | 'blight', confidence: number) {
    if (!this.autoTriggerEnabled) return;
    
    const now = performance.now();
    if (now - this.lastTriggerTime < 800) {
      return; // Debounce actuator to avoid mechanical jamming
    }
    this.lastTriggerTime = now;

    let cmd: ActuatorCommand = 'R';
    if (ripeness === 'blight') cmd = 'B';
    else if (ripeness === 'unripe') cmd = 'U';

    this.sendCommand(cmd, `Auto-Trigger: ${ripeness.toUpperCase()} (${Math.round(confidence * 100)}%)`);
  }
}

export const arduinoSerial = new ArduinoSerialController();
