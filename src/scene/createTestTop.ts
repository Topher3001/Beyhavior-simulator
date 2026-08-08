import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
} from 'three';

export type TestTop = {
  object: Group;
  update: (deltaSeconds: number, elapsedSeconds: number) => void;
};

export function createTestTop(): TestTop {
  const top = new Group();
  top.name = 'PrimitiveBeybladeTop';
  top.position.y = 0.14;

  const ringMaterial = new MeshStandardMaterial({
    color: '#d13f4b',
    metalness: 0.28,
    roughness: 0.34,
  });

  const coreMaterial = new MeshStandardMaterial({
    color: '#f5f0df',
    metalness: 0.12,
    roughness: 0.42,
  });

  const accentMaterial = new MeshStandardMaterial({
    color: '#2f8fbd',
    metalness: 0.22,
    roughness: 0.38,
  });

  const tipMaterial = new MeshStandardMaterial({
    color: '#2f3437',
    metalness: 0.32,
    roughness: 0.5,
  });

  const ring = new Mesh(new TorusGeometry(1.16, 0.22, 20, 128), ringMaterial);
  ring.name = 'OuterAttackRing';
  ring.position.y = 0.78;
  ring.rotation.x = Math.PI / 2;
  ring.castShadow = true;
  ring.receiveShadow = true;
  top.add(ring);

  const body = new Mesh(new CylinderGeometry(0.98, 1.08, 0.46, 80), coreMaterial);
  body.name = 'MainBody';
  body.position.y = 0.77;
  body.castShadow = true;
  body.receiveShadow = true;
  top.add(body);

  const cap = new Mesh(new CylinderGeometry(0.45, 0.62, 0.3, 64), accentMaterial);
  cap.name = 'EnergyCap';
  cap.position.y = 1.15;
  cap.castShadow = true;
  cap.receiveShadow = true;
  top.add(cap);

  const balanceMark = new Mesh(new BoxGeometry(0.18, 0.08, 0.48), accentMaterial);
  balanceMark.name = 'VisibleSpinMarker';
  balanceMark.position.set(1.05, 0.94, 0);
  balanceMark.castShadow = true;
  balanceMark.receiveShadow = true;
  top.add(balanceMark);

  const lowerBody = new Mesh(new ConeGeometry(0.74, 0.42, 64), coreMaterial);
  lowerBody.name = 'LowerBody';
  lowerBody.position.y = 0.44;
  lowerBody.rotation.x = Math.PI;
  lowerBody.castShadow = true;
  lowerBody.receiveShadow = true;
  top.add(lowerBody);

  const tip = new Mesh(new ConeGeometry(0.18, 0.42, 40), tipMaterial);
  tip.name = 'DriverTip';
  tip.position.y = 0.16;
  tip.rotation.x = Math.PI;
  tip.castShadow = true;
  top.add(tip);

  const tipContact = new Mesh(new SphereGeometry(0.08, 24, 16), tipMaterial);
  tipContact.name = 'TipContactPoint';
  tipContact.position.y = -0.06;
  tipContact.castShadow = true;
  top.add(tipContact);

  return {
    object: top,
    update: (deltaSeconds, elapsedSeconds) => {
      top.rotation.y += deltaSeconds * 7.5;
      top.rotation.z = Math.sin(elapsedSeconds * 1.7) * 0.055;
    },
  };
}
