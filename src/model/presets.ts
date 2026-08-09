import type { PhysicsProfile } from './types';

export type TipPreset = {
  id: PhysicsProfile['tipType'];
  label: string;
  patch: Pick<
    PhysicsProfile,
    'tipType' | 'tipFrictionCoefficient' | 'ringFrictionCoefficient' | 'airDragCoefficient' | 'spinDampingCoefficient'
  >;
};

export type LaunchPresetId = 'controlled' | 'stamina' | 'attack-sweep' | 'ko-test';

export type LaunchPreset = {
  id: LaunchPresetId;
  label: string;
  rpm: number;
  angleDegrees: number;
  position: {
    x: number;
    z: number;
  };
};

export const TIP_PRESETS: TipPreset[] = [
  {
    id: 'sharp',
    label: 'Sharp',
    patch: {
      tipType: 'sharp',
      tipFrictionCoefficient: 0.28,
      ringFrictionCoefficient: 0.24,
      airDragCoefficient: 0.01,
      spinDampingCoefficient: 0.012,
    },
  },
  {
    id: 'flat',
    label: 'Flat',
    patch: {
      tipType: 'flat',
      tipFrictionCoefficient: 0.42,
      ringFrictionCoefficient: 0.28,
      airDragCoefficient: 0.012,
      spinDampingCoefficient: 0.018,
    },
  },
  {
    id: 'ball',
    label: 'Ball',
    patch: {
      tipType: 'ball',
      tipFrictionCoefficient: 0.36,
      ringFrictionCoefficient: 0.26,
      airDragCoefficient: 0.011,
      spinDampingCoefficient: 0.015,
    },
  },
  {
    id: 'rubber',
    label: 'Rubber',
    patch: {
      tipType: 'rubber',
      tipFrictionCoefficient: 0.78,
      ringFrictionCoefficient: 0.34,
      airDragCoefficient: 0.018,
      spinDampingCoefficient: 0.032,
    },
  },
  {
    id: 'custom',
    label: 'Custom',
    patch: {
      tipType: 'custom',
      tipFrictionCoefficient: 0.5,
      ringFrictionCoefficient: 0.3,
      airDragCoefficient: 0.014,
      spinDampingCoefficient: 0.02,
    },
  },
];

export const LAUNCH_PRESETS: LaunchPreset[] = [
  {
    id: 'controlled',
    label: 'Controlled',
    rpm: 6200,
    angleDegrees: 4,
    position: {
      x: 0,
      z: 0,
    },
  },
  {
    id: 'stamina',
    label: 'Stamina',
    rpm: 8200,
    angleDegrees: 2,
    position: {
      x: 0,
      z: 0,
    },
  },
  {
    id: 'attack-sweep',
    label: 'Attack Sweep',
    rpm: 7600,
    angleDegrees: 9,
    position: {
      x: -1.2,
      z: 0.55,
    },
  },
  {
    id: 'ko-test',
    label: 'KO Test',
    rpm: 9000,
    angleDegrees: 12,
    position: {
      x: -1.65,
      z: 0.2,
    },
  },
];

export function getTipPreset(id: string): TipPreset | undefined {
  return TIP_PRESETS.find((preset) => preset.id === id);
}

export function getLaunchPreset(id: string): LaunchPreset | undefined {
  return LAUNCH_PRESETS.find((preset) => preset.id === id);
}
