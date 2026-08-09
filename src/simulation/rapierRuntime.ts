import RAPIER from '@dimforge/rapier3d-compat';

let rapierReady: Promise<typeof RAPIER> | null = null;

export function getRapier(): Promise<typeof RAPIER> {
  rapierReady ??= RAPIER.init().then(() => RAPIER);

  return rapierReady;
}
