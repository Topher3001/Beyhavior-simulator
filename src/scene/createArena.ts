import {
  BoxGeometry,
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

  const rimMaterial = new MeshStandardMaterial({
    color: stadium.id === 'xtreme-bx10' ? '#3ba861' : '#51616f',
    metalness: 0.18,
    opacity: 0.82,
    roughness: 0.48,
    transparent: true,
  });

  addOuterLipRing(arena, rimMaterial, stadium);
  addWallSegments(arena, rimMaterial, stadium);
  addPocketGuards(arena, rimMaterial, stadium);
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

function addWallSegments(arena: Group, material: MeshStandardMaterial, stadium: StadiumPreset): void {
  const segmentCount = 72;
  const segmentLength = (Math.PI * 2 * stadium.wallRadiusWorld) / segmentCount;
  const wallSurfaceY = getStadiumSurfaceYByProgress(1, stadium);

  for (let index = 0; index < segmentCount; index += 1) {
    const angle = (index / segmentCount) * Math.PI * 2;
    const angleDegrees = (angle * 180) / Math.PI;

    if (stadium.pockets.some((pocket) => isAngleInsidePocket(angleDegrees, pocket))) {
      continue;
    }

    const wall = new Mesh(
      new BoxGeometry(segmentLength * 1.02, stadium.wallHeightWorld, stadium.wallThicknessWorld),
      material,
    );
    wall.name = 'ArenaWallSegment';
    wall.position.set(
      Math.cos(angle) * stadium.wallRadiusWorld,
      wallSurfaceY + stadium.wallHeightWorld / 2,
      Math.sin(angle) * stadium.wallRadiusWorld,
    );
    wall.rotation.y = -angle;
    wall.castShadow = true;
    wall.receiveShadow = true;
    arena.add(wall);
  }
}

function addOuterLipRing(arena: Group, material: MeshStandardMaterial, stadium: StadiumPreset): void {
  const lip = new Mesh(new TorusGeometry(stadium.playRadiusWorld, 0.105, 12, 192), material.clone());
  lip.name = 'ArenaRoundedOuterLip';
  lip.position.y = getStadiumSurfaceYByProgress(1, stadium) + 0.06;
  lip.rotation.x = Math.PI / 2;
  lip.castShadow = true;
  lip.receiveShadow = true;
  arena.add(lip);
}

function addPocketGuards(arena: Group, material: MeshStandardMaterial, stadium: StadiumPreset): void {
  const wallSurfaceY = getStadiumSurfaceYByProgress(1, stadium);

  for (const pocket of stadium.pockets) {
    const halfWidth = pocket.widthDegrees / 2;

    for (const side of [-1, 1]) {
      const angle = ((pocket.angleDegrees + side * halfWidth) * Math.PI) / 180;
      const guardLength = stadium.pocketGuardLengthWorld + pocket.depthWorld * 0.4;
      const radialCenter = stadium.wallRadiusWorld + guardLength / 2 - 0.1;
      const guard = new Mesh(
        new BoxGeometry(guardLength, stadium.wallHeightWorld, stadium.wallThicknessWorld),
        material,
      );
      guard.name = `${pocket.kind === 'xtreme' ? 'Xtreme' : 'Pocket'}Guard`;
      guard.position.set(
        Math.cos(angle) * radialCenter,
        wallSurfaceY + stadium.wallHeightWorld / 2,
        Math.sin(angle) * radialCenter,
      );
      guard.rotation.y = angle;
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
  const centerColor = new Color(stadium.id === 'xtreme-bx10' ? '#b9cabc' : '#aebcc4');
  const midColor = new Color(stadium.id === 'xtreme-bx10' ? '#eef7ef' : '#e4ebee');
  const rimColor = new Color(stadium.id === 'xtreme-bx10' ? '#fbfffb' : '#f8fbfc');
  const ridgeColor = new Color(stadium.id === 'xtreme-bx10' ? '#79be86' : '#9fb4bf');
  const workingColor = new Color();
  const ridgeProgress = stadium.tornadoRidgeRadiusWorld / stadium.playRadiusWorld;

  for (let index = 0; index < vertices.length; index += 3) {
    const vertexIndex = index / 3;
    const x = vertices[index];
    const y = vertices[index + 1];
    const z = vertices[index + 2];
    const progress = Math.min(Math.hypot(x, z) / stadium.playRadiusWorld, 1);
    const edgeMix = Math.max(0, (progress - 0.66) / 0.34);
    const heightMix = Math.max(0, Math.min((y - (0.1 - stadium.bowlDepthWorld)) / stadium.bowlDepthWorld, 1));

    workingColor.copy(centerColor).lerp(midColor, Math.min(progress * 1.25, 1));
    workingColor.lerp(rimColor, edgeMix * 0.65);

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
