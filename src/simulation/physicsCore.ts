import RAPIER from '@dimforge/rapier3d-compat';
import { Quaternion, Vector3 } from 'three';
import type { LoadedDesign, PhysicsProfile, TipType } from '../model/types';
import type { SimulationStopReason, TopTelemetry } from './types';
import {
  ARENA_SURFACE_Y as STADIUM_SURFACE_Y,
  getActiveStadiumPreset,
  getPocketAtPosition,
  getPocketEntryRadius,
  isAngleInsidePocket,
  isPositionInPocket,
  type StadiumPreset,
} from './stadiumConfig';
import {
  getStadiumBowlGradientAt,
  getStadiumSurfaceYAt,
  getStadiumSurfaceYByProgress,
} from './stadiumSurface';
import {
  degreesToRadians,
  gramsToKilograms,
  profileMmToSceneWorld,
  radiansPerSecondToRpm,
  rpmToRadiansPerSecond,
  radiansToDegrees,
} from './units';

export type RapierRuntime = typeof RAPIER;
export type RapierWorld = InstanceType<RapierRuntime['World']>;
export type RapierRigidBody = InstanceType<RapierRuntime['RigidBody']>;

export type ProxyGeometry = {
  massKg: number;
  radiusWorld: number;
  heightWorld: number;
  tipRadiusWorld: number;
  centerOfMassWorld: Vector3;
  tipFriction: number;
  ringFriction: number;
  contactPointCount: number;
  attackBias: number;
  recoilCoefficient: number;
};

export type LaunchSettings = {
  rpm: number;
  angleDegrees: number;
  position: {
    x: number;
    z: number;
  };
  linearVelocity?: {
    x: number;
    z: number;
  };
};

export type TopRigidBodyOptions = {
  includeBattleRing?: boolean;
  spinDirection?: 1 | -1;
};

export const ARENA_SURFACE_Y = STADIUM_SURFACE_Y;
export const FIXED_TIMESTEP_SECONDS = 1 / 120;
export const MAX_ACCUMULATED_SECONDS = 1 / 4;
export const MAX_STEPS_PER_FRAME = 24;
export const STOP_RPM_THRESHOLD = 120;
export const STOP_TILT_DEGREES = 75;
export const STOP_DURATION_SECONDS = 1.25;
export const RING_OUT_DURATION_SECONDS = 0.5;
export const DRAW_WINDOW_SECONDS = 0.75;

const MAX_HORIZONTAL_SPEED = 2.35;
const MAX_UPWARD_SPEED = 0.28;
const MAX_SPIN_RPM = 12500;
const MAX_TUMBLE_RADIANS_PER_SECOND = 12;
const MAX_VISUAL_SPIN_RPM = 480;
const BOWL_SLOPE_ACCELERATION_SCALE = 0.16;
const CENTER_CHANNEL_LOW_SPIN_RPM = 4600;
const CENTER_CHANNEL_MIN_RADIUS = 0.42;
const CENTER_CHANNEL_ACCELERATION = 0.82;
const CENTER_CHANNEL_OUTWARD_DAMPING = 2.85;
const CENTER_CHANNEL_ORBIT_DAMPING = 0.92;
const CENTER_CHANNEL_POSITION_SETTLE = 0.34;
const RIM_BANK_RETURN_RATE = 1.9;
const RIM_BANK_ORBIT_DAMPING = 1.85;
const CONTACT_CLEARANCE = 0.006;
const LAUNCH_RPM_VARIATION_RATIO = 0.035;
const LAUNCH_ANGLE_VARIATION_DEGREES = 0.65;
const LAUNCH_POSITION_VARIATION_WORLD = 0.08;
const LAUNCH_VELOCITY_VARIATION_WORLD_PER_SECOND = 0.14;
const HIGH_RPM_STABILITY_RPM = 7000;
const XTREME_RAIL_ACCELERATION = 1.15;
const XTREME_RAIL_SPIN_DRAIN = 0.035;
const WORLD_UP = new Vector3(0, 1, 0);
const IDENTITY_ROTATION = { x: 0, y: 0, z: 0, w: 1 };
const lowEnergyRadiusByBody = new WeakMap<RapierRigidBody, number>();

export function configurePhysicsWorld(world: RapierWorld): void {
  world.timestep = FIXED_TIMESTEP_SECONDS;
  world.numSolverIterations = Math.max(world.numSolverIterations, 8);
  world.maxCcdSubsteps = Math.max(world.maxCcdSubsteps, 4);
}

export function createArenaColliders(rapier: RapierRuntime, world: RapierWorld): void {
  createTornadoRidgeColliders(rapier, world);
  createWallColliders(rapier, world);
  createPocketGuardColliders(rapier, world);
}

function createWallColliders(rapier: RapierRuntime, world: RapierWorld): void {
  const stadium = getActiveStadiumPreset();
  const segmentCount = 36;
  const rimRadius = stadium.wallRadiusWorld;
  const rimHeight = stadium.wallHeightWorld;
  const rimThickness = stadium.wallThicknessWorld;
  const rimSurfaceY = getStadiumSurfaceYByProgress(1, stadium);
  const segmentLength = (Math.PI * 2 * rimRadius) / segmentCount;

  for (let index = 0; index < segmentCount; index += 1) {
    const angle = (index / segmentCount) * Math.PI * 2;
    const angleDegrees = (angle * 180) / Math.PI;

    if (stadium.pockets.some((pocket) => isAngleInsidePocket(angleDegrees, pocket))) {
      continue;
    }

    const yaw = angle + Math.PI / 2;
    const rimDesc = rapier.ColliderDesc.cuboid(segmentLength * 0.52, rimHeight / 2, rimThickness / 2)
      .setTranslation(Math.cos(angle) * rimRadius, rimSurfaceY + rimHeight / 2, Math.sin(angle) * rimRadius)
      .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
      .setFriction(stadium.wallFriction)
      .setRestitution(0.015);

    world.createCollider(rimDesc);
  }
}

function createTornadoRidgeColliders(rapier: RapierRuntime, world: RapierWorld): void {
  const stadium = getActiveStadiumPreset();
  const segmentCount = 40;
  const ridgeRadius = stadium.tornadoRidgeRadiusWorld;
  const ridgeThickness = 0.08;
  const ridgeHeight = Math.max(stadium.tornadoRidgeHeightWorld, 0.035);
  const segmentLength = (Math.PI * 2 * ridgeRadius) / segmentCount;

  for (let index = 0; index < segmentCount; index += 1) {
    const angle = (index / segmentCount) * Math.PI * 2;
    const yaw = angle + Math.PI / 2;
    const surfaceY = getStadiumSurfaceYAt(Math.cos(angle) * ridgeRadius, Math.sin(angle) * ridgeRadius, stadium);
    const ridgeDesc = rapier.ColliderDesc.cuboid(segmentLength * 0.54, ridgeHeight / 2, ridgeThickness / 2)
      .setTranslation(Math.cos(angle) * ridgeRadius, surfaceY + ridgeHeight / 2, Math.sin(angle) * ridgeRadius)
      .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
      .setFriction(stadium.floorFriction * 1.4)
      .setRestitution(0.005);

    world.createCollider(ridgeDesc);
  }
}

