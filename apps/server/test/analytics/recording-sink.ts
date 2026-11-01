import { EventSink, type StoredEvent } from '../../src/analytics/event-sink';

/** База для тестов: запоминает пачки; `fail = true` — «база упала». */
export class RecordingSink extends EventSink {
  readonly enabled = true;
  readonly batches: StoredEvent[][] = [];
  fail = false;
  closed = false;

  async write(events: readonly StoredEvent[]): Promise<void> {
    if (this.fail) throw new Error('connection refused');
    this.batches.push([...events]);
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  get events(): StoredEvent[] {
    return this.batches.flat();
  }
}
