// Glox Studio Phase 1 — workbench shell + built-in Glox panels
import '@codingame/monaco-vscode-theme-defaults-default-extension';
import '@codingame/monaco-vscode-theme-seti-default-extension';
import '@codingame/monaco-vscode-javascript-default-extension';
import '@codingame/monaco-vscode-html-default-extension';
import '@codingame/monaco-vscode-css-default-extension';
import '@codingame/monaco-vscode-json-default-extension';
// Glox extension: Preview webview, Run command, nav sidebar, toggle
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker.js?worker';
import ExtensionHostWorker from '@codingame/monaco-vscode-api/workers/extensionHost.worker?worker';
import TextMateWorker from '@codingame/monaco-vscode-textmate-service-override/worker?worker';
import SearchWorker from '@codingame/monaco-vscode-search-service-override/worker?worker';
import OutputLinkWorker from '@codingame/monaco-vscode-output-service-override/worker?worker';
// Extension-host iframe asks for a URL string via getWorkerUrl (not getWorker).
import extensionHostWorkerUrl from '@codingame/monaco-vscode-api/workers/extensionHost.worker?worker&url';
// Glox built-ins (Preview as editor tab + commands) — registered directly with
// the workbench, no vsix, cannot be uninstalled.
import './glox';
import { seedPreviewDoc } from './glox';
import './style.css';
import { bootProject, applyProjectToProvider, registerProjectCommands } from './project';
import * as monaco from 'monaco-editor';
import * as vscode from 'vscode';
import {
  initialize as initializeMonacoService,
  type IEditorOverrideServices
} from '@codingame/monaco-vscode-api';
import getConfigurationServiceOverride, {
  initUserConfiguration
} from '@codingame/monaco-vscode-configuration-service-override';
import { initUserKeybindings } from '@codingame/monaco-vscode-keybindings-service-override';
import {
  RegisteredFileSystemProvider,
  RegisteredMemoryFile,
  registerFileSystemOverlay
} from '@codingame/monaco-vscode-files-service-override';
import getModelServiceOverride from '@codingame/monaco-vscode-model-service-override';
import getNotificationServiceOverride from '@codingame/monaco-vscode-notifications-service-override';
import getDialogsServiceOverride from '@codingame/monaco-vscode-dialogs-service-override';
import getTextmateServiceOverride from '@codingame/monaco-vscode-textmate-service-override';
import getThemeServiceOverride from '@codingame/monaco-vscode-theme-service-override';
import getLanguagesServiceOverride from '@codingame/monaco-vscode-languages-service-override';
import getWorkbenchServiceOverride from '@codingame/monaco-vscode-workbench-service-override';
import getQuickAccessServiceOverride from '@codingame/monaco-vscode-quickaccess-service-override';
import getStorageServiceOverride from '@codingame/monaco-vscode-storage-service-override';
import getExtensionServiceOverride from '@codingame/monaco-vscode-extensions-service-override';
import getExtensionGalleryServiceOverride from '@codingame/monaco-vscode-extension-gallery-service-override';
import getExplorerServiceOverride from '@codingame/monaco-vscode-explorer-service-override';
import getSearchServiceOverride from '@codingame/monaco-vscode-search-service-override';
import getMarkersServiceOverride from '@codingame/monaco-vscode-markers-service-override';
import getOutputServiceOverride from '@codingame/monaco-vscode-output-service-override';
import getStatusBarServiceOverride from '@codingame/monaco-vscode-view-status-bar-service-override';
import getTitleBarServiceOverride from '@codingame/monaco-vscode-view-title-bar-service-override';
import getLifecycleServiceOverride from '@codingame/monaco-vscode-lifecycle-service-override';
import getEnvironmentServiceOverride from '@codingame/monaco-vscode-environment-service-override';
import getWorkspaceTrustServiceOverride from '@codingame/monaco-vscode-workspace-trust-service-override';
import getWorkingCopyServiceOverride from '@codingame/monaco-vscode-working-copy-service-override';
import getPreferencesServiceOverride from '@codingame/monaco-vscode-preferences-service-override';
import getSnippetServiceOverride from '@codingame/monaco-vscode-snippets-service-override';
import getEmmetServiceOverride from '@codingame/monaco-vscode-emmet-service-override';
import getAccessibilityServiceOverride from '@codingame/monaco-vscode-accessibility-service-override';
import type { IWorkbenchConstructionOptions } from '@codingame/monaco-vscode-api';
import { EnvironmentOverride } from '@codingame/monaco-vscode-api/workbench';

