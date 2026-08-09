import { createStrikeAudio } from '../audio/createStrikeAudio';
import { sanitizePhysicsProfile } from '../model/physicsProfile';
import { getLaunchPreset, getTipPreset } from '../model/presets';
import { createProfileExport, parseProfileExport } from '../model/profileExport';
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
import {
  createReferenceBeybladeFile,
  getReferenceBeybladePreset,
  REFERENCE_BEYBLADE_PRESETS,
  type ReferenceBeybladePreset,
} from '../model/referenceBeyblades';
import type { SimulatorScene } from '../scene/createScene';
import { createBattleSimulation } from '../simulation/createBattleSimulation';
import { createSingleTopSimulation } from '../simulation/createSingleTopSimulation';
import type {
  BattleResult,
  BattleSide,
  BattleSimulation,
  BattleSlot,
  BattleTelemetry,
  ContactEvent,
  SimulationMetric,
  SimulationTrace,
  SimulationTelemetry,
  SingleTopSimulation,
} from '../simulation/types';
import { getNearestTraceSample, getTraceDuration } from '../simulation/traceRecorder';
import {
  deleteBattleResult,
  deleteStoredDesign,
  getDefaultDisplayName,
  getStoredDesign,
  listBattleResults,
  listStoredDesigns,
  renameStoredDesign,
  saveBattleResult,
  saveStoredDesign,
  updatePhysicsProfile,
} from '../storage/designLibrary';

type StatusTone = 'idle' | 'loading' | 'success' | 'error';
type DesignTab = 'import' | 'library' | 'physics' | 'sim' | 'battle' | 'results';

const LIVE_TELEMETRY_INTERVAL_SECONDS = 1 / 12;

type ActiveDesignState = {
  design: LoadedDesign;
  fileBlob: Blob;
  storedId: string | null;
  physicsProfile: PhysicsProfile | null;
};

type BattleSlotState = {
  storedDesign: StoredDesign;
  loadedDesign: LoadedDesign;
};