function createPocketGuardColliders(rapier: RapierRuntime, world: RapierWorld): void {
  const stadium = getActiveStadiumPreset();
  const rimSurfaceY = getStadiumSurfaceYByProgress(1, stadium);

  for (const pocket of stadium.pockets) {
    const halfWidth = pocket.widthDegrees / 2;

    for (const side of [-1, 1]) {
      const angle = ((pocket.angleDegrees + side * halfWidth) * Math.PI) / 180;
      const guardLength = stadium.pocketGuardLengthWorld + pocket.depthWorld * 0.4;
      const radialCenter = stadium.wallRadiusWorld + guardLength / 2 - 0.1;
      const guardDesc = rapier.ColliderDesc.cuboid(guardLength / 2, stadium.wallHeightWorld / 2, stadium.wallThicknessWorld / 2)
        .setTranslation(Math.cos(angle) * radialCenter, rimSurfaceY + stadium.wallHeightWorld / 2, Math.sin(angle) * radialCenter)
        .setRotation({ x: 0, y: Math.sin(-angle / 2), z: 0, w: Math.cos(-angle / 2) })
        .setFriction(stadium.wallFriction)
        .setRestitution(0.012);

      world.createCollider(guardDesc);
    }
  }
}

export function createTopRigidBody(
  rapier: RapierRuntime,
  world: RapierWorld,
  profile: PhysicsProfile,
  proxyGeometry: ProxyGeometry,
  launchSettings: LaunchSettings,
  withLaunchVelocity: boolean,
  options: TopRigidBodyOptions = {},
): RapierRigidBody {
  const launchTiltRadians = degreesToRadians(getEffectiveInitialTiltDegrees(launchSettings));
  const launchRotation = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), launchTiltRadians);
  const launchPosition = getClampedLaunchPosition(launchSettings.position, proxyGeometry.radiusWorld);
  const launchSurfaceOffsetY = getBodyYOffsetForSurface(launchPosition.x, launchPosition.z);
  const inertia = estimateCylinderInertia(proxyGeometry.massKg, proxyGeometry.radiusWorld, proxyGeometry.heightWorld);

  const bodyDesc = rapier.RigidBodyDesc.dynamic()
    .setTranslation(launchPosition.x, launchSurfaceOffsetY, launchPosition.z)
    .setRotation(toRapierQuaternion(launchRotation))
    .setLinvel(
      withLaunchVelocity ? launchSettings.linearVelocity?.x ?? 0 : 0,
      0,
      withLaunchVelocity ? launchSettings.linearVelocity?.z ?? 0 : 0,
    )
    .setAngvel(withLaunchVelocity ? getLaunchAngularVelocity(launchSettings, launchRotation, options.spinDirection ?? 1) : { x: 0, y: 0, z: 0 })
    .setLinearDamping(Math.min(1.2, 0.025 + profile.airDragCoefficient * 0.35))
    .setAngularDamping(Math.min(1, 0.006 + profile.spinDampingCoefficient * 0.08))
    .setAdditionalSolverIterations(4)
    .setCcdEnabled(true)
    .setAdditionalMassProperties(
      proxyGeometry.massKg,
      {
        x: proxyGeometry.centerOfMassWorld.x,
        y: ARENA_SURFACE_Y + proxyGeometry.centerOfMassWorld.y,
        z: proxyGeometry.centerOfMassWorld.z,
      },
      {
        x: inertia.crossAxis,
        y: inertia.spinAxis,
        z: inertia.crossAxis,
      },
      IDENTITY_ROTATION,
    )
    .setCanSleep(false);

  const topBody = world.createRigidBody(bodyDesc);
  createTopColliders(rapier, world, topBody, proxyGeometry, options);

  return topBody;
}

export function createProxyGeometry(design: LoadedDesign, profile: PhysicsProfile): ProxyGeometry {
  const radiusWorld = clamp(profileMmToSceneWorld(profile.radiusMm, design), 0.12, 2.2);
  const heightWorld = clamp(profileMmToSceneWorld(profile.heightMm, design), 0.1, 2.2);
  const centerOfMassWorld = new Vector3(
    clamp(profileMmToSceneWorld(profile.centerOfMassOffsetMm.x, design), -radiusWorld, radiusWorld),
    clamp(profileMmToSceneWorld(profile.centerOfMassOffsetMm.y, design), 0.02, heightWorld * 1.4),
    clamp(profileMmToSceneWorld(profile.centerOfMassOffsetMm.z, design), -radiusWorld, radiusWorld),
  );
  const tip = getTipContact(profile.tipType, radiusWorld, profile.tipFrictionCoefficient);

  return {
    massKg: clamp(gramsToKilograms(profile.weightGrams), 0.005, 0.25),
    radiusWorld,
    heightWorld,
    tipRadiusWorld: tip.radiusWorld,
    centerOfMassWorld,
    tipFriction: tip.friction,
    ringFriction: clamp(profile.ringFrictionCoefficient, 0, 3),
    contactPointCount: Math.round(clamp(profile.contactProfile.attackPoints, 1, 12)),
    attackBias: clamp(profile.contactProfile.attackBias, 0, 1),
    recoilCoefficient: clamp(profile.contactProfile.recoilCoefficient, 0, 1),
  };
}

export function getLaunchSettingsFromProfile(profile: PhysicsProfile, position = profile.defaultLaunchPosition): LaunchSettings {
  return {
    rpm: profile.defaultLaunchRpm,
    angleDegrees: profile.defaultLaunchAngleDegrees,
    position,
  };
}

export function createVariedLaunchSettings(launchSettings: LaunchSettings, proxyGeometry: ProxyGeometry): LaunchSettings {
  const rpmScale = 1 + centeredRandom() * LAUNCH_RPM_VARIATION_RATIO;
  const variedPosition = getClampedLaunchPosition(
    {
      x: launchSettings.position.x + centeredRandom() * LAUNCH_POSITION_VARIATION_WORLD,
      z: launchSettings.position.z + centeredRandom() * LAUNCH_POSITION_VARIATION_WORLD,
    },
    proxyGeometry.radiusWorld,
  );
  const baseLinearVelocity = launchSettings.linearVelocity ?? { x: 0, z: 0 };

  return {
    rpm: Math.max(0, launchSettings.rpm * rpmScale),
    angleDegrees: clamp(
      launchSettings.angleDegrees + centeredRandom() * LAUNCH_ANGLE_VARIATION_DEGREES,
      -20,
      30,
    ),
    position: variedPosition,
    linearVelocity: {
      x: baseLinearVelocity.x + centeredRandom() * LAUNCH_VELOCITY_VARIATION_WORLD_PER_SECOND,
      z: baseLinearVelocity.z + centeredRandom() * LAUNCH_VELOCITY_VARIATION_WORLD_PER_SECOND,
    },
  };
}

export function applyProfileDamping(body: RapierRigidBody, profile: PhysicsProfile, proxyGeometry: ProxyGeometry, deltaSeconds: number): void {
  const linearVelocity = body.linvel();
  const horizontalDrag = Math.exp(-(0.025 + profile.airDragCoefficient * 1.2 + proxyGeometry.tipFriction * 0.01) * deltaSeconds);
  let horizontalVelocity = new Vector3(linearVelocity.x * horizontalDrag, 0, linearVelocity.z * horizontalDrag);
  const energyLimitedHorizontalVelocity = limitHorizontalSpeedBySpinEnergy(
    body,
    proxyGeometry,
    { bladeContactStrength: 0 },
    horizontalVelocity.x,
    horizontalVelocity.z,
    deltaSeconds,
    1.45,
  );

  horizontalVelocity = new Vector3(energyLimitedHorizontalVelocity.x, 0, energyLimitedHorizontalVelocity.z);

  if (horizontalVelocity.length() > MAX_HORIZONTAL_SPEED) {
    horizontalVelocity.setLength(MAX_HORIZONTAL_SPEED);
  }

  body.setLinvel({ x: horizontalVelocity.x, y: linearVelocity.y, z: horizontalVelocity.z }, true);

  const angularVelocity = body.angvel();
  const spinLoss = Math.exp(-(0.015 + profile.spinDampingCoefficient * 0.85 + proxyGeometry.tipFriction * 0.004) * deltaSeconds);
  const tumbleLoss = Math.exp(-(0.32 + profile.airDragCoefficient * 0.9 + profile.spinDampingCoefficient * 1.6) * deltaSeconds);
  body.setAngvel(
    {
      x: angularVelocity.x * tumbleLoss,
      y: angularVelocity.y * spinLoss,
      z: angularVelocity.z * tumbleLoss,
    },
    true,
  );
}

