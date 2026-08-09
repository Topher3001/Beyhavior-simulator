import type { TipType } from './types';

const DEFAULT_SEGMENTS = 96;

type Vertex = {
  x: number;
  y: number;
  z: number;
};

export type ProceduralBeybladeStlOptions = {
  solidName: string;
  diameterMm: number;
  heightMm: number;
  attackPoints: number;
  attackBias: number;
  tipType: TipType;
};

export function createProceduralBeybladeStl(options: ProceduralBeybladeStlOptions): string {
  const radius = Math.max(options.diameterMm / 2, 8);
  const height = Math.max(options.heightMm, 18);
  const attackPoints = Math.max(1, Math.round(options.attackPoints));
  const attackBias = clamp(options.attackBias, 0, 1);
  const tip = getTipProfile(options.tipType, radius);
  const facets: string[] = [`solid ${sanitizeSolidName(options.solidName)}`];

  addFrustum(facets, {
    bottomRadius: tip.bottomRadius,
    topRadius: tip.topRadius,
    z0: 0,
    z1: height * 0.15,
  });
  addFrustum(facets, {
    bottomRadius: radius * 0.16,
    topRadius: radius * 0.22,
    z0: height * 0.13,
    z1: height * 0.46,
  });
  addAnnularFrustum(facets, {
    innerRadius: radius * 0.17,
    outerRadius: radius * 0.58,
    z0: height * 0.39,
    z1: height * 0.58,
    outerLobeStrength: 0.05,
    attackPoints,
    attackBias: 0.35,
  });
  addAnnularFrustum(facets, {
    innerRadius: radius * 0.34,
    outerRadius: radius * 0.91,
    z0: height * 0.54,
    z1: height * 0.83,
    outerLobeStrength: 0.18,
    attackPoints,
    attackBias,
  });
  addAnnularFrustum(facets, {
    innerRadius: radius * 0.42,
    outerRadius: radius * 0.98,
    z0: height * 0.62,
    z1: height * 0.77,
    outerLobeStrength: 0.28,
    attackPoints,
    attackBias,
  });
  addFrustum(facets, {
    bottomRadius: radius * 0.43,
    topRadius: radius * 0.34,
    z0: height * 0.68,
    z1: height * 0.93,
  });
  addFrustum(facets, {
    bottomRadius: radius * 0.2,
    topRadius: radius * 0.16,
    z0: height * 0.91,
    z1: height,
  });

  facets.push(`endsolid ${sanitizeSolidName(options.solidName)}`);

  return facets.join('\n');
}

function addFrustum(
  facets: string[],
  options: {
    bottomRadius: number;
    topRadius: number;
    z0: number;
    z1: number;
  },
): void {
  const bottomCenter = { x: 0, y: 0, z: options.z0 };
  const topCenter = { x: 0, y: 0, z: options.z1 };

  for (let segment = 0; segment < DEFAULT_SEGMENTS; segment += 1) {
    const angle = segmentAngle(segment);
    const nextAngle = segmentAngle(segment + 1);
    const bottomA = pointAt(options.bottomRadius, angle, options.z0);
    const bottomB = pointAt(options.bottomRadius, nextAngle, options.z0);
    const topA = pointAt(options.topRadius, angle, options.z1);
    const topB = pointAt(options.topRadius, nextAngle, options.z1);

    if (options.bottomRadius > 0.001 && options.topRadius > 0.001) {
      facets.push(formatFacet(bottomA, topA, topB), formatFacet(bottomA, topB, bottomB));
    } else if (options.bottomRadius <= 0.001) {
      facets.push(formatFacet(bottomCenter, topA, topB));
    } else {
      facets.push(formatFacet(bottomA, topCenter, bottomB));
    }

    if (options.bottomRadius > 0.001) {
      facets.push(formatFacet(bottomCenter, bottomB, bottomA));
    }

    if (options.topRadius > 0.001) {
      facets.push(formatFacet(topCenter, topA, topB));
    }
  }
}

function addAnnularFrustum(
  facets: string[],
  options: {
    innerRadius: number;
    outerRadius: number;
    z0: number;
    z1: number;
    outerLobeStrength: number;
    attackPoints: number;
    attackBias: number;
  },
): void {
  for (let segment = 0; segment < DEFAULT_SEGMENTS; segment += 1) {
    const angle = segmentAngle(segment);
    const nextAngle = segmentAngle(segment + 1);
    const outerBottomA = pointAt(lobedRadius(options.outerRadius, angle, options), angle, options.z0);
    const outerBottomB = pointAt(lobedRadius(options.outerRadius, nextAngle, options), nextAngle, options.z0);
    const outerTopA = pointAt(lobedRadius(options.outerRadius * 0.96, angle, options), angle, options.z1);
    const outerTopB = pointAt(lobedRadius(options.outerRadius * 0.96, nextAngle, options), nextAngle, options.z1);
    const innerBottomA = pointAt(options.innerRadius, angle, options.z0);
    const innerBottomB = pointAt(options.innerRadius, nextAngle, options.z0);
    const innerTopA = pointAt(options.innerRadius * 0.92, angle, options.z1);
    const innerTopB = pointAt(options.innerRadius * 0.92, nextAngle, options.z1);

    facets.push(formatFacet(outerBottomA, outerTopA, outerTopB), formatFacet(outerBottomA, outerTopB, outerBottomB));
    facets.push(formatFacet(innerBottomA, innerTopB, innerTopA), formatFacet(innerBottomA, innerBottomB, innerTopB));
    facets.push(formatFacet(innerTopA, outerTopA, outerTopB), formatFacet(innerTopA, outerTopB, innerTopB));
    facets.push(formatFacet(innerBottomA, outerBottomB, outerBottomA), formatFacet(innerBottomA, innerBottomB, outerBottomB));
  }
}

function lobedRadius(
  baseRadius: number,
  angle: number,
  options: {
    outerLobeStrength: number;
    attackPoints: number;
    attackBias: number;
  },
): number {
  const primaryLobe = Math.max(0, Math.cos(angle * options.attackPoints));
  const secondaryRipple = Math.sin(angle * options.attackPoints * 2 + options.attackPoints) * 0.5 + 0.5;
  const lobe = primaryLobe * (0.35 + options.attackBias * 0.65) + secondaryRipple * 0.18;

  return baseRadius * (1 + options.outerLobeStrength * lobe);
}

function getTipProfile(tipType: TipType, radius: number): { bottomRadius: number; topRadius: number } {
  if (tipType === 'sharp') {
    return { bottomRadius: radius * 0.035, topRadius: radius * 0.16 };
  }

  if (tipType === 'ball') {
    return { bottomRadius: radius * 0.09, topRadius: radius * 0.18 };
  }

  if (tipType === 'rubber' || tipType === 'flat') {
    return { bottomRadius: radius * 0.13, topRadius: radius * 0.2 };
  }

  return { bottomRadius: radius * 0.08, topRadius: radius * 0.18 };
}

function pointAt(radius: number, angle: number, z: number): Vertex {
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
    z,
  };
}

function segmentAngle(segment: number): number {
  return (segment / DEFAULT_SEGMENTS) * Math.PI * 2;
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

function sanitizeSolidName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
