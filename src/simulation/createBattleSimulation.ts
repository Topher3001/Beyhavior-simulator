import type { SimulatorScene } from '../scene/createScene';
import {
  DRAW_WINDOW_SECONDS,
  FIXED_TIMESTEP_SECONDS,
  MAX_ACCUMULATED_SECONDS,
  MAX_STEPS_PER_FRAME,
  RING_OUT_DURATION_SECONDS,
  STOP_DURATION_SECONDS,
  STOP_RPM_THRESHOLD,
  applyArenaContainment,
  applyGyroscopicStability,
  applyProfileDamping,
  applyWobbleTorque,
  calculateTopTelemetry,
  createArenaColliders,
  createProxyGeometry,
  createTopRigidBody,
  createVariedLaunchSettings,
  decaySpinCeilingRpm,
  getBodyTransform,
  getRingOutCandidateReason,
  getStopCandidateReason,
  limitTopAngularVelocity,
  stabilizeTopGroundContact,
  updateVisualSpinRadians,
  type ProxyGeometry,
  type RapierRigidBody,
  type RapierRuntime,
  type RapierWorld,
} from './physicsCore';
import { getRapier } from './rapierRuntime';
import { createTraceRecorder } from './traceRecorder';
import type {
  BattleResultReason,
  BattleSide,
  BattleSimulation,
  BattleSlot,
  BattleTelemetry,
  BattleWinner,
  ContactEvent,
  SimulationStopReason,
  TopTelemetry,
} from './types';

type BattleTopState = {
  slot: BattleSlot;
  proxyGeometry: ProxyGeometry;
  body: RapierRigidBody;
  stopCandidateSeconds: number;
  ringOutCandidateSeconds: number;
  failureTime: number | null;
  failureReason: SimulationStopReason;
  visualSpinRadians: number;
  spinDirection: 1 | -1;
  spinCeilingRpm: number;
};

type BattleSimulationCallbacks = {
  onContact?: (event: ContactEvent) => void;
};

const SIDES: BattleSide[] = ['left', 'right'];

