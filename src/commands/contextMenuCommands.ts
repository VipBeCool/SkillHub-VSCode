import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { SkillTreeItem } from '../views/SkillTreeItem';
import { Skill, Prompt } from '../types';

// Helper to extract path and name
function getSourceData(itemOrSkill: any): { sourcePath: string; name: string } {
  let data: any;
  if (itemOrSkill instanceof SkillTreeItem) {
    data = itemOrSkill.data;
  } else {
    data = itemOrSkill;
  }
  return {
    sourcePath: data.local_path || data.path,
    name: data.name
  };
}

export async function uninstallSkillCommand(itemOrSkill: SkillTreeItem | import('../types').Skill | import('../types').GroupedRepo) {
  const { sourcePath, name } = getSourceData(itemOrSkill);
  
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showWarningMessage('请先打开一个工作区。');
    return;
  }

  const workspacePath = workspaceFolders[0].uri.fsPath;
  const agentsSkillsDir = path.join(workspacePath, '.agents', 'skills');
  const isDir = fs.statSync(sourcePath).isDirectory();
  let targetName = path.basename(sourcePath);
  if (!isDir || targetName === 'SKILL.md') {
      targetName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
  }
  
  const targetPath = path.join(agentsSkillsDir, targetName);

  if (!fs.existsSync(targetPath)) {
    vscode.window.showInformationMessage(`当前工作区并未链接该技能。`);
    return;
  }

  try {
    fs.rmSync(targetPath, { recursive: true, force: true });
    vscode.window.showInformationMessage(`✅ 成功断开技能 '${name}' 与当前工作区的连接！`);
  } catch (err: any) {
    vscode.window.showErrorMessage(`断开连接失败: ${err.message}`);
  }
}

export async function openInVSCodeCommand(itemOrSkill: SkillTreeItem | Skill) {
  const { sourcePath } = getSourceData(itemOrSkill);
  if (!sourcePath || !fs.existsSync(sourcePath)) return;

  const stat = fs.statSync(sourcePath);
  let filePathToOpen = sourcePath;
  
  if (stat.isDirectory()) {
    const mdPath = path.join(sourcePath, 'SKILL.md');
    if (fs.existsSync(mdPath)) {
      filePathToOpen = mdPath;
    } else {
      vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(sourcePath), true);
      return;
    }
  }

  try {
    const doc = await vscode.workspace.openTextDocument(filePathToOpen);
    await vscode.window.showTextDocument(doc);
  } catch (err: any) {
    vscode.window.showErrorMessage(`无法在 VS Code 中打开: ${err.message}`);
  }
}

export async function revealInFinderCommand(itemOrSkill: SkillTreeItem | import('../types').Skill | import('../types').GroupedRepo) {
  const { sourcePath } = getSourceData(itemOrSkill);
  if (!sourcePath || !fs.existsSync(sourcePath)) return;
  const stat = fs.statSync(sourcePath);
  const targetPath = stat.isDirectory() ? sourcePath : path.dirname(sourcePath);
  vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(targetPath));
}

export async function openInTerminalCommand(itemOrSkill: SkillTreeItem | import('../types').Skill | import('../types').GroupedRepo) {
  const { sourcePath, name } = getSourceData(itemOrSkill);
  if (!sourcePath || !fs.existsSync(sourcePath)) return;
  
  const stat = fs.statSync(sourcePath);
  const cwd = stat.isDirectory() ? sourcePath : path.dirname(sourcePath);

  const terminal = vscode.window.createTerminal({
    name: name,
    cwd: cwd
  });
  terminal.show();
}

export async function copyPathCommand(itemOrSkill: SkillTreeItem | import('../types').Skill | import('../types').GroupedRepo) {
  const { sourcePath } = getSourceData(itemOrSkill);
  if (sourcePath && fs.existsSync(sourcePath)) {
    const stat = fs.statSync(sourcePath);
    const targetPath = stat.isDirectory() ? sourcePath : path.dirname(sourcePath);
    await vscode.env.clipboard.writeText(targetPath);
    vscode.window.setStatusBarMessage(`已复制目录路径: ${targetPath}`, 3000);
  }
}

export async function copyPromptContentCommand(itemOrPrompt: SkillTreeItem | import('../types').Prompt) {
  let prompt: import('../types').Prompt;
  if (itemOrPrompt instanceof SkillTreeItem) {
    prompt = itemOrPrompt.data as import('../types').Prompt;
  } else {
    prompt = itemOrPrompt as import('../types').Prompt;
  }
  
  if (prompt && prompt.content) {
    await vscode.env.clipboard.writeText(prompt.content);
    vscode.window.showInformationMessage(`✅ 已复制提示词: ${prompt.title}`);
  }
}
