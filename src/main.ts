import './styles.css';
import { createScene } from './scene/createScene';
import { createImportPanel } from './ui/createImportPanel';

const app = document.querySelector<HTMLElement>('#app');

if (!app) {
  throw new Error('Missing app container.');
}

const simulatorScene = createScene(app);
createImportPanel(simulatorScene);

simulatorScene.start();

window.addEventListener('beforeunload', () => {
  simulatorScene.dispose();
});
