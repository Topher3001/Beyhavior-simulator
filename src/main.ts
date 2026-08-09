import './styles.css';
import { createScene } from './scene/createScene';
import {
  getActiveStadiumPreset,
  STADIUM_PRESETS,
  type StadiumPreset,
} from './simulation/stadiumConfig';
import { createImportPanel } from './ui/createImportPanel';

const app = document.querySelector<HTMLElement>('#app');

if (!app) {
  throw new Error('Missing app container.');
}

const simulatorScene = createScene(app);
createImportPanel(simulatorScene);
createStadiumSelector(simulatorScene);

simulatorScene.start();

window.addEventListener('beforeunload', () => {
  simulatorScene.dispose();
});

function createStadiumSelector(simulatorScene: ReturnType<typeof createScene>): void {
  const select = queryRequired<HTMLSelectElement>('#stadium-preset-select');
  const summary = queryRequired<HTMLElement>('#stadium-preset-summary');

  for (const preset of STADIUM_PRESETS) {
    const option = document.createElement('option');
    option.value = preset.id;
    option.textContent = preset.label;
    select.append(option);
  }

  select.value = getActiveStadiumPreset().id;
  renderStadiumSummary(getActiveStadiumPreset(), summary);

  select.addEventListener('change', () => {
    const preset = simulatorScene.setStadiumPreset(select.value);
    renderStadiumSummary(preset, summary);
    window.dispatchEvent(new CustomEvent('stadiumchange', { detail: { presetId: preset.id } }));
  });
}

function renderStadiumSummary(preset: StadiumPreset, element: HTMLElement): void {
  const pocketLabel = preset.pockets.length === 1 ? 'pocket' : 'pockets';
  const dimensions = `${preset.dimensionsCm.length} x ${preset.dimensionsCm.width} x ${preset.dimensionsCm.height} cm`;

  element.textContent = `${preset.sourceLabel}. ${dimensions}, ${preset.pockets.length} ${pocketLabel}.`;
}

function queryRequired<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Missing element: ${selector}`);
  }

  return element;
}