export async function createBattleSimulation(
  simulatorScene: SimulatorScene,
  callbacks: BattleSimulationCallbacks = {},
): Promise<BattleSimulation> {
  const rapier = await getRapier();
  let slots: Record<BattleSide, BattleSlot> | null = null;
  let world: RapierWorld | null = null;
  let topStates: Partial<Record<BattleSide, BattleTopState>> = {};
  let accumulatorSeconds = 0;
  let elapsedSeconds = 0;
  let lastContactSeconds = Number.NEGATIVE_INFINITY;
  let telemetry = createBattleTelemetry('ready');
  const traceRecorder = createTraceRecorder();

  const freeWorld = () => {
    if (!world) {
      return;
    }

    world.free();
    world = null;
    topStates = {};
  };

  const rebuildWorld = (withLaunchVelocity: boolean) => {
    if (!slots) {
      throw new Error('Choose two saved designs before preparing a battle.');
    }

    freeWorld();
    world = new rapier.World({ x: 0, y: -9.81, z: 0 });
    world.timestep = FIXED_TIMESTEP_SECONDS;
    createArenaColliders(rapier as RapierRuntime, world);

    topStates = {
      left: createBattleTopState(rapier as RapierRuntime, world, slots.left, withLaunchVelocity),
      right: createBattleTopState(rapier as RapierRuntime, world, slots.right, withLaunchVelocity),
    };
    accumulatorSeconds = 0;
    elapsedSeconds = 0;
    lastContactSeconds = Number.NEGATIVE_INFINITY;
    syncSceneTransforms();
  };

  const fail = (error: unknown) => {
    telemetry = {
      ...telemetry,
      ready: false,
      status: 'error',
      errorMessage: error instanceof Error ? error.message : 'Battle simulation error.',
    };
    simulatorScene.setBattleMode(false);
  };

  const performStep = (deltaSeconds: number) => {
    if (!world || !topStates.left || !topStates.right) {
      return;
    }

    for (const side of SIDES) {
      const state = topStates[side];

      if (!state) {
        continue;
      }

      applyProfileDamping(state.body, state.slot.profile, state.proxyGeometry, deltaSeconds);
      applyWobbleTorque(state.body, state.proxyGeometry);
      applyGyroscopicStability(state.body, state.proxyGeometry, deltaSeconds);
    }

    world.step();
    recordAnalyticContactEvent();

    for (const side of SIDES) {
      const state = topStates[side];

      if (state) {
        applyArenaContainment(state.body, state.proxyGeometry);
        stabilizeTopGroundContact(state.body, state.proxyGeometry, deltaSeconds);
        applyGyroscopicStability(state.body, state.proxyGeometry, deltaSeconds);
        state.spinCeilingRpm = decaySpinCeilingRpm(state.spinCeilingRpm, state.slot.profile, state.proxyGeometry, deltaSeconds);
        limitTopAngularVelocity(state.body, state.spinDirection, state.spinCeilingRpm);
        state.visualSpinRadians = updateVisualSpinRadians(state.body, state.visualSpinRadians, deltaSeconds, state.spinDirection);
      }
    }

    elapsedSeconds += deltaSeconds;
    updateFailureDetection(deltaSeconds);
    telemetry = calculateBattleTelemetry(telemetry.status, elapsedSeconds, topStates, telemetry.winner, telemetry.resultReason, telemetry.errorMessage);
    recordTraceSample();
    updateWinner();
  };

  const syncSceneTransforms = () => {
    for (const side of SIDES) {
      const state = topStates[side];

      if (state) {
        simulatorScene.setBattleTransform(side, getBodyTransform(state.body, state.visualSpinRadians));
      }
    }
  };

  const updateFailureDetection = (deltaSeconds: number) => {
    for (const side of SIDES) {
      const state = topStates[side];

      if (!state || state.failureTime !== null) {
        continue;
      }

      const topTelemetry = calculateTopTelemetry(state.body, state.failureReason);
      const ringOutReason = getRingOutCandidateReason(topTelemetry.radialDistance, topTelemetry.position);

      if (ringOutReason) {
        state.ringOutCandidateSeconds += deltaSeconds;
      } else {
        state.ringOutCandidateSeconds = 0;
      }

      const measuredSpinRpm = state.slot.launchSettings.rpm < STOP_RPM_THRESHOLD ? state.slot.launchSettings.rpm : topTelemetry.spinRpm;
      const stopReason = getStopCandidateReason(measuredSpinRpm, topTelemetry.tiltDegrees, topTelemetry.radialDistance, topTelemetry.position);

      if (stopReason && stopReason !== 'arena_exit') {
        state.stopCandidateSeconds += deltaSeconds;
      } else {
        state.stopCandidateSeconds = 0;
      }

      if (state.ringOutCandidateSeconds >= RING_OUT_DURATION_SECONDS) {
        markTopFailed(state, 'arena_exit', elapsedSeconds);
      } else if (state.stopCandidateSeconds >= STOP_DURATION_SECONDS) {
        markTopFailed(state, stopReason ?? 'spin_below_threshold', elapsedSeconds);
      }
    }
  };

  const updateWinner = () => {
    if (!topStates.left || !topStates.right || telemetry.status !== 'running') {
      return;
    }

    const leftFailureTime = topStates.left.failureTime;
    const rightFailureTime = topStates.right.failureTime;

    if (leftFailureTime === null && rightFailureTime === null) {
      return;
    }

    if (leftFailureTime !== null && rightFailureTime !== null) {
      const draw = Math.abs(leftFailureTime - rightFailureTime) <= DRAW_WINDOW_SECONDS;
      finishBattle(draw ? 'draw' : leftFailureTime < rightFailureTime ? 'right' : 'left');
      return;
    }

    if (leftFailureTime !== null && elapsedSeconds - leftFailureTime > DRAW_WINDOW_SECONDS) {
      finishBattle('right');
      return;
    }

    if (rightFailureTime !== null && elapsedSeconds - rightFailureTime > DRAW_WINDOW_SECONDS) {
      finishBattle('left');
    }
  };

  const finishBattle = (winner: BattleWinner) => {
    const resultReason = getResultReason(winner, topStates.left?.failureReason ?? null, topStates.right?.failureReason ?? null);

    stopBodies();
    telemetry = calculateBattleTelemetry('stopped', elapsedSeconds, topStates, winner, resultReason, null);
    traceRecorder.setResult(resultReason ?? 'stopped');
    recordTraceSample();
    simulatorScene.setBattleMode(false);
  };

  const stopBodies = () => {
    for (const side of SIDES) {
      const body = topStates[side]?.body;

      if (!body) {
        continue;
      }

      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  };

  const beginTrace = () => {
    traceRecorder.reset('battle', slots ? `${slots.left.displayName} vs ${slots.right.displayName}` : 'Battle');
    recordTraceSample();
  };

  const recordTraceSample = () => {
    if (!topStates.left || !topStates.right) {
      return;
    }

    traceRecorder.recordBattle(
      elapsedSeconds,
      {
        telemetry: getTopTelemetry(topStates.left),
        transform: getBodyTransform(topStates.left.body, topStates.left.visualSpinRadians),
      },
      {
        telemetry: getTopTelemetry(topStates.right),
        transform: getBodyTransform(topStates.right.body, topStates.right.visualSpinRadians),
      },
    );
  };

  const recordAnalyticContactEvent = () => {
    if (!topStates.left || !topStates.right || elapsedSeconds - lastContactSeconds < 0.05) {
      return;
    }

    const leftTranslation = topStates.left.body.translation();
    const rightTranslation = topStates.right.body.translation();
    const leftVelocity = topStates.left.body.linvel();
    const rightVelocity = topStates.right.body.linvel();
    const horizontalDistance = Math.hypot(
      leftTranslation.x - rightTranslation.x,
      leftTranslation.z - rightTranslation.z,
    );
    const verticalDistance = Math.abs(leftTranslation.y - rightTranslation.y);
    const contactDistance = (topStates.left.proxyGeometry.radiusWorld + topStates.right.proxyGeometry.radiusWorld) * 0.92;
    const maxVerticalDistance = Math.max(topStates.left.proxyGeometry.heightWorld, topStates.right.proxyGeometry.heightWorld) * 0.72;

    if (horizontalDistance > contactDistance || verticalDistance > maxVerticalDistance) {
      return;
    }

    lastContactSeconds = elapsedSeconds;
    const contactEvent = {
      timeSeconds: elapsedSeconds,
      leftPosition: {
        x: leftTranslation.x,
        z: leftTranslation.z,
      },
      rightPosition: {
        x: rightTranslation.x,
        z: rightTranslation.z,
      },
      relativeSpeed: Math.hypot(
        leftVelocity.x - rightVelocity.x,
        leftVelocity.y - rightVelocity.y,
        leftVelocity.z - rightVelocity.z,
      ),
    };

    traceRecorder.recordContact(contactEvent);
    callbacks.onContact?.(contactEvent);
  };

  return {
    prepare: (left, right) => {
      slots = { left, right };

      try {
        rebuildWorld(false);
        telemetry = calculateBattleTelemetry('ready', 0, topStates, null, null, null);
        simulatorScene.setBattleMode(false);
      } catch (error) {
        fail(error);
      }
    },
    launch: () => {
      try {
        rebuildWorld(true);
        beginTrace();
        telemetry = calculateBattleTelemetry('running', 0, topStates, null, null, null);
        simulatorScene.setBattleMode(true);
      } catch (error) {
        fail(error);
      }
    },
    pause: () => {
      if (telemetry.status !== 'running') {
        return;
      }

      telemetry = {
        ...telemetry,
        status: 'paused',
      };
      simulatorScene.setBattleMode(false);
    },
    resume: () => {
      if (telemetry.status !== 'paused') {
        return;
      }

      telemetry = {
        ...telemetry,
        status: 'running',
      };
      simulatorScene.setBattleMode(true);
    },
    step: () => {
      try {
        if (telemetry.status === 'ready' || telemetry.status === 'stopped') {
          rebuildWorld(true);
          beginTrace();
          telemetry = calculateBattleTelemetry('paused', 0, topStates, null, null, null);
        }

        const nextStatus = telemetry.status === 'running' ? 'running' : 'paused';
        telemetry = {
          ...telemetry,
          status: nextStatus,
        };
        performStep(FIXED_TIMESTEP_SECONDS);
        syncSceneTransforms();

        if (telemetry.status !== 'stopped') {
          telemetry = {
            ...telemetry,
            status: nextStatus,
          };
        }

        simulatorScene.setBattleMode(nextStatus === 'running');
      } catch (error) {
        fail(error);
      }
    },
    reset: () => {
      try {
        rebuildWorld(false);
        telemetry = calculateBattleTelemetry('ready', 0, topStates, null, 'manual_reset', null);
        simulatorScene.setBattleMode(false);
      } catch (error) {
        fail(error);
      }
    },
    update: (deltaSeconds) => {
      if (telemetry.status !== 'running') {
        return;
      }

      try {
        accumulatorSeconds += Math.min(deltaSeconds, MAX_ACCUMULATED_SECONDS);
        let steps = 0;

        while (accumulatorSeconds >= FIXED_TIMESTEP_SECONDS && steps < MAX_STEPS_PER_FRAME) {
          performStep(FIXED_TIMESTEP_SECONDS);
          accumulatorSeconds -= FIXED_TIMESTEP_SECONDS;
          steps += 1;

          if ((telemetry as BattleTelemetry).status !== 'running') {
            accumulatorSeconds = 0;
            break;
          }
        }

        if (steps > 0) {
          syncSceneTransforms();
        }
      } catch (error) {
        fail(error);
      }
    },
    getTelemetry: () => ({ ...telemetry }),
    getTrace: () => traceRecorder.getTrace(),
    dispose: () => {
      freeWorld();
      slots = null;
      telemetry = createBattleTelemetry('stopped');
      simulatorScene.setBattleMode(false);
    },
  };
}

function createBattleTopState(
  rapier: RapierRuntime,
  world: RapierWorld,
  slot: BattleSlot,
  withLaunchVelocity: boolean,
): BattleTopState {
  const proxyGeometry = createProxyGeometry(slot.design, slot.profile);
  const inwardDirection = slot.side === 'left' ? 1 : -1;
  const baseLaunchSettings = {
    ...slot.launchSettings,
    linearVelocity: {
      x: inwardDirection * 0.72,
      z: slot.side === 'left' ? 0.12 : -0.12,
    },
  };
  const launchSettings = withLaunchVelocity
    ? createVariedLaunchSettings(baseLaunchSettings, proxyGeometry)
    : baseLaunchSettings;
  const body = createTopRigidBody(
    rapier,
    world,
    slot.profile,
    proxyGeometry,
    launchSettings,
    withLaunchVelocity,
    {
      includeBattleRing: true,
      spinDirection: 1,
    },
  );

  return {
    slot,
    proxyGeometry,
    body,
    stopCandidateSeconds: 0,
    ringOutCandidateSeconds: 0,
    failureTime: null,
    failureReason: null,
    visualSpinRadians: 0,
    spinDirection: 1,
    spinCeilingRpm: withLaunchVelocity ? launchSettings.rpm : 0,
  };
}

function markTopFailed(state: BattleTopState, reason: SimulationStopReason, elapsedSeconds: number): void {
  state.failureTime = state.failureTime ?? elapsedSeconds;
  state.failureReason = reason;
}

function calculateBattleTelemetry(
  status: BattleTelemetry['status'],
  elapsedSeconds: number,
  topStates: Partial<Record<BattleSide, BattleTopState>>,
  winner: BattleWinner,
  resultReason: BattleResultReason,
  errorMessage: string | null,
): BattleTelemetry {
  return {
    ready: Boolean(topStates.left && topStates.right) && status !== 'initializing' && status !== 'error',
    status,
    elapsedSeconds,
    left: getTopTelemetry(topStates.left),
    right: getTopTelemetry(topStates.right),
    winner,
    resultReason,
    errorMessage,
  };
}

function getTopTelemetry(state: BattleTopState | undefined): TopTelemetry {
  const telemetry = calculateTopTelemetry(state?.body ?? null, state?.failureReason ?? null);

  if (state?.failureReason) {
    return {
      ...telemetry,
      stopReason: state.failureReason,
    };
  }

  return telemetry;
}

function getResultReason(
  winner: BattleWinner,
  leftReason: SimulationStopReason,
  rightReason: SimulationStopReason,
): BattleResultReason {
  if (winner === 'draw') {
    return 'draw';
  }

  if (winner === 'left') {
    return rightReason === 'arena_exit' ? 'right_ring_out' : 'right_stopped';
  }

  if (winner === 'right') {
    return leftReason === 'arena_exit' ? 'left_ring_out' : 'left_stopped';
  }

  return null;
}

function createBattleTelemetry(status: BattleTelemetry['status']): BattleTelemetry {
  return {
    ready: status !== 'initializing' && status !== 'error',
    status,
    elapsedSeconds: 0,
    left: createEmptyTopTelemetry(),
    right: createEmptyTopTelemetry(),
    winner: null,
    resultReason: null,
    errorMessage: null,
  };
}

function createEmptyTopTelemetry(): TopTelemetry {
  return {
    spinRpm: 0,
    tiltDegrees: 0,
    speed: 0,
    radialDistance: 0,
    stopReason: null,
    position: {
      x: 0,
      z: 0,
    },
  };
}
