import {
  AmbientLight,
  Box3,
  BoxHelper,
  Clock,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Scene,
  Sphere,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { LoadedDesign, Vector3Mm } from '../model/types';
import {
  getActiveStadiumPreset,
  setActiveStadiumPreset,
  type StadiumPreset,
} from '../simulation/stadiumConfig';
import { getStadiumSurfaceYAt } from '../simulation/stadiumSurface';
import type { BattleSide, SimulationTransform } from '../simulation/types';
import { createArena } from './createArena';
import { createTestTop } from './createTestTop';

type FrameUpdateCallback = (deltaSeconds: number, elapsedSeconds: number) => void;

export type SimulatorScene = {
  start: () => void;
  setStadiumPreset: (presetId: string) => StadiumPreset;
  setImportedDesign: (design: LoadedDesign) => void;
  resetToDemoTop: () => void;
  setFrameUpdate: (callback: FrameUpdateCallback | null) => void;
  setSimulationTransform: (design: LoadedDesign, transform: SimulationTransform) => void;
  setSimulationMode: (active: boolean) => void;
  setBattleDesigns: (left: LoadedDesign, right: LoadedDesign) => void;
  setBattleTransform: (side: BattleSide, transform: SimulationTransform) => void;
  setBattleMode: (active: boolean) => void;
  clearBattleMode: () => void;
  setCenterOfMassMarker: (offsetMm: Vector3Mm, design: LoadedDesign) => void;
  clearCenterOfMassMarker: () => void;
  captureThumbnail: () => string;
  dispose: () => void;
};

const ARENA_SURFACE_Y = 0.1;

export function createScene(container: HTMLElement): SimulatorScene {
  const scene = new Scene();
  scene.name = 'BeybladePrototypeScene';
  scene.background = new Color('#eef1f3');

  const camera = new PerspectiveCamera(48, 1, 0.1, 100);
  camera.name = 'MainCamera';
  camera.position.set(7.8, 3.6, 8.4);
  camera.lookAt(new Vector3(0, -0.08, 0));

  const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.domElement.className = 'viewport-canvas';
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, -0.08, 0);
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.minDistance = 4;
  controls.maxDistance = 18;
  controls.update();

  const ambientLight = new AmbientLight('#ffffff', 1.35);
  scene.add(ambientLight);

  const hemisphereLight = new HemisphereLight('#f7fbff', '#9aa3a8', 1.1);
  scene.add(hemisphereLight);

  const keyLight = new DirectionalLight('#ffffff', 2.8);
  keyLight.name = 'KeyLight';
  keyLight.position.set(4.5, 8, 3.5);
  keyLight.castShadow = true;
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 18;
  keyLight.shadow.camera.left = -7;
  keyLight.shadow.camera.right = 7;
  keyLight.shadow.camera.top = 7;
  keyLight.shadow.camera.bottom = -7;
  scene.add(keyLight);

  let activeStadium = getActiveStadiumPreset();
  let arena = createArena(activeStadium);
  scene.add(arena);

  const testTop = createTestTop();
  alignDemoTopToStadium();
  scene.add(testTop.object);

  let importedDesignObject: Object3D | null = null;
  let activeImportedDesign: LoadedDesign | null = null;
  let importedBoundsHelper: BoxHelper | null = null;
  let battleDesignObjects: Partial<Record<BattleSide, Object3D>> = {};
  let battleBoundsHelpers: BoxHelper[] = [];
  let centerOfMassMarker: Group | null = null;
  let thumbnailTarget: Object3D = testTop.object;
  let frameUpdate: FrameUpdateCallback | null = null;
  let isSimulationModeActive = false;
  const clock = new Clock();
  let animationFrameId = 0;
  let disposed = false;

  const resize = () => {
    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  const render = () => {
    if (disposed) {
      return;
    }

    const delta = clock.getDelta();
    const elapsed = clock.elapsedTime;

    if (testTop.object.visible) {
      testTop.update(delta, elapsed);
    }

    frameUpdate?.(delta, elapsed);
    if (importedBoundsHelper?.visible) {
      importedBoundsHelper.update();
    }

    controls.update();
    renderScene();
    animationFrameId = window.requestAnimationFrame(render);
  };

  const renderScene = () => {
    renderer.render(scene, camera);
  };

  const ensureCenterOfMassMarker = () => {
    if (centerOfMassMarker) {
      return centerOfMassMarker;
    }

    centerOfMassMarker = createCenterOfMassMarker();
    scene.add(centerOfMassMarker);

    return centerOfMassMarker;
  };

  const clearCenterOfMassMarker = () => {
    if (!centerOfMassMarker) {
      return;
    }

    scene.remove(centerOfMassMarker);
    disposeObject(centerOfMassMarker);
    centerOfMassMarker = null;
    renderScene();
  };

  const removeImportedDesign = () => {
    clearCenterOfMassMarker();
    activeImportedDesign = null;
    isSimulationModeActive = false;

    if (importedBoundsHelper) {
      scene.remove(importedBoundsHelper);
      importedBoundsHelper.geometry.dispose();
      disposeMaterial(importedBoundsHelper.material);
      importedBoundsHelper = null;
    }

    if (importedDesignObject) {
      scene.remove(importedDesignObject);
      disposeObject(importedDesignObject);
      importedDesignObject = null;
    }
  };

  const removeBattleDesigns = () => {
    battleBoundsHelpers.forEach((helper) => {
      scene.remove(helper);
      helper.geometry.dispose();
      disposeMaterial(helper.material);
    });
    battleBoundsHelpers = [];

    (Object.keys(battleDesignObjects) as BattleSide[]).forEach((side) => {
      const object = battleDesignObjects[side];

      if (!object) {
        return;
      }

      scene.remove(object);
      disposeObject(object);
    });

    battleDesignObjects = {};
    isSimulationModeActive = false;
  };

  const fitCameraToObject = (object: Object3D, padding = 1.45) => {
    const bounds = new Box3().setFromObject(object);

    if (bounds.isEmpty()) {
      return;
    }

    const sphere = bounds.getBoundingSphere(new Sphere());
    const direction = new Vector3(1.1, 0.72, 1).normalize();
    const fovRadians = (camera.fov * Math.PI) / 180;
    const distance = Math.max((sphere.radius / Math.sin(fovRadians / 2)) * padding, 4.2);

    camera.position.copy(sphere.center).add(direction.multiplyScalar(distance));
    camera.near = Math.max(distance / 100, 0.01);
    camera.far = Math.max(distance * 100, 100);
    camera.updateProjectionMatrix();
    controls.target.copy(sphere.center);
    controls.update();
  };

  const fitCameraToObjects = (objects: Object3D[], padding = 1.45) => {
    const bounds = new Box3();

    objects.forEach((object) => {
      bounds.union(new Box3().setFromObject(object));
    });

    if (bounds.isEmpty()) {
      return;
    }

    const sphere = bounds.getBoundingSphere(new Sphere());
    const direction = new Vector3(1.1, 0.72, 1).normalize();
    const fovRadians = (camera.fov * Math.PI) / 180;
    const distance = Math.max((sphere.radius / Math.sin(fovRadians / 2)) * padding, 4.2);

    camera.position.copy(sphere.center).add(direction.multiplyScalar(distance));
    camera.near = Math.max(distance / 100, 0.01);
    camera.far = Math.max(distance * 100, 100);
    camera.updateProjectionMatrix();
    controls.target.copy(sphere.center);
    controls.update();
  };

  const setDefaultCameraView = () => {
    camera.near = 0.1;
    camera.far = 100;
    camera.position.set(7.8, 3.6, 8.4);
    camera.updateProjectionMatrix();
    controls.target.set(0, -0.08, 0);
    controls.update();
  };

  function alignDemoTopToStadium(): void {
    testTop.object.position.y = getStadiumSurfaceYAt(0, 0, activeStadium) + 0.065;
  }

  function getPreviewYOffset(x: number, z: number): number {
    return getStadiumSurfaceYAt(x, z, activeStadium) - ARENA_SURFACE_Y;
  }

  return {
    start: () => {
      clock.start();
      render();
    },
    setStadiumPreset: (presetId) => {
      const preset = setActiveStadiumPreset(presetId);
      activeStadium = preset;
      scene.remove(arena);
      disposeObject(arena);
      arena = createArena(preset);
      scene.add(arena);
      alignDemoTopToStadium();

      if (importedDesignObject && !isSimulationModeActive) {
        importedDesignObject.position.y = getPreviewYOffset(0, 0);
      }

      for (const side of Object.keys(battleDesignObjects) as BattleSide[]) {
        const object = battleDesignObjects[side];

        if (object && !isSimulationModeActive) {
          const x = side === 'left' ? -1.4 : 1.4;
          object.position.y = getPreviewYOffset(x, 0);
        }
      }

      renderScene();

      return preset;
    },
    setImportedDesign: (design) => {
      removeBattleDesigns();
      removeImportedDesign();
      testTop.object.visible = false;
      activeImportedDesign = design;

      const simulationAnchor = new Group();
      simulationAnchor.name = 'ImportedDesignSimulationAnchor';
      simulationAnchor.add(design.object);
      simulationAnchor.position.y = getPreviewYOffset(0, 0);

      importedDesignObject = simulationAnchor;
      importedBoundsHelper = new BoxHelper(simulationAnchor, '#238fbd');
      thumbnailTarget = simulationAnchor;
      scene.add(simulationAnchor);
      scene.add(importedBoundsHelper);
      setDefaultCameraView();
      renderScene();
    },
    resetToDemoTop: () => {
      removeImportedDesign();
      removeBattleDesigns();
      testTop.object.visible = true;
      testTop.object.rotation.set(0, 0, 0);
      alignDemoTopToStadium();
      thumbnailTarget = testTop.object;
      setDefaultCameraView();
      renderScene();
    },
    setFrameUpdate: (callback) => {
      frameUpdate = callback;
    },
    setSimulationTransform: (design, transform) => {
      if (design !== activeImportedDesign || !importedDesignObject) {
        return;
      }

      importedDesignObject.position.set(transform.position.x, transform.position.y, transform.position.z);
      importedDesignObject.quaternion.set(
        transform.quaternion.x,
        transform.quaternion.y,
        transform.quaternion.z,
        transform.quaternion.w,
      );
      if (importedBoundsHelper?.visible) {
        importedBoundsHelper.update();
      }
    },
    setSimulationMode: (active) => {
      isSimulationModeActive = active;

      if (centerOfMassMarker) {
        centerOfMassMarker.visible = !active;
      }

      if (importedBoundsHelper) {
        importedBoundsHelper.visible = !active;
      }

      renderScene();
    },
    setBattleDesigns: (left, right) => {
      removeImportedDesign();
      removeBattleDesigns();
      clearCenterOfMassMarker();
      testTop.object.visible = false;

      const leftAnchor = createBattleAnchor('left', left);
      const rightAnchor = createBattleAnchor('right', right);
      leftAnchor.position.set(-1.4, getPreviewYOffset(-1.4, 0), 0);
      rightAnchor.position.set(1.4, getPreviewYOffset(1.4, 0), 0);

      battleDesignObjects = {
        left: leftAnchor,
        right: rightAnchor,
      };

      const leftHelper = new BoxHelper(leftAnchor, '#bb3340');
      const rightHelper = new BoxHelper(rightAnchor, '#238fbd');
      battleBoundsHelpers = [leftHelper, rightHelper];
      scene.add(leftAnchor, rightAnchor, leftHelper, rightHelper);
      thumbnailTarget = leftAnchor;
      setDefaultCameraView();
      renderScene();
    },
    setBattleTransform: (side, transform) => {
      const object = battleDesignObjects[side];

      if (!object) {
        return;
      }

      object.position.set(transform.position.x, transform.position.y, transform.position.z);
      object.quaternion.set(
        transform.quaternion.x,
        transform.quaternion.y,
        transform.quaternion.z,
        transform.quaternion.w,
      );
      battleBoundsHelpers.forEach((helper) => {
        if (helper.visible) {
          helper.update();
        }
      });
    },
    setBattleMode: (active) => {
      isSimulationModeActive = active;

      if (centerOfMassMarker) {
        centerOfMassMarker.visible = false;
      }

      battleBoundsHelpers.forEach((helper) => {
        helper.visible = !active;
      });
      renderScene();
    },
    clearBattleMode: () => {
      removeBattleDesigns();
      renderScene();
    },
    setCenterOfMassMarker: (offsetMm, design) => {
      const marker = ensureCenterOfMassMarker();
      const designScale = Number.isFinite(design.scaleFactor) && design.scaleFactor > 0 ? design.scaleFactor : 1;

      marker.position.set(
        offsetMm.x * designScale,
        getStadiumSurfaceYAt(0, 0, activeStadium) + offsetMm.y * designScale,
        offsetMm.z * designScale,
      );
      marker.visible = !isSimulationModeActive;
      renderScene();
    },
    clearCenterOfMassMarker,
    captureThumbnail: () => {
      const previousPosition = camera.position.clone();
      const previousTarget = controls.target.clone();
      const previousNear = camera.near;
      const previousFar = camera.far;

      fitCameraToObject(thumbnailTarget, 1.65);
      renderScene();
      const dataUrl = renderer.domElement.toDataURL('image/png');

      camera.position.copy(previousPosition);
      camera.near = previousNear;
      camera.far = previousFar;
      camera.updateProjectionMatrix();
      controls.target.copy(previousTarget);
      controls.update();
      renderScene();

      return dataUrl;
    },
    dispose: () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      removeImportedDesign();
      removeBattleDesigns();
      scene.remove(arena);
      disposeObject(arena);
      disposeObject(testTop.object);
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

function createCenterOfMassMarker(): Group {
  const marker = new Group();
  marker.name = 'CenterOfMassMarker';

  const coreMaterial = new MeshStandardMaterial({
    color: '#f2b705',
    emissive: '#7a3f00',
    emissiveIntensity: 0.22,
    metalness: 0.15,
    roughness: 0.32,
  });

  const ringMaterial = new MeshStandardMaterial({
    color: '#1f2a31',
    emissive: '#f2b705',
    emissiveIntensity: 0.08,
    metalness: 0.1,
    roughness: 0.42,
  });

  const core = new Mesh(new SphereGeometry(0.075, 24, 16), coreMaterial);
  core.name = 'CenterOfMassCore';
  core.castShadow = true;

  const horizontalRing = new Mesh(new TorusGeometry(0.13, 0.006, 8, 32), ringMaterial.clone());
  horizontalRing.name = 'CenterOfMassHorizontalRing';
  horizontalRing.rotation.x = Math.PI / 2;

  const verticalRing = new Mesh(new TorusGeometry(0.13, 0.006, 8, 32), ringMaterial);
  verticalRing.name = 'CenterOfMassVerticalRing';
  verticalRing.rotation.y = Math.PI / 2;

  marker.add(core, horizontalRing, verticalRing);

  return marker;
}

function createBattleAnchor(side: BattleSide, design: LoadedDesign): Group {
  const anchor = new Group();
  anchor.name = side === 'left' ? 'BattleLeftDesignAnchor' : 'BattleRightDesignAnchor';
  anchor.add(design.object);

  return anchor;
}

function disposeObject(object: Object3D): void {
  object.traverse((child) => {
    if (!isMesh(child)) {
      return;
    }

    child.geometry.dispose();
    disposeMaterial(child.material);
  });
}

function disposeMaterial(material: Material | Material[]): void {
  if (Array.isArray(material)) {
    material.forEach((item) => item.dispose());
    return;
  }

  material.dispose();
}

function isMesh(object: Object3D): object is Mesh {
  return (object as Mesh).isMesh === true;
}