export function decaySpinCeilingRpm(currentRpm: number, profile: PhysicsProfile, proxyGeometry: ProxyGeometry, deltaSeconds: number): number {
  const spinDecayRate = 0.01 + profile.spinDampingCoefficient * 0.7 + proxyGeometry.tipFriction * 0.002;

  return Math.max(0, currentRpm * Math.exp(-spinDecayRate * deltaSeconds));
}

export function applyWobbleTorque(body: RapierRigidBody, proxyGeometry: ProxyGeometry, elapsedSeconds = Number.POSITIVE_INFINITY): void {
  const rotation = body.rotation();
  const bodyUp = WORLD_UP.clone().applyQuaternion(new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w)).normalize();
  const tiltAxis = new Vector3().crossVectors(bodyUp, WORLD_UP);
  const angularVelocity = body.angvel();
  const spinRadiansPerSecond = new Vector3(angularVelocity.x, angularVelocity.y, angularVelocity.z).dot(bodyUp);
  const spinRpm = Math.abs(radiansPerSecondToRpm(spinRadiansPerSecond));
  const highSpinStability = clamp(spinRpm / HIGH_RPM_STABILITY_RPM, 0, 1);
  const launchSettling = clamp(elapsedSeconds / 1.6, 0, 1);
  const wobbleReadiness = (0.06 + (1 - highSpinStability) * 0.94) * (0.18 + launchSettling * 0.82);

  if (tiltAxis.lengthSq() > 0.000001) {
    tiltAxis.normalize().multiplyScalar(proxyGeometry.massKg * 9.81 * Math.max(proxyGeometry.centerOfMassWorld.y, 0.04) * 0.18 * wobbleReadiness);
    body.addTorque({ x: tiltAxis.x, y: 0, z: tiltAxis.z }, true);
  }

  const offsetTorqueScale = proxyGeometry.massKg * 9.81 * 0.08 * wobbleReadiness;
  body.addTorque(
    {
      x: proxyGeometry.centerOfMassWorld.z * offsetTorqueScale,
      y: 0,
      z: -proxyGeometry.centerOfMassWorld.x * offsetTorqueScale,
    },
    true,
  );
}

export function applyGyroscopicStability(
  body: RapierRigidBody,
  proxyGeometry: ProxyGeometry,
  deltaSeconds: number,
  elapsedSeconds = Number.POSITIVE_INFINITY,
): void {
  const rotation = body.rotation();
  const bodyUp = WORLD_UP.clone().applyQuaternion(new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w)).normalize();
  const angularVelocity = body.angvel();
  const angularVelocityVector = new Vector3(angularVelocity.x, angularVelocity.y, angularVelocity.z);
  const spinRadiansPerSecond = angularVelocityVector.dot(bodyUp);
  const spinRpm = Math.abs(radiansPerSecondToRpm(spinRadiansPerSecond));
  const stability = clamp((spinRpm - 250) / 6500, 0, 1);
  const launchHold = clamp(1 - elapsedSeconds / 1.75, 0, 1);

  if (stability <= 0) {
    return;
  }

  const spinVector = bodyUp.clone().multiplyScalar(spinRadiansPerSecond);
  const tumbleVelocity = angularVelocityVector.sub(spinVector);
  const tumbleDamping = Math.exp(-(2.4 + stability * (12.5 + launchHold * 10)) * deltaSeconds);
  const stabilizedAngularVelocity = spinVector.add(tumbleVelocity.multiplyScalar(tumbleDamping));

  body.setAngvel(
    {
      x: stabilizedAngularVelocity.x,
      y: stabilizedAngularVelocity.y,
      z: stabilizedAngularVelocity.z,
    },
    true,
  );

  const tiltAxis = new Vector3().crossVectors(bodyUp, WORLD_UP);

  if (tiltAxis.lengthSq() <= 0.000001) {
    return;
  }

  const tiltDegrees = radiansToDegrees(bodyUp.angleTo(WORLD_UP));
  const rightingScale = proxyGeometry.massKg * 9.81 * Math.max(proxyGeometry.centerOfMassWorld.y, 0.04);
  const rightingTorque = rightingScale * (0.55 + stability * (2.5 + launchHold * 2.6)) * Math.min(tiltDegrees / 42, 1);

  tiltAxis.normalize().multiplyScalar(rightingTorque);
  body.addTorque({ x: tiltAxis.x, y: 0, z: tiltAxis.z }, true);

  const flatSpinHold = stability * clamp(1 - elapsedSeconds / 5, 0, 1);
  const maxHighSpinTiltDegrees = 2.8 + (1 - flatSpinHold) * 10;

  if (tiltDegrees > maxHighSpinTiltDegrees) {
    clampBodyTilt(body, rotation, bodyUp, maxHighSpinTiltDegrees);
    return;
  }

  if (tiltDegrees < 89.4) {
    const correctionRate = (0.85 + stability * (5.2 + launchHold * 7.5)) * Math.min(Math.max(tiltDegrees, 1) / 22, 1.8);
    const correctionAlpha = 1 - Math.exp(-correctionRate * deltaSeconds);
    const currentRotation = new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
    const fullCorrection = new Quaternion().setFromUnitVectors(bodyUp, WORLD_UP);
    const partialCorrection = new Quaternion().identity().slerp(fullCorrection, correctionAlpha);
    const correctedRotation = partialCorrection.multiply(currentRotation).normalize();

    body.setRotation(toRapierQuaternion(correctedRotation), true);
  }
}

function clampBodyTilt(
  body: RapierRigidBody,
  rotation: { x: number; y: number; z: number; w: number },
  bodyUp: Vector3,
  maxTiltDegrees: number,
): void {
  const tiltAxis = new Vector3().crossVectors(WORLD_UP, bodyUp);

  if (tiltAxis.lengthSq() <= 0.000001) {
    return;
  }

  const currentRotation = new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
  const desiredUp = WORLD_UP.clone().applyAxisAngle(tiltAxis.normalize(), degreesToRadians(maxTiltDegrees));
  const correction = new Quaternion().setFromUnitVectors(bodyUp, desiredUp);
  const correctedRotation = correction.multiply(currentRotation).normalize();

  body.setRotation(toRapierQuaternion(correctedRotation), true);
}

export function limitTopAngularVelocity(body: RapierRigidBody, spinDirection: 1 | -1 = 1, maxSpinRpm = MAX_SPIN_RPM): void {
  const rotation = body.rotation();
  const bodyUp = WORLD_UP.clone().applyQuaternion(new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w)).normalize();
  const angularVelocity = body.angvel();
  const angularVelocityVector = new Vector3(angularVelocity.x, angularVelocity.y, angularVelocity.z);
  const rawSpinRadiansPerSecond = angularVelocityVector.dot(bodyUp);
  const cappedSpinRpm = clamp(maxSpinRpm, 0, MAX_SPIN_RPM);
  const spinRadiansPerSecond = Math.min(Math.abs(rawSpinRadiansPerSecond), rpmToRadiansPerSecond(cappedSpinRpm)) * spinDirection;
  const spinVector = bodyUp.clone().multiplyScalar(spinRadiansPerSecond);
  const tumbleVelocity = angularVelocityVector.sub(bodyUp.clone().multiplyScalar(rawSpinRadiansPerSecond));

  if (tumbleVelocity.length() > MAX_TUMBLE_RADIANS_PER_SECOND) {
    tumbleVelocity.setLength(MAX_TUMBLE_RADIANS_PER_SECOND);
  }

  const limitedVelocity = spinVector.add(tumbleVelocity);

  body.setAngvel(
    {
      x: limitedVelocity.x,
      y: limitedVelocity.y,
      z: limitedVelocity.z,
    },
    true,
  );
}

