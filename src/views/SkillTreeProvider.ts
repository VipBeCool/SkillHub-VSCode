import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { DatabaseService } from '../data/DatabaseService';
import { SkillTreeItem, SkillTreeItemType } from './SkillTreeItem';
import { SourceDirectory, GroupedRepo, Skill } from '../types';

export class SkillTreeProvider implements vscode.TreeDataProvider<SkillTreeItem>, vscode.TreeDragAndDropController<SkillTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<SkillTreeItem | undefined | void> = new vscode.EventEmitter<SkillTreeItem | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<SkillTreeItem | undefined | void> = this._onDidChangeTreeData.event;
  
  private dbService = DatabaseService.getInstance();

  dragMimeTypes = ['text/uri-list', 'text/plain', 'application/vnd.code.tree.skillhub'];
  dropMimeTypes = [];


  constructor(private viewType: 'skills' | 'prompts') {}


  public async handleDrag(source: readonly SkillTreeItem[], dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
    const uris: string[] = [];
    for (const item of source) {
      if (item.type === SkillTreeItemType.Skill) {
        const skill = item.data as Skill;
        if (skill && skill.local_path) {
          // If it's a local skill or installed skill with a local_path
          const skillMdPath = path.join(skill.local_path, 'SKILL.md');
          if (fs.existsSync(skillMdPath)) {
            uris.push(vscode.Uri.file(skillMdPath).toString());
          } else if (fs.existsSync(skill.local_path)) {
            uris.push(vscode.Uri.file(skill.local_path).toString());
          }
        }
      } else if (item.type === SkillTreeItemType.Prompt) {
        // If we want to drag prompts, we can't easily drag them as files unless we write them to temp files.
        // For now, we only handle skills.
      }
    }
    
    if (uris.length > 0) {
      dataTransfer.set('text/uri-list', new vscode.DataTransferItem(uris.join('\r\n')));
      // Also provide plain text as absolute path fallback
      dataTransfer.set('text/plain', new vscode.DataTransferItem(uris.map(u => vscode.Uri.parse(u).fsPath).join('\n')));
      // And a custom type just in case
      dataTransfer.set('application/vnd.code.tree.skillhub', new vscode.DataTransferItem(source));
    }
  }

  async refresh(): Promise<void> {
    const initialized = await this.dbService.initialize();
    if (initialized) {
      this._onDidChangeTreeData.fire();
    }
  }

  getTreeItem(element: SkillTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: SkillTreeItem): Promise<SkillTreeItem[]> {
    const initialized = await this.dbService.initialize();
    if (!initialized) {
      return [];
    }

    if (!element) {
      if (this.viewType === 'skills') {
        const dirs = this.dbService.getSourceDirectories();
        return dirs.map(dir => new SkillTreeItem(
          SkillTreeItemType.SourceDirectory,
          dir.label,
          vscode.TreeItemCollapsibleState.Expanded,
          dir
        ));
      } else {
        const groups = this.dbService.getPromptGroups();
        const prompts = this.dbService.getPrompts();
        const treeItems = [];
        
        // Always add Favorites and Ungrouped at the top
        const favoritesCount = prompts.filter(p => p.is_favorite).length;
        treeItems.push(new SkillTreeItem(SkillTreeItemType.PromptGroup, '收藏', vscode.TreeItemCollapsibleState.Collapsed, { id: 'favorites', count: favoritesCount }));
        
        groups.forEach(group => {
          const count = prompts.filter(p => p.group_id === group.id).length;
          treeItems.push(new SkillTreeItem(
            SkillTreeItemType.PromptGroup,
            group.name,
            vscode.TreeItemCollapsibleState.Collapsed,
            { ...group, count }
          ));
        });

        const ungroupedCount = prompts.filter(p => !p.group_id).length;
        treeItems.push(new SkillTreeItem(SkillTreeItemType.PromptGroup, '未分组', vscode.TreeItemCollapsibleState.Collapsed, { id: 'ungrouped', count: ungroupedCount }));
        return treeItems;
      }
    } else if (element.type === SkillTreeItemType.PromptGroup) {
      const prompts = this.dbService.getPrompts();
      let filtered: import('../types').Prompt[] = [];
      
      if (element.data.id === 'favorites') {
        filtered = prompts.filter(p => p.is_favorite);
      } else if (element.data.id === 'ungrouped') {
        filtered = prompts.filter(p => !p.group_id);
      } else {
        filtered = prompts.filter(p => p.group_id === element.data.id);
      }

      return filtered.map(prompt => new SkillTreeItem(
        SkillTreeItemType.Prompt,
        prompt.title,
        vscode.TreeItemCollapsibleState.None,
        prompt
      ));
    } else if (element.type === SkillTreeItemType.SourceDirectory) {
      const dir = element.data as SourceDirectory;
      const allRepos = this.dbService.getGroupedRepos();
      const childRepos = allRepos.filter(repo => repo.source_dir_id === dir.id);
      
      return childRepos.map(repo => new SkillTreeItem(
        SkillTreeItemType.Repository,
        repo.name,
        vscode.TreeItemCollapsibleState.Collapsed,
        repo
      ));
    } else if (element.type === SkillTreeItemType.Repository) {
      const repo = element.data as GroupedRepo;
      return repo.skills.map(skill => new SkillTreeItem(
        SkillTreeItemType.Skill,
        skill.name,
        vscode.TreeItemCollapsibleState.None,
        skill
      ));
    }

    return [];
  }
}
