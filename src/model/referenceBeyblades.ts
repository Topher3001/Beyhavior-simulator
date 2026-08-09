import type { PhysicsProfile } from './types';

const SEGMENTS = 72;

type Vertex = {
  x: number;
  y: number;
  z: number;
};

type ProfileLevel = {
  radius: number;
  z: number;
  lobeStrength: number;
};

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
    tipFriction: 0.5,
    ringFriction: 0.38,
    airDrag: 0.016,
    spinDamping: 0.024,
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
    tipFriction: 0.38,
    ringFriction: 0.31,
    airDrag: 0.013,
    spinDamping: 0.018,
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
    tipFriction: 0.58,
    ringFriction: 0.42,
    airDrag: 0.017,
    spinDamping: 0.026,
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
    tipFriction: 0.62,
    ringFriction: 0.45,
    airDrag: 0.019,
    spinDamping: 0.032,
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
    tipFriction: 0.32,
    ringFriction: 0.22,
    airDrag: 0.011,
    spinDamping: 0.014,
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
    tipFriction: 0.34,
    ringFriction: 0.2,
    airDrag: 0.01,
    spinDamping: 0.011,
  }),
];

export function getReferenceBeybladePreset(id: string): ReferenceBeybladePreset | undefined {
  return REFERENCE_BEYBLADE_PRESETS.find((preset) => preset.id === id);
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
  const radius = preset.dimensions.diameterMm / 2;
  const height = preset.dimensions.heightMm;
  const bladeStart = Math.max(height - preset.dimensions.bladeHeightMm, height * 0.58);
  const facets: string[] = [`solid ${preset.id}`];
  const levels: ProfileLevel[] = [
    { radius: 0, z: 0, lobeStrength: 0 },
    { radius: radius * 0.13, z: height * 0.08, lobeStrength: 0.08 },
    { radius: radius * 0.24, z: height * 0.28, lobeStrength: 0.05 },
    { radius: radius * 0.44, z: bladeStart, lobeStrength: 0.12 },
    { radius: radius * 0.94, z: bladeStart + preset.dimensions.bladeHeightMm * 0.25, lobeStrength: preset.profile.contactProfile.attackBias },
    { radius, z: bladeStart + preset.dimensions.bladeHeightMm * 0.58, lobeStrength: preset.profile.contactProfile.attackBias },
    { radius: radius * 0.72, z: height, lobeStrength: preset.profile.contactProfile.attackBias * 0.55 },
    { radius: 0, z: height, lobeStrength: 0 },
  ];

  for (let levelIndex = 0; levelIndex < levels.length - 1; levelIndex += 1) {
    const lower = levels[levelIndex];
    const upper = levels[levelIndex + 1];

    for (let segment = 0; segment < SEGMENTS; segment += 1) {
      const nextSegment = (segment + 1) % SEGMENTS;
      const lowerA = pointOnLevel(lower, segment, preset);
      const lowerB = pointOnLevel(lower, nextSegment, preset);
      const upperA = pointOnLevel(upper, segment, preset);
      const upperB = pointOnLevel(upper, nextSegment, preset);

      if (lower.radius === 0) {
        facets.push(formatFacet(lowerA, upperA, upperB));
      } else if (upper.radius === 0) {
        facets.push(formatFacet(lowerA, upperB, lowerB));
      } else {
        facets.push(formatFacet(lowerA, upperA, upperB));
        facets.push(formatFacet(lowerA, upperB, lowerB));
      }
    }
  }

  facets.push(`endsolid ${preset.id}`);

  return facets.join('\n');
}

function pointOnLevel(level: ProfileLevel, segment: number, preset: ReferenceBeybladePreset): Vertex {
  const angle = (segment / SEGMENTS) * Math.PI * 2;
  const points = Math.max(1, preset.profile.contactProfile.attackPoints);
  const attackBias = preset.profile.contactProfile.attackBias;
  const lobe = Math.max(0, Math.cos(angle * points));
  const ripple = Math.sin(angle * points * 2 + points) * 0.035;
  const localRadius = level.radius * (1 + level.lobeStrength * (0.02 + attackBias * 0.14) * lobe + ripple * level.lobeStrength);

  return {
    x: Math.cos(angle) * localRadius,
    y: Math.sin(angle) * localRadius,
    z: level.z,
  };
}

function formatFacet(a: Vertex, b: Vertex, c: Vertex): string {
  return [
    '  facet normal 0 0 0',
    '    outer loop',
    formatVertex(a),
    formatVertex(b),
    formatVertex(c),
    '    endloop',
    '  endfacet',
  ].join('\n');
}

function formatVertex(vertex: Vertex): string {
  return `      vertex ${formatNumber(vertex.x)} ${formatNumber(vertex.y)} ${formatNumber(vertex.z)}`;
}

function formatNumber(value: number): string {
  return Number(value.toFixed(5)).toString();
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