export function applyArenaContainment(body: RapierRigidBody, proxyGeometry: ProxyGeometry): void {
  const translation = body.translation();
  const radialDistance = Math.hypot(translation.x, translation.z);
  const inPocket = isPositionInPocket(translation.x, translation.z);
  const stadium = getActiveStadiumPreset();
  const maxCenterDistance = Math.max(0.4, stadium.wallRadiusWorld - Math.max(proxyGeometry.radiusWorld * 0.45, 0.4));
  const softBankDistance = Math.max(0.6, stadium.wallRadiusWorld - Math.max(proxyGeometry.radiusWorld * 0.95, 0.74));

  if (inPocket && radialDistance > maxCenterDistance) {
    return;
  }

  if (radialDistance <= softBankDistance || radialDistance === 0) {
    return;
  }

  const normalX = translation.x / radialDistance;
  const normalZ = translation.z / radialDistance;
  const rimWidth = Math.max(maxCenterDistance - softBankDistance, 0.001);
  const rimPressure = clamp((radialDistance - softBankDistance) / rimWidth, 0, 1);
  const linearVelocity = body.linvel();
  const speed = Math.hypot(linearVelocity.x, linearVelocity.z);
  const spinRpm = getBodySpinRpm(body);
  const lowSpinReturn = clamp((6200 - spinRpm) / 6200, 0, 1);
  const returnRate = RIM_BANK_RETURN_RATE * (0.34 + rimPressure * 0.66) * (0.65 + lowSpinReturn * 0.55);
  const hardWallReentryRadius = softBankDistance + rimWidth * 0.18;
  const slowBankReentryRadius = softBankDistance + rimWidth * 0.24;
  const gradualReturnRadius = Math.min(radialDistance, maxCenterDistance)
    - returnRate * FIXED_TIMESTEP_SECONDS * (0.55 + Math.min(speed, 0.9));
  const bankedReturnRadius = speed < 0.45 && lowSpinReturn > 0.16 && rimPressure > 0.55
    ? Math.min(gradualReturnRadius, slowBankReentryRadius)
    : gradualReturnRadius;
  const returnedRadius = Math.max(
    softBankDistance,
    radialDistance >= maxCenterDistance - 0.035
      ? Math.min(hardWallReentryRadius, bankedReturnRadius)
      : bankedReturnRadius,
  );

  body.setTranslation(
    {
      x: normalX * returnedRadius,
      y: translation.y,
      z: normalZ * returnedRadius,
    },
    true,
  );

  const outwardSpeed = linearVelocity.x * normalX + linearVelocity.z * normalZ;
  const tangentialVelocityX = linearVelocity.x - outwardSpeed * normalX;
  const tangentialVelocityZ = linearVelocity.z - outwardSpeed * normalZ;
  const rimOrbitDamping = Math.exp(
    -RIM_BANK_ORBIT_DAMPING * (0.25 + rimPressure * 0.75) * (0.55 + lowSpinReturn * 0.45) * FIXED_TIMESTEP_SECONDS,
  );
  const nextRadialSpeed = outwardSpeed > 0
    ? -outwardSpeed * (0.16 + rimPressure * 0.18)
    : outwardSpeed;

  body.setLinvel(
    {
      x: tangentialVelocityX * rimOrbitDamping + nextRadialSpeed * normalX,
      y: linearVelocity.y,
      z: tangentialVelocityZ * rimOrbitDamping + nextRadialSpeed * normalZ,
    },
    true,
  );
}

export function stabilizeTopGroundContact(body: RapierRigidBody, proxyGeometry: ProxyGeometry, deltaSeconds = FIXED_TIMESTEP_SECONDS): void {
  const translation = body.translation();
  const linearVelocity = body.linvel();
  const stadium = getActiveStadiumPreset();
  const groundBodyY = getBodyYOffsetForSurface(translation.x, translation.z);
  const softHoverY = Math.max(proxyGeometry.tipRadiusWorld * 0.45, 0.035);
  const hardHoverY = Math.max(proxyGeometry.tipRadiusWorld * 1.15, 0.11);
  let nextY = translation.y;
  let nextVelocityX = linearVelocity.x;
  let nextVelocityY = linearVelocity.y;
  let nextVelocityZ = linearVelocity.z;
  const surfaceContact = calculateSurfaceContact(body, proxyGeometry);
  let shouldUpdateTranslation = false;
  let shouldUpdateVelocity = false;

  if (surfaceContact.maxPenetration > 0) {
    nextY += surfaceContact.maxPenetration + CONTACT_CLEARANCE;
    nextVelocityY = Math.max(0, nextVelocityY);
    shouldUpdateTranslation = true;
    shouldUpdateVelocity = true;
  }

  if (nextY < groundBodyY) {
    nextY = groundBodyY;
    nextVelocityY = Math.max(0, nextVelocityY);
    shouldUpdateTranslation = true;
    shouldUpdateVelocity = true;
  }

  if (surfaceContact.maxPenetration <= 0 && nextY > groundBodyY + hardHoverY) {
    nextVelocityY = Math.min(0, nextVelocityY);
    shouldUpdateVelocity = true;
  } else if (surfaceContact.maxPenetration <= 0 && nextY > groundBodyY + softHoverY && nextVelocityY > 0) {
    nextVelocityY *= 0.18;
    shouldUpdateVelocity = true;
  }

  if (nextVelocityY > MAX_UPWARD_SPEED) {
    nextVelocityY = MAX_UPWARD_SPEED;
    shouldUpdateVelocity = true;
  }

  const contactWindow = Math.max(hardHoverY, 0.12);
  const contactStrength = Math.max(
    surfaceContact.maxPenetration > 0 ? 0.9 : 0,
    Math.min((groundBodyY + contactWindow - nextY) / contactWindow, 1),
  );
  const nearSurfaceGripStrength = (
    contactStrength <= 0
    && nextY <= groundBodyY + contactWindow * 1.85
    && Math.hypot(nextVelocityX, nextVelocityZ) < 0.42
  )
    ? 0.42
    : 0;
  const bowlGripStrength = Math.max(contactStrength, nearSurfaceGripStrength);

  if (bowlGripStrength > 0) {
    const gradient = getStadiumBowlGradientAt(surfaceContact.supportX, surfaceContact.supportZ, stadium);
    const accelerationScale = 9.81 * BOWL_SLOPE_ACCELERATION_SCALE * bowlGripStrength;
    const railDriveStrength = getXtremeRailDriveStrength(body, proxyGeometry, stadium, surfaceContact.supportX, surfaceContact.supportZ);
    const floorDrag = Math.exp(
      -(
        0.34
        + stadium.floorFriction * 18
        + proxyGeometry.tipFriction * 0.42
        + surfaceContact.bladeContactStrength * 1.4
      ) * bowlGripStrength * deltaSeconds,
    );

    nextVelocityX = (nextVelocityX - gradient.x * accelerationScale * deltaSeconds) * floorDrag;
    nextVelocityZ = (nextVelocityZ - gradient.z * accelerationScale * deltaSeconds) * floorDrag;
    const railDrivenVelocity = applyXtremeRailDrive(
      body,
      proxyGeometry,
      surfaceContact.supportX,
      surfaceContact.supportZ,
      railDriveStrength,
      nextVelocityX,
      nextVelocityZ,
      deltaSeconds,
    );

    nextVelocityX = railDrivenVelocity.x;
    nextVelocityZ = railDrivenVelocity.z;

    const channeledVelocity = applyBowlCentering(
      body,
      proxyGeometry,
      stadium,
      surfaceContact.supportX,
      surfaceContact.supportZ,
      railDriveStrength,
      bowlGripStrength,
      nextVelocityX,
      nextVelocityZ,
      deltaSeconds,
    );

    nextVelocityX = channeledVelocity.x;
    nextVelocityZ = channeledVelocity.z;

    if (channeledVelocity.settleDistance > 0) {
      const currentRadius = Math.hypot(translation.x, translation.z);

      if (currentRadius > CENTER_CHANNEL_MIN_RADIUS) {
        const positionScale = Math.max((currentRadius - channeledVelocity.settleDistance) / currentRadius, 0);
        translation.x *= positionScale;
        translation.z *= positionScale;
        shouldUpdateTranslation = true;
      }
    }

    if (
      limitLowEnergyOutwardDrift(
        body,
        translation,
        railDriveStrength,
        bowlGripStrength,
        nextVelocityX,
        nextVelocityZ,
        deltaSeconds,
      )
    ) {
      shouldUpdateTranslation = true;
    }

    const limitedHorizontalVelocity = limitHorizontalSpeedBySpinEnergy(
      body,
      proxyGeometry,
      {
        bladeContactStrength: surfaceContact.bladeContactStrength,
        railDriveStrength,
      },
      nextVelocityX,
      nextVelocityZ,
      deltaSeconds,
    );

    nextVelocityX = limitedHorizontalVelocity.x;
    nextVelocityZ = limitedHorizontalVelocity.z;

    const horizontalSpeed = Math.hypot(nextVelocityX, nextVelocityZ);

    if (horizontalSpeed > MAX_HORIZONTAL_SPEED) {
      const speedScale = MAX_HORIZONTAL_SPEED / horizontalSpeed;
      nextVelocityX *= speedScale;
      nextVelocityZ *= speedScale;
    }

    shouldUpdateVelocity = true;
  }

  if (surfaceContact.bladeContactStrength > 0) {
    const angularVelocity = body.angvel();
    const tumbleDamping = Math.exp(-surfaceContact.bladeContactStrength * 4.8 * deltaSeconds);
    const scrapeSpinDamping = Math.exp(-surfaceContact.bladeContactStrength * 0.035 * deltaSeconds);

    body.setAngvel(
      {
        x: angularVelocity.x * tumbleDamping,
        y: angularVelocity.y * scrapeSpinDamping,
        z: angularVelocity.z * tumbleDamping,
      },
      true,
    );
  }

  const finalLimitedHorizontalVelocity = limitHorizontalSpeedBySpinEnergy(
    body,
    proxyGeometry,
    {
      bladeContactStrength: surfaceContact.bladeContactStrength,
      railDriveStrength: getXtremeRailDriveStrength(body, proxyGeometry, stadium, surfaceContact.supportX, surfaceContact.supportZ),
    },
    nextVelocityX,
    nextVelocityZ,
    deltaSeconds,
    contactStrength > 0 ? 2.2 : 3.4,
  );

  if (
    Math.abs(finalLimitedHorizontalVelocity.x - nextVelocityX) > 0.000001
    || Math.abs(finalLimitedHorizontalVelocity.z - nextVelocityZ) > 0.000001
  ) {
    nextVelocityX = finalLimitedHorizontalVelocity.x;
    nextVelocityZ = finalLimitedHorizontalVelocity.z;
    shouldUpdateVelocity = true;
  }

  if (shouldUpdateTranslation) {
    body.setTranslation(
      {
        x: translation.x,
        y: nextY,
        z: translation.z,
      },
      true,
    );
  }

  if (shouldUpdateVelocity) {
    body.setLinvel(
      {
        x: nextVelocityX,
        y: nextVelocityY,
        z: nextVelocityZ,
      },
      true,
    );
  }
}

