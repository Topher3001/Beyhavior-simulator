import {
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  TorusGeometry,
} from 'three';
import {
  getActiveStadiumPreset,
  isAngleInsidePocket,
  type StadiumPreset,
} from '../simulation/stadiumConfig';
import {
  createStadiumDishSurface,
  getStadiumSurfaceYAt,
  getStadiumSurfaceYByProgress,
} from '../simulation/stadiumSurface';

type AngleSpan = {
  start: number;
  end: number;
};

const FULL_CIRCLE = Math.PI * 2;
const VISUAL_SEGMENTS_PER_CIRCLE = 256;

export function createArena(stadium = getActiveStadiumPreset()): Group {
  const arena = new Group();
  arena.name = `ReferenceArena-${stadium.id}`;

  const floorMaterial = new MeshStandardMaterial({
    color: '#ffffff',
    metalness: 0.03,
    roughness: 0.78,
    side: DoubleSide,
    vertexColors: true,
  });

  const floor = new Mesh(createDishFloorGeometry(stadium), floorMaterial);
  floor.name = 'ArenaDishFloor';
  floor.receiveShadow = true;
  arena.add(floor);

  addOuterBowlShell(arena, stadium);
  addFaintDomeGuides(arena, stadium);

  const rimMaterial = new MeshStandardMaterial({
    color: stadium.id === 'xtreme-bx10' ? '#3ba861' : '#51616f',
    metalness: 0.18,
    opacity: 0.82,
    roughness: 0.48,
    transparent: true,
  });

  addSmoothOuterLip(arena, rimMaterial, stadium);
  addSmoothWallArcs(arena, rimMaterial, stadium);
  addSmoothPocketGuards(arena, rimMaterial, stadium);
  addBowlContourRings(arena, stadium);

  const ridgeMaterial = new MeshStandardMaterial({
    color: stadium.id === 'xtreme-bx10' ? '#49b66d' : '#9cadb8',
    metalness: 0.06,
    roughness: 0.62,
  });
  const tornadoRidge = new Mesh(new TorusGeometry(stadium.tornadoRidgeRadiusWorld, 0.055, 10, 128), ridgeMaterial);
  tornadoRidge.name = 'TornadoRidge';
  tornadoRidge.position.y = getStadiumSurfaceYByProgress(stadium.tornadoRidgeRadiusWorld / stadium.playRadiusWorld, stadium) + 0.048;
  tornadoRidge.rotation.x = Math.PI / 2;
  tornadoRidge.receiveShadow = true;
  arena.add(tornadoRidge);

  const centerMarkMaterial = new MeshStandardMaterial({
    color: '#f3f7f8',
    metalness: 0,
    roughness: 0.9,
    side: DoubleSide,
  });

  const centerMark = new Mesh(new CylinderGeometry(0.48, 0.48, 0.012, 96), centerMarkMaterial);
  centerMark.name = 'ArenaCenterMark';
  centerMark.position.y = getStadiumSurfaceYAt(0, 0, stadium) + 0.012;
  centerMark.receiveShadow = true;
  arena.add(centerMark);

  return arena;
}

function addSmoothWallArcs(arena: Group, material: MeshStandardMaterial, stadium: StadiumPreset): void {
  const wallSurfaceY = getStadiumSurfaceYByProgress(1, stadium);
  const wallGeometrySpans = getOpenWallSpans(stadium, 1.5);

  for (const span of wallGeometrySpans) {
    const wall = new Mesh(
      createWallArcGeometry(
        span,
        stadium.wallRadiusWorld,
        stadium.wallThicknessWorld,
        wallSurfaceY,
        stadium.wallHeightWorld,
      ),
      material.clone(),
    );
    wall.name = 'ArenaSmoothWallArc';
    wall.castShadow = true;
    wall.receiveShadow = true;
    arena.add(wall);
  }
}

function addSmoothOuterLip(arena: Group, material: MeshStandardMaterial, stadium: StadiumPreset): void {
  const lipY = getStadiumSurfaceYByProgress(1, stadium) + 0.06;

  for (const span of getOpenWallSpans(stadium, -1)) {
    const lip = new Mesh(createLipArcGeometry(span, stadium.playRadiusWorld, lipY, 0.105), material.clone());
    lip.name = 'ArenaSmoothOuterLipArc';
    lip.castShadow = true;
    lip.receiveShadow = true;
    arena.add(lip);
  }
}

