import { createProceduralBeybladeStl } from './proceduralBeybladeStl';

export function createSampleStlFile(): File {
  const stl = createProceduralBeybladeStl({
    solidName: 'sample_beyblade',
    diameterMm: 49,
    heightMm: 40,
    attackPoints: 3,
    attackBias: 0.82,
    tipType: 'flat',
  });

  return new File([stl], 'sample-beyblade.stl', { type: 'model/stl' });
}