function calculateSurfaceContact(body: RapierRigidBody, proxyGeometry: ProxyGeometry): {
  maxPenetration: number;
  supportX: number;
  supportZ: number;
  bladeContactStrength: number;
} {
  const translation = body.translation();
  const rotation = body.rotation();
  const stadium = getActiveStadiumPreset();
  const bodyHeight = getBodyHeight(proxyGeometry);
  const bodyFloorClearance = getBodyFloorClearance(proxyGeometry);
  const lowerBladeY = ARENA_SURFACE_Y + bodyFloorClearance + bodyHeight * 0.08;
  const ringUndersideY = ARENA_SURFACE_Y + bodyFloorClearance + bodyHeight * 0.48;
  const samples = [
    { radius: 0, y: ARENA_SURFACE_Y, count: 1, blade: false },
    { radius: proxyGeometry.radiusWorld * 0.46, y: lowerBladeY, count: 8, blade: true },
    { radius: proxyGeometry.radiusWorld * 0.88, y: lowerBladeY, count: 10, blade: true },
    { radius: proxyGeometry.radiusWorld * 0.96, y: ringUndersideY, count: 12, blade: true },
  ];
  let maxPenetration = 0;
  let supportX = translation.x;
  let supportZ = translation.z;
  let bladeContactStrength = 0;

  for (const sample of samples) {
    for (let index = 0; index < sample.count; index += 1) {
      const angle = sample.count === 1 ? 0 : (index / sample.count) * Math.PI * 2;
      const localX = Math.cos(angle) * sample.radius;
      const localZ = Math.sin(angle) * sample.radius;
      const rotated = rotateLocalPoint(localX, sample.y, localZ, rotation);
      const worldX = translation.x + rotated.x;
      const worldY = translation.y + rotated.y;
      const worldZ = translation.z + rotated.z;
      const surfaceY = getStadiumSurfaceYAt(worldX, worldZ, stadium);
      const penetration = surfaceY - worldY;

      if (penetration > maxPenetration) {
        maxPenetration = penetration;
        supportX = worldX;
        supportZ = worldZ;
      }

      if (sample.blade && penetration > 0) {
        bladeContactStrength = Math.max(bladeContactStrength, Math.min(penetration / 0.12, 1));
      }
    }
  }

  return {
    maxPenetration,
    supportX,
    supportZ,
    bladeContactStrength,
  };
}

export function calculateTopTelemetry(body: RapierRigidBody | null, stopReason: SimulationStopReason): TopTelemetry {
  if (!body) {
    return {
      spinRpm: 0,
      tiltDegrees: 0,
      speed: 0,
      stopReason,
      radialDistance: 0,
      position: {
        x: 0,
        z: 0,
      },
    };
  }

  const angularVelocity = body.angvel();
  const linearVelocity = body.linvel();
  const translation = body.translation();
  const rotation = body.rotation();
  const bodyUp = WORLD_UP.clone().applyQuaternion(new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w)).normalize();
  const angularVelocityVector = new Vector3(angularVelocity.x, angularVelocity.y, angularVelocity.z);
  const spinRadiansPerSecond = Math.abs(angularVelocityVector.dot(bodyUp));

  return {
    spinRpm: Math.max(0, radiansPerSecondToRpm(spinRadiansPerSecond)),
    tiltDegrees: radiansToDegrees(bodyUp.angleTo(WORLD_UP)),
    speed: Math.hypot(linearVelocity.x, linearVelocity.z),
    stopReason,
    radialDistance: Math.hypot(translation.x, translation.z),
    position: {
      x: translation.x,
      z: translation.z,
    },
  };
}