function addOuterBowlShell(arena: Group, stadium: StadiumPreset): void {
  const shellMaterial = new MeshStandardMaterial({
    color: stadium.id === 'xtreme-bx10' ? '#7aa883' : '#8797a1',
    metalness: 0.04,
    opacity: 0.42,
    roughness: 0.72,
    side: DoubleSide,
    transparent: true,
  });
  const shell = new Mesh(createOuterBowlShellGeometry(stadium), shellMaterial);
  shell.name = 'ArenaOuterBowlShell';
  shell.receiveShadow = true;
  arena.add(shell);
}

function addFaintDomeGuides(arena: Group, stadium: StadiumPreset): void {
  const domeMaterial = new MeshStandardMaterial({
    color: stadium.id === 'xtreme-bx10' ? '#b9e4c5' : '#c3d2db',
    metalness: 0,
    opacity: 0.13,
    roughness: 0.18,
    side: DoubleSide,
    transparent: true,
    depthWrite: false,
  });

  const outerDome = new Mesh(
    createDomeGuideGeometry(
      stadium.wallRadiusWorld + stadium.wallThicknessWorld + 0.46,
      getStadiumSurfaceYByProgress(1, stadium) - 0.04,
      stadium.wallHeightWorld + stadium.outerLipLiftWorld + 0.36,
      0.08,
    ),
    domeMaterial,
  );
  outerDome.name = 'ArenaFaintOuterDome';
  arena.add(outerDome);

  const innerDome = new Mesh(
    createDomeGuideGeometry(
      stadium.playRadiusWorld * 0.78,
      getStadiumSurfaceYByProgress(0, stadium) + 0.03,
      stadium.bowlDepthWorld * 0.42,
      0.38,
    ),
    domeMaterial.clone(),
  );
  innerDome.name = 'ArenaFaintInnerBowlDome';
  arena.add(innerDome);
}

function addSmoothPocketGuards(arena: Group, material: MeshStandardMaterial, stadium: StadiumPreset): void {
  const wallSurfaceY = getStadiumSurfaceYByProgress(1, stadium);

  for (const pocket of stadium.pockets) {
    const halfWidth = pocket.widthDegrees / 2;

    for (const side of [-1, 1]) {
      const angle = ((pocket.angleDegrees + side * halfWidth) * Math.PI) / 180;
      const guardLength = stadium.pocketGuardLengthWorld + pocket.depthWorld * 0.4;
      const guard = new Mesh(
        createPocketGuardRailGeometry(
          angle,
          stadium.wallRadiusWorld - stadium.wallThicknessWorld * 0.25,
          stadium.wallRadiusWorld + guardLength - 0.1,
          wallSurfaceY + stadium.wallHeightWorld * 0.68,
          stadium.wallThicknessWorld * 0.34,
        ),
        material.clone(),
      );
      guard.name = `${pocket.kind === 'xtreme' ? 'Xtreme' : 'Pocket'}SmoothGuardRail`;
      guard.castShadow = true;
      guard.receiveShadow = true;
      arena.add(guard);
    }
  }
}

