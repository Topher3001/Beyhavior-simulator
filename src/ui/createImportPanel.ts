import type { SimulatorScene } from '../scene/createScene';
import { loadDesignFile } from '../model/loadDesign';
import { createSampleStlFile } from '../model/sampleStl';
import type { Dimensions, LoadedDesign, UpAxis } from '../model/types';

type StatusTone = 'idle' | 'loading' | 'success' | 'error';

export function createImportPanel(simulatorScene: SimulatorScene): void {
  const fileInput = queryRequired<HTMLInputElement>('#design-file-input');
  const sampleButton = queryRequired<HTMLButtonElement>('#load-sample-button');
  const resetButton = queryRequired<HTMLButtonElement>('#reset-demo-button');
  const upAxisSelect = queryRequired<HTMLSelectElement>('#up-axis');
  const status = queryRequired<HTMLElement>('#import-status');
  const details = queryRequired<HTMLElement>('#design-details');
  const thumbnail = queryRequired<HTMLImageElement>('#design-thumbnail');
  const activeModelLabel = queryRequired<HTMLElement>('#active-model-label');
  const fileName = queryRequired<HTMLElement>('#detail-file-name');
  const fileType = queryRequired<HTMLElement>('#detail-file-type');
  const fileSize = queryRequired<HTMLElement>('#detail-file-size');
  const rawDimensions = queryRequired<HTMLElement>('#detail-raw-dimensions');
  const normalizedDimensions = queryRequired<HTMLElement>('#detail-normalized-dimensions');
  const scaleFactor = queryRequired<HTMLElement>('#detail-scale-factor');

  let lastSelectedFile: File | null = null;
  let isImporting = false;

  const setStatus = (message: string, tone: StatusTone) => {
    status.textContent = message;
    status.dataset.tone = tone;
  };

  const setBusy = (busy: boolean) => {
    isImporting = busy;
    fileInput.disabled = busy;
    sampleButton.disabled = busy;
    resetButton.disabled = busy;
    upAxisSelect.disabled = busy;
  };

  const importFile = async (file: File) => {
    if (isImporting) {
      return;
    }

    const upAxis = upAxisSelect.value as UpAxis;

    setBusy(true);
    setStatus(`Importing ${file.name}...`, 'loading');

    try {
      const design = await loadDesignFile(file, upAxis);
      simulatorScene.setImportedDesign(design);
      await waitForFrame();
      design.thumbnailDataUrl = simulatorScene.captureThumbnail();
      renderDesignDetails(design);
      lastSelectedFile = file;
      activeModelLabel.textContent = design.fileName;
      resetButton.hidden = false;
      setStatus('Imported visual model.', 'success');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to import this file.', 'error');
    } finally {
      setBusy(false);
      fileInput.value = '';
    }
  };

  const renderDesignDetails = (design: LoadedDesign) => {
    thumbnail.src = design.thumbnailDataUrl;
    fileName.textContent = design.fileName;
    fileType.textContent = design.fileType.toUpperCase();
    fileSize.textContent = formatFileSize(design.fileSizeBytes);
    rawDimensions.textContent = formatDimensions(design.rawDimensions);
    normalizedDimensions.textContent = formatDimensions(design.normalizedDimensions);
    scaleFactor.textContent = design.scaleFactor.toFixed(4);
    details.hidden = false;
  };

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.item(0);

    if (file) {
      void importFile(file);
    }
  });

  sampleButton.addEventListener('click', () => {
    void importFile(createSampleStlFile());
  });

  resetButton.addEventListener('click', () => {
    simulatorScene.resetToDemoTop();
    lastSelectedFile = null;
    activeModelLabel.textContent = 'Demo Top';
    details.hidden = true;
    thumbnail.removeAttribute('src');
    resetButton.hidden = true;
    setStatus('Demo top restored.', 'idle');
  });

  upAxisSelect.addEventListener('change', () => {
    if (lastSelectedFile) {
      void importFile(lastSelectedFile);
    }
  });
}

function queryRequired<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Missing element: ${selector}`);
  }

  return element;
}

function waitForFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function formatDimensions(dimensions: Dimensions): string {
  return `${formatNumber(dimensions.x)} x ${formatNumber(dimensions.y)} x ${formatNumber(dimensions.z)}`;
}

function formatNumber(value: number): string {
  if (value >= 100) {
    return value.toFixed(1);
  }

  if (value >= 10) {
    return value.toFixed(2);
  }

  return value.toFixed(3);
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }

  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${bytes} B`;
}