function limitHorizontalSpeedBySpinEnergy(
  body: RapierRigidBody,
  proxyGeometry: ProxyGeometry,
  surfaceContact: {
    bladeContactStrength: number;
    railDriveStrength?: number;
  },
  velocityX: number,
  velocityZ: number,
  deltaSeconds: number,
  dampingMultiplier = 1,
): { x: number; z: number } {
  const horizontalSpeed = Math.hypot(velocityX, velocityZ);

  if (horizontalSpeed <= 0.000001) {
    return { x: velocityX, z: velocityZ };
  }

  const rotation = body.rotation();
  const bodyUp = WORLD_UP.clone().applyQuaternion(new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w)).normalize();
  const angularVelocity = body.angvel();
  const spinRadiansPerSecond = new Vector3(angularVelocity.x, angularVelocity.y, angularVelocity.z).dot(bodyUp);
  const spinRpm = Math.abs(radiansPerSecondToRpm(spinRadiansPerSecond));
  const spinRatio = clamp(spinRpm / HIGH_RPM_STABILITY_RPM, 0, 1);
  const tiltDrive = clamp(radiansToDegrees(bodyUp.angleTo(WORLD_UP)) / 22, 0, 1);
  const contactDrive = clamp(surfaceContact.bladeContactStrength, 0, 1);
  const railDrive = clamp(surfaceContact.railDriveStrength ?? 0, 0, 1);
  const tipDrive = clamp(proxyGeometry.tipRadiusWorld / Math.max(proxyGeometry.radiusWorld * 0.14, 0.001), 0.35, 1.25);
  const sustainedSpeedLimit = clamp(
    0.04 + Math.sqrt(spinRatio) * (0.07 + tiltDrive * 0.08 + contactDrive * 0.015 + railDrive * 1.05) * tipDrive,
    0.05,
    MAX_HORIZONTAL_SPEED,
  );

  if (horizontalSpeed <= sustainedSpeedLimit) {
    return { x: velocityX, z: velocityZ };
  }

  const excessDamping = Math.exp(-(2.3 + proxyGeometry.tipFriction * 0.7 + contactDrive * 2.6) * dampingMultiplier * deltaSeconds);
  const transientAllowance = 0.025 + contactDrive * 0.035 + railDrive * 0.42;
  const dampedSpeed = Math.min(
    sustainedSpeedLimit + transientAllowance,
    sustainedSpeedLimit + (horizontalSpeed - sustainedSpeedLimit) * excessDamping,
  );
  const speedScale = dampedSpeed / horizontalSpeed;

  return {
    x: velocityX * speedScale,
    z: velocityZ * speedScale,
  };
}

function getXtremeRailDriveStrength(
  body: RapierRigidBody,
  proxyGeometry: ProxyGeometry,
  stadium: StadiumPreset,
  contactX: number,
  contactZ: number,
): number {
  if (stadium.id !== 'xtreme-bx10') {
    return 0;
  }

  const radialDistance = Math.hypot(contactX, contactZ);

  if (radialDistance <= 0.000001) {
    return 0;
  }

  const railWidth = Math.max(proxyGeometry.radiusWorld * 0.5, 0.22);
  const railProximity = clamp(1 - Math.abs(radialDistance - stadium.tornadoRidgeRadiusWorld) / railWidth, 0, 1);

  if (railProximity <= 0) {
    return 0;
  }

  const rotation = body.rotation();
  const bodyUp = WORLD_UP.clone().applyQuaternion(new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w)).normalize();
  const angularVelocity = body.angvel();
  const spinRadiansPerSecond = new Vector3(angularVelocity.x, angularVelocity.y, angularVelocity.z).dot(bodyUp);
  const spinRpm = Math.abs(radiansPerSecondToRpm(spinRadiansPerSecond));
  const spinDrive = clamp((spinRpm - 2200) / 6200, 0, 1);
  const tipEngagement = clamp((proxyGeometry.tipFriction - 0.18) / 0.42, 0, 1);

  return railProximity * spinDrive * tipEngagement;
}

function applyXtremeRailDrive(
  body: RapierRigidBody,
  proxyGeometry: ProxyGeometry,
  contactX: number,
  contactZ: number,
  driveStrength: number,
  velocityX: number,
  velocityZ: number,
  deltaSeconds: number,
): { x: number; z: number } {
  if (driveStrength <= 0) {
    return { x: velocityX, z: velocityZ };
  }

  const radialDistance = Math.hypot(contactX, contactZ);

  if (radialDistance <= 0.000001) {
    return { x: velocityX, z: velocityZ };
  }

  const rotation = body.rotation();
  const bodyUp = WORLD_UP.clone().applyQuaternion(new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w)).normalize();
  const angularVelocity = body.angvel();
  const angularVelocityVector = new Vector3(angularVelocity.x, angularVelocity.y, angularVelocity.z);
  const spinRadiansPerSecond = angularVelocityVector.dot(bodyUp);
  const spinDirection = Math.sign(spinRadiansPerSecond) || 1;
  const tangentX = (-contactZ / radialDistance) * spinDirection;
  const tangentZ = (contactX / radialDistance) * spinDirection;
  const tangentSpeed = velocityX * tangentX + velocityZ * tangentZ;
  const spinRpm = Math.abs(radiansPerSecondToRpm(spinRadiansPerSecond));
  const spinRatio = clamp(spinRpm / HIGH_RPM_STABILITY_RPM, 0, 1);
  const railSpeedLimit = 0.42 + spinRatio * (0.9 + proxyGeometry.attackBias * 0.32);

  if (tangentSpeed >= railSpeedLimit) {
    return { x: velocityX, z: velocityZ };
  }

  const acceleration = XTREME_RAIL_ACCELERATION * driveStrength * spinRatio;
  const speedBoost = Math.min((railSpeedLimit - tangentSpeed) * 0.55, acceleration * deltaSeconds);
  const spinDrain = Math.min(Math.abs(spinRadiansPerSecond) * XTREME_RAIL_SPIN_DRAIN * driveStrength * deltaSeconds, Math.abs(spinRadiansPerSecond) * 0.08);
  const drainedSpinVector = bodyUp.multiplyScalar(spinDrain * spinDirection);

  body.setAngvel(
    {
      x: angularVelocity.x - drainedSpinVector.x,
      y: angularVelocity.y - drainedSpinVector.y,
      z: angularVelocity.z - drainedSpinVector.z,
    },
    true,
  );

  return {
    x: velocityX + tangentX * speedBoost,
    z: velocityZ + tangentZ * speedBoost,
  };
}

function applyBowlCentering(
  body: RapierRigidBody,
  proxyGeometry: ProxyGeometry,
  stadium: StadiumPreset,
  contactX: number,
  contactZ: number,
  railDriveStrength: number,
  contactStrength: number,
  velocityX: number,
  velocityZ: number,
  deltaSeconds: number,
): { x: number; z: number; settleDistance: number } {
  const radialDistance = Math.hypot(contactX, contactZ);

  if (radialDistance <= CENTER_CHANNEL_MIN_RADIUS || contactStrength <= 0) {
    return { x: velocityX, z: velocityZ, settleDistance: 0 };
  }

  const rotation = body.rotation();
  const bodyUp = WORLD_UP.clone().applyQuaternion(new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w)).normalize();
  const angularVelocity = body.angvel();
  const spinRadiansPerSecond = new Vector3(angularVelocity.x, angularVelocity.y, angularVelocity.z).dot(bodyUp);
  const spinRpm = Math.abs(radiansPerSecondToRpm(spinRadiansPerSecond));
  const lowSpinSettling = clamp((CENTER_CHANNEL_LOW_SPIN_RPM - spinRpm) / CENTER_CHANNEL_LOW_SPIN_RPM, 0, 1);
  const railRelief = 1 - clamp(railDriveStrength, 0, 1) * 0.82;
  const radialProgress = clamp(radialDistance / stadium.playRadiusWorld, 0, 1.1);
  const normalX = contactX / radialDistance;
  const normalZ = contactZ / radialDistance;
  const radialSpeed = velocityX * normalX + velocityZ * normalZ;
  const tangentialVelocityX = velocityX - radialSpeed * normalX;
  const tangentialVelocityZ = velocityZ - radialSpeed * normalZ;
  const outwardDamping = 1 - Math.exp(
    -CENTER_CHANNEL_OUTWARD_DAMPING
      * (0.18 + lowSpinSettling * 0.82)
      * radialProgress
      * contactStrength
      * railRelief
      * deltaSeconds,
  );
  const orbitDamping = Math.exp(
    -CENTER_CHANNEL_ORBIT_DAMPING
      * lowSpinSettling
      * radialProgress
      * contactStrength
      * railRelief
      * deltaSeconds,
  );
  const inwardAcceleration = CENTER_CHANNEL_ACCELERATION
    * radialProgress
    * (0.24 + lowSpinSettling * 0.76)
    * contactStrength
    * railRelief;
  const settleDistance = CENTER_CHANNEL_POSITION_SETTLE
    * lowSpinSettling
    * radialProgress
    * contactStrength
    * railRelief
    * deltaSeconds;
  const nextRadialSpeed = radialSpeed > 0
    ? radialSpeed * (1 - outwardDamping) - inwardAcceleration * deltaSeconds
    : radialSpeed - inwardAcceleration * deltaSeconds * 0.42;

  return {
    x: tangentialVelocityX * orbitDamping + normalX * nextRadialSpeed,
    z: tangentialVelocityZ * orbitDamping + normalZ * nextRadialSpeed,
    settleDistance,
  };
}

