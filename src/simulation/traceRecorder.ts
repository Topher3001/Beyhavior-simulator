import type {
  BattleSide,
  ContactEvent,
  SimulationTrace,
  SimulationTraceMode,
  SimulationTraceSample,
  SimulationTransform,
  TopTelemetry,
  TraceTopSample,
} from './types';

const TRACE_SAMPLE_RATE_HZ = 30;
const TRACE_SAMPLE_INTERVAL_SECONDS = 1 / TRACE_SAMPLE_RATE_HZ;

export type TopTraceInput = {
  telemetry: TopTelemetry;
  transform: SimulationTransform;
};

export type TraceRecorder = {
  reset: (mode: SimulationTraceMode, label: string) => void;
  recordSingle: (elapsedSeconds: number, top: TopTraceInput) => void;
  recordBattle: (elapsedSeconds: number, left: TopTraceInput, right: TopTraceInput) => void;
  recordContact: (event: ContactEvent) => void;
  setResult: (resultLabel: string | null) => void;
  getTrace: () => SimulationTrace | null;
};

export function createTraceRecorder(): TraceRecorder {
  let trace: SimulationTrace | null = null;
  let lastSampleSeconds = Number.NEGATIVE_INFINITY;

  const shouldRecordSample = (elapsedSeconds: number) => {
    if (!trace) {
      return false;
    }

    if (trace.samples.length === 0 || elapsedSeconds - lastSampleSeconds >= TRACE_SAMPLE_INTERVAL_SECONDS - 0.000001) {
      lastSampleSeconds = elapsedSeconds;
      return true;
    }

    return false;
  };

  return {
    reset: (mode, label) => {
      trace = {
        id: crypto.randomUUID(),
        mode,
        label,
        startedAt: new Date().toISOString(),
        samples: [],
        contactEvents: [],
        resultLabel: null,
      };
      lastSampleSeconds = Number.NEGATIVE_INFINITY;
    },
    recordSingle: (elapsedSeconds, top) => {
      if (!shouldRecordSample(elapsedSeconds)) {
        return;
      }

      trace?.samples.push({
        elapsedSeconds,
        single: createTraceTopSample(top),
      });
    },
    recordBattle: (elapsedSeconds, left, right) => {
      if (!shouldRecordSample(elapsedSeconds)) {
        return;
      }

      trace?.samples.push({
        elapsedSeconds,
        left: createTraceTopSample(left),
        right: createTraceTopSample(right),
      });
    },
    recordContact: (event) => {
      trace?.contactEvents.push(event);
    },
    setResult: (resultLabel) => {
      if (trace) {
        trace.resultLabel = resultLabel;
      }
    },
    getTrace: () => cloneTrace(trace),
  };
}

export function createTraceTopSample(input: TopTraceInput): TraceTopSample {
  return {
    ...input.telemetry,
    transform: cloneTransform(input.transform),
  };
}

export function getTraceDuration(trace: SimulationTrace | null): number {
  if (!trace || trace.samples.length === 0) {
    return 0;
  }

  return trace.samples[trace.samples.length - 1]?.elapsedSeconds ?? 0;
}

export function getNearestTraceSample(trace: SimulationTrace, elapsedSeconds: number): SimulationTraceSample | null {
  if (trace.samples.length === 0) {
    return null;
  }

  let low = 0;
  let high = trace.samples.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const sample = trace.samples[mid];

    if (sample.elapsedSeconds < elapsedSeconds) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const before = trace.samples[Math.max(0, high)];
  const after = trace.samples[Math.min(trace.samples.length - 1, low)];

  if (!before) {
    return after;
  }

  if (!after) {
    return before;
  }

  return Math.abs(before.elapsedSeconds - elapsedSeconds) <= Math.abs(after.elapsedSeconds - elapsedSeconds)
    ? before
    : after;
}

export function getTraceSideSample(sample: SimulationTraceSample, side: BattleSide): TraceTopSample | undefined {
  return side === 'left' ? sample.left : sample.right;
}

function cloneTrace(trace: SimulationTrace | null): SimulationTrace | null {
  return trace ? JSON.parse(JSON.stringify(trace)) as SimulationTrace : null;
}

function cloneTransform(transform: SimulationTransform): SimulationTransform {
  return {
    position: {
      x: transform.position.x,
      y: transform.position.y,
      z: transform.position.z,
    },
    quaternion: {
      x: transform.quaternion.x,
      y: transform.quaternion.y,
      z: transform.quaternion.z,
      w: transform.quaternion.w,
    },
  };
}
