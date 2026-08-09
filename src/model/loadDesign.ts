import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Vector3,
} from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import {
  createReferenceBeybladeFile,
  getReferenceBeybladePresetByFileName,
} from './referenceBeyblades';
import type { Dimensions, LoadedDesign, SupportedDesignFileType, UpAxis } from './types';

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const TARGET_HORIZONTAL_SIZE = 0.95;
const ARENA_SURFACE_Y = 0.1;

const generatedMaterialBase = {
  color: '#f7fbff',
  emissive: '#162027',
  emissiveIntensity: 0.08,
  metalness: 0.36,
  roughness: 0.31,
  side: DoubleSide,
  vertexColors: true,
};

const generatedPalette = [
  new Color('#d13f4b'),
  new Color('#2f8fbd'),
  new Color('#f2b705'),
  new Color('#f5f0df'),
];

const lowerPalette = {
  driver: new Color('#263038'),
  shadow: new Color('#11181d'),
  accent: new Color('#f2b705'),
};

export async function loadDesignFile(file: File, upAxis: UpAxis): Promise<LoadedDesign> {
  validateFile(file);

  const fileType = getSupportedFileType(file.name);
  const fileForParsing = getDisplayFile(file);
  const parsedObject = await parseFileByType(fileForParsing, fileType);
  prepareImportedObject(parsedObject, upAxis);

  const rawDimensions = getObjectDimensions(parsedObject);
  const { object, scaleFactor } = normalizeImportedObject(parsedObject, upAxis);
  const normalizedDimensions = getObjectDimensions(object);

  return {
    id: crypto.randomUUID(),
    fileName: file.name,
    fileType,
    fileSizeBytes: file.size,
    sourceUpAxis: upAxis,
    rawDimensions,
    normalizedDimensions,
    scaleFactor,
    object,
    thumbnailDataUrl: '',
  };
}

function getDisplayFile(file: File): File {
  const referencePreset = getReferenceBeybladePresetByFileName(file.name);

  return referencePreset ? createReferenceBeybladeFile(referencePreset) : file;
}

export function getSupportedFileType(fileName: string): SupportedDesignFileType {
  const extension = fileName.split('.').pop()?.toLowerCase();

  if (extension === 'stl' || extension === 'obj') {
    return extension;
  }

  throw new Error('Unsupported file type. Import an STL or OBJ file.');
}

function validateFile(file: File): void {
  if (file.size === 0) {
    throw new Error('This file is empty. Choose a valid STL or OBJ file.');
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error('This file is larger than 50 MB. Use a smaller STL or OBJ file.');
  }
}

async function parseFileByType(file: File, fileType: SupportedDesignFileType): Promise<Group> {
  if (fileType === 'stl') {
    return parseStlFile(file);
  }

  return parseObjFile(file);
}

async function parseStlFile(file: File): Promise<Group> {
  const loader = new STLLoader();
  const buffer = await readFileAsArrayBuffer(file);
  let geometry: BufferGeometry;

  try {
    geometry = loader.parse(buffer) as BufferGeometry;
  } catch {
    throw new Error('Unable to parse this STL file. Check that it is a valid STL export.');
  }

  if (!geometry.attributes.position || geometry.attributes.position.count === 0) {
    throw new Error('The STL file did not contain any visible geometry.');
  }

  const mesh = new Mesh(geometry, createGeneratedImportedMaterial());
  mesh.name = 'ImportedSTLMesh';

  const group = new Group();
  group.name = 'ImportedSTLDesign';
  group.add(mesh);

  return group;
}

async function parseObjFile(file: File): Promise<Group> {
  const loader = new OBJLoader();
  const text = await readFileAsText(file);
  let group: Group;

  try {
    group = loader.parse(text);
  } catch {
    throw new Error('Unable to parse this OBJ file. Check that it is a valid OBJ export.');
  }

  group.name = 'ImportedOBJDesign';

  let meshCount = 0;
  group.traverse((child) => {
    if (isMesh(child)) {
      meshCount += 1;
    }
  });

  if (meshCount === 0) {
    throw new Error('The OBJ file did not contain any visible mesh geometry.');
  }

  return group;
}

function normalizeImportedObject(sourceObject: Group, upAxis: UpAxis): { object: Group; scaleFactor: number } {
  const normalizedRoot = new Group();
  normalizedRoot.name = 'NormalizedImportedDesign';
  normalizedRoot.add(sourceObject);

  if (upAxis === 'z') {
    normalizedRoot.rotation.x = -Math.PI / 2;
  }

  normalizedRoot.updateMatrixWorld(true);

  const orientedBox = getObjectBounds(normalizedRoot);
  const orientedSize = orientedBox.getSize(new Vector3());
  const largestHorizontalSize = Math.max(orientedSize.x, orientedSize.z);
  const scaleFactor = largestHorizontalSize > 0 ? TARGET_HORIZONTAL_SIZE / largestHorizontalSize : 1;

  normalizedRoot.scale.setScalar(scaleFactor);
  normalizedRoot.updateMatrixWorld(true);

  const scaledBox = getObjectBounds(normalizedRoot);
  const scaledCenter = scaledBox.getCenter(new Vector3());

  normalizedRoot.position.set(
    -scaledCenter.x,
    ARENA_SURFACE_Y - scaledBox.min.y,
    -scaledCenter.z,
  );
  normalizedRoot.updateMatrixWorld(true);

  return { object: normalizedRoot, scaleFactor };
}

