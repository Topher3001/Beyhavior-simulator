import type {
  Dimensions,
  LoadedDesign,
  PhysicsProfile,
  StoredDesign,
  TipType,
} from './types';

export type PhysicsProfilePatch = Partial<Omit<PhysicsProfile, 'updatedAt'>> & {
  centerOfMassOffsetMm?: Partial<PhysicsProfile['centerOfMassOffsetMm']>;
  defaultLaunchPosition?: Partial<PhysicsProfile['defaultLaunchPosition']>;
};

type ProfileSource = Pick<LoadedDesign | StoredDesign, 'normalizedDimensions' | 'rawDimensions' | 'scaleFactor'>;

const FALLBACK_ORIENTED_DIMENSIONS: Dimensions = {
  x: 40,
  y: 18,
  z: 40,
};

const TIP_TYPES: TipType[] = ['flat', 'sharp', 'ball', 'rubber', 'custom'];

export function createDefaultPhysicsProfile(source: ProfileSource, updatedAt = new Date().toISOString()): PhysicsProfile {
  const orientedDimensions = getOrientedSourceDimensions(source);
  const radiusMm = Math.max(orientedDimensions.x, orientedDimensions.z) / 2;
  const heightMm = orientedDimensions.y;

  return {
    weightGrams: 45,
    radiusMm: roundProfileValue(radiusMm),
    heightMm: roundProfileValue(heightMm),
    centerOfMassOffsetMm: {
      x: 0,
      y: roundProfileValue(heightMm / 2),
      z: 0,
    },
    tipType: 'flat',
    tipFrictionCoefficient: 0.42,
    ringFrictionCoefficient: 0.28,
    airDragCoefficient: 0.012,
    spinDampingCoefficient: 0.018,
    defaultLaunchRpm: 7200,
    defaultLaunchAngleDegrees: 5,
    defaultLaunchPosition: {
      x: 0,
      z: 0,
    },
    updatedAt,
  };
}

export function mergePhysicsProfile(
  source: ProfileSource,
  currentProfile: PhysicsProfile | undefined,
  patch: PhysicsProfilePatch,
  updatedAt = new Date().toISOString(),
): PhysicsProfile {
  const defaults = createDefaultPhysicsProfile(source, updatedAt);
  const current = currentProfile ?? defaults;

  return sanitizePhysicsProfile({
    ...defaults,
    ...current,
    ...patch,
    centerOfMassOffsetMm: {
      ...defaults.centerOfMassOffsetMm,
      ...current.centerOfMassOffsetMm,
      ...patch.centerOfMassOffsetMm,
    },
    defaultLaunchPosition: {
      ...defaults.defaultLaunchPosition,
      ...current.defaultLaunchPosition,
      ...patch.defaultLaunchPosition,
    },
    updatedAt,
  });
}

export function sanitizePhysicsProfile(profile: PhysicsProfile): PhysicsProfile {
  return {
    weightGrams: requirePositiveNumber(profile.weightGrams, 'Weight must be greater than 0.'),
    radiusMm: requirePositiveNumber(profile.radiusMm, 'Radius must be greater than 0.'),
    heightMm: requirePositiveNumber(profile.heightMm, 'Height must be greater than 0.'),
    centerOfMassOffsetMm: {
      x: requireFiniteNumber(profile.centerOfMassOffsetMm.x, 'Center of mass X must be a number.'),
      y: requireFiniteNumber(profile.centerOfMassOffsetMm.y, 'Center of mass Y must be a number.'),
      z: requireFiniteNumber(profile.centerOfMassOffsetMm.z, 'Center of mass Z must be a number.'),
    },
    tipType: isTipType(profile.tipType) ? profile.tipType : 'custom',
    tipFrictionCoefficient: requireNonNegativeNumber(profile.tipFrictionCoefficient, 'Tip friction must be 0 or greater.'),
    ringFrictionCoefficient: requireNonNegativeNumber(profile.ringFrictionCoefficient, 'Ring friction must be 0 or greater.'),
    airDragCoefficient: requireNonNegativeNumber(profile.airDragCoefficient, 'Air drag must be 0 or greater.'),
    spinDampingCoefficient: requireNonNegativeNumber(profile.spinDampingCoefficient, 'Spin damping must be 0 or greater.'),
    defaultLaunchRpm: requireNonNegativeNumber(profile.defaultLaunchRpm, 'Launch RPM must be 0 or greater.'),
    defaultLaunchAngleDegrees: requireFiniteNumber(profile.defaultLaunchAngleDegrees, 'Launch angle must be a number.'),
    defaultLaunchPosition: {
      x: requireFiniteNumber(profile.defaultLaunchPosition.x, 'Launch position X must be a number.'),
      z: requireFiniteNumber(profile.defaultLaunchPosition.z, 'Launch position Z must be a number.'),
    },
    updatedAt: profile.updatedAt,
  };
}

export function getOrientedSourceDimensions(source: ProfileSource): Dimensions {
  if (Number.isFinite(source.scaleFactor) && source.scaleFactor > 0) {
    return {
      x: fallbackIfInvalid(source.normalizedDimensions.x / source.scaleFactor, FALLBACK_ORIENTED_DIMENSIONS.x),
      y: fallbackIfInvalid(source.normalizedDimensions.y / source.scaleFactor, FALLBACK_ORIENTED_DIMENSIONS.y),
      z: fallbackIfInvalid(source.normalizedDimensions.z / source.scaleFactor, FALLBACK_ORIENTED_DIMENSIONS.z),
    };
  }

  return {
    x: fallbackIfInvalid(source.rawDimensions.x, FALLBACK_ORIENTED_DIMENSIONS.x),
    y: fallbackIfInvalid(source.rawDimensions.y, FALLBACK_ORIENTED_DIMENSIONS.y),
    z: fallbackIfInvalid(source.rawDimensions.z, FALLBACK_ORIENTED_DIMENSIONS.z),
  };
}

function requirePositiveNumber(value: number, message: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(message);
  }

  return value;
}

function requireNonNegativeNumber(value: number, message: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(message);
  }

  return value;
}

function requireFiniteNumber(value: number, message: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(message);
  }

  return value;
}

function fallbackIfInvalid(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function roundProfileValue(value: number): number {
  return Math.round(value * 100) / 100;
}

function isTipType(value: TipType): value is TipType {
  return TIP_TYPES.includes(value);
}
