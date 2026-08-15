import type { PhysicsProfile } from './types';
import { createProceduralBeybladeStl } from './proceduralBeybladeStl';

export type ReferenceBeybladePreset = {
  id: string;
  displayName: string;
  fileName: string;
  sourceSummary: string;
  dimensions: {
    diameterMm: number;
    heightMm: number;
    bladeHeightMm: number;
    bladeWeightGrams: number;
    totalWeightGrams: number;
  };
  profile: PhysicsProfile;
};

export const REFERENCE_BEYBLADE_PRESETS: ReferenceBeybladePreset[] = [
  createPreset({
    id: 'dran-sword-3-60f',
    displayName: 'Dran Sword 3-60F',
    sourceSummary: 'Popular Beyblade X attack starter; blade measured near 48.25 mm wide and 14.12 mm tall.',
    diameterMm: 48.25,
    bladeHeightMm: 14.12,
    bladeWeightGrams: 34.67,
    totalWeightGrams: 43,
    heightMm: 40.1,
    tipType: 'flat',
    attackPoints: 3,
    attackBias: 0.82,
    recoilCoefficient: 0.72,
    launchRpm: 8000,
    launchAngleDegrees: 8,
    launchX: -1.1,
    launchZ: 0.4,
    tipFriction: 0.42,
    ringFriction: 0.38,
    airDrag: 0.008,
    spinDamping: 0.009,
  }),
  createPreset({
    id: 'hells-scythe-4-60t',
    displayName: 'Hells Scythe 4-60T',
    sourceSummary: 'Early Beyblade X balance staple; blade measured near 47.99 mm wide and 14.29 mm tall.',
    diameterMm: 47.99,
    bladeHeightMm: 14.29,
    bladeWeightGrams: 32.7,
    totalWeightGrams: 41.2,
    heightMm: 40.3,
    tipType: 'custom',
    attackPoints: 4,
    attackBias: 0.52,
    recoilCoefficient: 0.5,
    launchRpm: 7200,
    launchAngleDegrees: 5,
    launchX: -0.35,
    launchZ: 0.15,
    tipFriction: 0.32,
    ringFriction: 0.31,
    airDrag: 0.007,
    spinDamping: 0.007,
  }),
  createPreset({
    id: 'phoenix-wing-9-60gf',
    displayName: 'Phoenix Wing 9-60GF',
    sourceSummary: 'Heavy attack benchmark; blade measured near 49.00 mm wide and 13.70 mm tall.',
    diameterMm: 49,
    bladeHeightMm: 13.7,
    bladeWeightGrams: 37.95,
    totalWeightGrams: 46.25,
    heightMm: 39.9,
    tipType: 'flat',
    attackPoints: 3,
    attackBias: 0.9,
    recoilCoefficient: 0.82,
    launchRpm: 8600,
    launchAngleDegrees: 9,
    launchX: -1.35,
    launchZ: 0.35,
    tipFriction: 0.48,
    ringFriction: 0.42,
    airDrag: 0.009,
    spinDamping: 0.01,
  }),
  createPreset({
    id: 'shark-edge-3-60lf',
    displayName: 'Shark Edge 3-60LF',
    sourceSummary: 'Aggressive two-contact attack blade; blade measured near 48.88 mm wide and 14.25 mm tall.',
    diameterMm: 48.88,
    bladeHeightMm: 14.25,
    bladeWeightGrams: 34.53,
    totalWeightGrams: 43,
    heightMm: 39.2,
    tipType: 'flat',
    attackPoints: 2,
    attackBias: 0.96,
    recoilCoefficient: 0.88,
    launchRpm: 8600,
    launchAngleDegrees: 10,
    launchX: -1.55,
    launchZ: 0.3,
    tipFriction: 0.5,
    ringFriction: 0.45,
    airDrag: 0.01,
    spinDamping: 0.012,
  }),
  createPreset({
    id: 'wizard-arrow-4-80b',
    displayName: 'Wizard Arrow 4-80B',
    sourceSummary: 'Smooth stamina benchmark; blade measured near 48.09 mm wide and 14.06 mm tall.',
    diameterMm: 48.09,
    bladeHeightMm: 14.06,
    bladeWeightGrams: 31.97,
    totalWeightGrams: 40.9,
    heightMm: 42.6,
    tipType: 'ball',
    attackPoints: 2,
    attackBias: 0.2,
    recoilCoefficient: 0.18,
    launchRpm: 7600,
    launchAngleDegrees: 2,
    launchX: 0,
    launchZ: 0,
    tipFriction: 0.27,
    ringFriction: 0.22,
    airDrag: 0.005,
    spinDamping: 0.005,
  }),
  createPreset({
    id: 'knight-shield-3-80n',
    displayName: 'Knight Shield 3-80N',
    sourceSummary: 'Official Beyblade X defense starter lineage; simulator dimensions are catalog-seeded estimates pending measured component data.',
    diameterMm: 48.4,
    bladeHeightMm: 14.4,
    bladeWeightGrams: 32.4,
    totalWeightGrams: 41.4,
    heightMm: 42.7,
    tipType: 'sharp',
    attackPoints: 3,
    attackBias: 0.24,
    recoilCoefficient: 0.22,
    launchRpm: 7400,
    launchAngleDegrees: 2.5,
    launchX: 0,
    launchZ: 0,
    tipFriction: 0.2,
    ringFriction: 0.2,
    airDrag: 0.005,
    spinDamping: 0.005,
  }),
  createPreset({
    id: 'dagger-dran-4-60r',
    displayName: 'Dagger Dran 4-60R',
    sourceSummary: 'Official Xtreme Battle Set attack top; simulator dimensions are catalog-seeded estimates pending measured component data.',
    diameterMm: 48.6,
    bladeHeightMm: 14.2,
    bladeWeightGrams: 34.1,
    totalWeightGrams: 42.8,
    heightMm: 39.8,
    tipType: 'flat',
    attackPoints: 4,
    attackBias: 0.78,
    recoilCoefficient: 0.68,
    launchRpm: 8200,
    launchAngleDegrees: 8,
    launchX: -1.15,
    launchZ: 0.45,
    tipFriction: 0.4,
    ringFriction: 0.36,
    airDrag: 0.008,
    spinDamping: 0.009,
  }),
  createPreset({
    id: 'tusk-mammoth-3-60t',
    displayName: 'Tusk Mammoth 3-60T',
    sourceSummary: 'Official Xtreme Battle Set balance top; simulator dimensions are catalog-seeded estimates pending measured component data.',
    diameterMm: 49.1,
    bladeHeightMm: 14.6,
    bladeWeightGrams: 33.5,
    totalWeightGrams: 42.3,
    heightMm: 40.2,
    tipType: 'custom',
    attackPoints: 3,
    attackBias: 0.5,
    recoilCoefficient: 0.46,
    launchRpm: 7400,
    launchAngleDegrees: 5,
    launchX: -0.45,
    launchZ: 0.2,
    tipFriction: 0.32,
    ringFriction: 0.3,
    airDrag: 0.007,
    spinDamping: 0.007,
  }),
  createPreset({
    id: 'steel-samurai-4-80t',
    displayName: 'Steel Samurai 4-80T',
    sourceSummary: 'Official Beyblade X balance booster; simulator dimensions are catalog-seeded estimates pending measured component data.',
    diameterMm: 48.7,
    bladeHeightMm: 14.3,
    bladeWeightGrams: 33.2,
    totalWeightGrams: 42.5,
    heightMm: 42.6,
    tipType: 'custom',
    attackPoints: 4,
    attackBias: 0.55,
    recoilCoefficient: 0.52,
    launchRpm: 7400,
    launchAngleDegrees: 5.5,
    launchX: -0.55,
    launchZ: 0.25,
    tipFriction: 0.34,
    ringFriction: 0.31,
    airDrag: 0.007,
    spinDamping: 0.008,
  }),
  createPreset({
    id: 'talon-ptera-3-80b',
    displayName: 'Talon Ptera 3-80B',
    sourceSummary: 'Official Beyblade X stamina booster; simulator dimensions are catalog-seeded estimates pending measured component data.',
    diameterMm: 48.5,
    bladeHeightMm: 14.1,
    bladeWeightGrams: 31.8,
    totalWeightGrams: 41.1,
    heightMm: 42.4,
    tipType: 'ball',
    attackPoints: 3,
    attackBias: 0.22,
    recoilCoefficient: 0.2,
    launchRpm: 7600,
    launchAngleDegrees: 2,
    launchX: 0,
    launchZ: 0,
    tipFriction: 0.27,
    ringFriction: 0.22,
    airDrag: 0.005,
    spinDamping: 0.005,
  }),
  createPreset({
    id: 'knife-shinobi-4-80hn',
    displayName: 'Knife Shinobi 4-80HN',
    sourceSummary: 'Official Beyblade X defense dual-pack top; simulator dimensions are catalog-seeded estimates pending measured component data.',
    diameterMm: 48.2,
    bladeHeightMm: 14.1,
    bladeWeightGrams: 31.5,
    totalWeightGrams: 40.8,
    heightMm: 42.9,
    tipType: 'sharp',
    attackPoints: 4,
    attackBias: 0.18,
    recoilCoefficient: 0.18,
    launchRpm: 7300,
    launchAngleDegrees: 2,
    launchX: 0,
    launchZ: 0,
    tipFriction: 0.18,
    ringFriction: 0.2,
    airDrag: 0.005,
    spinDamping: 0.005,
  }),
  createPreset({
    id: 'keel-shark-3-80f',
    displayName: 'Keel Shark 3-80F',
    sourceSummary: 'Official Beyblade X attack dual-pack top; simulator dimensions are catalog-seeded estimates pending measured component data.',
    diameterMm: 48.8,
    bladeHeightMm: 14.2,
    bladeWeightGrams: 34,
    totalWeightGrams: 43.4,
    heightMm: 42.1,
    tipType: 'flat',
    attackPoints: 2,
    attackBias: 0.86,
    recoilCoefficient: 0.78,
    launchRpm: 8400,
    launchAngleDegrees: 9,
    launchX: -1.35,
    launchZ: 0.35,
    tipFriction: 0.44,
    ringFriction: 0.39,
    airDrag: 0.009,
    spinDamping: 0.01,
  }),
  createPreset({
    id: 'wizard-rod-5-70db',
    displayName: 'Wizard Rod 5-70DB',
    sourceSummary: 'Current stamina/meta benchmark; total weight and component weights are sourced, width is approximated as large-diameter.',
    diameterMm: 50.4,
    bladeHeightMm: 14.5,
    bladeWeightGrams: 35.4,
    totalWeightGrams: 45.2,
    heightMm: 43.8,
    tipType: 'ball',
    attackPoints: 5,
    attackBias: 0.18,
    recoilCoefficient: 0.14,
    launchRpm: 8000,
    launchAngleDegrees: 1.5,
    launchX: 0,
    launchZ: 0,
    tipFriction: 0.28,
    ringFriction: 0.2,
    airDrag: 0.004,
    spinDamping: 0.004,
  }),
];