function prepareImportedObject(object: Object3D, upAxis: UpAxis): void {
  let meshIndex = 0;

  object.traverse((child) => {
    if (!isMesh(child)) {
      return;
    }

    child.castShadow = true;
    child.receiveShadow = true;

    if (shouldApplyGeneratedStyle(child.material) || shouldApplyMissingGeneratedVertexColors(child)) {
      child.geometry.computeVertexNormals();
      applyGeneratedVertexColors(child.geometry, meshIndex, upAxis);
      child.material = createGeneratedImportedMaterial();
    }

    meshIndex += 1;
  });
}

function createGeneratedImportedMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial(generatedMaterialBase);
}

function applyGeneratedVertexColors(geometry: BufferGeometry, seed: number, upAxis: UpAxis): void {
  const position = geometry.getAttribute('position');

  if (!position) {
    return;
  }

  geometry.computeBoundingBox();

  const bounds = geometry.boundingBox;

  if (!bounds) {
    return;
  }

  const center = bounds.getCenter(new Vector3());
  const size = bounds.getSize(new Vector3());
  const maxRadius = (upAxis === 'z' ? Math.max(size.x, size.y, 0.001) : Math.max(size.x, size.z, 0.001)) / 2;
  const height = Math.max(upAxis === 'z' ? size.z : size.y, 0.001);
  const colors = new Float32Array(position.count * 3);
  const workingColor = new Color();

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const vertical = upAxis === 'z' ? z : y;
    const verticalMin = upAxis === 'z' ? bounds.min.z : bounds.min.y;
    const horizontalA = upAxis === 'z' ? x - center.x : x - center.x;
    const horizontalB = upAxis === 'z' ? y - center.y : z - center.z;
    const yNorm = (vertical - verticalMin) / height;
    const radiusNorm = Math.min(Math.hypot(horizontalA, horizontalB) / maxRadius, 1);
    const angle = Math.atan2(horizontalB, horizontalA) + seed * 0.85;
    const sector = Math.abs(Math.floor(((angle + Math.PI) / (Math.PI * 2)) * generatedPalette.length)) % generatedPalette.length;

    if (yNorm < 0.16) {
      workingColor.copy(lowerPalette.driver).lerp(lowerPalette.shadow, radiusNorm * 0.45);
    } else if (yNorm < 0.28) {
      workingColor.copy(lowerPalette.accent).lerp(generatedPalette[sector], 0.28);
    } else {
      const stripe = Math.sin(angle * 4 + yNorm * Math.PI * 3) > 0 ? sector : (sector + 1) % generatedPalette.length;
      workingColor.copy(generatedPalette[stripe]).lerp(new Color('#ffffff'), 0.08 + yNorm * 0.1);
    }

    colors[index * 3] = workingColor.r;
    colors[index * 3 + 1] = workingColor.g;
    colors[index * 3 + 2] = workingColor.b;
  }

  geometry.setAttribute('color', new BufferAttribute(colors, 3));
}

function getObjectDimensions(object: Object3D): Dimensions {
  const bounds = getObjectBounds(object);
  const size = bounds.getSize(new Vector3());

  return {
    x: size.x,
    y: size.y,
    z: size.z,
  };
}

function getObjectBounds(object: Object3D): Box3 {
  const bounds = new Box3().setFromObject(object);

  if (bounds.isEmpty()) {
    throw new Error('The imported model has no measurable bounds.');
  }

  return bounds;
}

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result as ArrayBuffer));
    reader.addEventListener('error', () => reject(new Error('Unable to read this file.')));
    reader.readAsArrayBuffer(file);
  });
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result ?? '')));
    reader.addEventListener('error', () => reject(new Error('Unable to read this file.')));
    reader.readAsText(file);
  });
}

function isMesh(object: Object3D): object is Mesh {
  return (object as Mesh).isMesh === true;
}

function isEmptyMaterialArray(material: Material | Material[]): boolean {
  return Array.isArray(material) && material.length === 0;
}

function shouldApplyGeneratedStyle(material: Material | Material[] | undefined): boolean {
  if (!material || isEmptyMaterialArray(material)) {
    return true;
  }

  if (Array.isArray(material)) {
    return material.every(isPlainGeneratedCandidate);
  }

  return isPlainGeneratedCandidate(material);
}

function shouldApplyMissingGeneratedVertexColors(mesh: Mesh): boolean {
  if (mesh.geometry.getAttribute('color')) {
    return false;
  }

  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

  return materials.some((material) => (material as MeshStandardMaterial).vertexColors === true);
}

function isPlainGeneratedCandidate(material: Material): boolean {
  const maybeColored = material as Material & { color?: Color; map?: unknown };

  if (maybeColored.map) {
    return false;
  }

  if (material.name && !material.name.toLowerCase().includes('default')) {
    return false;
  }

  if (!maybeColored.color) {
    return false;
  }

  const hsl = {
    h: 0,
    s: 0,
    l: 0,
  };
  maybeColored.color.getHSL(hsl);

  return hsl.s < 0.14;
}