function getBodySpinRpm(body: RapierRigidBody): number {
  const rotation = body.rotation();
  const bodyUp = WORLD_UP.clone().applyQuaternion(new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w)).normalize();
  const angularVelocity = body.angvel();
  const spinRadiansPerSecond = new Vector3(angularVelocity.x, angularVelocity.y, angularVelocity.z).dot(bodyUp);

  return Math.abs(radiansPerSecondToRpm(spinRadiansPerSecond));
}

function limitLowEnergyOutwardDrift(
  body: RapierRigidBody,
  translation: { x: number; y: number; z: number },
  railDriveStrength: number,
  contactStrength: number,
  velocityX: number,
  velocityZ: number,
  deltaSeconds: number,
): boolean {
  const currentRadius = Math.hypot(translation.x, translation.z);

  if (currentRadius <= CENTER_CHANNEL_MIN_RADIUS || contactStrength <= 0) {
    lowEnergyRadiusByBody.set(body, currentRadius);
    return false;
  }

  const speed = Math.hypot(velocityX, velocityZ);
  const spinRpm = getBodySpinRpm(body);
  const lowSpinSettling = clamp((CENTER_CHANNEL_LOW_SPIN_RPM - spinRpm) / CENTER_CHANNEL_LOW_SPIN_RPM, 0, 1);
  const previousRadius = lowEnergyRadiusByBody.get(body);

  if (
    previousRadius === undefined
    || lowSpinSettling < 0.34
    || railDriveStrength > 0.12
    || speed > 0.46
  ) {
    lowEnergyRadiusByBody.set(body, currentRadius);
    return false;
  }

  const allowedOutwardDrift = (0.035 + speed * 0.045) * (1 - lowSpinSettling * 0.72) * deltaSeconds;
  const maxAllowedRadius = Math.max(previousRadius + allowedOutwardDrift, CENTER_CHANNEL_MIN_RADIUS);

  if (currentRadius <= maxAllowedRadius) {
    lowEnergyRadiusByBody.set(body, currentRadius);
    return false;
  }

  const scale = maxAllowedRadius / currentRadius;
  translation.x *= scale;
  translation.z *= scale;
  lowEnergyRadiusByBody.set(body, maxAllowedRadius);

  return true;
}

export function getStopCandidateReason(
  spinRpm: number,
  tiltDegrees: number,
  radialDistance: number,
  position?: { x: number; z: number },
): SimulationStopReason {
  if (isRingOutPosition(radialDistance, position)) {
    return 'arena_exit';
  }

  if ((tiltDegrees > 88 && spinRpm < 1600) || (tiltDegrees > STOP_TILT_DEGREES && spinRpm < 700)) {
    return 'tilt_limit';
  }

  if (spinRpm < STOP_RPM_THRESHOLD) {
    return 'spin_below_threshold';
  }

  return null;
}

export function getRingOutCandidateReason(radialDistance: number, position?: { x: number; z: number }): SimulationStopReason {
  return isRingOutPosition(radialDistance, position) ? 'arena_exit' : null;
}

function isRingOutPosition(radialDistance: number, position?: { x: number; z: number }): boolean {
  if (!position) {
    return radialDistance > getActiveStadiumPreset().ringOutRadiusWorld;
  }

  const pocket = getPocketAtPosition(position.x, position.z);
  const stadium = getActiveStadiumPreset();
  const ringOutRadius = pocket ? getPocketEntryRadius(pocket, stadium) : stadium.ringOutRadiusWorld;

  return radialDistance > ringOutRadius;
}

export function getBodyTransform(body: RapierRigidBody, visualSpinRadians?: number) {
  const translation = body.translation();
  const rotation = body.rotation();
  const visualQuaternion = Number.isFinite(visualSpinRadians)
    ? getVisualSpinQuaternion(rotation, visualSpinRadians ?? 0)
    : rotation;

  return {
    position: {
      x: translation.x,
      y: translation.y,
      z: translation.z,
    },
    quaternion: {
      x: visualQuaternion.x,
      y: visualQuaternion.y,
      z: visualQuaternion.z,
      w: visualQuaternion.w,
    },
  };
}

export function updateVisualSpinRadians(body: RapierRigidBody, currentRadians: number, deltaSeconds: number, spinDirection: 1 | -1 = 1): number {
  const rotation = body.rotation();
  const angularVelocity = body.angvel();
  const bodyUp = WORLD_UP.clone().applyQuaternion(new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w)).normalize();
  const angularVelocityVector = new Vector3(angularVelocity.x, angularVelocity.y, angularVelocity.z);
  const actualSpinRadiansPerSecond = Math.abs(angularVelocityVector.dot(bodyUp));
  const actualSpinRpm = radiansPerSecondToRpm(actualSpinRadiansPerSecond);
  const displayedSpinRpm = Math.min(actualSpinRpm, MAX_VISUAL_SPIN_RPM);
  const displayedRadiansPerSecond = rpmToRadiansPerSecond(displayedSpinRpm) * spinDirection;

  return wrapRadians(currentRadians + displayedRadiansPerSecond * deltaSeconds);
}

function createTopColliders(
  rapier: RapierRuntime,
  world: RapierWorld,
  topBody: RapierRigidBody,
  proxyGeometry: ProxyGeometry,
  options: TopRigidBodyOptions,
): void {
  const bodyHeight = getBodyHeight(proxyGeometry);
  const bodyFloorClearance = getBodyFloorClearance(proxyGeometry);
  const bodyCenterY = ARENA_SURFACE_Y + bodyFloorClearance + bodyHeight / 2;
  const activeEvents = rapier.ActiveEvents.NONE;
  const coreRadius = options.includeBattleRing
    ? proxyGeometry.radiusWorld * (0.72 + (1 - proxyGeometry.attackBias) * 0.1)
    : proxyGeometry.radiusWorld;
  const bodyDescCollider = rapier.ColliderDesc.cylinder(bodyHeight / 2, coreRadius)
    .setTranslation(0, bodyCenterY, 0)
    .setDensity(0)
    .setFriction(proxyGeometry.ringFriction * 0.06)
    .setRestitution(options.includeBattleRing ? 0.025 : 0)
    .setActiveEvents(activeEvents);

  const tipDesc = rapier.ColliderDesc.ball(proxyGeometry.tipRadiusWorld)
    .setTranslation(0, ARENA_SURFACE_Y + proxyGeometry.tipRadiusWorld, 0)
    .setDensity(0)
    .setFriction(proxyGeometry.tipFriction * 0.035)
    .setRestitution(0)
    .setContactSkin(0.002)
    .setActiveEvents(activeEvents);

  world.createCollider(bodyDescCollider, topBody);
  world.createCollider(tipDesc, topBody);

  if (options.includeBattleRing) {
    const ringDesc = rapier.ColliderDesc.cylinder(Math.max(bodyHeight * 0.12, 0.03), proxyGeometry.radiusWorld * 0.86)
      .setTranslation(0, bodyCenterY + bodyHeight * 0.22, 0)
      .setDensity(0)
      .setFriction(proxyGeometry.ringFriction * 0.08)
      .setRestitution(0.012 + proxyGeometry.recoilCoefficient * 0.025)
      .setActiveEvents(activeEvents);

    world.createCollider(ringDesc, topBody);
    createStrikePointColliders(rapier, world, topBody, proxyGeometry, bodyCenterY, bodyHeight, activeEvents);
  }
}

