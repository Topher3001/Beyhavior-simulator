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
} from './stadiumConfig';
import {
  getStadiumSurfaceGradientAt,
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
export const FIXED_TIMESTEP_SECONDS = 1 / 90;
export const MAX_ACCUMULATED_SECONDS = 1 / 10;
export const MAX_STEPS_PER_FRAME = 4;
export const STOP_RPM_THRESHOLD = 120;
export const STOP_TILT_DEGREES = 75;
export const STOP_DURATION_SECONDS = 1.25;
export const RING_OUT_DURATION_SECONDS = 0.5;
export const DRAW_WINDOW_SECONDS = 0.75;

const MAX_HORIZONTAL_SPEED = 3;
const MAX_UPWARD_SPEED = 0.28;
const BOWL_SLOPE_ACCELERATION_SCALE = 0.42;
const WORLD_UP = new Vector3(0, 1, 0);
const IDENTITY_ROTATION = { x: 0, y: 0, z: 0, w: 1 };

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
  const launchTiltRadians = degreesToRadians(launchSettings.angleDegrees);
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
    .setLinearDamping(Math.min(3, 0.08 + profile.airDragCoefficient * 0.75))
    .setAngularDamping(Math.min(5, 0.05 + profile.spinDampingCoefficient * 0.45))
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

export function applyProfileDamping(body: RapierRigidBody, profile: PhysicsProfile, proxyGeometry: ProxyGeometry, deltaSeconds: number): void {
  const linearVelocity = body.linvel();
  const horizontalDrag = Math.exp(-(0.04 + profile.airDragCoefficient * 2.8 + proxyGeometry.tipFriction * 0.025) * deltaSeconds);
  const horizontalVelocity = new Vector3(linearVelocity.x * horizontalDrag, 0, linearVelocity.z * horizontalDrag);

  if (horizontalVelocity.length() > MAX_HORIZONTAL_SPEED) {
    horizontalVelocity.setLength(MAX_HORIZONTAL_SPEED);
  }

  body.setLinvel({ x: horizontalVelocity.x, y: linearVelocity.y, z: horizontalVelocity.z }, true);

  const angularVelocity = body.angvel();
  const spinLoss = Math.exp(-(0.18 + profile.spinDampingCoefficient * 10 + proxyGeometry.tipFriction * 0.04) * deltaSeconds);
  const tumbleLoss = Math.exp(-(0.5 + profile.airDragCoefficient * 1.5 + profile.spinDampingCoefficient * 4) * deltaSeconds);
  body.setAngvel(
    {
      x: angularVelocity.x * tumbleLoss,
      y: angularVelocity.y * spinLoss,
      z: angularVelocity.z * tumbleLoss,
    },
    true,
  );
}

export function applyWobbleTorque(body: RapierRigidBody, proxyGeometry: ProxyGeometry): void {
  const rotation = body.rotation();
  const bodyUp = WORLD_UP.clone().applyQuaternion(new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w)).normalize();
  const tiltAxis = new Vector3().crossVectors(bodyUp, WORLD_UP);

  if (tiltAxis.lengthSq() > 0.000001) {
    tiltAxis.normalize().multiplyScalar(proxyGeometry.massKg * 9.81 * Math.max(proxyGeometry.centerOfMassWorld.y, 0.04) * 0.18);
    body.addTorque({ x: tiltAxis.x, y: 0, z: tiltAxis.z }, true);
  }

  const offsetTorqueScale = proxyGeometry.massKg * 9.81 * 0.08;
  body.addTorque(
    {
      x: proxyGeometry.centerOfMassWorld.z * offsetTorqueScale,
      y: 0,
      z: -proxyGeometry.centerOfMassWorld.x * offsetTorqueScale,
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

  if (inPocket && radialDistance > maxCenterDistance) {
    return;
  }

  if (radialDistance <= maxCenterDistance || radialDistance === 0) {
    return;
  }

  const normalX = translation.x / radialDistance;
  const normalZ = translation.z / radialDistance;
  body.setTranslation(
    {
      x: normalX * maxCenterDistance,
      y: translation.y,
      z: normalZ * maxCenterDistance,
    },
    true,
  );

  const linearVelocity = body.linvel();
  const outwardSpeed = linearVelocity.x * normalX + linearVelocity.z * normalZ;

  if (outwardSpeed <= 0) {
    return;
  }

  body.setLinvel(
    {
      x: linearVelocity.x - outwardSpeed * normalX * 1.35,
      y: linearVelocity.y,
      z: linearVelocity.z - outwardSpeed * normalZ * 1.35,
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
  let shouldUpdateTranslation = false;
  let shouldUpdateVelocity = false;

  if (nextY < groundBodyY - 0.02) {
    nextY = groundBodyY;
    nextVelocityY = Math.max(0, nextVelocityY);
    shouldUpdateTranslation = true;
    shouldUpdateVelocity = true;
  }

  if (nextY > groundBodyY + hardHoverY) {
    nextY = groundBodyY + hardHoverY;
    nextVelocityY = Math.min(0, nextVelocityY);
    shouldUpdateTranslation = true;
    shouldUpdateVelocity = true;
  } else if (nextY > groundBodyY + softHoverY && nextVelocityY > 0) {
    nextVelocityY *= 0.18;
    shouldUpdateVelocity = true;
  }

  if (nextVelocityY > MAX_UPWARD_SPEED) {
    nextVelocityY = MAX_UPWARD_SPEED;
    shouldUpdateVelocity = true;
  }

  const contactWindow = Math.max(hardHoverY, 0.12);
  const contactStrength = Math.max(0, Math.min((groundBodyY + contactWindow - nextY) / contactWindow, 1));

  if (contactStrength > 0) {
    const gradient = getStadiumSurfaceGradientAt(translation.x, translation.z, stadium);
    const accelerationScale = 9.81 * BOWL_SLOPE_ACCELERATION_SCALE * contactStrength;

    nextVelocityX -= gradient.x * accelerationScale * deltaSeconds;
    nextVelocityZ -= gradient.z * accelerationScale * deltaSeconds;

    const horizontalSpeed = Math.hypot(nextVelocityX, nextVelocityZ);

    if (horizontalSpeed > MAX_HORIZONTAL_SPEED) {
      const speedScale = MAX_HORIZONTAL_SPEED / horizontalSpeed;
      nextVelocityX *= speedScale;
      nextVelocityZ *= speedScale;
    }

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
    speed: Math.hypot(linearVelocity.x, linearVelocity.y, linearVelocity.z),
    stopReason,
    radialDistance: Math.hypot(translation.x, translation.z),
    position: {
      x: translation.x,
      z: translation.z,
    },
  };
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

  if (tiltDegrees > STOP_TILT_DEGREES) {
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

export function getBodyTransform(body: RapierRigidBody) {
  const translation = body.translation();
  const rotation = body.rotation();

  return {
    position: {
      x: translation.x,
      y: translation.y,
      z: translation.z,
    },
    quaternion: {
      x: rotation.x,
      y: rotation.y,
      z: rotation.z,
      w: rotation.w,
    },
  };
}

function createTopColliders(
  rapier: RapierRuntime,
  world: RapierWorld,
  topBody: RapierRigidBody,
  proxyGeometry: ProxyGeometry,
  options: TopRigidBodyOptions,
): void {
  const bodyHeight = Math.max(proxyGeometry.heightWorld - proxyGeometry.tipRadiusWorld * 0.7, 0.08);
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