function createDishFloorGeometry(stadium: StadiumPreset): BufferGeometry {
  const surface = createStadiumDishSurface(stadium);
  const geometry = new BufferGeometry();
  const colors = createDishVertexColors(surface.vertices, stadium);

  geometry.setAttribute('position', new BufferAttribute(surface.vertices, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.setIndex(new BufferAttribute(surface.indices, 1));
  geometry.computeVertexNormals();

  return geometry;
}

function createOuterBowlShellGeometry(stadium: StadiumPreset): BufferGeometry {
  const segmentCount = 192;
  const positions: number[] = [];
  const indices: number[] = [];
  const radius = stadium.playRadiusWorld + 0.075;
  const topY = getStadiumSurfaceYByProgress(1, stadium) + 0.02;
  const bottomY = getStadiumSurfaceYByProgress(0, stadium) - 0.16;

  for (let segment = 0; segment < segmentCount; segment += 1) {
    const angle = (segment / segmentCount) * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;

    positions.push(x, topY, z, x, bottomY, z);
  }

  for (let segment = 0; segment < segmentCount; segment += 1) {
    const nextSegment = (segment + 1) % segmentCount;
    const topA = segment * 2;
    const bottomA = topA + 1;
    const topB = nextSegment * 2;
    const bottomB = topB + 1;

    indices.push(topA, bottomA, topB, bottomA, bottomB, topB);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(new BufferAttribute(new Uint32Array(indices), 1));
  geometry.computeVertexNormals();

  return geometry;
}

function createWallArcGeometry(
  span: AngleSpan,
  centerRadius: number,
  thickness: number,
  bottomY: number,
  height: number,
): BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const innerRadius = centerRadius - thickness / 2;
  const outerRadius = centerRadius + thickness / 2;
  const topY = bottomY + height;
  const segmentCount = getArcSegmentCount(span);

  for (let index = 0; index <= segmentCount; index += 1) {
    const angle = span.start + ((span.end - span.start) * index) / segmentCount;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    positions.push(
      cos * innerRadius, bottomY, sin * innerRadius,
      cos * innerRadius, topY, sin * innerRadius,
      cos * outerRadius, bottomY, sin * outerRadius,
      cos * outerRadius, topY, sin * outerRadius,
    );
  }

  for (let index = 0; index < segmentCount; index += 1) {
    const current = index * 4;
    const next = current + 4;
    const innerBottom = current;
    const innerTop = current + 1;
    const outerBottom = current + 2;
    const outerTop = current + 3;
    const nextInnerBottom = next;
    const nextInnerTop = next + 1;
    const nextOuterBottom = next + 2;
    const nextOuterTop = next + 3;

    indices.push(
      innerBottom, nextInnerBottom, innerTop,
      innerTop, nextInnerBottom, nextInnerTop,
      outerBottom, outerTop, nextOuterBottom,
      outerTop, nextOuterTop, nextOuterBottom,
      innerTop, nextInnerTop, outerTop,
      outerTop, nextInnerTop, nextOuterTop,
      innerBottom, outerBottom, nextInnerBottom,
      outerBottom, nextOuterBottom, nextInnerBottom,
    );
  }

  addArcEndCap(indices, 0, false);
  addArcEndCap(indices, segmentCount * 4, true);

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(new BufferAttribute(new Uint32Array(indices), 1));
  geometry.computeVertexNormals();

  return geometry;
}

function createLipArcGeometry(span: AngleSpan, centerRadius: number, centerY: number, tubeRadius: number): BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const arcSegmentCount = getArcSegmentCount(span);
  const tubeSegmentCount = 14;

  for (let arcIndex = 0; arcIndex <= arcSegmentCount; arcIndex += 1) {
    const angle = span.start + ((span.end - span.start) * arcIndex) / arcSegmentCount;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    for (let tubeIndex = 0; tubeIndex < tubeSegmentCount; tubeIndex += 1) {
      const tubeAngle = (tubeIndex / tubeSegmentCount) * FULL_CIRCLE;
      const radius = centerRadius + Math.cos(tubeAngle) * tubeRadius;
      const y = centerY + Math.sin(tubeAngle) * tubeRadius;

      positions.push(cos * radius, y, sin * radius);
    }
  }

  for (let arcIndex = 0; arcIndex < arcSegmentCount; arcIndex += 1) {
    const current = arcIndex * tubeSegmentCount;
    const next = current + tubeSegmentCount;

    for (let tubeIndex = 0; tubeIndex < tubeSegmentCount; tubeIndex += 1) {
      const nextTubeIndex = (tubeIndex + 1) % tubeSegmentCount;

      indices.push(
        current + tubeIndex, next + tubeIndex, current + nextTubeIndex,
        current + nextTubeIndex, next + tubeIndex, next + nextTubeIndex,
      );
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(new BufferAttribute(new Uint32Array(indices), 1));
  geometry.computeVertexNormals();

  return geometry;
}

function createPocketGuardRailGeometry(
  angle: number,
  startRadius: number,
  endRadius: number,
  centerY: number,
  tubeRadius: number,
): BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const lengthSegmentCount = 28;
  const tubeSegmentCount = 12;
  const radialX = Math.cos(angle);
  const radialZ = Math.sin(angle);
  const tangentX = -Math.sin(angle);
  const tangentZ = Math.cos(angle);

  for (let lengthIndex = 0; lengthIndex <= lengthSegmentCount; lengthIndex += 1) {
    const progress = lengthIndex / lengthSegmentCount;
    const radius = startRadius + (endRadius - startRadius) * progress;
    const centerX = radialX * radius;
    const centerZ = radialZ * radius;

    for (let tubeIndex = 0; tubeIndex < tubeSegmentCount; tubeIndex += 1) {
      const tubeAngle = (tubeIndex / tubeSegmentCount) * FULL_CIRCLE;
      const horizontalOffset = Math.cos(tubeAngle) * tubeRadius;
      const verticalOffset = Math.sin(tubeAngle) * tubeRadius;

      positions.push(
        centerX + tangentX * horizontalOffset,
        centerY + verticalOffset,
        centerZ + tangentZ * horizontalOffset,
      );
    }
  }

  for (let lengthIndex = 0; lengthIndex < lengthSegmentCount; lengthIndex += 1) {
    const current = lengthIndex * tubeSegmentCount;
    const next = current + tubeSegmentCount;

    for (let tubeIndex = 0; tubeIndex < tubeSegmentCount; tubeIndex += 1) {
      const nextTubeIndex = (tubeIndex + 1) % tubeSegmentCount;

      indices.push(
        current + tubeIndex, next + tubeIndex, current + nextTubeIndex,
        current + nextTubeIndex, next + tubeIndex, next + nextTubeIndex,
      );
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(new BufferAttribute(new Uint32Array(indices), 1));
  geometry.computeVertexNormals();

  return geometry;
}

function createDomeGuideGeometry(
  radius: number,
  baseY: number,
  height: number,
  centerProgress: number,
): BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const ringCount = 24;
  const segmentCount = 192;

  positions.push(0, baseY + height, 0);

  for (let ring = 1; ring <= ringCount; ring += 1) {
    const progress = ring / ringCount;
    const ringRadius = radius * progress;
    const domeFalloff = 1 - progress ** 2;
    const y = baseY + height * Math.max(domeFalloff, 0) + Math.sin(progress * Math.PI) * height * centerProgress * 0.08;

    for (let segment = 0; segment < segmentCount; segment += 1) {
      const angle = (segment / segmentCount) * FULL_CIRCLE;

      positions.push(Math.cos(angle) * ringRadius, y, Math.sin(angle) * ringRadius);
    }
  }

  for (let segment = 0; segment < segmentCount; segment += 1) {
    const nextSegment = (segment + 1) % segmentCount;
    indices.push(0, 1 + segment, 1 + nextSegment);
  }

  for (let ring = 1; ring < ringCount; ring += 1) {
    const currentStart = 1 + (ring - 1) * segmentCount;
    const nextStart = 1 + ring * segmentCount;

    for (let segment = 0; segment < segmentCount; segment += 1) {
      const nextSegment = (segment + 1) % segmentCount;

      indices.push(
        currentStart + segment, nextStart + segment, currentStart + nextSegment,
        currentStart + nextSegment, nextStart + segment, nextStart + nextSegment,
      );
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(new BufferAttribute(new Uint32Array(indices), 1));
  geometry.computeVertexNormals();

  return geometry;
}

function addBowlContourRings(arena: Group, stadium: StadiumPreset): void {
  const ringMaterial = new MeshStandardMaterial({
    color: stadium.id === 'xtreme-bx10' ? '#8fba9a' : '#9eb1bc',
    metalness: 0.02,
    roughness: 0.78,
  });

  for (const progress of [0.22, 0.42, 0.62, 0.82]) {
    const radius = stadium.playRadiusWorld * progress;
    const ring = new Mesh(new TorusGeometry(radius, 0.012, 6, 144), ringMaterial.clone());
    ring.name = 'BowlSlopeContour';
    ring.position.y = getStadiumSurfaceYByProgress(progress, stadium) + 0.018;
    ring.rotation.x = Math.PI / 2;
    ring.receiveShadow = true;
    arena.add(ring);
  }
}

function createDishVertexColors(vertices: Float32Array, stadium: StadiumPreset): Float32Array {
  const colors = new Float32Array((vertices.length / 3) * 3);
  const centerColor = new Color(stadium.id === 'xtreme-bx10' ? '#8fb69a' : '#8fa4ae');
  const midColor = new Color(stadium.id === 'xtreme-bx10' ? '#dbece0' : '#dce6ea');
  const rimColor = new Color(stadium.id === 'xtreme-bx10' ? '#fbfffb' : '#f8fbfc');
  const ridgeColor = new Color(stadium.id === 'xtreme-bx10' ? '#79be86' : '#9fb4bf');
  const workingColor = new Color();
  const ridgeProgress = stadium.tornadoRidgeRadiusWorld / stadium.playRadiusWorld;
  const centerY = getStadiumSurfaceYByProgress(0, stadium);
  const rimY = getStadiumSurfaceYByProgress(1, stadium);

  for (let index = 0; index < vertices.length; index += 3) {
    const vertexIndex = index / 3;
    const x = vertices[index];
    const y = vertices[index + 1];
    const z = vertices[index + 2];
    const progress = Math.min(Math.hypot(x, z) / stadium.playRadiusWorld, 1);
    const edgeMix = Math.max(0, (progress - 0.66) / 0.34);
    const heightMix = Math.max(0, Math.min((y - centerY) / Math.max(rimY - centerY, 0.001), 1));

    workingColor.copy(centerColor).lerp(midColor, Math.min(progress * 1.25, 1));
    workingColor.lerp(rimColor, edgeMix * 0.82);

    if (Math.abs(progress - ridgeProgress) < 0.035) {
      workingColor.lerp(ridgeColor, 0.65);
    }

    workingColor.offsetHSL(0, 0, (heightMix - 0.5) * 0.16);
    colors[vertexIndex * 3] = workingColor.r;
    colors[vertexIndex * 3 + 1] = workingColor.g;
    colors[vertexIndex * 3 + 2] = workingColor.b;
  }

  return colors;
}

function getOpenWallSpans(stadium: StadiumPreset, gapPaddingDegrees: number): AngleSpan[] {
  const blockedIntervals = stadium.pockets
    .flatMap((pocket) => {
      const halfWidth = Math.max(pocket.widthDegrees / 2 + gapPaddingDegrees, 1);
      const center = normalizeRadians((pocket.angleDegrees * Math.PI) / 180);
      const start = normalizeRadians(center - degreesToRadians(halfWidth));
      const end = normalizeRadians(center + degreesToRadians(halfWidth));

      return start <= end
        ? [{ start, end }]
        : [{ start, end: FULL_CIRCLE }, { start: 0, end }];
    })
    .sort((left, right) => left.start - right.start);

  const mergedIntervals: AngleSpan[] = [];

  for (const interval of blockedIntervals) {
    const previous = mergedIntervals[mergedIntervals.length - 1];

    if (!previous || interval.start > previous.end) {
      mergedIntervals.push({ ...interval });
    } else {
      previous.end = Math.max(previous.end, interval.end);
    }
  }

  const spans: AngleSpan[] = [];
  let cursor = 0;

  for (const interval of mergedIntervals) {
    if (interval.start > cursor) {
      spans.push({ start: cursor, end: interval.start });
    }

    cursor = Math.max(cursor, interval.end);
  }

  if (cursor < FULL_CIRCLE) {
    spans.push({ start: cursor, end: FULL_CIRCLE });
  }

  return spans.length > 0 ? spans : [{ start: 0, end: FULL_CIRCLE }];
}

function getArcSegmentCount(span: AngleSpan): number {
  return Math.max(8, Math.ceil(((span.end - span.start) / FULL_CIRCLE) * VISUAL_SEGMENTS_PER_CIRCLE));
}

function addArcEndCap(indices: number[], startIndex: number, reverse: boolean): void {
  const innerBottom = startIndex;
  const innerTop = startIndex + 1;
  const outerBottom = startIndex + 2;
  const outerTop = startIndex + 3;

  if (reverse) {
    indices.push(innerBottom, innerTop, outerBottom, outerBottom, innerTop, outerTop);
    return;
  }

  indices.push(innerBottom, outerBottom, innerTop, innerTop, outerBottom, outerTop);
}

function normalizeRadians(value: number): number {
  return ((value % FULL_CIRCLE) + FULL_CIRCLE) % FULL_CIRCLE;
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
