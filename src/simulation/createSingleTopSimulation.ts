import RAPIER from '@dimforge/rapier3d-compat';
import type { LoadedDesign, PhysicsProfile } from '../model/types';
import type { SimulatorScene } from '../scene/createScene';
import {
  FIXED_TIMESTEP_SECONDS,
  MAX_ACCUMULATED_SECONDS,
  MAX_STEPS_PER_FRAME,
  STOP_DURATION_SECONDS,
  applyArenaContainment,
  applyGyroscopicStability,
  applyProfileDamping,
  applyWobbleTorque,
  calculateTopTelemetry,
  createArenaColliders,
  createProxyGeometry,
  createTopRigidBody,
  decaySpinCeilingRpm,
  getBodyTransform,
  getLaunchSettingsFromProfile,
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
import type { SimulationStopReason, SimulationTelemetry, SingleTopSimulation } from './types';

export async function createSingleTopSimulation(simulatorScene: SimulatorScene): Promise<SingleTopSimulation> {
  const rapier = await getRapier();
  let currentDesign: LoadedDesign | null = null;
  let currentProfile: PhysicsProfile | null = null;
  let proxyGeometry: ProxyGeometry | null = null;
  let world: RapierWorld | null = null;
  let topBody: RapierRigidBody | null = null;
  let accumulatorSeconds = 0;
  let elapsedSeconds = 0;
  let stopCandidateSeconds = 0;
  let stopCandidateReason: SimulationStopReason = null;
  let visualSpinRadians = 0;
  let spinCeilingRpm = 0;
  let telemetry = createTelemetry('ready');
  const traceRecorder = createTraceRecorder();

  const freeWorld = () => {
    if (!world) {
      return;
    }

    world.free();
    world = null;
    topBody = null;
  };

  const rebuildWorld = (withLaunchVelocity: boolean) => {
    if (!currentDesign || !currentProfile) {
      throw new Error('Load a saved design before preparing the simulation.');
    }

    freeWorld();
    proxyGeometry = createProxyGeometry(currentDesign, currentProfile);
    world = new rapier.World({ x: 0, y: -9.81, z: 0 });
    world.timestep = FIXED_TIMESTEP_SECONDS;
    createArenaColliders(rapier as RapierRuntime, world);
    topBody = createTopRigidBody(
      rapier as RapierRuntime,
      world,
      currentProfile,
      proxyGeometry,
      getLaunchSettingsFromProfile(currentProfile),
      withLaunchVelocity,
    );
    accumulatorSeconds = 0;
    elapsedSeconds = 0;
    stopCandidateSeconds = 0;
    stopCandidateReason = null;
    visualSpinRadians = 0;
    spinCeilingRpm = withLaunchVelocity ? currentProfile.defaultLaunchRpm : 0;
    syncSceneTransform();
  };

  const fail = (error: unknown) => {
    telemetry = {
      ...telemetry,
      ready: false,
      status: 'error',
      errorMessage: error instanceof Error ? error.message : 'Simulation error.',
      stopReason: null,
    };
    simulatorScene.setSimulationMode(false);
  };

  const performStep = (deltaSeconds: number) => {
    if (!world || !topBody || !currentProfile || !proxyGeometry) {
      return;
    }

    applyProfileDamping(topBody, currentProfile, proxyGeometry, deltaSeconds);
    applyWobbleTorque(topBody, proxyGeometry);
    applyGyroscopicStability(topBody, proxyGeometry, deltaSeconds);
    world.step();
    applyArenaContainment(topBody, proxyGeometry);
    stabilizeTopGroundContact(topBody, proxyGeometry, deltaSeconds);
    applyGyroscopicStability(topBody, proxyGeometry, deltaSeconds);
    spinCeilingRpm = decaySpinCeilingRpm(spinCeilingRpm, currentProfile, proxyGeometry, deltaSeconds);
    limitTopAngularVelocity(topBody, 1, spinCeilingRpm);
    visualSpinRadians = updateVisualSpinRadians(topBody, visualSpinRadians, deltaSeconds);
    elapsedSeconds += deltaSeconds;
    telemetry = calculateTelemetry(topBody, telemetry.status, elapsedSeconds, telemetry.stopReason, telemetry.errorMessage);
    recordTraceSample();
    updateStopDetection(deltaSeconds);
  };

  const syncSceneTransform = () => {
    if (!currentDesign || !topBody) {
      return;
    }

    simulatorScene.setSimulationTransform(currentDesign, getBodyTransform(topBody, visualSpinRadians));
  };

  const updateStopDetection = (deltaSeconds: number) => {
    if (!topBody || telemetry.status !== 'running') {
      return;
    }

    const topTelemetry = calculateTopTelemetry(topBody, telemetry.stopReason);
    const reason = getStopCandidateReason(topTelemetry.spinRpm, topTelemetry.tiltDegrees, topTelemetry.radialDistance, topTelemetry.position);

    if (!reason) {
      stopCandidateSeconds = 0;
      stopCandidateReason = null;
      return;
    }

    stopCandidateReason = reason;
    stopCandidateSeconds += deltaSeconds;

    if (stopCandidateSeconds >= STOP_DURATION_SECONDS) {
      topBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
      topBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
      telemetry = calculateTelemetry(topBody, 'stopped', elapsedSeconds, stopCandidateReason, null);
      traceRecorder.setResult(stopCandidateReason ?? 'stopped');
      recordTraceSample();
      simulatorScene.setSimulationMode(false);
    }
  };

  const beginTrace = () => {
    traceRecorder.reset('single', currentDesign?.fileName ?? 'Single top');
    recordTraceSample();
  };

  const recordTraceSample = () => {
    if (!topBody) {
      return;
    }

    traceRecorder.recordSingle(elapsedSeconds, {
      telemetry: calculateTopTelemetry(topBody, telemetry.stopReason),
      transform: getBodyTransform(topBody, visualSpinRadians),
    });
  };

  return {
    prepare: (design, profile) => {
      currentDesign = design;
      currentProfile = profile;

      try {
        rebuildWorld(false);
        telemetry = calculateTelemetry(topBody, 'ready', 0, null, null);
        simulatorScene.setSimulationMode(false);
      } catch (error) {
        fail(error);
      }
    },
    launch: () => {
      try {
        rebuildWorld(true);
        beginTrace();
        telemetry = calculateTelemetry(topBody, 'running', 0, null, null);
        simulatorScene.setSimulationMode(true);
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
      simulatorScene.setSimulationMode(false);
    },
    resume: () => {
      if (telemetry.status !== 'paused') {
        return;
      }

      telemetry = {
        ...telemetry,
        status: 'running',
        stopReason: null,
      };
      simulatorScene.setSimulationMode(true);
    },
    step: () => {
      try {
        if (telemetry.status === 'ready' || telemetry.status === 'stopped') {
          rebuildWorld(true);
          beginTrace();
          telemetry = calculateTelemetry(topBody, 'paused', 0, null, null);
        }

        const nextStatus = telemetry.status === 'running' ? 'running' : 'paused';
        telemetry = {
          ...telemetry,
          status: nextStatus,
        };
        performStep(FIXED_TIMESTEP_SECONDS);
        syncSceneTransform();

        if (telemetry.status !== 'stopped') {
          telemetry = {
            ...telemetry,
            status: nextStatus,
          };
        }

        simulatorScene.setSimulationMode(nextStatus === 'running');
      } catch (error) {
        fail(error);
      }
    },
    reset: () => {
      try {
        rebuildWorld(false);
        telemetry = calculateTelemetry(topBody, 'ready', 0, 'manual_reset', null);
        simulatorScene.setSimulationMode(false);
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

          if ((telemetry as SimulationTelemetry).status !== 'running') {
            accumulatorSeconds = 0;
            break;
          }
        }

        if (steps > 0) {
          syncSceneTransform();
        }
      } catch (error) {
        fail(error);
      }
    },
    getTelemetry: () => ({ ...telemetry }),
    getTrace: () => traceRecorder.getTrace(),
    dispose: () => {
      freeWorld();
      currentDesign = null;
      currentProfile = null;
      proxyGeometry = null;
      telemetry = createTelemetry('stopped');
      simulatorScene.setSimulationMode(false);
    },
  };
}

function calculateTelemetry(
  body: RapierRigidBody | null,
  status: SimulationTelemetry['status'],
  elapsedSeconds: number,
  stopReason: SimulationStopReason,
  errorMessage: string | null,
): SimulationTelemetry {
  const topTelemetry = calculateTopTelemetry(body, stopReason);

  return {
    ready: Boolean(body) && status !== 'initializing' && status !== 'error',
    status,
    elapsedSeconds,
    spinRpm: topTelemetry.spinRpm,
    tiltDegrees: topTelemetry.tiltDegrees,
    speed: topTelemetry.speed,
    radialDistance: topTelemetry.radialDistance,
    stopReason,
    errorMessage,
  };
}

function createTelemetry(status: SimulationTelemetry['status']): SimulationTelemetry {
  return {
    ready: status !== 'initializing' && status !== 'error',
    status,
    elapsedSeconds: 0,
    spinRpm: 0,
    tiltDegrees: 0,
    speed: 0,
    radialDistance: 0,
    stopReason: null,
    errorMessage: null,
  };
}
