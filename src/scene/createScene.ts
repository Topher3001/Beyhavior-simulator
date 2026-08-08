import {
  AmbientLight,
  Box3,
  BoxHelper,
  Clock,
  Color,
  DirectionalLight,
  HemisphereLight,
  Material,
  Mesh,
  Object3D,
  PerspectiveCamera,
  Scene,
  Sphere,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { LoadedDesign } from '../model/types';
import { createArena } from './createArena';
import { createTestTop } from './createTestTop';

export type SimulatorScene = {
  start: () => void;
  setImportedDesign: (design: LoadedDesign) => void;
  resetToDemoTop: () => void;
  captureThumbnail: () => string;
  dispose: () => void;
};

export function createScene(container: HTMLElement): SimulatorScene {
  const scene = new Scene();
  scene.name = 'BeybladePrototypeScene';
  scene.background = new Color('#eef1f3');

  const camera = new PerspectiveCamera(48, 1, 0.1, 100);
  camera.name = 'MainCamera';
  camera.position.set(7.8, 5.2, 8.4);
  camera.lookAt(new Vector3(0, 0.75, 0));

  const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.domElement.className = 'viewport-canvas';
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 0.65, 0);
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

  const arena = createArena();
  scene.add(arena);

  const testTop = createTestTop();
  scene.add(testTop.object);

  let importedDesignObject: Object3D | null = null;
  let importedBoundsHelper: BoxHelper | null = null;
  let thumbnailTarget: Object3D = testTop.object;
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

    importedBoundsHelper?.update();
    controls.update();
    renderScene();
    animationFrameId = window.requestAnimationFrame(render);
  };

  const renderScene = () => {
    renderer.render(scene, camera);
  };

  const removeImportedDesign = () => {
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

  const setDefaultCameraView = () => {
    camera.near = 0.1;
    camera.far = 100;
    camera.position.set(7.8, 5.2, 8.4);
    camera.updateProjectionMatrix();
    controls.target.set(0, 0.65, 0);
    controls.update();
  };

  return {
    start: () => {
      clock.start();
      render();
    },
    setImportedDesign: (design) => {
      removeImportedDesign();
      testTop.object.visible = false;
      importedDesignObject = design.object;
      importedBoundsHelper = new BoxHelper(design.object, '#238fbd');
      thumbnailTarget = design.object;
      scene.add(design.object);
      scene.add(importedBoundsHelper);
      fitCameraToObject(design.object);
      renderScene();
    },
    resetToDemoTop: () => {
      removeImportedDesign();
      testTop.object.visible = true;
      testTop.object.rotation.set(0, 0, 0);
      thumbnailTarget = testTop.object;
      setDefaultCameraView();
      renderScene();
    },
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
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
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
