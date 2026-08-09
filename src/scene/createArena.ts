import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  TorusGeometry,
} from 'three';
import {
  ARENA_SURFACE_Y,
  getActiveStadiumPreset,
  isAngleInsidePocket,
  type StadiumPreset,
} from '../simulation/stadiumConfig';

export function createArena(stadium = getActiveStadiumPreset()): Group {
  const arena = new Group();
  arena.name = `ReferenceArena-${stadium.id}`;

  const floorMaterial = new MeshStandardMaterial({
    color: stadium.id === 'xtreme-bx10' ? '#f3f6f2' : '#d8dde2',
    metalness: 0.08,
    roughness: 0.68,
    side: DoubleSide,
  });

  const floor = new Mesh(createDishFloorGeometry(stadium), floorMaterial);
  floor.name = 'ArenaDishFloor';
  floor.receiveShadow = true;
  arena.add(floor);

  const rimMaterial = new MeshStandardMaterial({
    color: stadium.id === 'xtreme-bx10' ? '#3ba861' : '#51616f',
    metalness: 0.18,
    roughness: 0.48,
  });

  addWallSegments(arena, rimMaterial, stadium);
  addPocketGuards(arena, rimMaterial, stadium);

  const ridgeMaterial = new MeshStandardMaterial({
    color: stadium.id === 'xtreme-bx10' ? '#49b66d' : '#9cadb8',
    metalness: 0.06,
    roughness: 0.62,
  });
  const tornadoRidge = new Mesh(new TorusGeometry(stadium.tornadoRidgeRadiusWorld, 0.036, 8, 128), ridgeMaterial);
  tornadoRidge.name = 'TornadoRidge';
  tornadoRidge.position.y = getDishSurfaceY(stadium.tornadoRidgeRadiusWorld / stadium.playRadiusWorld, stadium) + 0.032;
  tornadoRidge.rotation.x = Math.PI / 2;
  tornadoRidge.receiveShadow = true;
  arena.add(tornadoRidge);

  const centerMarkMaterial = new MeshStandardMaterial({
    color: '#f3f7f8',
    metalness: 0,
    roughness: 0.9,
    side: DoubleSide,
  });

  const centerMark = new Mesh(new CylinderGeometry(0.75, 0.75, 0.014, 96), centerMarkMaterial);
  centerMark.name = 'ArenaCenterMark';
  centerMark.position.y = getDishSurfaceY(0, stadium) + 0.012;
  centerMark.receiveShadow = true;
  arena.add(centerMark);

  return arena;
}

function addWallSegments(arena: Group, material: MeshStandardMaterial, stadium: StadiumPreset): void {
  const segmentCount = 72;
  const segmentLength = (Math.PI * 2 * stadium.wallRadiusWorld) / segmentCount;
  const wallSurfaceY = getDishSurfaceY(1, stadium);

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

function addPocketGuards(arena: Group, material: MeshStandardMaterial, stadium: StadiumPreset): void {
  const wallSurfaceY = getDishSurfaceY(1, stadium);

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
  const ringCount = 30;
  const segmentCount = 160;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let ring = 0; ring <= ringCount; ring += 1) {
    const radiusProgress = ring / ringCount;
    const radius = stadium.playRadiusWorld * radiusProgress;
    const y = getDishSurfaceY(radiusProgress, stadium);

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

      indices.push(lowerA, upperA, upperB, lowerA, upperB, lowerB);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

function getDishSurfaceY(radiusProgress: number, stadium: StadiumPreset): number {
  const bowlDepth = stadium.id === 'xtreme-bx10' ? 0.24 : 0.18;
  const rimLift = 0.05 * radiusProgress ** 3;
  const ridgeProgress = stadium.tornadoRidgeRadiusWorld / stadium.playRadiusWorld;
  const ridgeLift = Math.max(0, 1 - Math.abs(radiusProgress - ridgeProgress) / 0.035) * 0.035;

  return ARENA_SURFACE_Y - bowlDepth * (1 - radiusProgress ** 1.85) + rimLift + ridgeLift;
}
