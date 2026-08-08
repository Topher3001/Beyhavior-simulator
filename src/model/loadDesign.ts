import {
  Box3,
  BufferGeometry,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Vector3,
} from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import type { Dimensions, LoadedDesign, SupportedDesignFileType, UpAxis } from './types';

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const TARGET_HORIZONTAL_SIZE = 2.4;
const ARENA_SURFACE_Y = 0.1;

const defaultImportedMaterial = new MeshStandardMaterial({
  color: '#9fb8c8',
  metalness: 0.16,
  roughness: 0.46,
});

export async function loadDesignFile(file: File, upAxis: UpAxis): Promise<LoadedDesign> {
  validateFile(file);

  const fileType = getSupportedFileType(file.name);
  const parsedObject = await parseFileByType(file, fileType);
  prepareImportedObject(parsedObject);

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

  geometry.computeVertexNormals();

  const mesh = new Mesh(geometry, defaultImportedMaterial.clone());
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

function prepareImportedObject(object: Object3D): void {
  object.traverse((child) => {
    if (!isMesh(child)) {
      return;
    }

    child.castShadow = true;
    child.receiveShadow = true;

    if (!child.material || isEmptyMaterialArray(child.material)) {
      child.material = defaultImportedMaterial.clone();
    }
  });
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
