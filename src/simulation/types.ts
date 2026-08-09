import type { LoadedDesign, PhysicsProfile } from '../model/types';
import type { LaunchSettings } from './physicsCore';

export type SimulationStatus = 'initializing' | 'ready' | 'running' | 'paused' | 'stopped' | 'error';

export type SimulationStopReason = 'spin_below_threshold' | 'tilt_limit' | 'arena_exit' | 'manual_reset' | null;
export type BattleSide = 'left' | 'right';
export type BattleStatus = SimulationStatus;
export type BattleWinner = BattleSide | 'draw' | null;
export type BattleResultReason =
  | 'left_ring_out'
  | 'right_ring_out'
  | 'left_stopped'
  | 'right_stopped'
  | 'draw'
  | 'manual_reset'
  | null;

export type SimulationTransform = {
  position: {
    x: number;
    y: number;
    z: number;
  };
  quaternion: {
    x: number;
    y: number;
    z: number;
    w: number;
  };
};

export type TopTelemetry = {
  spinRpm: number;
  tiltDegrees: number;
  speed: number;
  stopReason: SimulationStopReason;
  radialDistance: number;
  position: {
    x: number;
    z: number;
  };
};

export type SimulationTelemetry = {
  ready: boolean;
  status: SimulationStatus;
  elapsedSeconds: number;
  spinRpm: number;
  tiltDegrees: number;
  speed: number;
  radialDistance: number;
  stopReason: SimulationStopReason;
  errorMessage: string | null;
};

export type BattleLaunchSettings = LaunchSettings;

export type BattleSlot = {
  side: BattleSide;
  storedDesignId: string;
  displayName: string;
  design: LoadedDesign;
  profile: PhysicsProfile;
  launchSettings: BattleLaunchSettings;
};

export type BattleTelemetry = {
  ready: boolean;
  status: BattleStatus;
  elapsedSeconds: number;
  left: TopTelemetry;
  right: TopTelemetry;
  winner: BattleWinner;
  resultReason: BattleResultReason;
  errorMessage: string | null;
};

export type BattleResult = {
  id: string;
  leftDesignId: string;
  leftDisplayName: string;
  rightDesignId: string;
  rightDisplayName: string;
  leftProfile: PhysicsProfile;
  rightProfile: PhysicsProfile;
  leftLaunchSettings: BattleLaunchSettings;
  rightLaunchSettings: BattleLaunchSettings;
  winner: BattleWinner;
  resultReason: BattleResultReason;
  durationSeconds: number;
  finalTelemetry: BattleTelemetry;
  createdAt: string;
};

export type SimulationMetric = 'spinRpm' | 'tiltDegrees' | 'speed' | 'position';

export type SimulationTraceMode = 'single' | 'battle';

export type TraceTopSample = TopTelemetry & {
  transform: SimulationTransform;
};

export type ContactEvent = {
  timeSeconds: number;
  leftPosition: {
    x: number;
    z: number;
  };
  rightPosition: {
    x: number;
    z: number;
  };
  relativeSpeed: number;
};

export type SimulationTraceSample = {
  elapsedSeconds: number;
  single?: TraceTopSample;
  left?: TraceTopSample;
  right?: TraceTopSample;
};

export type SimulationTrace = {
  id: string;
  mode: SimulationTraceMode;
  label: string;
  startedAt: string;
  samples: SimulationTraceSample[];
  contactEvents: ContactEvent[];
  resultLabel: string | null;
};

export type SingleTopSimulation = {
  prepare: (design: LoadedDesign, profile: PhysicsProfile) => void;
  launch: () => void;
  pause: () => void;
  resume: () => void;
  step: () => void;
  reset: () => void;
  update: (deltaSeconds: number) => void;
  getTelemetry: () => SimulationTelemetry;
  getTrace: () => SimulationTrace | null;
  dispose: () => void;
};

export type BattleSimulation = {
  prepare: (left: BattleSlot, right: BattleSlot) => void;
  launch: () => void;
  pause: () => void;
  resume: () => void;
  step: () => void;
  reset: () => void;
  update: (deltaSeconds: number) => void;
  getTelemetry: () => BattleTelemetry;
  getTrace: () => SimulationTrace | null;
  dispose: () => void;
};
