import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { SourceDirectory, GroupedRepo, Skill, PromptGroup, Prompt } from '../types';

export enum SkillTreeItemType {
  RootNode,
  SourceDirectory,
  Repository,
  Skill,
  PromptGroup,
  Prompt
}

export class SkillTreeItem extends vscode.TreeItem {
  constructor(
    public readonly type: SkillTreeItemType,
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly data?: SourceDirectory | GroupedRepo | Skill | PromptGroup | Prompt | any
  ) {
    super(label, collapsibleState);
    this.tooltip = this.getTooltip();
    this.description = this.getDescription();
    this.iconPath = this.getIcon();
    
    if (this.type === SkillTreeItemType.Repository || this.type === SkillTreeItemType.Skill) {
      const { isInstalled, isOnline, isMissing } = this.checkIfInstalled();
      
      let prefix = 'skill';
      if (this.type === SkillTreeItemType.Repository && (this.data as GroupedRepo).repo_type === 'collection') {
        prefix = 'collection';
      }

      if (isOnline) {
        this.contextValue = `${prefix}-online`;
      } else if (isMissing) {
        this.contextValue = `${prefix}-missing`;
      } else {
        this.contextValue = isInstalled ? `${prefix}-installed` : `${prefix}-uninstalled`;
      }

      // Set resourceUri for local files so IDE knows this node represents a file
      if (!isOnline && this.type === SkillTreeItemType.Skill) {
        const skill = this.data as Skill;
        if (skill && skill.local_path) {
          const skillMdPath = path.join(skill.local_path, 'SKILL.md');
          if (fs.existsSync(skillMdPath)) {
            this.resourceUri = vscode.Uri.file(skillMdPath);
          } else if (fs.existsSync(skill.local_path)) {
            this.resourceUri = vscode.Uri.file(skill.local_path);
          }
        }
      }
      
      // Keep click command for leaf nodes (Skill or Standalone Repository)
      if (this.type === SkillTreeItemType.Skill || (this.type === SkillTreeItemType.Repository && (this.data as GroupedRepo).repo_type === 'standalone')) {
        this.command = {
          command: 'skillhub.openSkill',
          title: 'Open Skill',
          arguments: [this]
        };
      }
    } else if (this.type === SkillTreeItemType.Prompt) {
      this.contextValue = 'prompt';
      this.command = {
        command: 'skillhub.openPrompt',
        title: 'Open Prompt',
        arguments: [this]
      };
    }
  }

  private checkIfInstalled(): { isInstalled: boolean; isOnline: boolean, isMissing: boolean } {
    let sourcePath = '';
    let itemName = '';
    
    if (this.type === SkillTreeItemType.Repository) {
      const repo = this.data as GroupedRepo;
      sourcePath = repo.path;
      itemName = repo.name;
    } else if (this.type === SkillTreeItemType.Skill) {
      const skill = this.data as Skill;
      sourcePath = skill.local_path;
      itemName = skill.name;
    }
    
    if (!sourcePath) return { isInstalled: false, isOnline: false, isMissing: true };

    // 必须在工作区检查之前先判断是否为在线技能
    // 否则无工作区时会提前返回，导致在线技能被错误识别为 uninstalled
    let isOnlineSource = false;
    if (this.type === SkillTreeItemType.Repository) {
      const repo = this.data as GroupedRepo;
      isOnlineSource = repo.source_type === 'online' || repo.source_type === 'github';
    } else if (this.type === SkillTreeItemType.Skill) {
      const skill = this.data as Skill;
      isOnlineSource = skill.source_type === 'online' || skill.source_type === 'github' || !!skill.online_url;
    }

    if (isOnlineSource || sourcePath.startsWith('http://') || sourcePath.startsWith('https://')) {
      return { isInstalled: false, isOnline: true, isMissing: false };
    }

    // 本地技能：检查工作区和文件是否存在
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return { isInstalled: false, isOnline: false, isMissing: false };
    }
    
    if (!fs.existsSync(sourcePath)) {
      return { isInstalled: false, isOnline: false, isMissing: true };
    }

    const workspacePath = workspaceFolders[0].uri.fsPath;
    const agentsSkillsDir = path.join(workspacePath, '.agents', 'skills');
    
    const isDir = fs.existsSync(sourcePath) && fs.statSync(sourcePath).isDirectory();
    let targetName = path.basename(sourcePath);
    if (!isDir || targetName === 'SKILL.md') {
        targetName = itemName.replace(/[^a-zA-Z0-9_-]/g, '_');
    }
    
    const targetPath = path.join(agentsSkillsDir, targetName);
    return { isInstalled: fs.existsSync(targetPath), isOnline: false, isMissing: false };
  }

  getTooltip(): string | undefined {
    switch (this.type) {
      case SkillTreeItemType.RootNode:
        return this.label;
      case SkillTreeItemType.SourceDirectory:
        return (this.data as SourceDirectory).path;
      case SkillTreeItemType.Repository:
        return (this.data as GroupedRepo).path;
      case SkillTreeItemType.Skill:
        return (this.data as Skill).description || (this.data as Skill).local_path;
      case SkillTreeItemType.PromptGroup:
        return this.label;
      case SkillTreeItemType.Prompt:
        const prompt = this.data as Prompt;
        return prompt.description || prompt.title;
    }
    return undefined;
  }

  getDescription(): string {
    switch (this.type) {
      case SkillTreeItemType.RootNode:
        return '';
      case SkillTreeItemType.SourceDirectory:
        return (this.data as SourceDirectory).is_missing ? '(Missing)' : '';
      case SkillTreeItemType.Repository:
        const repo = this.data as GroupedRepo;
        if (repo.repo_type === 'collection') {
          return `组合包 (${repo.skills.length})`;
        } else {
          return repo.is_missing ? '(Missing)' : '';
        }
      case SkillTreeItemType.Skill:
        return '';
      case SkillTreeItemType.PromptGroup:
        const groupData = this.data as any;
        return typeof groupData.count === 'number' ? `(${groupData.count})` : '';
      case SkillTreeItemType.Prompt:
        return '';
    }
    return '';
  }

  getIcon(): vscode.ThemeIcon | string {
    switch (this.type) {
      case SkillTreeItemType.RootNode:
        return this.label === '技能库' ? new vscode.ThemeIcon('library') : new vscode.ThemeIcon('book');
      case SkillTreeItemType.SourceDirectory:
        return new vscode.ThemeIcon('folder-library');
      case SkillTreeItemType.Repository:
        return new vscode.ThemeIcon('repo');
      case SkillTreeItemType.Skill:
        return new vscode.ThemeIcon('symbol-interface');
      case SkillTreeItemType.PromptGroup:
        if (this.label === '收藏') return new vscode.ThemeIcon('star-full', new vscode.ThemeColor('charts.yellow'));
        if (this.label === '未分组') return new vscode.ThemeIcon('folder-opened');
        return new vscode.ThemeIcon('folder');
      case SkillTreeItemType.Prompt:
        const prompt = this.data as Prompt;
        return prompt.is_favorite 
          ? new vscode.ThemeIcon('star-full', new vscode.ThemeColor('charts.yellow'))
          : new vscode.ThemeIcon('file-text');
    }
    return new vscode.ThemeIcon('file');
  }
}
