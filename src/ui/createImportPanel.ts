import { sanitizePhysicsProfile } from '../model/physicsProfile';
import type {
  LoadedDesign,
  PhysicsProfile,
  StoredDesign,
  StoredDesignMetadata,
  TipType,
  UpAxis,
} from '../model/types';
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
  updatePhysicsProfile,
} from '../storage/designLibrary';

type StatusTone = 'idle' | 'loading' | 'success' | 'error';
type DesignTab = 'import' | 'library' | 'physics';

type ActiveDesignState = {
  design: LoadedDesign;
  fileBlob: Blob;
  storedId: string | null;
  physicsProfile: PhysicsProfile | null;
};

export function createImportPanel(simulatorScene: SimulatorScene): void {
  const elements = getPanelElements();
  let activeDesignState: ActiveDesignState | null = null;
  let lastImportedFile: File | null = null;
  let savedDesigns: StoredDesignMetadata[] = [];
  let isBusy = false;

  const canEditPhysics = () => Boolean(activeDesignState?.storedId && activeDesignState.physicsProfile);

  const setImportStatus = (message: string, tone: StatusTone) => {
    elements.importStatus.textContent = message;
    elements.importStatus.dataset.tone = tone;
  };

  const setLibraryStatus = (message: string, tone: StatusTone) => {
    elements.libraryStatus.textContent = message;
    elements.libraryStatus.dataset.tone = tone;
  };

  const setPhysicsStatus = (message: string, tone: StatusTone) => {
    elements.physicsStatus.textContent = message;
    elements.physicsStatus.dataset.tone = tone;
  };

  const updatePhysicsSaveButton = () => {
    elements.savePhysicsButton.disabled = isBusy || !canEditPhysics() || elements.physicsSaveState.dataset.tone !== 'unsaved';
  };

  const setPhysicsDirtyState = (dirty: boolean) => {
    elements.physicsSaveState.textContent = dirty ? 'Unsaved changes' : 'Saved';
    elements.physicsSaveState.dataset.tone = dirty ? 'unsaved' : 'saved';
    updatePhysicsSaveButton();
  };

  const setPhysicsUnavailable = (message: string) => {
    elements.physicsTabButton.disabled = true;
    elements.physicsProfileForm.hidden = true;
    setPhysicsStatus(message, 'idle');
    setPhysicsDirtyState(false);

    if (!elements.physicsPane.hidden) {
      switchTab('import');
    }
  };

  const setPhysicsFormDisabled = (disabled: boolean) => {
    elements.physicsProfileForm.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select').forEach((control) => {
      control.disabled = disabled;
    });
  };

  const setBusy = (busy: boolean) => {
    isBusy = busy;
    elements.fileInput.disabled = busy;
    elements.sampleButton.disabled = busy;
    elements.resetButton.disabled = busy;
    elements.upAxisSelect.disabled = busy;
    elements.saveButton.disabled = busy || !activeDesignState || Boolean(activeDesignState.storedId) || elements.saveNameInput.value.trim().length === 0;
    setPhysicsFormDisabled(busy || !canEditPhysics());
    updatePhysicsSaveButton();
    elements.libraryList.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      button.disabled = busy;
    });
    elements.libraryList.querySelectorAll<HTMLInputElement>('input').forEach((input) => {
      input.disabled = busy;
    });
  };

  const switchTab = (tab: DesignTab) => {
    if (tab === 'physics' && elements.physicsTabButton.disabled) {
      return;
    }

    elements.importTabButton.setAttribute('aria-selected', String(tab === 'import'));
    elements.libraryTabButton.setAttribute('aria-selected', String(tab === 'library'));
    elements.physicsTabButton.setAttribute('aria-selected', String(tab === 'physics'));
    elements.importPane.hidden = tab !== 'import';
    elements.libraryPane.hidden = tab !== 'library';
    elements.physicsPane.hidden = tab !== 'physics';
  };

  const renderActivePhysicsProfile = (profile: PhysicsProfile) => {
    elements.physicsTabButton.disabled = false;
    elements.physicsProfileForm.hidden = false;
    renderPhysicsProfile(profile, elements);
    setPhysicsStatus('Physics profile ready.', 'idle');
    setPhysicsDirtyState(false);
    setPhysicsFormDisabled(isBusy);

    if (activeDesignState) {
      simulatorScene.setCenterOfMassMarker(profile.centerOfMassOffsetMm, activeDesignState.design);
    }
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
      simulatorScene.clearCenterOfMassMarker();
      await waitForFrame();
      design.thumbnailDataUrl = simulatorScene.captureThumbnail();

      activeDesignState = {
        design,
        fileBlob: file,
        storedId: null,
        physicsProfile: null,
      };
      lastImportedFile = file;

      renderDesignDetails(design, elements);
      renderSaveControls(design, elements, null);
      elements.activeModelLabel.textContent = design.fileName;
      elements.resetButton.hidden = false;
      setPhysicsUnavailable('Save this design before editing physics.');
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
        physicsProfile: metadata.physicsProfile,
      };

      elements.activeModelLabel.textContent = metadata.displayName;
      renderSaveControls(activeDesignState.design, elements, metadata);
      renderActivePhysicsProfile(metadata.physicsProfile);
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
        physicsProfile: storedDesign.physicsProfile,
      };
      lastImportedFile = null;

      elements.upAxisSelect.value = storedDesign.sourceUpAxis;
      elements.activeModelLabel.textContent = storedDesign.displayName;
      elements.resetButton.hidden = false;
      renderStoredDesignDetails(storedDesign, elements);
      renderSaveControls(loadedDesign, elements, storedDesign);
      renderActivePhysicsProfile(storedDesign.physicsProfile);
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
        activeDesignState.physicsProfile = metadata.physicsProfile;
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

  const savePhysicsProfile = async () => {
    if (!activeDesignState?.storedId || !activeDesignState.physicsProfile || isBusy) {
      return;
    }

    let profile: PhysicsProfile;

    try {
      profile = readPhysicsProfileFromForm(elements, activeDesignState.physicsProfile.updatedAt);
    } catch (error) {
      setPhysicsStatus(getErrorMessage(error, 'Check the profile values.'), 'error');
      return;
    }

    setBusy(true);
    setPhysicsStatus('Saving physics profile...', 'loading');

    try {
      const metadata = await updatePhysicsProfile(activeDesignState.storedId, profile);
      activeDesignState.physicsProfile = metadata.physicsProfile;
      renderActivePhysicsProfile(metadata.physicsProfile);
      setPhysicsStatus('Physics profile saved.', 'success');
      await refreshLibrary();
    } catch (error) {
      setPhysicsStatus(getErrorMessage(error, 'Unable to save this physics profile.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handlePhysicsInput = () => {
    if (!activeDesignState?.storedId || !activeDesignState.physicsProfile) {
      return;
    }

    try {
      const profile = readPhysicsProfileFromForm(elements, activeDesignState.physicsProfile.updatedAt);
      simulatorScene.setCenterOfMassMarker(profile.centerOfMassOffsetMm, activeDesignState.design);
      setPhysicsStatus('Physics profile ready.', 'idle');
      setPhysicsDirtyState(!arePhysicsProfilesEquivalent(profile, activeDesignState.physicsProfile));
    } catch (error) {
      setPhysicsStatus(getErrorMessage(error, 'Check the profile values.'), 'error');
      elements.physicsSaveState.textContent = 'Check values';
      elements.physicsSaveState.dataset.tone = 'error';
      updatePhysicsSaveButton();
    }
  };

  const resetToDemo = (message = 'Demo top restored.') => {
    simulatorScene.resetToDemoTop();
    simulatorScene.clearCenterOfMassMarker();
    activeDesignState = null;
    lastImportedFile = null;
    elements.activeModelLabel.textContent = 'Demo Top';
    elements.designDetails.hidden = true;
    elements.thumbnail.removeAttribute('src');
    elements.resetButton.hidden = true;
    elements.saveControls.hidden = true;
    setPhysicsUnavailable('Load or save a design.');
    setImportStatus(message, 'idle');
    renderLibrary(savedDesigns, elements, null);
  };

  elements.importTabButton.addEventListener('click', () => switchTab('import'));
  elements.libraryTabButton.addEventListener('click', () => {
    switchTab('library');
    void refreshLibrary();
  });
  elements.physicsTabButton.addEventListener('click', () => switchTab('physics'));

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

  elements.physicsProfileForm.addEventListener('submit', (event) => {
    event.preventDefault();
  });
  elements.physicsProfileForm.addEventListener('input', handlePhysicsInput);
  elements.physicsProfileForm.addEventListener('change', handlePhysicsInput);
  elements.savePhysicsButton.addEventListener('click', () => void savePhysicsProfile());

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

  setPhysicsUnavailable('Load or save a design.');
  void refreshLibrary();
}

function getPanelElements() {
  return {
    importTabButton: queryRequired<HTMLButtonElement>('#import-tab-button'),
    libraryTabButton: queryRequired<HTMLButtonElement>('#library-tab-button'),
    physicsTabButton: queryRequired<HTMLButtonElement>('#physics-tab-button'),
    importPane: queryRequired<HTMLElement>('#import-pane'),
    libraryPane: queryRequired<HTMLElement>('#library-pane'),
    physicsPane: queryRequired<HTMLElement>('#physics-pane'),
    fileInput: queryRequired<HTMLInputElement>('#design-file-input'),
    sampleButton: queryRequired<HTMLButtonElement>('#load-sample-button'),
    resetButton: queryRequired<HTMLButtonElement>('#reset-demo-button'),
    upAxisSelect: queryRequired<HTMLSelectElement>('#up-axis'),
    importStatus: queryRequired<HTMLElement>('#import-status'),
    libraryStatus: queryRequired<HTMLElement>('#library-status'),
    physicsStatus: queryRequired<HTMLElement>('#physics-status'),
    libraryList: queryRequired<HTMLElement>('#library-list'),
    libraryEmptyState: queryRequired<HTMLElement>('#library-empty-state'),
    saveControls: queryRequired<HTMLElement>('#save-controls'),
    saveNameInput: queryRequired<HTMLInputElement>('#save-name-input'),
    saveButton: queryRequired<HTMLButtonElement>('#save-design-button'),
    savedStateLabel: queryRequired<HTMLElement>('#saved-state-label'),
    physicsProfileForm: queryRequired<HTMLFormElement>('#physics-profile-form'),
    savePhysicsButton: queryRequired<HTMLButtonElement>('#save-physics-button'),
    physicsSaveState: queryRequired<HTMLElement>('#physics-save-state'),
    physicsWeight: queryRequired<HTMLInputElement>('#physics-weight'),
    physicsRadius: queryRequired<HTMLInputElement>('#physics-radius'),
    physicsHeight: queryRequired<HTMLInputElement>('#physics-height'),
    physicsComX: queryRequired<HTMLInputElement>('#physics-com-x'),
    physicsComY: queryRequired<HTMLInputElement>('#physics-com-y'),
    physicsComZ: queryRequired<HTMLInputElement>('#physics-com-z'),
    physicsTipType: queryRequired<HTMLSelectElement>('#physics-tip-type'),
    physicsTipFriction: queryRequired<HTMLInputElement>('#physics-tip-friction'),
    physicsRingFriction: queryRequired<HTMLInputElement>('#physics-ring-friction'),
    physicsAirDrag: queryRequired<HTMLInputElement>('#physics-air-drag'),
    physicsSpinDamping: queryRequired<HTMLInputElement>('#physics-spin-damping'),
    physicsLaunchRpm: queryRequired<HTMLInputElement>('#physics-launch-rpm'),
    physicsLaunchAngle: queryRequired<HTMLInputElement>('#physics-launch-angle'),
    physicsLaunchX: queryRequired<HTMLInputElement>('#physics-launch-x'),
    physicsLaunchZ: queryRequired<HTMLInputElement>('#physics-launch-z'),
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

function renderPhysicsProfile(profile: PhysicsProfile, elements: ReturnType<typeof getPanelElements>): void {
  elements.physicsWeight.value = formatInputNumber(profile.weightGrams);
  elements.physicsRadius.value = formatInputNumber(profile.radiusMm);
  elements.physicsHeight.value = formatInputNumber(profile.heightMm);
  elements.physicsComX.value = formatInputNumber(profile.centerOfMassOffsetMm.x);
  elements.physicsComY.value = formatInputNumber(profile.centerOfMassOffsetMm.y);
  elements.physicsComZ.value = formatInputNumber(profile.centerOfMassOffsetMm.z);
  elements.physicsTipType.value = profile.tipType;
  elements.physicsTipFriction.value = formatInputNumber(profile.tipFrictionCoefficient);
  elements.physicsRingFriction.value = formatInputNumber(profile.ringFrictionCoefficient);
  elements.physicsAirDrag.value = formatInputNumber(profile.airDragCoefficient);
  elements.physicsSpinDamping.value = formatInputNumber(profile.spinDampingCoefficient);
  elements.physicsLaunchRpm.value = formatInputNumber(profile.defaultLaunchRpm);
  elements.physicsLaunchAngle.value = formatInputNumber(profile.defaultLaunchAngleDegrees);
  elements.physicsLaunchX.value = formatInputNumber(profile.defaultLaunchPosition.x);
  elements.physicsLaunchZ.value = formatInputNumber(profile.defaultLaunchPosition.z);
}

function readPhysicsProfileFromForm(
  elements: ReturnType<typeof getPanelElements>,
  updatedAt: string,
): PhysicsProfile {
  return sanitizePhysicsProfile({
    weightGrams: readNumber(elements.physicsWeight),
    radiusMm: readNumber(elements.physicsRadius),
    heightMm: readNumber(elements.physicsHeight),
    centerOfMassOffsetMm: {
      x: readNumber(elements.physicsComX),
      y: readNumber(elements.physicsComY),
      z: readNumber(elements.physicsComZ),
    },
    tipType: elements.physicsTipType.value as TipType,
    tipFrictionCoefficient: readNumber(elements.physicsTipFriction),
    ringFrictionCoefficient: readNumber(elements.physicsRingFriction),
    airDragCoefficient: readNumber(elements.physicsAirDrag),
    spinDampingCoefficient: readNumber(elements.physicsSpinDamping),
    defaultLaunchRpm: readNumber(elements.physicsLaunchRpm),
    defaultLaunchAngleDegrees: readNumber(elements.physicsLaunchAngle),
    defaultLaunchPosition: {
      x: readNumber(elements.physicsLaunchX),
      z: readNumber(elements.physicsLaunchZ),
    },
    updatedAt,
  });
}

function arePhysicsProfilesEquivalent(first: PhysicsProfile, second: PhysicsProfile): boolean {
  return JSON.stringify(getComparablePhysicsProfile(first)) === JSON.stringify(getComparablePhysicsProfile(second));
}

function getComparablePhysicsProfile(profile: PhysicsProfile) {
  return {
    weightGrams: profile.weightGrams,
    radiusMm: profile.radiusMm,
    heightMm: profile.heightMm,
    centerOfMassOffsetMm: profile.centerOfMassOffsetMm,
    tipType: profile.tipType,
    tipFrictionCoefficient: profile.tipFrictionCoefficient,
    ringFrictionCoefficient: profile.ringFrictionCoefficient,
    airDragCoefficient: profile.airDragCoefficient,
    spinDampingCoefficient: profile.spinDampingCoefficient,
    defaultLaunchRpm: profile.defaultLaunchRpm,
    defaultLaunchAngleDegrees: profile.defaultLaunchAngleDegrees,
    defaultLaunchPosition: profile.defaultLaunchPosition,
  };
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

function readNumber(input: HTMLInputElement): number {
  return Number(input.value);
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

function formatInputNumber(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;

  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
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
