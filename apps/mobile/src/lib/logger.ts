/**
 * Logger — ring buffer + console sink (04 §10).
 *
 * The buffer is what makes a failed E2E run diagnosable after the fact:
 * `devctl logsnap` pulls the last N events and correlates them with api and
 * share logs by request-id. Keep the buffer bounded — it lives for the whole
 * process lifetime.
 */
import { clock } from './clock';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEvent {
  ts: number;
  level: LogLevel;
  msg: string;
  /** Correlates one client call with its api/share log lines (04 §10). */
  requestId?: string;
  data?: Record<string, unknown>;
}

/** 04 §10 specifies the last 2000 events. */
export const RING_CAPACITY = 2000;

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export class Logger {
  private buffer: LogEvent[] = [];
  private start = 0;
  private minLevel: LogLevel = 'debug';
  private sink: ((event: LogEvent) => void) | null = null;

  constructor(private capacity: number = RING_CAPACITY) {}

  setLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  /** Attach a transport (logcat in the app, a spy in tests). */
  setSink(sink: ((event: LogEvent) => void) | null): void {
    this.sink = sink;
  }

  log(level: LogLevel, msg: string, data?: Record<string, unknown>, requestId?: string): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) return;
    const event: LogEvent = { ts: clock.now(), level, msg };
    if (requestId !== undefined) event.requestId = requestId;
    if (data !== undefined) event.data = data;

    if (this.buffer.length < this.capacity) {
      this.buffer.push(event);
    } else {
      // Overwrite the oldest slot rather than shifting the array — this runs on
      // every log call and shifting a 2000-element array is not free.
      this.buffer[this.start] = event;
      this.start = (this.start + 1) % this.capacity;
    }
    this.sink?.(event);
  }

  debug(msg: string, data?: Record<string, unknown>, requestId?: string): void {
    this.log('debug', msg, data, requestId);
  }
  info(msg: string, data?: Record<string, unknown>, requestId?: string): void {
    this.log('info', msg, data, requestId);
  }
  warn(msg: string, data?: Record<string, unknown>, requestId?: string): void {
    this.log('warn', msg, data, requestId);
  }
  error(msg: string, data?: Record<string, unknown>, requestId?: string): void {
    this.log('error', msg, data, requestId);
  }

  /** Oldest-first snapshot of the buffer. */
  snapshot(): LogEvent[] {
    if (this.buffer.length < this.capacity) return [...this.buffer];
    return [...this.buffer.slice(this.start), ...this.buffer.slice(0, this.start)];
  }

  clear(): void {
    this.buffer = [];
    this.start = 0;
  }
}

export const logger = new Logger();
