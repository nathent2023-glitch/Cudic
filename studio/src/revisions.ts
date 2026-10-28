// Revision history: snapshot/restore project files against the account.
import * as vscode from 'vscode';
import {
  registerAction2,
  Action2,
  MenuId
} from '@codingame/monaco-vscode-api/vscode/vs/platform/actions/common/actions';
import { getToken, getProjectId, collectTextFiles, apiBase, headers } from './project';

async function snapshots() {
  const id = getProjectId();
  if (!id) return null;
  const tok = getToken();
  const res = await fetch(apiBase() + '/api/games/' + encodeURIComponent(id) + '/revisions', { headers: headers(!!tok) });
  if (!res.ok) return null;
  const d = await res.json();
  return d.revisions || [];
}

async function createSnapshot() {
  const id = getProjectId();
  if (!id) { vscode.window.showInformationMessage('Save the project first — you can snapshot after it has an id.'); return; }
  const label = await vscode.window.showInputBox({ prompt: 'Snapshot label (optional)', placeHolder: 'e.g. "before adding powerups"', value: '' });
  if (label === undefined) return;
  const tok = getToken();
  if (!tok) { vscode.window.showInformationMessage('Sign in to snapshot.'); return; }
  const files = await collectTextFiles();
  const res = await fetch(apiBase() + '/api/games/' + encodeURIComponent(id) + '/revisions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
    body: JSON.stringify({ label: label || '' , files })
  });
  const d = await res.json();
  if (d.revision) vscode.window.showInformationMessage('Snapshot saved: ' + d.revision.label);
  else vscode.window.showErrorMessage(d.error || 'Snapshot failed.');
}

async function restoreSnapshot() {
  const id = getProjectId();
  if (!id) { vscode.window.showInformationMessage('No project open.'); return; }
  const tok = getToken();
  if (!tok) { vscode.window.showInformationMessage('Sign in to restore.'); return; }
  const list = await snapshots();
  if (!list || !list.length) { vscode.window.showInformationMessage('No snapshots yet — create one first.'); return; }
  const pick = await vscode.window.showQuickPick(
    list.map((r: { id: string; label: string; created_at: string }) => ({
      label: r.label,
      description: new Date(r.created_at).toLocaleString(),
      detail: 'Restore this snapshot into the current project',
      id: r.id
    })),
    { placeHolder: 'Choose a snapshot to restore' }
  );
  if (!pick) return;
  const res = await fetch(apiBase() + '/api/games/' + encodeURIComponent(id) + '/revisions/' + encodeURIComponent(pick.id) + '/restore', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + tok }
  });
  const d = await res.json();
  if (d.ok) {
    vscode.window.showInformationMessage('Restored — reloading project…');
    setTimeout(() => location.reload(), 600);
  } else {
    vscode.window.showErrorMessage(d.error || 'Restore failed.');
  }
}

export function registerRevisionCommands(): void {
  registerAction2(
    class extends Action2 {
      constructor() {
        super({
          id: 'glox.snapshot',
          title: { value: 'Cudic: Save snapshot', original: 'Cudic: Save snapshot' },
          menu: [{ id: MenuId.CommandPalette }, { id: MenuId.MenubarFileMenu, group: '5_glox' }]
        });
      }
      async run(): Promise<void> { await createSnapshot(); }
    }
  );
  registerAction2(
    class extends Action2 {
      constructor() {
        super({
          id: 'glox.snapshotList',
          title: { value: 'Cudic: Restore snapshot…', original: 'Cudic: Restore snapshot…' },
          menu: [{ id: MenuId.CommandPalette }, { id: MenuId.MenubarFileMenu, group: '5_glox' }]
        });
      }
      async run(): Promise<void> { await restoreSnapshot(); }
    }
  );
}
