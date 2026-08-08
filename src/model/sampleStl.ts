const SEGMENTS = 40;

type Vertex = {
  x: number;
  y: number;
  z: number;
};

type ProfileLevel = {
  radius: number;
  z: number;
};

const profile: ProfileLevel[] = [
  { radius: 0, z: 0 },
  { radius: 6, z: 4 },
  { radius: 18, z: 7 },
  { radius: 32, z: 10 },
  { radius: 28, z: 13 },
  { radius: 15, z: 16 },
  { radius: 8, z: 19 },
  { radius: 0, z: 21 },
];

export function createSampleStlFile(): File {
  const stl = createSampleStl();
  return new File([stl], 'sample-beyblade.stl', { type: 'model/stl' });
}

function createSampleStl(): string {
  const facets: string[] = ['solid sample_beyblade'];

  for (let levelIndex = 0; levelIndex < profile.length - 1; levelIndex += 1) {
    const lower = profile[levelIndex];
    const upper = profile[levelIndex + 1];

    for (let segment = 0; segment < SEGMENTS; segment += 1) {
      const nextSegment = (segment + 1) % SEGMENTS;
      const lowerA = pointOnLevel(lower, segment);
      const lowerB = pointOnLevel(lower, nextSegment);
      const upperA = pointOnLevel(upper, segment);
      const upperB = pointOnLevel(upper, nextSegment);

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

  facets.push('endsolid sample_beyblade');

  return facets.join('\n');
}

function pointOnLevel(level: ProfileLevel, segment: number): Vertex {
  const angle = (segment / SEGMENTS) * Math.PI * 2;

  return {
    x: Math.cos(angle) * level.radius,
    y: Math.sin(angle) * level.radius,
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