function createStrikePointColliders(
  rapier: RapierRuntime,
  world: RapierWorld,
  topBody: RapierRigidBody,
  proxyGeometry: ProxyGeometry,
  bodyCenterY: number,
  bodyHeight: number,
  activeEvents: number,
): void {
  const pointCount = Math.min(4, Math.max(1, proxyGeometry.contactPointCount));
  const contactRadius = proxyGeometry.radiusWorld * (0.78 + proxyGeometry.attackBias * 0.22);
  const pointRadius = clamp(proxyGeometry.radiusWorld * (0.085 + proxyGeometry.attackBias * 0.055), 0.045, 0.22);
  const verticalOffset = bodyHeight * (0.1 + proxyGeometry.attackBias * 0.18);

  for (let index = 0; index < pointCount; index += 1) {
    const angle = (index / pointCount) * Math.PI * 2;
    const emphasis = 0.86 + Math.sin(index * 1.618 + pointCount) * 0.1 + proxyGeometry.attackBias * 0.08;
    const strikeDesc = rapier.ColliderDesc.ball(pointRadius * emphasis)
      .setTranslation(Math.cos(angle) * contactRadius, bodyCenterY + verticalOffset, Math.sin(angle) * contactRadius)
      .setDensity(0)
      .setFriction(proxyGeometry.ringFriction * (0.07 + proxyGeometry.attackBias * 0.04))
      .setRestitution(0.018 + proxyGeometry.recoilCoefficient * 0.12)
      .setActiveEvents(activeEvents);

    world.createCollider(strikeDesc, topBody);
  }
}

function getBodyFloorClearance(proxyGeometry: ProxyGeometry): number {
  return clamp(proxyGeometry.radiusWorld * 0.3, proxyGeometry.tipRadiusWorld * 1.8, 0.72);
}

function getBodyHeight(proxyGeometry: ProxyGeometry): number {
  return Math.max(proxyGeometry.heightWorld - proxyGeometry.tipRadiusWorld * 0.7, 0.08);
}

function getVisualSpinQuaternion(
  rotation: { x: number; y: number; z: number; w: number },
  visualSpinRadians: number,
): { x: number; y: number; z: number; w: number } {
  const physicsQuaternion = new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
  const bodyUp = WORLD_UP.clone().applyQuaternion(physicsQuaternion).normalize();
  const tiltQuaternion = new Quaternion().setFromUnitVectors(WORLD_UP, bodyUp);
  const spinQuaternion = new Quaternion().setFromAxisAngle(WORLD_UP, visualSpinRadians);
  const visualQuaternion = tiltQuaternion.multiply(spinQuaternion);

  return {
    x: visualQuaternion.x,
    y: visualQuaternion.y,
    z: visualQuaternion.z,
    w: visualQuaternion.w,
  };
}

function rotateLocalPoint(
  x: number,
  y: number,
  z: number,
  quaternion: { x: number; y: number; z: number; w: number },
): { x: number; y: number; z: number } {
  const ix = quaternion.w * x + quaternion.y * z - quaternion.z * y;
  const iy = quaternion.w * y + quaternion.z * x - quaternion.x * z;
  const iz = quaternion.w * z + quaternion.x * y - quaternion.y * x;
  const iw = -quaternion.x * x - quaternion.y * y - quaternion.z * z;

  return {
    x: ix * quaternion.w + iw * -quaternion.x + iy * -quaternion.z - iz * -quaternion.y,
    y: iy * quaternion.w + iw * -quaternion.y + iz * -quaternion.x - ix * -quaternion.z,
    z: iz * quaternion.w + iw * -quaternion.z + ix * -quaternion.y - iy * -quaternion.x,
  };
}

function getTipContact(tipType: TipType, radiusWorld: number, profileFriction: number): { radiusWorld: number; friction: number } {
  const friction = clamp(profileFriction, 0, 4);

  if (tipType === 'sharp') {
    return {
      radiusWorld: clamp(radiusWorld * 0.025, 0.018, 0.055),
      friction: friction * 0.78,
    };
  }

  if (tipType === 'ball') {
    return {
      radiusWorld: clamp(radiusWorld * 0.055, 0.045, 0.12),
      friction: friction * 0.95,
    };
  }

  if (tipType === 'rubber') {
    return {
      radiusWorld: clamp(radiusWorld * 0.07, 0.06, 0.16),
      friction: Math.max(friction * 1.65, 0.75),
    };
  }

  if (tipType === 'flat') {
    return {
      radiusWorld: clamp(radiusWorld * 0.08, 0.055, 0.18),
      friction,
    };
  }

  return {
    radiusWorld: clamp(radiusWorld * 0.06, 0.04, 0.15),
    friction,
  };
}

function estimateCylinderInertia(massKg: number, radiusWorld: number, heightWorld: number): { spinAxis: number; crossAxis: number } {
  return {
    spinAxis: 0.5 * massKg * radiusWorld ** 2,
    crossAxis: (massKg * (3 * radiusWorld ** 2 + heightWorld ** 2)) / 12,
  };
}

function getEffectiveInitialTiltDegrees(launchSettings: LaunchSettings): number {
  const sign = Math.sign(launchSettings.angleDegrees) || 1;
  const absoluteAngle = Math.abs(launchSettings.angleDegrees);
  const spinStability = clamp(launchSettings.rpm / HIGH_RPM_STABILITY_RPM, 0, 1);
  const retainedTiltRatio = 0.64 - spinStability * 0.34;
  const highSpinTiltCap = 2.2 + (1 - spinStability) * 4.8;

  return sign * Math.min(absoluteAngle * retainedTiltRatio, highSpinTiltCap);
}

function getLaunchAngularVelocity(launchSettings: LaunchSettings, launchRotation: Quaternion, spinDirection: 1 | -1): { x: number; y: number; z: number } {
  const spinRadiansPerSecond = rpmToRadiansPerSecond(launchSettings.rpm) * spinDirection;
  const spinAxis = WORLD_UP.clone().applyQuaternion(launchRotation).normalize().multiplyScalar(spinRadiansPerSecond);

  return {
    x: spinAxis.x,
    y: spinAxis.y,
    z: spinAxis.z,
  };
}

function getClampedLaunchPosition(position: LaunchSettings['position'], radiusWorld: number): { x: number; z: number } {
  const maxDistance = Math.max(0.2, getActiveStadiumPreset().playRadiusWorld - radiusWorld - 0.35);
  const requested = new Vector3(position.x, 0, position.z);

  if (requested.length() <= maxDistance) {
    return {
      x: requested.x,
      z: requested.z,
    };
  }

  requested.setLength(maxDistance);

  return {
    x: requested.x,
    z: requested.z,
  };
}

function getBodyYOffsetForSurface(x: number, z: number): number {
  return getStadiumSurfaceYAt(x, z, getActiveStadiumPreset()) - ARENA_SURFACE_Y;
}

function wrapRadians(value: number): number {
  return ((((value + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
}

function centeredRandom(): number {
  return Math.random() + Math.random() - 1;
}

function toRapierQuaternion(quaternion: Quaternion): { x: number; y: number; z: number; w: number } {
  return {
    x: quaternion.x,
    y: quaternion.y,
    z: quaternion.z,
    w: quaternion.w,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
