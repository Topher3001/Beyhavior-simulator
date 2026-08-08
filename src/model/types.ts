import type { Group } from 'three';

export type SupportedDesignFileType = 'stl' | 'obj';

export type UpAxis = 'z' | 'y';

export type Dimensions = {
  x: number;
  y: number;
  z: number;
};

export type Vector3Mm = {
  x: number;
  y: number;
  z: number;
};

export type LaunchPosition = {
  x: number;
  z: number;
};

export type TipType = 'flat' | 'sharp' | 'ball' | 'rubber' | 'custom';

export type PhysicsProfile = {
  weightGrams: number;
  radiusMm: number;
  heightMm: number;
  centerOfMassOffsetMm: Vector3Mm;
  tipType: TipType;
  tipFrictionCoefficient: number;
  ringFrictionCoefficient: number;
  airDragCoefficient: number;
  spinDampingCoefficient: number;
  defaultLaunchRpm: number;
  defaultLaunchAngleDegrees: number;
  defaultLaunchPosition: LaunchPosition;
  updatedAt: string;
};

export type LoadedDesign = {
  id: string;
  fileName: string;
  fileType: SupportedDesignFileType;
  fileSizeBytes: number;
  sourceUpAxis: UpAxis;
  rawDimensions: Dimensions;
  normalizedDimensions: Dimensions;
  scaleFactor: number;
  object: Group;
  thumbnailDataUrl: string;
};

export type StoredDesign = {
  id: string;
  displayName: string;
  fileName: string;
  fileType: SupportedDesignFileType;
  fileSizeBytes: number;
  sourceUpAxis: UpAxis;
  fileBlob: Blob;
  thumbnailDataUrl: string;
  rawDimensions: Dimensions;
  normalizedDimensions: Dimensions;
  scaleFactor: number;
  physicsProfile: PhysicsProfile;
  createdAt: string;
  updatedAt: string;
};

export type StoredDesignMetadata = Omit<StoredDesign, 'fileBlob'>;
