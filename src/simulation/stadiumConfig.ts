export type StadiumPocket = {
  label: string;
  angleDegrees: number;
  widthDegrees: number;
  depthWorld: number;
  kind: 'gap' | 'pocket' | 'xtreme';
};

export type StadiumPreset = {
  id: string;
  label: string;
  sourceLabel: string;
  dimensionsCm: {
    length: number;
    width: number;
    height: number;
    playDiameter?: number;
    tornadoRidgeDiameter?: number;
    exitGapLength?: number;
    wallLength?: number;
  };
  playRadiusWorld: number;
  wallRadiusWorld: number;
  ringOutRadiusWorld: number;
  tornadoRidgeRadiusWorld: number;
  wallHeightWorld: number;
  wallThicknessWorld: number;
  wallFriction: number;
  floorFriction: number;
  pocketGuardLengthWorld: number;
  bowlDepthWorld: number;
  bowlCurve: number;
  outerLipLiftWorld: number;
  tornadoRidgeHeightWorld: number;
  pockets: StadiumPocket[];
};

export const DEFAULT_STADIUM_PRESET_ID = 'xtreme-bx10';

export const STADIUM_PRESETS: StadiumPreset[] = [
  {
    id: 'bb10-attack-standard',
    label: 'BB-10 Attack Standard',
    sourceLabel: 'Takara Tomy BB-10 Attack Type',
    dimensionsCm: {
      length: 34,
      width: 34,
      height: 3,
      playDiameter: 34,
      tornadoRidgeDiameter: 25,
      exitGapLength: 15,
      wallLength: 15.5,
    },
    playRadiusWorld: 5.6,
    wallRadiusWorld: 5.56,
    ringOutRadiusWorld: 6.25,
    tornadoRidgeRadiusWorld: 4.12,
    wallHeightWorld: 0.55,
    wallThicknessWorld: 0.3,
    wallFriction: 0.09,
    floorFriction: 0.035,
    pocketGuardLengthWorld: 1.25,
    bowlDepthWorld: 0.9,
    bowlCurve: 1.65,
    outerLipLiftWorld: 0.18,
    tornadoRidgeHeightWorld: 0.075,
    pockets: [
      { label: 'KO Gap A', angleDegrees: 90, widthDegrees: 52, depthWorld: 1.05, kind: 'gap' },
      { label: 'KO Gap B', angleDegrees: 210, widthDegrees: 52, depthWorld: 1.05, kind: 'gap' },
      { label: 'KO Gap C', angleDegrees: 330, widthDegrees: 52, depthWorld: 1.05, kind: 'gap' },
    ],
  },
  {
    id: 'burst-standard-b09',
    label: 'Burst Standard B-09',
    sourceLabel: 'Takara Tomy Burst Standard Type',
    dimensionsCm: {
      length: 45.7,
      width: 45.7,
      height: 10.2,
      playDiameter: 45.7,
    },
    playRadiusWorld: 5.6,
    wallRadiusWorld: 5.56,
    ringOutRadiusWorld: 6.1,
    tornadoRidgeRadiusWorld: 3.9,
    wallHeightWorld: 0.62,
    wallThicknessWorld: 0.32,
    wallFriction: 0.075,
    floorFriction: 0.033,
    pocketGuardLengthWorld: 1.05,
    bowlDepthWorld: 0.96,
    bowlCurve: 1.78,
    outerLipLiftWorld: 0.2,
    tornadoRidgeHeightWorld: 0.07,
    pockets: [
      { label: 'Pocket A', angleDegrees: 90, widthDegrees: 44, depthWorld: 0.95, kind: 'pocket' },
      { label: 'Pocket B', angleDegrees: 210, widthDegrees: 44, depthWorld: 0.95, kind: 'pocket' },
      { label: 'Pocket C', angleDegrees: 330, widthDegrees: 44, depthWorld: 0.95, kind: 'pocket' },
    ],
  },
  {
    id: 'db-standard-b183',
    label: 'DB Standard B-183',
    sourceLabel: 'Takara Tomy DB Standard Type',
    dimensionsCm: {
      length: 54.5,
      width: 48,
      height: 16.5,
      tornadoRidgeDiameter: 31.5,
    },
    playRadiusWorld: 5.9,
    wallRadiusWorld: 5.86,
    ringOutRadiusWorld: 6.45,
    tornadoRidgeRadiusWorld: 3.82,
    wallHeightWorld: 0.66,
    wallThicknessWorld: 0.34,
    wallFriction: 0.07,
    floorFriction: 0.032,
    pocketGuardLengthWorld: 1.35,
    bowlDepthWorld: 1.04,
    bowlCurve: 1.85,
    outerLipLiftWorld: 0.22,
    tornadoRidgeHeightWorld: 0.07,
    pockets: [
      { label: 'Wide Pocket A', angleDegrees: 150, widthDegrees: 58, depthWorld: 1.2, kind: 'pocket' },
      { label: 'Wide Pocket B', angleDegrees: 30, widthDegrees: 58, depthWorld: 1.2, kind: 'pocket' },
    ],
  },
  {
    id: 'xtreme-bx10',
    label: 'Xtreme Stadium BX-10',
    sourceLabel: 'Takara Tomy Beyblade X BX-10',
    dimensionsCm: {
      length: 44,
      width: 45.5,
      height: 15.5,
      tornadoRidgeDiameter: 21,
    },
    playRadiusWorld: 5.6,
    wallRadiusWorld: 5.56,
    ringOutRadiusWorld: 6.45,
    tornadoRidgeRadiusWorld: 2.58,
    wallHeightWorld: 0.74,
    wallThicknessWorld: 0.34,
    wallFriction: 0.105,
    floorFriction: 0.034,
    pocketGuardLengthWorld: 1.45,
    bowlDepthWorld: 1.14,
    bowlCurve: 2,
    outerLipLiftWorld: 0.26,
    tornadoRidgeHeightWorld: 0.095,
    pockets: [
      { label: 'Over Zone L', angleDegrees: 136, widthDegrees: 33, depthWorld: 1.15, kind: 'pocket' },
      { label: 'Xtreme Zone', angleDegrees: 180, widthDegrees: 48, depthWorld: 1.45, kind: 'xtreme' },
      { label: 'Over Zone R', angleDegrees: 224, widthDegrees: 33, depthWorld: 1.15, kind: 'pocket' },
    ],
  },
];

