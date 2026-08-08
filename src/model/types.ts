import type { Group } from 'three';

export type SupportedDesignFileType = 'stl' | 'obj';

export type UpAxis = 'z' | 'y';

export type Dimensions = {
  x: number;
  y: number;
  z: number;
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