// In-memory workspace, filled from the Glox backend project (?id=) or demo files
const fileSystemProvider = new RegisteredFileSystemProvider(false);
const boot = await bootProject();
applyProjectToProvider(fileSystemProvider, boot);
fileSystemProvider.registerFile(
  new RegisteredMemoryFile(
    monaco.Uri.file('/workspace.code-workspace'),
    JSON.stringify({ folders: [{ path: '/workspace', name: boot.title }] }, null, 2)
  )
);
registerFileSystemOverlay(1, fileSystemProvider);
const firstFile =
  boot.files['index.html'] != null
    ? '/workspace/index.html'
    : '/workspace/' + Object.keys(boot.files)[0];

// Workers as bundled constructors (Vite ?worker chunks — self-contained, correct URLs).
// NOTE: getWorkerUrl/getWorkerOptions are intentionally absent: the lib falls back
// to getWorker, and URL strings built with `new URL(pkg-path, import.meta.url)`
// 404 in production builds (Vite only rewrites relative asset paths).
const win = window as unknown as { MonacoEnvironment?: unknown };
win.MonacoEnvironment = {
  // Called by the web-worker extension-host iframe: must return a URL string.
  // Other labels fall through to getWorker below.
  getWorkerUrl: function (_moduleId: unknown, label: string) {
    if (label === 'extensionHostWorkerMain') return extensionHostWorkerUrl;
    return undefined;
  },
  // extensionHost.worker is an ES module (uses import.meta) — classic Worker
  // would crash on importScripts; the iframe path reads options from here.
  getWorkerOptions: function (_moduleId: unknown, label: string) {
    if (label === 'extensionHostWorkerMain') return { type: 'module' };
    return undefined;
  },
  getWorker: function (_moduleId: unknown, label: string) {
    switch (label) {
      case 'editorWorkerService':
      case 'TextEditorWorker':
        return new EditorWorker();
      case 'extensionHostWorkerMain':
        return new ExtensionHostWorker();
      case 'TextMateWorker':
        return new TextMateWorker();
      case 'LocalFileSearchWorker':
        return new SearchWorker();
      case 'OutputLinkDetectionWorker':
        return new OutputLinkWorker();
      default:
        throw new Error(`Worker ${label} not found`);
    }
  }
};

// Dark default before init (prevents theme flicker)
await Promise.all([
  initUserConfiguration(
    JSON.stringify({ 'workbench.colorTheme': 'Default Dark+', 'workbench.iconTheme': 'vs-seti', 'editor.fontSize': 13 })
  ),
  // Desktop VS Code (incl. Simple Browser) swallows Ctrl+Shift+P, so our own
  // palette gets an unbound-by-default chord that passes through to the page.
  initUserKeybindings(
    JSON.stringify([
      { key: 'ctrl+shift+alt+p', command: 'workbench.action.showCommands' }
    ])
  )
]);

const commonServices: IEditorOverrideServices = {
  ...getModelServiceOverride(),
  ...getNotificationServiceOverride(),
  ...getDialogsServiceOverride(),
  ...getConfigurationServiceOverride(),
  ...getTextmateServiceOverride(),
  ...getThemeServiceOverride(),
  ...getLanguagesServiceOverride(),
  ...getExtensionServiceOverride({ enableWorkerExtensionHost: true }),
  ...getExtensionGalleryServiceOverride({ webOnly: false }),
  ...getModelServiceOverride(),
  ...getStorageServiceOverride(),
  ...getExplorerServiceOverride(),
  ...getSearchServiceOverride(),
  ...getMarkersServiceOverride(),
  ...getOutputServiceOverride(),
  ...getStatusBarServiceOverride(),
  ...getTitleBarServiceOverride(),
  ...getLifecycleServiceOverride(),
  ...getEnvironmentServiceOverride(),
  ...getWorkspaceTrustServiceOverride(),
  ...getWorkingCopyServiceOverride(),
  ...getPreferencesServiceOverride(),
  ...getSnippetServiceOverride(),
  ...getEmmetServiceOverride(),
  ...getAccessibilityServiceOverride()
};

