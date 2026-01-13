type BackgroundModule = typeof import('./background');

let backgroundModulePromise: Promise<BackgroundModule> | null = null;
let backgroundRotationStarted = false;

function loadBackgroundModule() {
  if (!backgroundModulePromise) backgroundModulePromise = import('./background');
  return backgroundModulePromise;
}

export async function kickDynamicBackground(options?: { force?: boolean }) {
  const mod = await loadBackgroundModule();
  if (!backgroundRotationStarted) {
    backgroundRotationStarted = true;
    mod.startBackgroundRotation();
  }
  mod.initDynamicBackground(options);
}