export function createImportPanel(simulatorScene: SimulatorScene): void {
  const elements = getPanelElements();
  const strikeAudio = createStrikeAudio();
  let activeDesignState: ActiveDesignState | null = null;
  let lastImportedFile: File | null = null;
  let pendingReferencePreset: ReferenceBeybladePreset | null = null;
  let savedDesigns: StoredDesignMetadata[] = [];
  let activeTab: DesignTab = 'import';
  let singleTopSimulation: SingleTopSimulation | null = null;
  let battleSimulation: BattleSimulation | null = null;
  let simulationPrepareToken = 0;
  let battlePrepareToken = 0;
  let lastSimulationStatus: SimulationTelemetry['status'] | null = null;
  let lastBattleStatus: BattleTelemetry['status'] | null = null;
  let battleSlots: Partial<Record<BattleSide, BattleSlotState>> = {};
  let lastBattleSlots: { left: BattleSlot; right: BattleSlot } | null = null;
  let battleResults: BattleResult[] = [];
  let savedBattleResultKey: string | null = null;
  let latestTrace: SimulationTrace | null = null;
  let latestTraceCacheKey: string | null = null;
  let simulationTelemetryAccumulatorSeconds = 0;
  let battleTelemetryAccumulatorSeconds = 0;
  let replayState = {
    playing: false,
    timeSeconds: 0,
  };
  let isBusy = false;

  const canEditPhysics = () => Boolean(activeDesignState?.storedId && activeDesignState.physicsProfile);
  const canRunSimulation = () => Boolean(activeDesignState?.storedId && activeDesignState.physicsProfile);

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

  const setSimulationStatus = (message: string, tone: StatusTone) => {
    elements.simStatus.textContent = message;
    elements.simStatus.dataset.tone = tone;
  };

  const setBattleStatus = (message: string, tone: StatusTone) => {
    elements.battleStatus.textContent = message;
    elements.battleStatus.dataset.tone = tone;
  };

  const setResultsStatus = (message: string, tone: StatusTone) => {
    elements.resultsStatus.textContent = message;
    elements.resultsStatus.dataset.tone = tone;
  };

  const updatePhysicsSaveButton = () => {
    elements.savePhysicsButton.disabled = isBusy || !canEditPhysics() || elements.physicsSaveState.dataset.tone !== 'unsaved';
  };

  const updateSimulationControls = () => {
    const telemetry = singleTopSimulation?.getTelemetry();
    const canUseSimulation = Boolean(singleTopSimulation && telemetry?.ready && canRunSimulation()) && !isBusy;

    elements.simLaunchButton.disabled = !canUseSimulation || telemetry?.status === 'running';
    elements.simPauseButton.disabled = !canUseSimulation || (telemetry?.status !== 'running' && telemetry?.status !== 'paused');
    elements.simPauseButton.textContent = telemetry?.status === 'paused' ? 'Resume' : 'Pause';
    elements.simStepButton.disabled = !canUseSimulation;
    elements.simResetButton.disabled = !canUseSimulation;
  };

  const canUseBattle = () => Boolean(battleSimulation?.getTelemetry().ready && battleSlots.left && battleSlots.right) && !isBusy;

  const syncBattleSoundControls = () => {
    strikeAudio.setMuted(elements.battleSoundMuted.checked);
    strikeAudio.setVolume(readNumber(elements.battleSoundVolume));
    elements.battleSoundVolume.disabled = elements.battleSoundMuted.checked;
  };

  const updateBattleControls = () => {
    const telemetry = battleSimulation?.getTelemetry();
    const canBattle = canUseBattle();

    elements.battleLaunchButton.disabled = !canBattle || telemetry?.status === 'running';
    elements.battlePauseButton.disabled = !canBattle || (telemetry?.status !== 'running' && telemetry?.status !== 'paused');
    elements.battlePauseButton.textContent = telemetry?.status === 'paused' ? 'Resume' : 'Pause';
    elements.battleStepButton.disabled = !canBattle;
    elements.battleResetButton.disabled = !canBattle;
    elements.battleRepeatButton.disabled = !lastBattleSlots || isBusy;
  };

  const updateResultsControls = () => {
    const hasTrace = Boolean(latestTrace && latestTrace.samples.length > 0);

    elements.resultsMetric.disabled = !hasTrace;
    elements.replayButton.disabled = !hasTrace || isBusy;
    elements.replayPauseButton.disabled = !hasTrace || !replayState.playing || isBusy;
    elements.replayTimeline.disabled = !hasTrace || isBusy;
    elements.replaySpeed.disabled = !hasTrace || isBusy;
  };

  const getBattleInputs = () => [
    elements.battleLeftRpm,
    elements.battleLeftAngle,
    elements.battleLeftX,
    elements.battleLeftZ,
    elements.battleRightRpm,
    elements.battleRightAngle,
    elements.battleRightX,
    elements.battleRightZ,
  ];

  const setPhysicsDirtyState = (dirty: boolean) => {
    elements.physicsSaveState.textContent = dirty ? 'Unsaved changes' : 'Saved';
    elements.physicsSaveState.dataset.tone = dirty ? 'unsaved' : 'saved';
    updatePhysicsSaveButton();
  };

  const syncCenterOfMassMarker = () => {
    if (!activeDesignState?.physicsProfile || activeTab !== 'physics' || singleTopSimulation?.getTelemetry().status === 'running') {
      simulatorScene.clearCenterOfMassMarker();
      return;
    }

    simulatorScene.setCenterOfMassMarker(activeDesignState.physicsProfile.centerOfMassOffsetMm, activeDesignState.design);
  };

  const setPhysicsUnavailable = (message: string) => {
    elements.physicsTabButton.disabled = true;
    elements.physicsProfileForm.hidden = true;
    setPhysicsStatus(message, 'idle');
    setPhysicsDirtyState(false);
    syncCenterOfMassMarker();

    if (!elements.physicsPane.hidden) {
      switchTab('import');
    }
  };

  const renderSimulationTelemetry = (telemetry: SimulationTelemetry | null = singleTopSimulation?.getTelemetry() ?? null) => {
    elements.simStateValue.textContent = formatSimulationStatus(telemetry?.status ?? 'stopped');
    elements.simTimeValue.textContent = `${(telemetry?.elapsedSeconds ?? 0).toFixed(3)} s`;
    elements.simRpmValue.textContent = `${Math.round(telemetry?.spinRpm ?? 0).toLocaleString()} RPM`;
    elements.simTiltValue.textContent = `${(telemetry?.tiltDegrees ?? 0).toFixed(1)} deg`;
    elements.simSpeedValue.textContent = (telemetry?.speed ?? 0).toFixed(2);
    elements.simStopReasonValue.textContent = formatStopReason(telemetry?.stopReason ?? null);
    updateSimulationControls();
  };

  const setSimulationUnavailable = (message: string) => {
    elements.simTabButton.disabled = true;
    elements.simControls.hidden = true;
    setSimulationStatus(message, 'idle');
    renderSimulationTelemetry(null);

    if (!elements.simPane.hidden) {
      switchTab('import');
    }
  };

  const renderBattleTelemetry = (telemetry: BattleTelemetry | null = battleSimulation?.getTelemetry() ?? null) => {
    elements.battleStateValue.textContent = formatSimulationStatus(telemetry?.status ?? 'stopped');
    elements.battleTimeValue.textContent = `${(telemetry?.elapsedSeconds ?? 0).toFixed(3)} s`;
    elements.battleLeftRpmValue.textContent = `${Math.round(telemetry?.left.spinRpm ?? 0).toLocaleString()} RPM`;
    elements.battleRightRpmValue.textContent = `${Math.round(telemetry?.right.spinRpm ?? 0).toLocaleString()} RPM`;
    elements.battleLeftTiltValue.textContent = `${(telemetry?.left.tiltDegrees ?? 0).toFixed(1)} deg`;
    elements.battleRightTiltValue.textContent = `${(telemetry?.right.tiltDegrees ?? 0).toFixed(1)} deg`;
    elements.battleLeftStopValue.textContent = formatStopReason(telemetry?.left.stopReason ?? null);
    elements.battleRightStopValue.textContent = formatStopReason(telemetry?.right.stopReason ?? null);
    elements.battleResultLabel.textContent = formatBattleResult(telemetry);
    updateBattleControls();
  };

  const playBattleContact = (event: ContactEvent) => {
    strikeAudio.playStrike(event.relativeSpeed);
  };

  const renderResults = () => {
    if (!elements.resultsPane.hidden) {
      renderTraceResults(latestTrace, elements, elements.resultsMetric.value as SimulationMetric);
    }

    updateResultsControls();
  };

  const syncLatestTrace = (trace: SimulationTrace | null) => {
    if (!trace || trace.samples.length === 0 || replayState.playing) {
      return;
    }

    const cacheKey = `${trace.id}:${trace.samples.length}:${trace.resultLabel ?? ''}`;

    if (cacheKey === latestTraceCacheKey) {
      return;
    }

    latestTraceCacheKey = cacheKey;
    latestTrace = trace;
    replayState.timeSeconds = getTraceDuration(trace);
    elements.replayTimeline.max = String(Math.max(replayState.timeSeconds, 0));
    elements.replayTimeline.value = String(replayState.timeSeconds);
    setResultsStatus(`${trace.label} recorded.`, 'success');
    renderResults();
  };

  const clearLatestTrace = (message: string, tone: StatusTone) => {
    latestTrace = null;
    latestTraceCacheKey = null;
    replayState.playing = false;
    replayState.timeSeconds = 0;
    elements.replayTimeline.max = '0';
    elements.replayTimeline.value = '0';
    setResultsStatus(message, tone);
    renderResults();
  };

  const stopReplay = () => {
    replayState.playing = false;
    updateResultsControls();
  };

  const startReplay = () => {
    if (!latestTrace || latestTrace.samples.length === 0 || !canReplayTrace(latestTrace, activeDesignState, lastBattleSlots)) {
      setResultsStatus('Load the matching design or battle setup before replay.', 'error');
      return;
    }

    singleTopSimulation?.pause();
    battleSimulation?.pause();
    replayState.playing = true;
    replayState.timeSeconds = 0;
    elements.replayTimeline.value = '0';
    setResultsStatus('Replay running.', 'loading');
    renderReplayFrame();
    updateResultsControls();
  };

  const updateReplay = (deltaSeconds: number) => {
    if (!replayState.playing || !latestTrace) {
      return;
    }

    const duration = getTraceDuration(latestTrace);
    replayState.timeSeconds = Math.min(duration, replayState.timeSeconds + deltaSeconds * readNumber(elements.replaySpeed));
    elements.replayTimeline.value = String(replayState.timeSeconds);
    renderReplayFrame();

    if (replayState.timeSeconds >= duration) {
      replayState.playing = false;
      setResultsStatus('Replay complete.', 'success');
      updateResultsControls();
    }
  };

  const renderReplayFrame = () => {
    if (!latestTrace) {
      return;
    }

    const sample = getNearestTraceSample(latestTrace, replayState.timeSeconds);

    if (!sample) {
      return;
    }

    if (latestTrace.mode === 'single' && sample.single && activeDesignState) {
      simulatorScene.setSimulationTransform(activeDesignState.design, sample.single.transform);
      renderSimulationTelemetry({
        ready: true,
        status: 'paused',
        elapsedSeconds: sample.elapsedSeconds,
        spinRpm: sample.single.spinRpm,
        tiltDegrees: sample.single.tiltDegrees,
        speed: sample.single.speed,
        radialDistance: sample.single.radialDistance,
        stopReason: sample.single.stopReason,
        errorMessage: null,
      });
    }

    if (latestTrace.mode === 'battle' && sample.left && sample.right) {
      simulatorScene.setBattleTransform('left', sample.left.transform);
      simulatorScene.setBattleTransform('right', sample.right.transform);
      renderBattleTelemetry({
        ready: true,
        status: 'paused',
        elapsedSeconds: sample.elapsedSeconds,
        left: sample.left,
        right: sample.right,
        winner: null,
        resultReason: null,
        errorMessage: null,
      });
    }

  };

  const setBattleUnavailable = (message: string) => {
    setBattleStatus(message, 'idle');
    renderBattleTelemetry(null);
    updateBattleControls();
  };

  const disposeBattleSimulation = (message = 'Select saved designs for both slots.') => {
    stopReplay();
    battlePrepareToken += 1;

    if (battleSimulation) {
      battleSimulation.dispose();
      battleSimulation = null;
    }

    lastBattleStatus = null;
    savedBattleResultKey = null;
    simulatorScene.clearBattleMode();
    setBattleUnavailable(message);
  };

  const disposeSimulation = (message = 'Load or save a design.') => {
    simulationPrepareToken += 1;

    if (singleTopSimulation) {
      singleTopSimulation.dispose();
      singleTopSimulation = null;
    }

    lastSimulationStatus = null;
    setSimulationUnavailable(message);
  };

  const prepareSimulationForActiveDesign = async () => {
    simulationPrepareToken += 1;
    const token = simulationPrepareToken;
    const state = activeDesignState;

    if (singleTopSimulation) {
      singleTopSimulation.dispose();
      singleTopSimulation = null;
    }

    if (!state?.storedId || !state.physicsProfile) {
      setSimulationUnavailable('Save this design before simulation.');
      return;
    }

    elements.simTabButton.disabled = false;
    elements.simControls.hidden = false;
    setSimulationStatus('Preparing Rapier simulation...', 'loading');
    renderSimulationTelemetry(null);
    updateSimulationControls();

    try {
      const simulation = await createSingleTopSimulation(simulatorScene);

      if (token !== simulationPrepareToken) {
        simulation.dispose();
        return;
      }

      singleTopSimulation = simulation;
      simulation.prepare(state.design, state.physicsProfile);
      lastSimulationStatus = simulation.getTelemetry().status;
      renderSimulationTelemetry();
      setSimulationStatus('Simulation ready.', 'idle');
      syncCenterOfMassMarker();
    } catch (error) {
      if (token !== simulationPrepareToken) {
        return;
      }

      singleTopSimulation = null;
      setSimulationUnavailable(getErrorMessage(error, 'Unable to initialize Rapier simulation.'));
    }
  };

  const loadBattleSlot = async (side: BattleSide, id: string) => {
    if (!id) {
      delete battleSlots[side];
      renderBattleSlotSummary(side, null, elements);
      disposeBattleSimulation('Select saved designs for both slots.');
      return;
    }

    if (isBusy) {
      return;
    }

    setBusy(true);
    setBattleStatus(`Loading ${formatBattleSide(side)} slot...`, 'loading');

    try {
      const storedDesign = await getStoredDesign(id);

      if (!storedDesign) {
        throw new Error('This saved design no longer exists.');
      }

      const designFile = new File([storedDesign.fileBlob], storedDesign.fileName, {
        type: storedDesign.fileBlob.type || getStoredFileMimeType(storedDesign),
      });
      const loadedDesign = await loadDesignFile(designFile, storedDesign.sourceUpAxis);
      loadedDesign.id = `${storedDesign.id}-${side}-${crypto.randomUUID()}`;
      loadedDesign.thumbnailDataUrl = storedDesign.thumbnailDataUrl;

      battleSlots[side] = {
        storedDesign,
        loadedDesign,
      };
      setBattleLaunchInputs(side, storedDesign.physicsProfile, elements);
      renderBattleSlotSummary(side, storedDesign, elements);
      await prepareBattleForSlots();
    } catch (error) {
      delete battleSlots[side];
      renderBattleSlotSummary(side, null, elements);
      setBattleStatus(getErrorMessage(error, `Unable to load the ${formatBattleSide(side)} slot.`), 'error');
    } finally {
      setBusy(false);
    }
  };

  const prepareBattleForSlots = async () => {
    const leftState = battleSlots.left;
    const rightState = battleSlots.right;

    if (!leftState || !rightState) {
      setBattleUnavailable('Select saved designs for both slots.');
      return;
    }

    battlePrepareToken += 1;
    const token = battlePrepareToken;
    savedBattleResultKey = null;

    if (battleSimulation) {
      battleSimulation.dispose();
      battleSimulation = null;
    }

    disposeSimulation('Battle mode active.');
    simulatorScene.setBattleDesigns(leftState.loadedDesign, rightState.loadedDesign);
    elements.activeModelLabel.textContent = `${leftState.storedDesign.displayName} vs ${rightState.storedDesign.displayName}`;
    setBattleStatus('Preparing battle simulation...', 'loading');
    renderBattleTelemetry(null);
    updateBattleControls();

    try {
      const simulation = await createBattleSimulation(simulatorScene, {
        onContact: playBattleContact,
      });

      if (token !== battlePrepareToken) {
        simulation.dispose();
        return;
      }

      const leftSlot = createBattleSlot('left', leftState, elements);
      const rightSlot = createBattleSlot('right', rightState, elements);

      battleSimulation = simulation;
      lastBattleSlots = { left: leftSlot, right: rightSlot };
      simulation.prepare(leftSlot, rightSlot);
      lastBattleStatus = simulation.getTelemetry().status;
      renderBattleTelemetry();
      setBattleStatus('Battle ready.', 'idle');
    } catch (error) {
      if (token !== battlePrepareToken) {
        return;
      }

      battleSimulation = null;
      setBattleStatus(getErrorMessage(error, 'Unable to initialize battle simulation.'), 'error');
    }
  };

  const launchBattle = async () => {
    void strikeAudio.prime();
    await prepareBattleForSlots();
    stopReplay();
    clearLatestTrace('Recording battle. Results update when paused or stopped.', 'loading');
    battleSimulation?.launch();
    lastBattleStatus = null;
    battleTelemetryAccumulatorSeconds = LIVE_TELEMETRY_INTERVAL_SECONDS;
    savedBattleResultKey = null;
    renderBattleTelemetry();
  };

  const saveFinishedBattleResult = async (telemetry: BattleTelemetry) => {
    if (!lastBattleSlots || telemetry.status !== 'stopped' || !telemetry.winner || savedBattleResultKey) {
      return;
    }

    savedBattleResultKey = `${telemetry.winner}-${telemetry.resultReason}-${telemetry.elapsedSeconds.toFixed(3)}`;

    try {
      await saveBattleResult({
        leftDesignId: lastBattleSlots.left.storedDesignId,
        leftDisplayName: lastBattleSlots.left.displayName,
        rightDesignId: lastBattleSlots.right.storedDesignId,
        rightDisplayName: lastBattleSlots.right.displayName,
        leftProfile: cloneJson(lastBattleSlots.left.profile),
        rightProfile: cloneJson(lastBattleSlots.right.profile),
        leftLaunchSettings: cloneJson(lastBattleSlots.left.launchSettings),
        rightLaunchSettings: cloneJson(lastBattleSlots.right.launchSettings),
        winner: telemetry.winner,
        resultReason: telemetry.resultReason,
        durationSeconds: telemetry.elapsedSeconds,
        finalTelemetry: cloneJson(telemetry),
      });
      setBattleStatus('Battle complete. Result saved.', 'success');
      await refreshBattleResults();
    } catch (error) {
      setBattleStatus(getErrorMessage(error, 'Battle complete, but the result could not be saved.'), 'error');
    }
  };

  const refreshBattleResults = async () => {
    try {
      battleResults = await listBattleResults();
      renderBattleResults(battleResults, elements);
    } catch (error) {
      setBattleStatus(getErrorMessage(error, 'Unable to load battle history.'), 'error');
    }
  };

  const deleteBattleHistoryResult = async (id: string) => {
    if (isBusy) {
      return;
    }

    setBusy(true);
    setBattleStatus('Deleting battle result...', 'loading');

    try {
      await deleteBattleResult(id);
      await refreshBattleResults();
      setBattleStatus('Battle result deleted.', 'success');
    } catch (error) {
      setBattleStatus(getErrorMessage(error, 'Unable to delete this battle result.'), 'error');
    } finally {
      setBusy(false);
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
    elements.referenceBeySelect.disabled = busy;
    elements.referenceBeyButton.disabled = busy;
    elements.resetButton.disabled = busy;
    elements.upAxisSelect.disabled = busy;
    elements.saveButton.disabled = busy || !activeDesignState || Boolean(activeDesignState.storedId) || elements.saveNameInput.value.trim().length === 0;
    setPhysicsFormDisabled(busy || !canEditPhysics());
    elements.applyTipPresetButton.disabled = busy || !canEditPhysics();
    elements.applyLaunchPresetButton.disabled = busy || !canEditPhysics();
    elements.exportProfileButton.disabled = busy || !activeDesignState?.storedId;
    elements.profileImportInput.disabled = busy || !activeDesignState?.storedId;
    updatePhysicsSaveButton();
    updateSimulationControls();
    updateBattleControls();
    updateResultsControls();
    elements.battleLeftSelect.disabled = busy || savedDesigns.length === 0;
    elements.battleRightSelect.disabled = busy || savedDesigns.length === 0;
    elements.battleLeftApplyLaunchPreset.disabled = busy || !battleSlots.left;
    elements.battleRightApplyLaunchPreset.disabled = busy || !battleSlots.right;
    elements.simTimeScale.disabled = busy;
    elements.battleTimeScale.disabled = busy;
    getBattleInputs().forEach((input) => {
      input.disabled = busy;
    });
    elements.libraryList.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      button.disabled = busy;
    });
    elements.libraryList.querySelectorAll<HTMLInputElement>('input').forEach((input) => {
      input.disabled = busy;
    });
    elements.battleHistoryList.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      button.disabled = busy;
    });
    elements.resultsHistoryList.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      button.disabled = busy;
    });
  };

  const switchTab = (tab: DesignTab) => {
    if (tab === 'physics' && elements.physicsTabButton.disabled) {
      return;
    }

    if (tab === 'sim' && elements.simTabButton.disabled) {
      return;
    }

    activeTab = tab;
    elements.importTabButton.setAttribute('aria-selected', String(tab === 'import'));
    elements.libraryTabButton.setAttribute('aria-selected', String(tab === 'library'));
    elements.physicsTabButton.setAttribute('aria-selected', String(tab === 'physics'));
    elements.simTabButton.setAttribute('aria-selected', String(tab === 'sim'));
    elements.battleTabButton.setAttribute('aria-selected', String(tab === 'battle'));
    elements.resultsTabButton.setAttribute('aria-selected', String(tab === 'results'));
    elements.importPane.hidden = tab !== 'import';
    elements.libraryPane.hidden = tab !== 'library';
    elements.physicsPane.hidden = tab !== 'physics';
    elements.simPane.hidden = tab !== 'sim';
    elements.battlePane.hidden = tab !== 'battle';
    elements.resultsPane.hidden = tab !== 'results';
    syncCenterOfMassMarker();

    if (tab === 'results') {
      renderResults();
      void refreshBattleResults();
    }
  };

  const renderActivePhysicsProfile = (profile: PhysicsProfile) => {
    elements.physicsTabButton.disabled = false;
    elements.physicsProfileForm.hidden = false;
    renderPhysicsProfile(profile, elements);
    elements.physicsTipPreset.value = profile.tipType;
    setPhysicsStatus('Physics profile ready.', 'idle');
    setPhysicsDirtyState(false);
    setPhysicsFormDisabled(isBusy);
    syncCenterOfMassMarker();
  };

  const refreshLibrary = async () => {
    try {
      savedDesigns = await listStoredDesigns();
      renderLibrary(savedDesigns, elements, activeDesignState?.storedId ?? null);
      renderBattleSelectors(savedDesigns, elements);
      setLibraryStatus(
        savedDesigns.length === 0 ? 'No saved designs.' : `${savedDesigns.length} saved design${savedDesigns.length === 1 ? '' : 's'}.`,
        'idle',
      );
      if (savedDesigns.length === 0) {
        setBattleStatus('Save a design before starting a battle.', 'idle');
      }
    } catch (error) {
      setLibraryStatus(getErrorMessage(error, 'Unable to load saved designs.'), 'error');
    }
  };

  const importFile = async (file: File, referencePreset: ReferenceBeybladePreset | null = null) => {
    if (isBusy) {
      return;
    }

    const upAxis = referencePreset ? 'z' : (elements.upAxisSelect.value as UpAxis);

    if (referencePreset) {
      elements.upAxisSelect.value = 'z';
    }

    setBusy(true);
    setImportStatus(`Importing ${file.name}...`, 'loading');

    try {
      const design = await loadDesignFile(file, upAxis);
      stopReplay();
      disposeSimulation('Save this design before simulation.');
      disposeBattleSimulation('Select saved designs for both slots.');
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
      lastImportedFile = referencePreset ? null : file;
      pendingReferencePreset = referencePreset;

      renderDesignDetails(design, elements);
      renderSaveControls(design, elements, null);
      if (referencePreset) {
        elements.saveNameInput.value = referencePreset.displayName;
      }
      elements.activeModelLabel.textContent = referencePreset?.displayName ?? design.fileName;
      elements.resetButton.hidden = false;
      setPhysicsUnavailable('Save this design before editing physics.');
      setImportStatus(
        referencePreset ? `Loaded ${referencePreset.displayName} reference model. Save to add its test profile.` : 'Imported visual model. Unsaved.',
        'success',
      );
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
      let metadata = await saveStoredDesign(
        activeDesignState.design,
        activeDesignState.fileBlob,
        elements.saveNameInput.value,
      );

      if (pendingReferencePreset) {
        metadata = await updatePhysicsProfile(metadata.id, pendingReferencePreset.profile);
      }

      activeDesignState = {
        ...activeDesignState,
        storedId: metadata.id,
        physicsProfile: metadata.physicsProfile,
      };
      pendingReferencePreset = null;

      elements.activeModelLabel.textContent = metadata.displayName;
      renderSaveControls(activeDesignState.design, elements, metadata);
      renderActivePhysicsProfile(metadata.physicsProfile);
      setImportStatus('Saved to local design library.', 'success');
      await refreshLibrary();
      await prepareSimulationForActiveDesign();
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

      stopReplay();
      disposeSimulation('Preparing saved design for simulation.');
      disposeBattleSimulation('Select saved designs for both slots.');
      simulatorScene.setImportedDesign(loadedDesign);
      activeDesignState = {
        design: loadedDesign,
        fileBlob: storedDesign.fileBlob,
        storedId: storedDesign.id,
        physicsProfile: storedDesign.physicsProfile,
      };
      lastImportedFile = null;
      pendingReferencePreset = null;

      elements.upAxisSelect.value = storedDesign.sourceUpAxis;
      elements.activeModelLabel.textContent = storedDesign.displayName;
      elements.resetButton.hidden = false;
      renderStoredDesignDetails(storedDesign, elements);
      renderSaveControls(loadedDesign, elements, storedDesign);
      renderActivePhysicsProfile(storedDesign.physicsProfile);
      setLibraryStatus('Loaded saved design.', 'success');
      setImportStatus('Loaded saved design from library.', 'success');
      renderLibrary(savedDesigns, elements, storedDesign.id);
      await prepareSimulationForActiveDesign();
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

      if (battleSlots.left?.storedDesign.id === id || battleSlots.right?.storedDesign.id === id) {
        disposeBattleSimulation('A selected battle design was deleted.');
        battleSlots = {};
        renderBattleSlotSummary('left', null, elements);
        renderBattleSlotSummary('right', null, elements);
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
      profile = readPhysicsProfileFromForm(elements, activeDesignState.physicsProfile);
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
      await prepareSimulationForActiveDesign();
    } catch (error) {
      setPhysicsStatus(getErrorMessage(error, 'Unable to save this physics profile.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const applyTipPreset = () => {
    if (!activeDesignState?.storedId || !activeDesignState.physicsProfile || isBusy) {
      return;
    }

    const preset = getTipPreset(elements.physicsTipPreset.value);

    if (!preset) {
      setPhysicsStatus('Choose a valid tip preset.', 'error');
      return;
    }

    elements.physicsTipType.value = preset.patch.tipType;
    elements.physicsTipFriction.value = formatInputNumber(preset.patch.tipFrictionCoefficient);
    elements.physicsRingFriction.value = formatInputNumber(preset.patch.ringFrictionCoefficient);
    elements.physicsAirDrag.value = formatInputNumber(preset.patch.airDragCoefficient);
    elements.physicsSpinDamping.value = formatInputNumber(preset.patch.spinDampingCoefficient);
    handlePhysicsInput();
  };

  const applyPhysicsLaunchPreset = () => {
    if (!activeDesignState?.storedId || !activeDesignState.physicsProfile || isBusy) {
      return;
    }

    const preset = getLaunchPreset(elements.physicsLaunchPreset.value);

    if (!preset) {
      setPhysicsStatus('Choose a valid launch preset.', 'error');
      return;
    }

    elements.physicsLaunchRpm.value = formatInputNumber(preset.rpm);
    elements.physicsLaunchAngle.value = formatInputNumber(preset.angleDegrees);
    elements.physicsLaunchX.value = formatInputNumber(preset.position.x);
    elements.physicsLaunchZ.value = formatInputNumber(preset.position.z);
    handlePhysicsInput();
  };

  const applyBattleLaunchPreset = async (side: BattleSide) => {
    if (isBusy) {
      return;
    }

    const presetSelect = side === 'left' ? elements.battleLeftLaunchPreset : elements.battleRightLaunchPreset;
    const preset = getLaunchPreset(presetSelect.value);

    if (!preset) {
      setBattleStatus('Choose a valid launch preset.', 'error');
      return;
    }

    const controls = getBattleSlotControls(side, elements);
    controls.rpm.value = formatInputNumber(preset.rpm);
    controls.angle.value = formatInputNumber(preset.angleDegrees);
    controls.x.value = formatInputNumber(side === 'right' ? -preset.position.x : preset.position.x);
    controls.z.value = formatInputNumber(side === 'right' ? -preset.position.z : preset.position.z);
    savedBattleResultKey = null;
    await prepareBattleForSlots();
  };

  const exportActiveProfile = async () => {
    if (!activeDesignState?.storedId || isBusy) {
      return;
    }

    setBusy(true);
    setPhysicsStatus('Exporting physics profile...', 'loading');

    try {
      const storedDesign = await getStoredDesign(activeDesignState.storedId);

      if (!storedDesign) {
        throw new Error('This saved design no longer exists.');
      }

      const exportData = createProfileExport(storedDesign);
      downloadTextFile(`${sanitizeDownloadName(storedDesign.displayName)}-physics-profile.json`, JSON.stringify(exportData, null, 2));
      setPhysicsStatus('Physics profile exported.', 'success');
    } catch (error) {
      setPhysicsStatus(getErrorMessage(error, 'Unable to export this physics profile.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const importProfileFile = async (file: File | null) => {
    if (!file || !activeDesignState?.storedId || !activeDesignState.physicsProfile || isBusy) {
      return;
    }

    setBusy(true);
    setPhysicsStatus('Importing physics profile...', 'loading');

    try {
      const text = await file.text();
      const profileExport = parseProfileExport(text, activeDesignState.physicsProfile.updatedAt);
      renderPhysicsProfile(profileExport.physicsProfile, elements);
      elements.physicsTipPreset.value = profileExport.physicsProfile.tipType;
      handlePhysicsInput();
      setPhysicsStatus(`Imported ${profileExport.displayName} profile. Save to persist.`, 'success');
    } catch (error) {
      setPhysicsStatus(getErrorMessage(error, 'Unable to import this physics profile.'), 'error');
    } finally {
      setBusy(false);
      elements.profileImportInput.value = '';
    }
  };

  const handlePhysicsInput = () => {
    if (!activeDesignState?.storedId || !activeDesignState.physicsProfile) {
      return;
    }

    try {
      const profile = readPhysicsProfileFromForm(elements, activeDesignState.physicsProfile);
      if (activeTab === 'physics' && singleTopSimulation?.getTelemetry().status !== 'running') {
        simulatorScene.setCenterOfMassMarker(profile.centerOfMassOffsetMm, activeDesignState.design);
      }
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
    stopReplay();
    disposeSimulation('Load or save a design.');
    disposeBattleSimulation('Select saved designs for both slots.');
    simulatorScene.resetToDemoTop();
    simulatorScene.clearCenterOfMassMarker();
    activeDesignState = null;
    lastImportedFile = null;
    pendingReferencePreset = null;
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
  elements.simTabButton.addEventListener('click', () => switchTab('sim'));
  elements.battleTabButton.addEventListener('click', () => {
    switchTab('battle');
    void refreshLibrary();
    void refreshBattleResults();
  });
  elements.resultsTabButton.addEventListener('click', () => switchTab('results'));

  simulatorScene.setFrameUpdate((deltaSeconds) => {
    updateReplay(deltaSeconds);

    if (singleTopSimulation) {
      singleTopSimulation.update(deltaSeconds * readNumber(elements.simTimeScale));

      const telemetry = singleTopSimulation.getTelemetry();
      const statusChanged = telemetry.status !== lastSimulationStatus;
      simulationTelemetryAccumulatorSeconds += deltaSeconds;

      if (statusChanged || (telemetry.status === 'running' && simulationTelemetryAccumulatorSeconds >= LIVE_TELEMETRY_INTERVAL_SECONDS)) {
        renderSimulationTelemetry(telemetry);
        simulationTelemetryAccumulatorSeconds = 0;
      }

      if (statusChanged) {
        if (telemetry.status === 'running') {
          setSimulationStatus('Simulation running.', 'loading');
        } else if (telemetry.status === 'stopped') {
          setSimulationStatus('Simulation stopped.', 'success');
        } else if (telemetry.status === 'paused') {
          setSimulationStatus('Simulation paused.', 'idle');
        } else if (telemetry.status === 'error') {
          setSimulationStatus(telemetry.errorMessage ?? 'Simulation error.', 'error');
        } else {
          setSimulationStatus('Simulation ready.', 'idle');
        }

        lastSimulationStatus = telemetry.status;
        syncCenterOfMassMarker();

        if (telemetry.status !== 'running') {
          syncLatestTrace(singleTopSimulation.getTrace());
        }
      }
    }

    if (battleSimulation) {
      battleSimulation.update(deltaSeconds * readNumber(elements.battleTimeScale));

      const telemetry = battleSimulation.getTelemetry();
      const statusChanged = telemetry.status !== lastBattleStatus;
      battleTelemetryAccumulatorSeconds += deltaSeconds;

      if (statusChanged || (telemetry.status === 'running' && battleTelemetryAccumulatorSeconds >= LIVE_TELEMETRY_INTERVAL_SECONDS)) {
        renderBattleTelemetry(telemetry);
        battleTelemetryAccumulatorSeconds = 0;
      }

      if (statusChanged) {
        if (telemetry.status === 'running') {
          setBattleStatus('Battle running.', 'loading');
        } else if (telemetry.status === 'stopped') {
          setBattleStatus('Battle complete.', 'success');
          void saveFinishedBattleResult(telemetry);
        } else if (telemetry.status === 'paused') {
          setBattleStatus('Battle paused.', 'idle');
        } else if (telemetry.status === 'error') {
          setBattleStatus(telemetry.errorMessage ?? 'Battle simulation error.', 'error');
        } else {
          setBattleStatus('Battle ready.', 'idle');
        }

        lastBattleStatus = telemetry.status;

        if (telemetry.status !== 'running') {
          syncLatestTrace(battleSimulation.getTrace());
        }
      }
    }
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
  elements.referenceBeySelect.addEventListener('change', () => {
    renderReferenceBeySummary(elements);
  });
  elements.referenceBeyButton.addEventListener('click', () => {
    const preset = getReferenceBeybladePreset(elements.referenceBeySelect.value);

    if (!preset) {
      setImportStatus('Choose a valid reference bey.', 'error');
      return;
    }

    void importFile(createReferenceBeybladeFile(preset), preset);
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
  elements.applyTipPresetButton.addEventListener('click', applyTipPreset);
  elements.applyLaunchPresetButton.addEventListener('click', applyPhysicsLaunchPreset);
  elements.exportProfileButton.addEventListener('click', () => void exportActiveProfile());
  elements.profileImportInput.addEventListener('change', () => {
    void importProfileFile(elements.profileImportInput.files?.item(0) ?? null);
  });
  elements.simLaunchButton.addEventListener('click', () => {
    stopReplay();
    clearLatestTrace('Recording simulation. Results update when paused or stopped.', 'loading');
    singleTopSimulation?.launch();
    lastSimulationStatus = null;
    simulationTelemetryAccumulatorSeconds = LIVE_TELEMETRY_INTERVAL_SECONDS;
    renderSimulationTelemetry();
    syncCenterOfMassMarker();
  });
  elements.simPauseButton.addEventListener('click', () => {
    const telemetry = singleTopSimulation?.getTelemetry();

    if (telemetry?.status === 'paused') {
      singleTopSimulation?.resume();
    } else {
      singleTopSimulation?.pause();
    }

    lastSimulationStatus = null;
    renderSimulationTelemetry();
    syncCenterOfMassMarker();
  });
  elements.simStepButton.addEventListener('click', () => {
    stopReplay();
    singleTopSimulation?.step();
    lastSimulationStatus = null;
    renderSimulationTelemetry();
    syncLatestTrace(singleTopSimulation?.getTrace() ?? null);
    syncCenterOfMassMarker();
  });
  elements.simResetButton.addEventListener('click', () => {
    stopReplay();
    singleTopSimulation?.reset();
    lastSimulationStatus = null;
    renderSimulationTelemetry();
    setSimulationStatus('Simulation ready.', 'idle');
    syncCenterOfMassMarker();
  });
  elements.battleLeftSelect.addEventListener('change', () => {
    void loadBattleSlot('left', elements.battleLeftSelect.value);
  });
  elements.battleRightSelect.addEventListener('change', () => {
    void loadBattleSlot('right', elements.battleRightSelect.value);
  });
  getBattleInputs().forEach((input) => {
    input.addEventListener('input', () => {
      savedBattleResultKey = null;
    });
    input.addEventListener('change', () => void prepareBattleForSlots());
  });
  elements.battleLaunchButton.addEventListener('click', () => {
    void launchBattle();
  });
  elements.battleSoundMuted.addEventListener('change', syncBattleSoundControls);
  elements.battleSoundVolume.addEventListener('input', syncBattleSoundControls);
  elements.battlePauseButton.addEventListener('click', () => {
    const telemetry = battleSimulation?.getTelemetry();

    if (telemetry?.status === 'paused') {
      battleSimulation?.resume();
    } else {
      battleSimulation?.pause();
    }

    lastBattleStatus = null;
    renderBattleTelemetry();
  });
  elements.battleStepButton.addEventListener('click', () => {
    void strikeAudio.prime();
    stopReplay();
    battleSimulation?.step();
    lastBattleStatus = null;
    renderBattleTelemetry();
    syncLatestTrace(battleSimulation?.getTrace() ?? null);
  });
  elements.battleResetButton.addEventListener('click', () => {
    stopReplay();
    battleSimulation?.reset();
    lastBattleStatus = null;
    savedBattleResultKey = null;
    renderBattleTelemetry();
    setBattleStatus('Battle ready.', 'idle');
  });
  elements.battleRepeatButton.addEventListener('click', () => {
    if (!lastBattleSlots) {
      return;
    }

    stopReplay();
    void strikeAudio.prime();
    clearLatestTrace('Recording battle. Results update when paused or stopped.', 'loading');
    battleSimulation?.launch();
    lastBattleStatus = null;
    battleTelemetryAccumulatorSeconds = LIVE_TELEMETRY_INTERVAL_SECONDS;
    savedBattleResultKey = null;
    renderBattleTelemetry();
  });
  elements.battleLeftApplyLaunchPreset.addEventListener('click', () => {
    void applyBattleLaunchPreset('left');
  });
  elements.battleRightApplyLaunchPreset.addEventListener('click', () => {
    void applyBattleLaunchPreset('right');
  });
  elements.resultsMetric.addEventListener('change', renderResults);
  elements.replayButton.addEventListener('click', startReplay);
  elements.replayPauseButton.addEventListener('click', () => {
    replayState.playing = false;
    setResultsStatus('Replay paused.', 'idle');
    updateResultsControls();
  });
  elements.replayTimeline.addEventListener('input', () => {
    replayState.playing = false;
    replayState.timeSeconds = readNumber(elements.replayTimeline);
    renderReplayFrame();
    setResultsStatus('Replay paused.', 'idle');
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

  elements.battleHistoryList.addEventListener('click', (event) => {
    const target = event.target;

    if (!(target instanceof HTMLElement)) {
      return;
    }

    const actionElement = target.closest<HTMLElement>('[data-action="delete-battle-result"]');

    if (!actionElement?.dataset.resultId) {
      return;
    }

    void deleteBattleHistoryResult(actionElement.dataset.resultId);
  });
  elements.resultsHistoryList.addEventListener('click', (event) => {
    const target = event.target;

    if (!(target instanceof HTMLElement)) {
      return;
    }

    const actionElement = target.closest<HTMLElement>('[data-action="delete-battle-result"]');

    if (!actionElement?.dataset.resultId) {
      return;
    }

    void deleteBattleHistoryResult(actionElement.dataset.resultId);
  });
  window.addEventListener('stadiumchange', () => {
    const hadSingleSimulation = Boolean(singleTopSimulation);
    const hadBattleSimulation = Boolean(battleSimulation);

    stopReplay();
    clearLatestTrace('Stadium changed. Run a new test to record results.', 'idle');
    disposeSimulation('Stadium changed. Preparing the selected stadium...');
    disposeBattleSimulation('Stadium changed. Launch after the new stadium loads.');

    if (hadBattleSimulation && battleSlots.left && battleSlots.right) {
      void prepareBattleForSlots();
      return;
    }

    if (hadSingleSimulation && activeDesignState?.storedId && activeDesignState.physicsProfile) {
      void prepareSimulationForActiveDesign();
    }
  });

  renderReferenceBeyOptions(elements);
  elements.battleSoundMuted.checked = strikeAudio.getMuted();
  elements.battleSoundVolume.value = String(strikeAudio.getVolume());
  syncBattleSoundControls();
  setPhysicsUnavailable('Load or save a design.');
  setSimulationUnavailable('Load or save a design.');
  setBattleUnavailable('Select saved designs for both slots.');
  renderResults();
  void refreshLibrary();
  void refreshBattleResults();
}

function getPanelElements() {
  return {
    importTabButton: queryRequired<HTMLButtonElement>('#import-tab-button'),
    libraryTabButton: queryRequired<HTMLButtonElement>('#library-tab-button'),
    physicsTabButton: queryRequired<HTMLButtonElement>('#physics-tab-button'),
    simTabButton: queryRequired<HTMLButtonElement>('#sim-tab-button'),
    battleTabButton: queryRequired<HTMLButtonElement>('#battle-tab-button'),
    resultsTabButton: queryRequired<HTMLButtonElement>('#results-tab-button'),
    importPane: queryRequired<HTMLElement>('#import-pane'),
    libraryPane: queryRequired<HTMLElement>('#library-pane'),
    physicsPane: queryRequired<HTMLElement>('#physics-pane'),
    simPane: queryRequired<HTMLElement>('#sim-pane'),
    battlePane: queryRequired<HTMLElement>('#battle-pane'),
    resultsPane: queryRequired<HTMLElement>('#results-pane'),
    fileInput: queryRequired<HTMLInputElement>('#design-file-input'),
    sampleButton: queryRequired<HTMLButtonElement>('#load-sample-button'),
    referenceBeySelect: queryRequired<HTMLSelectElement>('#reference-bey-select'),
    referenceBeyButton: queryRequired<HTMLButtonElement>('#load-reference-bey-button'),
    referenceBeySummary: queryRequired<HTMLElement>('#reference-bey-summary'),
    resetButton: queryRequired<HTMLButtonElement>('#reset-demo-button'),
    upAxisSelect: queryRequired<HTMLSelectElement>('#up-axis'),
    importStatus: queryRequired<HTMLElement>('#import-status'),
    libraryStatus: queryRequired<HTMLElement>('#library-status'),
    physicsStatus: queryRequired<HTMLElement>('#physics-status'),
    simStatus: queryRequired<HTMLElement>('#sim-status'),
    battleStatus: queryRequired<HTMLElement>('#battle-status'),
    libraryList: queryRequired<HTMLElement>('#library-list'),
    libraryEmptyState: queryRequired<HTMLElement>('#library-empty-state'),
    saveControls: queryRequired<HTMLElement>('#save-controls'),
    saveNameInput: queryRequired<HTMLInputElement>('#save-name-input'),
    saveButton: queryRequired<HTMLButtonElement>('#save-design-button'),
    savedStateLabel: queryRequired<HTMLElement>('#saved-state-label'),
    physicsProfileForm: queryRequired<HTMLFormElement>('#physics-profile-form'),
    savePhysicsButton: queryRequired<HTMLButtonElement>('#save-physics-button'),
    exportProfileButton: queryRequired<HTMLButtonElement>('#export-profile-button'),
    profileImportInput: queryRequired<HTMLInputElement>('#profile-import-input'),
    physicsSaveState: queryRequired<HTMLElement>('#physics-save-state'),
    physicsWeight: queryRequired<HTMLInputElement>('#physics-weight'),
    physicsRadius: queryRequired<HTMLInputElement>('#physics-radius'),
    physicsHeight: queryRequired<HTMLInputElement>('#physics-height'),
    physicsComX: queryRequired<HTMLInputElement>('#physics-com-x'),
    physicsComY: queryRequired<HTMLInputElement>('#physics-com-y'),
    physicsComZ: queryRequired<HTMLInputElement>('#physics-com-z'),
    physicsTipPreset: queryRequired<HTMLSelectElement>('#physics-tip-preset'),
    applyTipPresetButton: queryRequired<HTMLButtonElement>('#apply-tip-preset-button'),
    physicsTipType: queryRequired<HTMLSelectElement>('#physics-tip-type'),
    physicsTipFriction: queryRequired<HTMLInputElement>('#physics-tip-friction'),
    physicsRingFriction: queryRequired<HTMLInputElement>('#physics-ring-friction'),
    physicsAttackPoints: queryRequired<HTMLInputElement>('#physics-attack-points'),
    physicsAttackBias: queryRequired<HTMLInputElement>('#physics-attack-bias'),
    physicsRecoil: queryRequired<HTMLInputElement>('#physics-recoil'),
    physicsAirDrag: queryRequired<HTMLInputElement>('#physics-air-drag'),
    physicsSpinDamping: queryRequired<HTMLInputElement>('#physics-spin-damping'),
    physicsLaunchPreset: queryRequired<HTMLSelectElement>('#physics-launch-preset'),
    applyLaunchPresetButton: queryRequired<HTMLButtonElement>('#apply-launch-preset-button'),
    physicsLaunchRpm: queryRequired<HTMLInputElement>('#physics-launch-rpm'),
    physicsLaunchAngle: queryRequired<HTMLInputElement>('#physics-launch-angle'),
    physicsLaunchX: queryRequired<HTMLInputElement>('#physics-launch-x'),
    physicsLaunchZ: queryRequired<HTMLInputElement>('#physics-launch-z'),
    simControls: queryRequired<HTMLElement>('#sim-controls'),
    simTimeScale: queryRequired<HTMLSelectElement>('#sim-time-scale'),
    simLaunchButton: queryRequired<HTMLButtonElement>('#sim-launch-button'),
    simPauseButton: queryRequired<HTMLButtonElement>('#sim-pause-button'),
    simStepButton: queryRequired<HTMLButtonElement>('#sim-step-button'),
    simResetButton: queryRequired<HTMLButtonElement>('#sim-reset-button'),
    simStateValue: queryRequired<HTMLElement>('#sim-state-value'),
    simTimeValue: queryRequired<HTMLElement>('#sim-time-value'),
    simRpmValue: queryRequired<HTMLElement>('#sim-rpm-value'),
    simTiltValue: queryRequired<HTMLElement>('#sim-tilt-value'),
    simSpeedValue: queryRequired<HTMLElement>('#sim-speed-value'),
    simStopReasonValue: queryRequired<HTMLElement>('#sim-stop-reason-value'),
    battleLeftSelect: queryRequired<HTMLSelectElement>('#battle-left-select'),
    battleRightSelect: queryRequired<HTMLSelectElement>('#battle-right-select'),
    battleLeftSummary: queryRequired<HTMLElement>('#battle-left-summary'),
    battleRightSummary: queryRequired<HTMLElement>('#battle-right-summary'),
    battleLeftLaunchPreset: queryRequired<HTMLSelectElement>('#battle-left-launch-preset'),
    battleLeftApplyLaunchPreset: queryRequired<HTMLButtonElement>('#battle-left-apply-launch-preset'),
    battleRightLaunchPreset: queryRequired<HTMLSelectElement>('#battle-right-launch-preset'),
    battleRightApplyLaunchPreset: queryRequired<HTMLButtonElement>('#battle-right-apply-launch-preset'),
    battleLeftRpm: queryRequired<HTMLInputElement>('#battle-left-rpm'),
    battleLeftAngle: queryRequired<HTMLInputElement>('#battle-left-angle'),
    battleLeftX: queryRequired<HTMLInputElement>('#battle-left-x'),
    battleLeftZ: queryRequired<HTMLInputElement>('#battle-left-z'),
    battleRightRpm: queryRequired<HTMLInputElement>('#battle-right-rpm'),
    battleRightAngle: queryRequired<HTMLInputElement>('#battle-right-angle'),
    battleRightX: queryRequired<HTMLInputElement>('#battle-right-x'),
    battleRightZ: queryRequired<HTMLInputElement>('#battle-right-z'),
    battleTimeScale: queryRequired<HTMLSelectElement>('#battle-time-scale'),
    battleSoundMuted: queryRequired<HTMLInputElement>('#battle-sound-muted'),
    battleSoundVolume: queryRequired<HTMLInputElement>('#battle-sound-volume'),
    battleLaunchButton: queryRequired<HTMLButtonElement>('#battle-launch-button'),
    battlePauseButton: queryRequired<HTMLButtonElement>('#battle-pause-button'),
    battleStepButton: queryRequired<HTMLButtonElement>('#battle-step-button'),
    battleResetButton: queryRequired<HTMLButtonElement>('#battle-reset-button'),
    battleRepeatButton: queryRequired<HTMLButtonElement>('#battle-repeat-button'),
    battleResultLabel: queryRequired<HTMLElement>('#battle-result-label'),
    battleStateValue: queryRequired<HTMLElement>('#battle-state-value'),
    battleTimeValue: queryRequired<HTMLElement>('#battle-time-value'),
    battleLeftRpmValue: queryRequired<HTMLElement>('#battle-left-rpm-value'),
    battleRightRpmValue: queryRequired<HTMLElement>('#battle-right-rpm-value'),
    battleLeftTiltValue: queryRequired<HTMLElement>('#battle-left-tilt-value'),
    battleRightTiltValue: queryRequired<HTMLElement>('#battle-right-tilt-value'),
    battleLeftStopValue: queryRequired<HTMLElement>('#battle-left-stop-value'),
    battleRightStopValue: queryRequired<HTMLElement>('#battle-right-stop-value'),
    battleHistoryEmpty: queryRequired<HTMLElement>('#battle-history-empty'),
    battleHistoryList: queryRequired<HTMLElement>('#battle-history-list'),
    resultsStatus: queryRequired<HTMLElement>('#results-status'),
    resultsMetric: queryRequired<HTMLSelectElement>('#results-metric'),
    resultsChart: queryRequired<HTMLCanvasElement>('#results-chart'),
    resultsSummary: queryRequired<HTMLElement>('#results-summary'),
    replayButton: queryRequired<HTMLButtonElement>('#replay-button'),
    replayPauseButton: queryRequired<HTMLButtonElement>('#replay-pause-button'),
    replayTimeline: queryRequired<HTMLInputElement>('#replay-timeline'),
    replaySpeed: queryRequired<HTMLSelectElement>('#replay-speed'),
    contactEventsEmpty: queryRequired<HTMLElement>('#contact-events-empty'),
    contactEventsList: queryRequired<HTMLElement>('#contact-events-list'),
    resultsHistoryEmpty: queryRequired<HTMLElement>('#results-history-empty'),
    resultsHistoryList: queryRequired<HTMLElement>('#results-history-list'),
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

function renderReferenceBeyOptions(elements: ReturnType<typeof getPanelElements>): void {
  elements.referenceBeySelect.replaceChildren();

  for (const preset of REFERENCE_BEYBLADE_PRESETS) {
    const option = document.createElement('option');
    option.value = preset.id;
    option.textContent = preset.displayName;
    elements.referenceBeySelect.append(option);
  }

  renderReferenceBeySummary(elements);
}

function renderReferenceBeySummary(elements: ReturnType<typeof getPanelElements>): void {
  const preset = getReferenceBeybladePreset(elements.referenceBeySelect.value);

  if (!preset) {
    elements.referenceBeySummary.textContent = 'Measured test profiles for repeatable calibration.';
    return;
  }

  elements.referenceBeySummary.textContent = `${preset.dimensions.diameterMm.toFixed(2)} mm diameter, ${preset.dimensions.totalWeightGrams.toFixed(1)} g, ${preset.profile.contactProfile.attackPoints} strike points.`;
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

function renderBattleSelectors(designs: StoredDesignMetadata[], elements: ReturnType<typeof getPanelElements>): void {
  const currentLeft = elements.battleLeftSelect.value;
  const currentRight = elements.battleRightSelect.value;

  renderBattleSelector(elements.battleLeftSelect, designs, currentLeft);
  renderBattleSelector(elements.battleRightSelect, designs, currentRight);

  const hasDesigns = designs.length > 0;
  elements.battleLeftSelect.disabled = !hasDesigns;
  elements.battleRightSelect.disabled = !hasDesigns;
}

function renderBattleSelector(select: HTMLSelectElement, designs: StoredDesignMetadata[], selectedId: string): void {
  select.replaceChildren();

  const emptyOption = document.createElement('option');
  emptyOption.value = '';
  emptyOption.textContent = designs.length === 0 ? 'No saved designs' : 'Choose design';
  select.append(emptyOption);

  for (const design of designs) {
    const option = document.createElement('option');
    option.value = design.id;
    option.textContent = design.displayName;
    select.append(option);
  }

  select.value = designs.some((design) => design.id === selectedId) ? selectedId : '';
}

function renderBattleSlotSummary(
  side: BattleSide,
  design: StoredDesign | null,
  elements: ReturnType<typeof getPanelElements>,
): void {
  const summary = side === 'left' ? elements.battleLeftSummary : elements.battleRightSummary;

  if (!design) {
    summary.textContent = 'No design selected.';
    return;
  }

  summary.replaceChildren();

  const name = document.createElement('span');
  name.textContent = design.displayName;

  const details = document.createElement('small');
  details.textContent = `${design.fileType.toUpperCase()} · ${formatNumber(design.physicsProfile.weightGrams)} g · ${formatNumber(design.physicsProfile.defaultLaunchRpm)} RPM`;

  summary.append(name, details);
}

function setBattleLaunchInputs(
  side: BattleSide,
  profile: PhysicsProfile,
  elements: ReturnType<typeof getPanelElements>,
): void {
  const defaults = getDefaultBattleLaunchPosition(side);
  const controls = getBattleSlotControls(side, elements);

  controls.rpm.value = formatInputNumber(profile.defaultLaunchRpm);
  controls.angle.value = formatInputNumber(profile.defaultLaunchAngleDegrees);
  controls.x.value = formatInputNumber(defaults.x);
  controls.z.value = formatInputNumber(defaults.z);
}

function createBattleSlot(
  side: BattleSide,
  state: BattleSlotState,
  elements: ReturnType<typeof getPanelElements>,
): BattleSlot {
  const controls = getBattleSlotControls(side, elements);

  return {
    side,
    storedDesignId: state.storedDesign.id,
    displayName: state.storedDesign.displayName,
    design: state.loadedDesign,
    profile: state.storedDesign.physicsProfile,
    launchSettings: {
      rpm: readNumber(controls.rpm),
      angleDegrees: readNumber(controls.angle),
      position: {
        x: readNumber(controls.x),
        z: readNumber(controls.z),
      },
    },
  };
}

function getBattleSlotControls(side: BattleSide, elements: ReturnType<typeof getPanelElements>) {
  if (side === 'left') {
    return {
      rpm: elements.battleLeftRpm,
      angle: elements.battleLeftAngle,
      x: elements.battleLeftX,
      z: elements.battleLeftZ,
    };
  }

  return {
    rpm: elements.battleRightRpm,
    angle: elements.battleRightAngle,
    x: elements.battleRightX,
    z: elements.battleRightZ,
  };
}

function getDefaultBattleLaunchPosition(side: BattleSide): { x: number; z: number } {
  return side === 'left' ? { x: -1.4, z: 0 } : { x: 1.4, z: 0 };
}

function renderBattleResults(results: BattleResult[], elements: ReturnType<typeof getPanelElements>): void {
  renderBattleResultList(results, elements.battleHistoryList, elements.battleHistoryEmpty);
  renderBattleResultList(results, elements.resultsHistoryList, elements.resultsHistoryEmpty);
}

function renderBattleResultList(results: BattleResult[], list: HTMLElement, emptyState: HTMLElement): void {
  list.replaceChildren();
  emptyState.hidden = results.length > 0;

  for (const result of results) {
    const card = document.createElement('article');
    card.className = 'battle-history-card';

    const headline = document.createElement('p');
    headline.textContent = `${result.leftDisplayName} vs ${result.rightDisplayName}`;

    const metadata = document.createElement('small');
    metadata.textContent = `${formatBattleWinner(result.winner)} · ${formatBattleReason(result.resultReason)} · ${result.durationSeconds.toFixed(2)} s · ${formatDate(result.createdAt)}`;

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'button button-danger';
    deleteButton.textContent = 'Delete Result';
    deleteButton.dataset.action = 'delete-battle-result';
    deleteButton.dataset.resultId = result.id;

    card.append(headline, metadata, deleteButton);
    list.append(card);
  }
}

function renderTraceResults(
  trace: SimulationTrace | null,
  elements: ReturnType<typeof getPanelElements>,
  metric: SimulationMetric,
): void {
  drawTraceChart(elements.resultsChart, trace, metric);
  renderContactEvents(trace, elements);
  elements.resultsSummary.textContent = formatTraceSummary(trace);

  const duration = getTraceDuration(trace);
  elements.replayTimeline.max = String(duration);

  if (!trace || trace.samples.length === 0) {
    elements.replayTimeline.value = '0';
  }
}

function renderContactEvents(trace: SimulationTrace | null, elements: ReturnType<typeof getPanelElements>): void {
  elements.contactEventsList.replaceChildren();
  const events = trace?.contactEvents ?? [];
  elements.contactEventsEmpty.hidden = events.length > 0;

  for (const event of events.slice(-12)) {
    const item = document.createElement('p');
    item.className = 'contact-event';
    item.textContent = `${event.timeSeconds.toFixed(2)} s · ${event.relativeSpeed.toFixed(2)} speed`;
    elements.contactEventsList.append(item);
  }
}

function drawTraceChart(canvas: HTMLCanvasElement, trace: SimulationTrace | null, metric: SimulationMetric): void {
  const context = canvas.getContext('2d');

  if (!context) {
    return;
  }

  const bounds = canvas.getBoundingClientRect();
  const pixelRatio = Math.max(window.devicePixelRatio || 1, 1);
  const width = Math.max(Math.round((bounds.width || canvas.width) * pixelRatio), 320);
  const height = Math.max(Math.round((bounds.height || canvas.height) * pixelRatio), 180);

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  context.clearRect(0, 0, width, height);
  context.fillStyle = '#f8fafb';
  context.fillRect(0, 0, width, height);

  const padding = {
    top: 22 * pixelRatio,
    right: 18 * pixelRatio,
    bottom: 30 * pixelRatio,
    left: 48 * pixelRatio,
  };
  const chartWidth = Math.max(width - padding.left - padding.right, 1);
  const chartHeight = Math.max(height - padding.top - padding.bottom, 1);

  context.strokeStyle = '#c8d2d9';
  context.lineWidth = 1 * pixelRatio;
  context.strokeRect(padding.left, padding.top, chartWidth, chartHeight);

  if (!trace || trace.samples.length === 0) {
    context.fillStyle = '#64717a';
    context.font = `${12 * pixelRatio}px Inter, sans-serif`;
    context.fillText('No run recorded', padding.left + 10 * pixelRatio, padding.top + 24 * pixelRatio);
    return;
  }

  const duration = Math.max(getTraceDuration(trace), 0.001);
  const series = getTraceSeries(trace, metric);
  const values = series.flatMap((item) => item.values.map((point) => point.value));
  const maxValue = Math.max(...values, 1);
  const minValue = metric === 'position' ? 0 : Math.min(...values, 0);
  const valueRange = Math.max(maxValue - minValue, 0.001);

  context.strokeStyle = '#e1e7eb';
  context.lineWidth = 1 * pixelRatio;
  for (let index = 1; index < 4; index += 1) {
    const y = padding.top + (chartHeight / 4) * index;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(padding.left + chartWidth, y);
    context.stroke();
  }

  for (const event of trace.contactEvents) {
    const x = padding.left + (event.timeSeconds / duration) * chartWidth;
    context.strokeStyle = 'rgba(187, 51, 64, 0.42)';
    context.beginPath();
    context.moveTo(x, padding.top);
    context.lineTo(x, padding.top + chartHeight);
    context.stroke();
  }

  for (const item of series) {
    context.strokeStyle = item.color;
    context.lineWidth = 2 * pixelRatio;
    context.beginPath();

    item.values.forEach((point, index) => {
      const x = padding.left + (point.timeSeconds / duration) * chartWidth;
      const y = padding.top + chartHeight - ((point.value - minValue) / valueRange) * chartHeight;

      if (index === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    });

    context.stroke();
  }

  context.fillStyle = '#303b43';
  context.font = `${11 * pixelRatio}px Inter, sans-serif`;
  context.fillText(formatMetricLabel(metric), padding.left, padding.top - 8 * pixelRatio);
  context.fillText(`${duration.toFixed(2)} s`, padding.left + chartWidth - 42 * pixelRatio, padding.top + chartHeight + 20 * pixelRatio);

  series.forEach((item, index) => {
    context.fillStyle = item.color;
    context.fillRect(padding.left + index * 82 * pixelRatio, padding.top + chartHeight + 12 * pixelRatio, 10 * pixelRatio, 3 * pixelRatio);
    context.fillText(item.label, padding.left + 14 * pixelRatio + index * 82 * pixelRatio, padding.top + chartHeight + 20 * pixelRatio);
  });
}

function getTraceSeries(trace: SimulationTrace, metric: SimulationMetric) {
  if (trace.mode === 'single') {
    return [
      {
        label: 'Top',
        color: '#238fbd',
        values: trace.samples
          .filter((sample) => sample.single)
          .map((sample) => ({
            timeSeconds: sample.elapsedSeconds,
            value: getMetricValue(sample.single!, metric),
          })),
      },
    ];
  }

  return [
    {
      label: 'Left',
      color: '#bb3340',
      values: trace.samples
        .filter((sample) => sample.left)
        .map((sample) => ({
          timeSeconds: sample.elapsedSeconds,
          value: getMetricValue(sample.left!, metric),
        })),
    },
    {
      label: 'Right',
      color: '#238fbd',
      values: trace.samples
        .filter((sample) => sample.right)
        .map((sample) => ({
          timeSeconds: sample.elapsedSeconds,
          value: getMetricValue(sample.right!, metric),
        })),
    },
  ];
}

function getMetricValue(sample: { spinRpm: number; tiltDegrees: number; speed: number; radialDistance: number }, metric: SimulationMetric): number {
  if (metric === 'spinRpm') {
    return sample.spinRpm;
  }

  if (metric === 'tiltDegrees') {
    return sample.tiltDegrees;
  }

  if (metric === 'speed') {
    return sample.speed;
  }

  return sample.radialDistance;
}

function formatMetricLabel(metric: SimulationMetric): string {
  if (metric === 'spinRpm') {
    return 'Spin RPM';
  }

  if (metric === 'tiltDegrees') {
    return 'Tilt';
  }

  if (metric === 'speed') {
    return 'Speed';
  }

  return 'Position';
}

function formatTraceSummary(trace: SimulationTrace | null): string {
  if (!trace || trace.samples.length === 0) {
    return 'No run recorded.';
  }

  const duration = getTraceDuration(trace);
  const contacts = trace.contactEvents.length;
  const result = trace.resultLabel ? ` · ${formatTraceResultLabel(trace.resultLabel)}` : '';

  return `${trace.label} · ${duration.toFixed(2)} s · ${trace.samples.length} samples · ${contacts} contacts${result}`;
}

function formatTraceResultLabel(label: string): string {
  return label
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function canReplayTrace(
  trace: SimulationTrace,
  activeDesignState: ActiveDesignState | null,
  lastBattleSlots: { left: BattleSlot; right: BattleSlot } | null,
): boolean {
  return trace.mode === 'single' ? Boolean(activeDesignState) : Boolean(lastBattleSlots);
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
  elements.physicsAttackPoints.value = formatInputNumber(profile.contactProfile.attackPoints);
  elements.physicsAttackBias.value = formatInputNumber(profile.contactProfile.attackBias);
  elements.physicsRecoil.value = formatInputNumber(profile.contactProfile.recoilCoefficient);
  elements.physicsAirDrag.value = formatInputNumber(profile.airDragCoefficient);
  elements.physicsSpinDamping.value = formatInputNumber(profile.spinDampingCoefficient);
  elements.physicsLaunchRpm.value = formatInputNumber(profile.defaultLaunchRpm);
  elements.physicsLaunchAngle.value = formatInputNumber(profile.defaultLaunchAngleDegrees);
  elements.physicsLaunchX.value = formatInputNumber(profile.defaultLaunchPosition.x);
  elements.physicsLaunchZ.value = formatInputNumber(profile.defaultLaunchPosition.z);
}

function readPhysicsProfileFromForm(
  elements: ReturnType<typeof getPanelElements>,
  currentProfile: PhysicsProfile,
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
    contactProfile: {
      attackPoints: readNumber(elements.physicsAttackPoints),
      attackBias: readNumber(elements.physicsAttackBias),
      recoilCoefficient: readNumber(elements.physicsRecoil),
    },
    airDragCoefficient: readNumber(elements.physicsAirDrag),
    spinDampingCoefficient: readNumber(elements.physicsSpinDamping),
    defaultLaunchRpm: readNumber(elements.physicsLaunchRpm),
    defaultLaunchAngleDegrees: readNumber(elements.physicsLaunchAngle),
    defaultLaunchPosition: {
      x: readNumber(elements.physicsLaunchX),
      z: readNumber(elements.physicsLaunchZ),
    },
    updatedAt: currentProfile.updatedAt,
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
    contactProfile: profile.contactProfile,
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

function readNumber(input: HTMLInputElement | HTMLSelectElement): number {
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

function downloadTextFile(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function sanitizeDownloadName(value: string): string {
  const sanitized = value.trim().replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();

  return sanitized.length > 0 ? sanitized : 'beyblade';
}

function formatSimulationStatus(status: SimulationTelemetry['status']): string {
  const labels: Record<SimulationTelemetry['status'], string> = {
    initializing: 'Initializing',
    ready: 'Ready',
    running: 'Running',
    paused: 'Paused',
    stopped: 'Stopped',
    error: 'Error',
  };

  return labels[status];
}

function formatStopReason(reason: SimulationTelemetry['stopReason']): string {
  if (reason === 'spin_below_threshold') {
    return 'Low spin';
  }

  if (reason === 'tilt_limit') {
    return 'Tilt limit';
  }

  if (reason === 'arena_exit') {
    return 'Arena exit';
  }

  if (reason === 'manual_reset') {
    return 'Manual reset';
  }

  return 'None';
}

function formatBattleSide(side: BattleSide): string {
  return side === 'left' ? 'Left' : 'Right';
}

function formatBattleResult(telemetry: BattleTelemetry | null): string {
  if (!telemetry) {
    return 'No result yet.';
  }

  if (telemetry.status === 'running') {
    return 'Battle in progress.';
  }

  if (telemetry.status === 'paused') {
    return 'Battle paused.';
  }

  if (telemetry.status === 'ready') {
    return 'Ready to battle.';
  }

  if (telemetry.status === 'error') {
    return telemetry.errorMessage ?? 'Battle error.';
  }

  return `${formatBattleWinner(telemetry.winner)} · ${formatBattleReason(telemetry.resultReason)}`;
}

function formatBattleWinner(winner: BattleTelemetry['winner']): string {
  if (winner === 'left') {
    return 'Left wins';
  }

  if (winner === 'right') {
    return 'Right wins';
  }

  if (winner === 'draw') {
    return 'Draw';
  }

  return 'No winner';
}

function formatBattleReason(reason: BattleTelemetry['resultReason']): string {
  if (reason === 'left_ring_out') {
    return 'Left ring-out';
  }

  if (reason === 'right_ring_out') {
    return 'Right ring-out';
  }

  if (reason === 'left_stopped') {
    return 'Left stopped';
  }

  if (reason === 'right_stopped') {
    return 'Right stopped';
  }

  if (reason === 'draw') {
    return 'Draw window';
  }

  if (reason === 'manual_reset') {
    return 'Manual reset';
  }

  return 'No result';
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
