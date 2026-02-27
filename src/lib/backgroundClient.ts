type BackgroundModule = typeof import('./background');

let backgroundModulePromise: Promise<BackgroundModule> | null = null;

function loadBackgroundModule() {
  if (!backgroundModulePromise) backgroundModulePromise = import('./background');
  return backgroundModulePromise;
}

export async function kickDynamicBackground(options?: { force?: boolean }) {
  const mod = await loadBackgroundModule();
  // Always (re)start rotation scheduling: this recovers when startup happened offline/save-data.
  mod.startBackgroundRotation();
  mod.initDynamicBackground(options);
}
