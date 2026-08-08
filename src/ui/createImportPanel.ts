import type { LoadedDesign, StoredDesign, StoredDesignMetadata, UpAxis } from '../model/types';
import { loadDesignFile } from '../model/loadDesign';
import { createSampleStlFile } from '../model/sampleStl';
import type { SimulatorScene } from '../scene/createScene';
import {
  deleteStoredDesign,
  getDefaultDisplayName,
  getStoredDesign,
  listStoredDesigns,
  renameStoredDesign,
  saveStoredDesign,
} from '../storage/designLibrary';

type StatusTone = 'idle' | 'loading' | 'success' | 'error';

type ActiveDesignState = {
  design: LoadedDesign;
  fileBlob: Blob;
  storedId: string | null;
};

export function createImportPanel(simulatorScene: SimulatorScene): void {
  const elements = getPanelElements();
  let activeDesignState: ActiveDesignState | null = null;
  let lastImportedFile: File | null = null;
  let savedDesigns: StoredDesignMetadata[] = [];
  let isBusy = false;

  const setImportStatus = (message: string, tone: StatusTone) => {
    elements.importStatus.textContent = message;
    elements.importStatus.dataset.tone = tone;
  };

  const setLibraryStatus = (message: string, tone: StatusTone) => {
    elements.libraryStatus.textContent = message;
    elements.libraryStatus.dataset.tone = tone;
  };

  const setBusy = (busy: boolean) => {
    isBusy = busy;
    elements.fileInput.disabled = busy;
    elements.sampleButton.disabled = busy;
    elements.resetButton.disabled = busy;
    elements.upAxisSelect.disabled = busy;
    elements.saveButton.disabled = busy || !activeDesignState || Boolean(activeDesignState.storedId);
    elements.libraryList.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      button.disabled = busy;
    });
    elements.libraryList.querySelectorAll<HTMLInputElement>('input').forEach((input) => {
      input.disabled = busy;
    });
  };

  const switchTab = (tab: 'import' | 'library') => {
    const isImportTab = tab === 'import';
    elements.importTabButton.setAttribute('aria-selected', String(isImportTab));
    elements.libraryTabButton.setAttribute('aria-selected', String(!isImportTab));
    elements.importPane.hidden = !isImportTab;
    elements.libraryPane.hidden = isImportTab;
  };

  const refreshLibrary = async () => {
    try {
      savedDesigns = await listStoredDesigns();
      renderLibrary(savedDesigns, elements, activeDesignState?.storedId ?? null);
      setLibraryStatus(
        savedDesigns.length === 0 ? 'No saved designs.' : `${savedDesigns.length} saved design${savedDesigns.length === 1 ? '' : 's'}.`,
        'idle',
      );
    } catch (error) {
      setLibraryStatus(getErrorMessage(error, 'Unable to load saved designs.'), 'error');
    }
  };

  const importFile = async (file: File) => {
    if (isBusy) {
      return;
    }

    const upAxis = elements.upAxisSelect.value as UpAxis;

    setBusy(true);
    setImportStatus(`Importing ${file.name}...`, 'loading');

    try {
      const design = await loadDesignFile(file, upAxis);
      simulatorScene.setImportedDesign(design);
      await waitForFrame();
      design.thumbnailDataUrl = simulatorScene.captureThumbnail();

      activeDesignState = {
        design,
        fileBlob: file,
        storedId: null,
      };
      lastImportedFile = file;

      renderDesignDetails(design, elements);
      renderSaveControls(design, elements, null);
      elements.activeModelLabel.textContent = design.fileName;
      elements.resetButton.hidden = false;
      setImportStatus('Imported visual model. Unsaved.', 'success');
      renderLibrary(savedDesigns, elements, null);
    } catch (error) {
      setImportStatus(getErrorMessage(error, 'Unable to import this file.'), 'error');
    } finally {
      setBusy(false);
      elements.fileInput.value = '';
    }
  };

  const saveActiveDesign = async () => {
    if (!activeDesignState || activeDesignState.storedId || isBusy) {
      return;
    }

    setBusy(true);
    setImportStatus('Saving design...', 'loading');

    try {
      const metadata = await saveStoredDesign(
        activeDesignState.design,
        activeDesignState.fileBlob,
        elements.saveNameInput.value,
      );

      activeDesignState = {
        ...activeDesignState,
        storedId: metadata.id,
      };

      elements.activeModelLabel.textContent = metadata.displayName;
      renderSaveControls(activeDesignState.design, elements, metadata);
      setImportStatus('Saved to local design library.', 'success');
      await refreshLibrary();
    } catch (error) {
      setImportStatus(getErrorMessage(error, 'Unable to save this design.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const loadStoredDesign = async (id: string) => {
    if (isBusy) {
      return;
    }

    setBusy(true);
    setLibraryStatus('Loading saved design...', 'loading');

    try {
      const storedDesign = await getStoredDesign(id);

      if (!storedDesign) {
        throw new Error('This saved design no longer exists.');
      }

      const designFile = new File([storedDesign.fileBlob], storedDesign.fileName, {
        type: storedDesign.fileBlob.type || getStoredFileMimeType(storedDesign),
      });
      const loadedDesign = await loadDesignFile(designFile, storedDesign.sourceUpAxis);
      loadedDesign.id = storedDesign.id;
      loadedDesign.thumbnailDataUrl = storedDesign.thumbnailDataUrl;

      simulatorScene.setImportedDesign(loadedDesign);
      activeDesignState = {
        design: loadedDesign,
        fileBlob: storedDesign.fileBlob,
        storedId: storedDesign.id,
      };
      lastImportedFile = null;

      elements.upAxisSelect.value = storedDesign.sourceUpAxis;
      elements.activeModelLabel.textContent = storedDesign.displayName;
      elements.resetButton.hidden = false;
      renderStoredDesignDetails(storedDesign, elements);
      renderSaveControls(loadedDesign, elements, storedDesign);
      setLibraryStatus('Loaded saved design.', 'success');
      setImportStatus('Loaded saved design from library.', 'success');
      renderLibrary(savedDesigns, elements, storedDesign.id);
    } catch (error) {
      await refreshLibrary();
      setLibraryStatus(getErrorMessage(error, 'Unable to load this saved design.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const renameDesign = async (id: string, input: HTMLInputElement) => {
    if (isBusy) {
      return;
    }

    setBusy(true);
    setLibraryStatus('Renaming design...', 'loading');

    try {
      const metadata = await renameStoredDesign(id, input.value);

      if (activeDesignState?.storedId === metadata.id) {
        elements.activeModelLabel.textContent = metadata.displayName;
        elements.saveNameInput.value = metadata.displayName;
      }

      await refreshLibrary();
      setLibraryStatus('Design renamed.', 'success');
    } catch (error) {
      setLibraryStatus(getErrorMessage(error, 'Unable to rename this design.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const deleteDesign = async (id: string) => {
    if (isBusy) {
      return;
    }

    const design = savedDesigns.find((item) => item.id === id);
    const displayName = design?.displayName ?? 'this design';

    if (!window.confirm(`Delete "${displayName}" from the local design library?`)) {
      return;
    }

    setBusy(true);
    setLibraryStatus('Deleting design...', 'loading');

    try {
      await deleteStoredDesign(id);

      if (activeDesignState?.storedId === id) {
        resetToDemo('Deleted active saved design.');
      }

      await refreshLibrary();
      setLibraryStatus('Design deleted.', 'success');
    } catch (error) {
      setLibraryStatus(getErrorMessage(error, 'Unable to delete this design.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const resetToDemo = (message = 'Demo top restored.') => {
    simulatorScene.resetToDemoTop();
    activeDesignState = null;
    lastImportedFile = null;
    elements.activeModelLabel.textContent = 'Demo Top';
    elements.designDetails.hidden = true;
    elements.thumbnail.removeAttribute('src');
    elements.resetButton.hidden = true;
    elements.saveControls.hidden = true;
    setImportStatus(message, 'idle');
    renderLibrary(savedDesigns, elements, null);
  };

  elements.importTabButton.addEventListener('click', () => switchTab('import'));
  elements.libraryTabButton.addEventListener('click', () => {
    switchTab('library');
    void refreshLibrary();
  });

  elements.fileInput.addEventListener('change', () => {
    const file = elements.fileInput.files?.item(0);

    if (file) {
      void importFile(file);
    }
  });

  elements.sampleButton.addEventListener('click', () => {
    void importFile(createSampleStlFile());
  });

  elements.resetButton.addEventListener('click', () => resetToDemo());
  elements.saveButton.addEventListener('click', () => void saveActiveDesign());
  elements.saveNameInput.addEventListener('input', () => {
    if (!activeDesignState?.storedId) {
      elements.saveButton.disabled = isBusy || elements.saveNameInput.value.trim().length === 0;
    }
  });

  elements.upAxisSelect.addEventListener('change', () => {
    if (lastImportedFile) {
      void importFile(lastImportedFile);
    }
  });

  elements.libraryList.addEventListener('click', (event) => {
    const target = event.target;

    if (!(target instanceof HTMLElement)) {
      return;
    }

    const actionElement = target.closest<HTMLElement>('[data-action]');

    if (!actionElement) {
      return;
    }

    const id = actionElement.dataset.designId;

    if (!id) {
      return;
    }

    if (actionElement.dataset.action === 'load') {
      void loadStoredDesign(id);
    }

    if (actionElement.dataset.action === 'rename') {
      const input = elements.libraryList.querySelector<HTMLInputElement>(`input[data-design-id="${id}"]`);

      if (input) {
        void renameDesign(id, input);
      }
    }

    if (actionElement.dataset.action === 'delete') {
      void deleteDesign(id);
    }
  });

  elements.libraryList.addEventListener('keydown', (event) => {
    const target = event.target;

    if (!(target instanceof HTMLInputElement) || event.key !== 'Enter') {
      return;
    }

    const id = target.dataset.designId;

    if (id) {
      void renameDesign(id, target);
    }
  });

  void refreshLibrary();
}

function getPanelElements() {
  return {
    importTabButton: queryRequired<HTMLButtonElement>('#import-tab-button'),
    libraryTabButton: queryRequired<HTMLButtonElement>('#library-tab-button'),
    importPane: queryRequired<HTMLElement>('#import-pane'),
    libraryPane: queryRequired<HTMLElement>('#library-pane'),
    fileInput: queryRequired<HTMLInputElement>('#design-file-input'),
    sampleButton: queryRequired<HTMLButtonElement>('#load-sample-button'),
    resetButton: queryRequired<HTMLButtonElement>('#reset-demo-button'),
    upAxisSelect: queryRequired<HTMLSelectElement>('#up-axis'),
    importStatus: queryRequired<HTMLElement>('#import-status'),
    libraryStatus: queryRequired<HTMLElement>('#library-status'),
    libraryList: queryRequired<HTMLElement>('#library-list'),
    libraryEmptyState: queryRequired<HTMLElement>('#library-empty-state'),
    saveControls: queryRequired<HTMLElement>('#save-controls'),
    saveNameInput: queryRequired<HTMLInputElement>('#save-name-input'),
    saveButton: queryRequired<HTMLButtonElement>('#save-design-button'),
    savedStateLabel: queryRequired<HTMLElement>('#saved-state-label'),
    designDetails: queryRequired<HTMLElement>('#design-details'),
    thumbnail: queryRequired<HTMLImageElement>('#design-thumbnail'),
    activeModelLabel: queryRequired<HTMLElement>('#active-model-label'),
    fileName: queryRequired<HTMLElement>('#detail-file-name'),
    fileType: queryRequired<HTMLElement>('#detail-file-type'),
    fileSize: queryRequired<HTMLElement>('#detail-file-size'),
    rawDimensions: queryRequired<HTMLElement>('#detail-raw-dimensions'),
    normalizedDimensions: queryRequired<HTMLElement>('#detail-normalized-dimensions'),
    scaleFactor: queryRequired<HTMLElement>('#detail-scale-factor'),
  };
}

function renderLibrary(
  designs: StoredDesignMetadata[],
  elements: ReturnType<typeof getPanelElements>,
  activeStoredId: string | null,
): void {
  elements.libraryList.replaceChildren();
  elements.libraryEmptyState.hidden = designs.length > 0;

  for (const design of designs) {
    const card = document.createElement('article');
    card.className = 'library-card';
    card.dataset.active = String(design.id === activeStoredId);

    const thumbnail = document.createElement('img');
    thumbnail.src = design.thumbnailDataUrl;
    thumbnail.alt = `${design.displayName} thumbnail`;
    thumbnail.className = 'library-thumbnail';

    const body = document.createElement('div');
    body.className = 'library-card-body';

    const input = document.createElement('input');
    input.className = 'library-name-input';
    input.type = 'text';
    input.maxLength = 80;
    input.value = design.displayName;
    input.dataset.designId = design.id;
    input.setAttribute('aria-label', `Rename ${design.displayName}`);

    const metadata = document.createElement('p');
    metadata.className = 'library-metadata';
    metadata.textContent = `${design.fileType.toUpperCase()} · ${formatDate(design.updatedAt)}`;

    const actions = document.createElement('div');
    actions.className = 'library-actions';

    const loadButton = createLibraryButton('Load', 'load', design.id, 'button-primary');
    const renameButton = createLibraryButton('Rename', 'rename', design.id);
    const deleteButton = createLibraryButton('Delete', 'delete', design.id, 'button-danger');

    actions.append(loadButton, renameButton, deleteButton);
    body.append(input, metadata, actions);
    card.append(thumbnail, body);
    elements.libraryList.append(card);
  }
}

function createLibraryButton(label: string, action: string, id: string, modifierClass?: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = modifierClass ? `button ${modifierClass}` : 'button';
  button.textContent = label;
  button.dataset.action = action;
  button.dataset.designId = id;

  return button;
}

function renderDesignDetails(design: LoadedDesign, elements: ReturnType<typeof getPanelElements>): void {
  elements.thumbnail.src = design.thumbnailDataUrl;
  elements.fileName.textContent = design.fileName;
  elements.fileType.textContent = design.fileType.toUpperCase();
  elements.fileSize.textContent = formatFileSize(design.fileSizeBytes);
  elements.rawDimensions.textContent = formatDimensions(design.rawDimensions);
  elements.normalizedDimensions.textContent = formatDimensions(design.normalizedDimensions);
  elements.scaleFactor.textContent = design.scaleFactor.toFixed(4);
  elements.designDetails.hidden = false;
}

function renderStoredDesignDetails(
  design: StoredDesign,
  elements: ReturnType<typeof getPanelElements>,
): void {
  elements.thumbnail.src = design.thumbnailDataUrl;
  elements.fileName.textContent = design.fileName;
  elements.fileType.textContent = design.fileType.toUpperCase();
  elements.fileSize.textContent = formatFileSize(design.fileSizeBytes);
  elements.rawDimensions.textContent = formatDimensions(design.rawDimensions);
  elements.normalizedDimensions.textContent = formatDimensions(design.normalizedDimensions);
  elements.scaleFactor.textContent = design.scaleFactor.toFixed(4);
  elements.designDetails.hidden = false;
}

function renderSaveControls(
  design: LoadedDesign,
  elements: ReturnType<typeof getPanelElements>,
  storedDesign: StoredDesignMetadata | null,
): void {
  elements.saveControls.hidden = false;

  if (storedDesign) {
    elements.saveNameInput.value = storedDesign.displayName;
    elements.saveButton.disabled = true;
    elements.saveButton.textContent = 'Saved';
    elements.savedStateLabel.textContent = 'Saved in local library';
    elements.savedStateLabel.dataset.tone = 'saved';
    return;
  }

  elements.saveNameInput.value = getDefaultDisplayName(design.fileName);
  elements.saveButton.disabled = false;
  elements.saveButton.textContent = 'Save Design';
  elements.savedStateLabel.textContent = 'Unsaved';
  elements.savedStateLabel.dataset.tone = 'unsaved';
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

function getStoredFileMimeType(design: StoredDesign): string {
  return design.fileType === 'stl' ? 'model/stl' : 'text/plain';
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function formatDimensions(dimensions: { x: number; y: number; z: number }): string {
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

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}
