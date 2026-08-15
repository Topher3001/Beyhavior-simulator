import type { StadiumPreset } from './stadiumConfig';
import { ARENA_SURFACE_Y } from './stadiumConfig';

export type StadiumDishSurface = {
  vertices: Float32Array;
  indices: Uint32Array;
};

export function createStadiumDishSurface(stadium: StadiumPreset, ringCount = 64, segmentCount = 192): StadiumDishSurface {
  const positions: number[] = [];
  const indices: number[] = [];

  for (let ring = 0; ring <= ringCount; ring += 1) {
    const radiusProgress = ring / ringCount;
    const radius = stadium.playRadiusWorld * radiusProgress;
    const y = getStadiumSurfaceYByProgress(radiusProgress, stadium);

    for (let segment = 0; segment < segmentCount; segment += 1) {
      const angle = (segment / segmentCount) * Math.PI * 2;
      positions.push(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
    }
  }

  for (let ring = 0; ring < ringCount; ring += 1) {
    for (let segment = 0; segment < segmentCount; segment += 1) {
      const nextSegment = (segment + 1) % segmentCount;
      const lowerA = ring * segmentCount + segment;
      const lowerB = ring * segmentCount + nextSegment;
      const upperA = (ring + 1) * segmentCount + segment;
      const upperB = (ring + 1) * segmentCount + nextSegment;

      indices.push(lowerA, upperB, upperA, lowerA, lowerB, upperB);
    }
  }

  return {
    vertices: new Float32Array(positions),
    indices: new Uint32Array(indices),
  };
}

export function getStadiumSurfaceYAt(x: number, z: number, stadium: StadiumPreset): number {
  const radiusProgress = Math.min(Math.hypot(x, z) / stadium.playRadiusWorld, 1.25);

  return getStadiumSurfaceYByProgress(radiusProgress, stadium);
}

export function getStadiumSurfaceGradientAt(x: number, z: number, stadium: StadiumPreset): { x: number; z: number } {
  const sampleDistance = Math.max(stadium.playRadiusWorld * 0.012, 0.055);
  const left = getStadiumSurfaceYAt(x - sampleDistance, z, stadium);
  const right = getStadiumSurfaceYAt(x + sampleDistance, z, stadium);
  const back = getStadiumSurfaceYAt(x, z - sampleDistance, stadium);
  const front = getStadiumSurfaceYAt(x, z + sampleDistance, stadium);

  return {
    x: (right - left) / (sampleDistance * 2),
    z: (front - back) / (sampleDistance * 2),
  };
}

export function getStadiumBowlGradientAt(x: number, z: number, stadium: StadiumPreset): { x: number; z: number } {
  const sampleDistance = Math.max(stadium.playRadiusWorld * 0.012, 0.055);
  const left = getStadiumBowlSurfaceYAt(x - sampleDistance, z, stadium);
  const right = getStadiumBowlSurfaceYAt(x + sampleDistance, z, stadium);
  const back = getStadiumBowlSurfaceYAt(x, z - sampleDistance, stadium);
  const front = getStadiumBowlSurfaceYAt(x, z + sampleDistance, stadium);

  return {
    x: (right - left) / (sampleDistance * 2),
    z: (front - back) / (sampleDistance * 2),
  };
}

export function getStadiumSurfaceYByProgress(radiusProgress: number, stadium: StadiumPreset): number {
  const clampedProgress = Math.max(0, Math.min(radiusProgress, 1.25));
  const ridgeProgress = stadium.tornadoRidgeRadiusWorld / stadium.playRadiusWorld;
  const ridgeWidth = 0.072;
  const ridgeDistance = Math.abs(clampedProgress - ridgeProgress) / ridgeWidth;
  const ridgeShape = 1 - smoothstep(0, 1, ridgeDistance);
  const ridgeLift = ridgeShape * ridgeShape * stadium.tornadoRidgeHeightWorld * 0.68;

  return getStadiumBowlSurfaceYByProgress(clampedProgress, stadium) + ridgeLift;
}

function getStadiumBowlSurfaceYAt(x: number, z: number, stadium: StadiumPreset): number {
  const radiusProgress = Math.min(Math.hypot(x, z) / stadium.playRadiusWorld, 1.25);

  return getStadiumBowlSurfaceYByProgress(radiusProgress, stadium);
}

function getStadiumBowlSurfaceYByProgress(radiusProgress: number, stadium: StadiumPreset): number {
  const clampedProgress = Math.max(0, Math.min(radiusProgress, 1.25));
  const playableProgress = Math.min(clampedProgress, 1);
  const centerY = ARENA_SURFACE_Y - stadium.bowlDepthWorld * 0.72;
  const rimY = ARENA_SURFACE_Y + stadium.outerLipLiftWorld;
  const innerRise = Math.pow(smoothstep(0, 0.72, playableProgress), 1.05 + stadium.bowlCurve * 0.22);
  const outerBank = Math.pow(smoothstep(0.62, 1, playableProgress), 1.55);
  const bowlProgress = Math.min(innerRise * 0.46 + outerBank * 0.54, 1);
  const baseY = centerY + (rimY - centerY) * bowlProgress;
  const outerLipProgress = smoothstep(1, 1.2, clampedProgress);
  const outerLipLift = outerLipProgress * stadium.outerLipLiftWorld * 0.85;

  return baseY + outerLipLift;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const progress = Math.max(0, Math.min((value - edge0) / (edge1 - edge0), 1));

  return progress * progress * (3 - 2 * progress);
}
