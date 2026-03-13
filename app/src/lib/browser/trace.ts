export interface TraceEntry {
  timestamp: number;
  action: string;
  target?: string;
  result?: string;
  note?: string;
  screenshotPath?: string;
}

export class TraceLogger {
  private entries: TraceEntry[] = [];

  log(entry: Omit<TraceEntry, "timestamp">): void {
    this.entries.push({
      ...entry,
      timestamp: Date.now(),
    });
  }

  getEntries(): TraceEntry[] {
    return [...this.entries];
  }

  getLastEntry(): TraceEntry | undefined {
    return this.entries[this.entries.length - 1];
  }

  get length(): number {
    return this.entries.length;
  }
}
