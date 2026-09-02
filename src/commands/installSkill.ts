import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Skill } from '../types';
import { SkillTreeItem } from '../views/SkillTreeItem';

export async function installSkillCommand(itemOrSkill: SkillTreeItem | import('../types').Skill | import('../types').GroupedRepo) {
  let data: any;
  if (itemOrSkill instanceof SkillTreeItem) {
    data = itemOrSkill.data;
  } else {
    data = itemOrSkill;
  }

  // Support both Skill and GroupedRepo
  const sourcePath = data.local_path || data.path;
  const name = data.name;

  if (sourcePath && (sourcePath.startsWith('http://') || sourcePath.startsWith('https://'))) {
    vscode.window.showInformationMessage(`'${name}' 是一个在线技能，无法直接安装到本地工作区。`);
    return;
  }

  if (!sourcePath || !fs.existsSync(sourcePath)) {
    vscode.window.showErrorMessage(`技能源路径不存在或不可访问: ${sourcePath}`);
    return;
  }

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showWarningMessage('请先在 VS Code 中打开一个项目文件夹（Workspace）。');
    return;
  }

  const workspacePath = workspaceFolders[0].uri.fsPath;
  const agentsSkillsDir = path.join(workspacePath, '.agents', 'skills');

  // Ensure directory exists
  if (!fs.existsSync(agentsSkillsDir)) {
    fs.mkdirSync(agentsSkillsDir, { recursive: true });
  }

  // Define target symlink path
  const isDir = fs.statSync(sourcePath).isDirectory();
  let targetName = path.basename(sourcePath);
  if (!isDir || targetName === 'SKILL.md') {
      targetName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
  }
  
  const targetPath = path.join(agentsSkillsDir, targetName);

  if (fs.existsSync(targetPath)) {
    const override = await vscode.window.showWarningMessage(
      `技能 '${targetName}' 已经存在于当前工作区中。是否覆盖？`,
      { modal: true },
      '覆盖 (Overwrite)'
    );
    if (override !== '覆盖 (Overwrite)') {
      return;
    }
    fs.rmSync(targetPath, { recursive: true, force: true });
  }

  try {
    const symlinkType = process.platform === 'win32' ? 'junction' : 'dir';
    fs.symlinkSync(sourcePath, targetPath, symlinkType);
    vscode.window.showInformationMessage(`✅ 成功将技能 '${name}' 链接到当前项目！`);
  } catch (err: any) {
    vscode.window.showErrorMessage(`安装失败，权限错误: ${err.message}`);
  }
}
