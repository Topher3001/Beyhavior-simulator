import {
  CylinderGeometry,
  DoubleSide,
  GridHelper,
  Group,
  Mesh,
  MeshStandardMaterial,
  TorusGeometry,
} from 'three';

export function createArena(): Group {
  const arena = new Group();
  arena.name = 'PrototypeArena';

  const floorMaterial = new MeshStandardMaterial({
    color: '#d8dde2',
    metalness: 0.08,
    roughness: 0.72,
  });

  const floor = new Mesh(new CylinderGeometry(5.6, 5.6, 0.12, 128), floorMaterial);
  floor.name = 'ArenaFloor';
  floor.receiveShadow = true;
  arena.add(floor);

  const rimMaterial = new MeshStandardMaterial({
    color: '#51616f',
    metalness: 0.18,
    roughness: 0.48,
  });

  const rim = new Mesh(new TorusGeometry(5.6, 0.18, 18, 160), rimMaterial);
  rim.name = 'ArenaRim';
  rim.position.y = 0.17;
  rim.rotation.x = Math.PI / 2;
  rim.castShadow = true;
  rim.receiveShadow = true;
  arena.add(rim);

  const centerMarkMaterial = new MeshStandardMaterial({
    color: '#f3f7f8',
    metalness: 0,
    roughness: 0.9,
    side: DoubleSide,
  });

  const centerMark = new Mesh(new CylinderGeometry(0.75, 0.75, 0.014, 96), centerMarkMaterial);
  centerMark.name = 'ArenaCenterMark';
  centerMark.position.y = 0.075;
  centerMark.receiveShadow = true;
  arena.add(centerMark);

  const grid = new GridHelper(10.8, 24, '#6c7a86', '#c3cbd1');
  grid.name = 'ArenaGridReference';
  grid.position.y = 0.086;
  arena.add(grid);

  return arena;
}
