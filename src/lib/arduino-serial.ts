/**
 * Web Serial API Controller for Arduino / ESP32 Physical Tomato Size Sorter
 * Controls physical servo gates to sort tomatoes into Small, Medium, Large bins.
 */
import type { TomatoSizeClass, TomatoRipeness } from '../types.ts';

export interface SerialLogEntry {
  id: string;
  timestamp: string;
  type: 'tx' | 'rx' | 'info' | 'error';
  message: string;
}

export type SortingMode = 'size' | 'health_and_size';

class ArduinoSerialController {
  private port: any | null = null;
  private reader: any | null = null;
  private writer: any | null = null;
  private isConnected: boolean = false;
  private logs: SerialLogEntry[] = [];
  private listeners: ((logs: SerialLogEntry[], connected: boolean) => void)[] = [];
  private autoTrigger: boolean = true;
  private sortingMode: SortingMode = 'size';
  private lastTriggerTime: number = 0;
  private minIntervalMs: number = 750; // Prevent spamming servo faster than gate dwell time

  constructor() {
    const savedAuto = localStorage.getItem('blightdetect_arduino_autotrigger');
    if (savedAuto !== null) {
      this.autoTrigger = savedAuto === 'true';
    }
    const savedMode = localStorage.getItem('blightdetect_arduino_sortmode');
    if (savedMode === 'size' || savedMode === 'health_and_size') {
      this.sortingMode = savedMode as SortingMode;
    }
  }

  public isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  public getConnected(): boolean {
    return this.isConnected;
  }

  public getLogs(): SerialLogEntry[] {
    return [...this.logs];
  }

  public getAutoTrigger(): boolean {
    return this.autoTrigger;
  }

  public getSortingMode(): SortingMode {
    return this.sortingMode;
  }

  public setSortingMode(mode: SortingMode) {
    this.sortingMode = mode;
    localStorage.setItem('blightdetect_arduino_sortmode', mode);
    this.addLog('CONFIG', 'info', `Sorting mode changed to: ${mode === 'size' ? 'Size Only (Small/Med/Large)' : 'Defect Reject + Size Sorting'}`);
  }

  public setAutoTrigger(enabled: boolean) {
    this.autoTrigger = enabled;
    localStorage.setItem('blightdetect_arduino_autotrigger', String(enabled));
    this.addLog('CONFIG', 'info', `Auto-dispatch ${enabled ? 'ENABLED' : 'DISABLED'}`);
    this.notify();
  }

