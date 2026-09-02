import * as vscode from 'vscode';
import { SkillTreeProvider } from './views/SkillTreeProvider';
import { SkillDetailPanel } from './views/SkillDetailPanel';
import { PromptDetailPanel } from './views/PromptDetailPanel';
import { SkillTreeItem, SkillTreeItemType } from './views/SkillTreeItem';
import { Skill, Prompt, GroupedRepo, SourceDirectory } from './types';
import { DatabaseService } from './data/DatabaseService';
import { installSkillCommand } from './commands/installSkill';
import { 
  uninstallSkillCommand, 
  openInVSCodeCommand, 
  revealInFinderCommand, 
  openInTerminalCommand, 
  copyPathCommand 
} from './commands/contextMenuCommands';

let statusBarItem: vscode.StatusBarItem;

async function updateStatusBar() {
  try {
    const dbService = DatabaseService.getInstance();
    const initialized = await dbService.initialize();
    if (initialized) {
      const skills = dbService.getGroupedRepos();
      const count = skills.length;
      statusBarItem.text = `$(plug) SkillHub: ${count} 技能`;
      statusBarItem.tooltip = "SkillHub 数据库已连接";
      statusBarItem.show();
    }
  } catch (e) {
    statusBarItem.text = `$(warning) SkillHub: 未连接`;
    statusBarItem.tooltip = "无法连接本地 SkillHub 数据库";
    statusBarItem.show();
  }
}

export function activate(context: vscode.ExtensionContext) {
  console.log('SkillHub extension is now active!');

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'skillhub.refresh';
  context.subscriptions.push(statusBarItem);
  
  updateStatusBar();

  const skillsProvider = new SkillTreeProvider('skills');
  const skillsTreeView = vscode.window.createTreeView('skillhub-skills-view', { treeDataProvider: skillsProvider, dragAndDropController: skillsProvider });
  context.subscriptions.push(skillsTreeView);

  const promptsProvider = new SkillTreeProvider('prompts');
  const promptsTreeView = vscode.window.createTreeView('skillhub-prompts-view', { treeDataProvider: promptsProvider, dragAndDropController: promptsProvider });
  context.subscriptions.push(promptsTreeView);

  context.subscriptions.push(
    vscode.commands.registerCommand('skillhub.refresh', () => {
      skillsProvider.refresh();
      promptsProvider.refresh();
      updateStatusBar();
    }),
    vscode.commands.registerCommand('skillhub.openSkill', (item: SkillTreeItem) => {
      if (item && item.type === SkillTreeItemType.Skill) {
        SkillDetailPanel.createOrShow(item.data as Skill);
      }
    }),
    vscode.commands.registerCommand('skillhub.openSkillInNewTab', (item: SkillTreeItem) => {
      if (item && item.type === SkillTreeItemType.Skill) {
        SkillDetailPanel.createOrShow(item.data as Skill, true);
      }
    }),
    vscode.commands.registerCommand('skillhub.openPrompt', (item: SkillTreeItem) => {
      if (item && item.type === SkillTreeItemType.Prompt) {
        PromptDetailPanel.createOrShow(item.data as Prompt);
      }
    }),
    vscode.commands.registerCommand('skillhub.openPromptInNewTab', (item: SkillTreeItem) => {
      if (item && item.type === SkillTreeItemType.Prompt) {
        PromptDetailPanel.createOrShow(item.data as Prompt, true);
      }
    }),
    vscode.commands.registerCommand('skillhub.installSkill', installSkillCommand),
    vscode.commands.registerCommand('skillhub.uninstallSkill', uninstallSkillCommand),
    vscode.commands.registerCommand('skillhub.openInVSCode', openInVSCodeCommand),
    vscode.commands.registerCommand('skillhub.revealInFinder', revealInFinderCommand),
    vscode.commands.registerCommand('skillhub.openInTerminal', openInTerminalCommand),
    vscode.commands.registerCommand('skillhub.copyPath', copyPathCommand),
    vscode.commands.registerCommand('skillhub.copyUrl', (item: SkillTreeItem) => {
      if (item && item.data) {
        let pathToCopy = '';
        if (item.type === SkillTreeItemType.Repository) {
          pathToCopy = (item.data as GroupedRepo).path;
        } else if (item.type === SkillTreeItemType.Skill) {
          pathToCopy = (item.data as Skill).local_path;
        } else if (item.type === SkillTreeItemType.SourceDirectory) {
          pathToCopy = (item.data as SourceDirectory).path;
        }
        if (pathToCopy) {
          vscode.env.clipboard.writeText(pathToCopy);
          vscode.window.showInformationMessage('技能 URL 已复制到剪贴板');
        }
      }
    }),
    vscode.commands.registerCommand('skillhub.searchSkills', async () => {
      const dbService = DatabaseService.getInstance();
      const initialized = await dbService.initialize();
      if (!initialized) return;
      const repos = dbService.getGroupedRepos();
      const items = repos.map(r => ({
        label: r.name,
        description: r.path,
        repo: r
      }));
      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: '搜索技能...',
        matchOnDescription: true
      });
      if (selected && selected.repo && selected.repo.skills.length > 0) {
        SkillDetailPanel.createOrShow(selected.repo.skills[0]);
      }
    }),
    vscode.commands.registerCommand('skillhub.searchPrompts', async () => {
      const dbService = DatabaseService.getInstance();
      const initialized = await dbService.initialize();
      if (!initialized) return;
      const prompts = dbService.getPrompts();
      const items = prompts.map(p => ({
        label: p.title,
        description: p.description || '',
        prompt: p
      }));
      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: '搜索提示词...',
        matchOnDescription: true
      });
      if (selected && selected.prompt) {
        PromptDetailPanel.createOrShow(selected.prompt);
      }
    }),
    vscode.commands.registerCommand('skillhub.copyPrompt', async (item: SkillTreeItem) => {
       if (item && item.type === SkillTreeItemType.Prompt) {
         vscode.env.clipboard.writeText((item.data as Prompt).content);
         vscode.window.showInformationMessage('提示词已复制到剪贴板');
       }
    })
  );
}

export function deactivate() {}
