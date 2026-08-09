import type { LoadedDesign } from '../model/types';

export function gramsToKilograms(grams: number): number {
  return grams / 1000;
}

export function rpmToRadiansPerSecond(rpm: number): number {
  return (rpm * Math.PI * 2) / 60;
}

export function radiansPerSecondToRpm(radiansPerSecond: number): number {
  return (radiansPerSecond * 60) / (Math.PI * 2);
}

export function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

export function profileMmToSceneWorld(millimeters: number, design: LoadedDesign): number {
  const scaleFactor = Number.isFinite(design.scaleFactor) && design.scaleFactor > 0 ? design.scaleFactor : 1;

  return millimeters * scaleFactor;
}