  public subscribe(cb: (logs: SerialLogEntry[], connected: boolean) => void): () => void {
    this.listeners.push(cb);
    cb(this.logs, this.isConnected);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  /**
   * Request user to select Arduino Serial Port
   */
  public async connect(baudRate: number = 9600): Promise<{ success: boolean; message: string }> {
    if (!this.isSupported()) {
      const err = 'Web Serial API is not supported in this browser. Please use Chrome, Edge, or Opera.';
      this.addLog('SYSTEM', 'error', err);
      return { success: false, message: err };
    }

    try {
      // @ts-ignore - Web Serial API
      this.port = await navigator.serial.requestPort();
      await this.port.open({ baudRate });

      this.isConnected = true;
      this.addLog(`BAUD_${baudRate}`, 'info', `Connected successfully to Arduino at ${baudRate} baud.`);
      this.startReading();
      this.notify();
      return { success: true, message: 'Arduino connected successfully!' };
    } catch (err: any) {
      this.isConnected = false;
      const isSecurity =
        err.name === 'SecurityError' ||
        String(err.message || '').toLowerCase().includes('permissions policy') ||
        String(err.message || '').toLowerCase().includes('disallowed');
      const isNotFound = err.name === 'NotFoundError';

      let msg = '';
      if (isSecurity) {
        msg =
          'Web Serial access is restricted inside embedded preview iframes by browser policy. Open in a standalone tab to grant native USB device access.';
      } else if (isNotFound) {
        msg = 'Connection cancelled: No Arduino USB port was selected in the device picker.';
      } else {
        msg = `Serial error: ${err.message || err}`;
      }

      this.addLog('CONN_ERR', 'error', msg);
      this.notify();
      return { success: false, message: msg };
    }
  }

  /**
   * Disconnect from Arduino
   */
  public async disconnect(): Promise<void> {
    try {
      if (this.reader) {
        await this.reader.cancel();
        this.reader = null;
      }
      if (this.writer) {
        await this.writer.close();
        this.writer = null;
      }
      if (this.port) {
        await this.port.close();
        this.port = null;
      }
      this.isConnected = false;
      this.addLog('DISCONNECT', 'info', 'Arduino disconnected.');
    } catch (e: any) {
      this.addLog('DISCONNECT_ERR', 'error', `Disconnect error: ${e.message}`);
    } finally {
      this.isConnected = false;
      this.notify();
    }
  }

  /**
   * Send single byte sorting command to Arduino
   * 'S' = Small (30°)
   * 'M' = Medium (90°)
   * 'L' = Large (150°)
   * 'R' = Reject/Blight (180°)
   * 'T' = Self-test sweep
   */
  public async sendCommand(cmd: string): Promise<boolean> {
    if (!this.isConnected || !this.port) {
      this.addLog(cmd, 'tx', `[Simulation] Sent command: '${cmd}' (Arduino not physically connected)`);
      return false;
    }

    try {
      const textEncoder = new TextEncoder();
      const writer = this.port.writable.getWriter();
      await writer.write(textEncoder.encode(cmd + '\n'));
      writer.releaseLock();
      
      const label = cmd === 'S' ? 'Route SMALL (30°)' 
        : cmd === 'M' ? 'Route MEDIUM (90°)' 
        : cmd === 'L' ? 'Route LARGE (150°)' 
        : cmd === 'R' ? 'Route REJECT (180°)'
        : cmd === 'T' ? 'Run Self-Test Sweep'
        : `Command: '${cmd}'`;

      this.addLog(cmd, 'tx', `TX ➔ ${label}`);
      return true;
    } catch (err: any) {
      this.addLog(cmd, 'error', `TX Failed: ${err.message}`);
      return false;
    }
  }

  /**
   * Automatically dispatch size sorting command on vision detection event
   */
  public handleDetectionEvent(
    size: TomatoSizeClass | string,
    ripeness?: TomatoRipeness,
    confidence?: number
  ) {
    if (!this.autoTrigger) return;

    const now = Date.now();
    if (now - this.lastTriggerTime < this.minIntervalMs) {
      return; // Skip if currently executing a gate divert
    }

    // If health & defect sorting is prioritized and item is diseased
    if (this.sortingMode === 'health_and_size' && ripeness === 'blight') {
      this.lastTriggerTime = now;
      this.sendCommand('R');
      return;
    }

    // Size Sorting: Small, Medium, Large
    this.lastTriggerTime = now;
    if (size === 'small') {
      this.sendCommand('S');
    } else if (size === 'large') {
      this.sendCommand('L');
    } else {
      // 'medium' is the default
      this.sendCommand('M');
    }
  }

  private async startReading() {
    while (this.port && this.port.readable && this.isConnected) {
      try {
        const textDecoder = new TextDecoder();
        this.reader = this.port.readable.getReader();
        let buffer = '';

        while (true) {
          const { value, done } = await this.reader.read();
          if (done) break;
          buffer += textDecoder.decode(value, { stream: true });
          
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const clean = line.trim();
            if (clean) {
              this.addLog(clean, 'rx', `RX ➔ ${clean}`);
            }
          }
        }
      } catch (err: any) {
        if (this.isConnected) {
          this.addLog('READ_ERR', 'error', `Serial read error: ${err.message}`);
        }
        break;
      } finally {
        if (this.reader) {
          this.reader.releaseLock();
          this.reader = null;
        }
      }
    }
  }

  private addLog(code: string, type: 'tx' | 'rx' | 'info' | 'error', message: string) {
    const entry: SerialLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toLocaleTimeString(),
      type,
      message,
    };
    this.logs.unshift(entry);
    if (this.logs.length > 80) {
      this.logs.pop();
    }
    this.notify();
  }

  private notify() {
    this.listeners.forEach((cb) => cb(this.logs, this.isConnected));
  }
}

export const arduinoSerial = new ArduinoSerialController();