let activeStadiumPreset = getStadiumPreset(DEFAULT_STADIUM_PRESET_ID) ?? STADIUM_PRESETS[0];

export const ARENA_SURFACE_Y = 0.1;

export function getActiveStadiumPreset(): StadiumPreset {
  return activeStadiumPreset;
}

export function setActiveStadiumPreset(id: string): StadiumPreset {
  const preset = getStadiumPreset(id);

  if (!preset) {
    throw new Error('Choose a valid stadium preset.');
  }

  activeStadiumPreset = preset;

  return activeStadiumPreset;
}

export function getStadiumPreset(id: string): StadiumPreset | undefined {
  return STADIUM_PRESETS.find((preset) => preset.id === id);
}

export function isPositionInPocket(x: number, z: number, preset = getActiveStadiumPreset()): boolean {
  return getPocketAtPosition(x, z, preset) !== null;
}

export function getPocketAtPosition(x: number, z: number, preset = getActiveStadiumPreset()): StadiumPocket | null {
  const angleDegrees = radiansToDegrees(Math.atan2(z, x));

  return preset.pockets.find((pocket) => isAngleInsidePocket(angleDegrees, pocket)) ?? null;
}

export function isAngleInsidePocket(angleDegrees: number, pocket: StadiumPocket): boolean {
  const delta = normalizeAngleDegrees(angleDegrees - pocket.angleDegrees);

  return Math.abs(delta) <= pocket.widthDegrees / 2;
}

export function getPocketEntryRadius(pocket: StadiumPocket | null, preset = getActiveStadiumPreset()): number {
  if (!pocket) {
    return preset.ringOutRadiusWorld;
  }

  return preset.wallRadiusWorld - Math.min(0.28, pocket.depthWorld * 0.18);
}

function normalizeAngleDegrees(value: number): number {
  return ((((value + 180) % 360) + 360) % 360) - 180;
}

function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}
