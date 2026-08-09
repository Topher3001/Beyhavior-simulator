import { sanitizePhysicsProfile } from './physicsProfile';
import type { Dimensions, PhysicsProfile, StoredDesign } from './types';

export const PROFILE_EXPORT_SCHEMA = 'beyblade-simulator.profile.v1';

export type ProfileExportV1 = {
  schema: typeof PROFILE_EXPORT_SCHEMA;
  exportedAt: string;
  displayName: string;
  fileName: string;
  fileType: StoredDesign['fileType'];
  rawDimensions: Dimensions;
  normalizedDimensions: Dimensions;
  scaleFactor: number;
  physicsProfile: PhysicsProfile;
};

export function createProfileExport(design: StoredDesign): ProfileExportV1 {
  return {
    schema: PROFILE_EXPORT_SCHEMA,
    exportedAt: new Date().toISOString(),
    displayName: design.displayName,
    fileName: design.fileName,
    fileType: design.fileType,
    rawDimensions: design.rawDimensions,
    normalizedDimensions: design.normalizedDimensions,
    scaleFactor: design.scaleFactor,
    physicsProfile: design.physicsProfile,
  };
}

export function parseProfileExport(text: string, updatedAt = new Date().toISOString()): ProfileExportV1 {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error('Profile import must be valid JSON.');
  }

  if (!isRecord(parsed) || parsed.schema !== PROFILE_EXPORT_SCHEMA) {
    throw new Error('Profile import uses an unsupported schema.');
  }

  if (!isRecord(parsed.physicsProfile)) {
    throw new Error('Profile import is missing physics settings.');
  }

  const physicsProfile = sanitizePhysicsProfile({
    ...(parsed.physicsProfile as PhysicsProfile),
    updatedAt,
  });

  return {
    schema: PROFILE_EXPORT_SCHEMA,
    exportedAt: requireString(parsed.exportedAt, 'Profile import is missing export date.'),
    displayName: requireString(parsed.displayName, 'Profile import is missing design name.'),
    fileName: requireString(parsed.fileName, 'Profile import is missing file name.'),
    fileType: parsed.fileType === 'stl' || parsed.fileType === 'obj' ? parsed.fileType : 'stl',
    rawDimensions: readDimensions(parsed.rawDimensions, 'raw dimensions'),
    normalizedDimensions: readDimensions(parsed.normalizedDimensions, 'normalized dimensions'),
    scaleFactor: readFiniteNumber(parsed.scaleFactor, 'scale factor'),
    physicsProfile,
  };
}

function readDimensions(value: unknown, label: string): Dimensions {
  if (!isRecord(value)) {
    throw new Error(`Profile import is missing ${label}.`);
  }

  return {
    x: readFiniteNumber(value.x, `${label} X`),
    y: readFiniteNumber(value.y, `${label} Y`),
    z: readFiniteNumber(value.z, `${label} Z`),
  };
}

function requireString(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(message);
  }

  return value;
}

function readFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Profile import has invalid ${label}.`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