export function getReferenceBeybladePreset(id: string): ReferenceBeybladePreset | undefined {
  return REFERENCE_BEYBLADE_PRESETS.find((preset) => preset.id === id);
}

export function getReferenceBeybladePresetByFileName(fileName: string): ReferenceBeybladePreset | undefined {
  return REFERENCE_BEYBLADE_PRESETS.find((preset) => preset.fileName.toLowerCase() === fileName.toLowerCase());
}

export function createReferenceBeybladeFile(preset: ReferenceBeybladePreset): File {
  const stl = createReferenceStl(preset);

  return new File([stl], preset.fileName, { type: 'model/stl' });
}

function createPreset(options: {
  id: string;
  displayName: string;
  sourceSummary: string;
  diameterMm: number;
  heightMm: number;
  bladeHeightMm: number;
  bladeWeightGrams: number;
  totalWeightGrams: number;
  tipType: PhysicsProfile['tipType'];
  attackPoints: number;
  attackBias: number;
  recoilCoefficient: number;
  launchRpm: number;
  launchAngleDegrees: number;
  launchX: number;
  launchZ: number;
  tipFriction: number;
  ringFriction: number;
  airDrag: number;
  spinDamping: number;
}): ReferenceBeybladePreset {
  return {
    id: options.id,
    displayName: options.displayName,
    fileName: `${options.id}.stl`,
    sourceSummary: options.sourceSummary,
    dimensions: {
      diameterMm: options.diameterMm,
      heightMm: options.heightMm,
      bladeHeightMm: options.bladeHeightMm,
      bladeWeightGrams: options.bladeWeightGrams,
      totalWeightGrams: options.totalWeightGrams,
    },
    profile: {
      weightGrams: options.totalWeightGrams,
      radiusMm: options.diameterMm / 2,
      heightMm: options.heightMm,
      centerOfMassOffsetMm: {
        x: 0,
        y: round(options.heightMm * (options.attackBias > 0.7 ? 0.52 : 0.44)),
        z: 0,
      },
      tipType: options.tipType,
      tipFrictionCoefficient: options.tipFriction,
      ringFrictionCoefficient: options.ringFriction,
      airDragCoefficient: options.airDrag,
      spinDampingCoefficient: options.spinDamping,
      defaultLaunchRpm: options.launchRpm,
      defaultLaunchAngleDegrees: options.launchAngleDegrees,
      defaultLaunchPosition: {
        x: options.launchX,
        z: options.launchZ,
      },
      contactProfile: {
        attackPoints: options.attackPoints,
        attackBias: options.attackBias,
        recoilCoefficient: options.recoilCoefficient,
      },
      updatedAt: new Date(0).toISOString(),
    },
  };
}

function createReferenceStl(preset: ReferenceBeybladePreset): string {
  return createProceduralBeybladeStl({
    solidName: preset.id,
    diameterMm: preset.dimensions.diameterMm,
    heightMm: preset.dimensions.heightMm,
    attackPoints: preset.profile.contactProfile.attackPoints,
    attackBias: preset.profile.contactProfile.attackBias,
    tipType: preset.profile.tipType,
  });
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