const constructOptions: IWorkbenchConstructionOptions = {
  // Workspace trust disabled entirely: everything is always trusted (no Restricted Mode)
  enableWorkspaceTrust: false,
  windowIndicator: { label: 'Glox Studio', tooltip: '', command: '' },
  workspaceProvider: {
    trusted: true,
    async open() {
      window.open(window.location.href);
      return true;
    },
    workspace: { workspaceUri: monaco.Uri.file('/workspace.code-workspace') }
  },
  defaultLayout: {
    editors: [
      { uri: monaco.Uri.file(firstFile), viewColumn: 1 }
    ]
  },
  productConfiguration: {
    nameShort: 'Glox Studio',
    nameLong: 'Glox Studio',
    extensionsGallery: {
      serviceUrl: 'https://open-vsx.org/vscode/gallery',
      resourceUrlTemplate:
        'https://open-vsx.org/vscode/unpkg/{publisher}/{name}/{version}/{path}',
      extensionUrlTemplate: 'https://open-vsx.org/vscode/gallery/{publisher}/{name}/latest',
      controlUrl: '',
      nlsBaseUrl: ''
    }
  },
  configurationDefaults: {
    'window.title': 'Glox Studio${separator}${dirty}${activeEditorShort}'
  }
};

const envOptions: EnvironmentOverride = {
  userHome: vscode.Uri.file('/')
};

// Shadow DOM keeps workbench CSS off the rest of the page (and vice versa)
let container: HTMLElement = document.getElementById('workbench')!;
container.style.height = '100vh';
const shadowRoot = container.attachShadow({ mode: 'open' });
const workbenchElement = document.createElement('div');
workbenchElement.style.height = '100vh';
shadowRoot.appendChild(workbenchElement);

await initializeMonacoService(
  {
    ...commonServices,
    ...getWorkbenchServiceOverride(),
    ...getQuickAccessServiceOverride({
      isKeybindingConfigurationVisible: () => true,
      shouldUseGlobalPicker: () => true
    })
  },
  workbenchElement,
  constructOptions,
  envOptions
);

// Phase 2 — Glox: Save project / Import files / Import folder / Export as zip
registerProjectCommands();

// Seed Preview's fallback doc so first-open Preview renders with zero clicks.
void seedPreviewDoc();

// ---- Glox icon in the title bar (highest bar) ------------------------------
// Wait for title bar to mount, then prepend the cube + open-Preview click.
async function mountTitleBarGloxIcon(): Promise<void> {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const titleBar = shadowRoot.querySelector(
      '[class*="titlebar"], [class*="title-bar"], .part.titlebar'
    );
    if (titleBar != null) {
      const btn = document.createElement('button');
      btn.id = 'glox-title-icon';
      btn.title = 'Glox: Open Preview';
      btn.style.cssText =
        'display:flex;align-items:center;justify-content:center;width:28px;height:24px;' +
        'background:transparent;border:none;cursor:pointer;padding:0;margin-right:6px;flex:0 0 auto;';
      const img = document.createElement('img');
      img.src = new URL('./glox.svg', import.meta.url).toString();
      img.alt = 'Glox';
      img.style.cssText = 'width:18px;height:18px;display:block;';
      btn.append(img);
      btn.onclick = () => {
        void vscode.commands.executeCommand('glox.openPreview');
      };
      // Prefer the left cluster (back/forward) so icon sits at the far left of the top bar.
      const left =
        titleBar.querySelector('[class*="navigation"]') ??
        titleBar.querySelector('[class*="left"]') ??
        titleBar;
      left.prepend(btn);
      return;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
}
void mountTitleBarGloxIcon();
