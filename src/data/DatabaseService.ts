import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import initSqlJs from 'sql.js';
import { SourceDirectory, Skill, GroupedRepo } from '../types';

export class DatabaseService {
  private static instance: DatabaseService;
  private db: initSqlJs.Database | null = null;
  private dbPath: string;

  private constructor() {
    this.dbPath = this.getDbPath();
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  private getDbPath(): string {
    const homeDir = os.homedir();
    switch (os.platform()) {
      case 'darwin':
        return path.join(homeDir, 'Library', 'Application Support', 'com.skillhub.desktop', 'skillhub.sqlite');
      case 'win32':
        return path.join(process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'), 'com.skillhub.desktop', 'skillhub.sqlite');
      default:
        return path.join(homeDir, '.local', 'share', 'com.skillhub.desktop', 'skillhub.sqlite');
    }
  }

  public async initialize(): Promise<boolean> {
    if (this.db) {
      return true;
    }

    if (!fs.existsSync(this.dbPath)) {
      vscode.window.showInformationMessage('SkillHub database not found. Please run the SkillHub Desktop app first.');
      return false;
    }

    try {
      // In VS Code extension context, we need to locate the wasm file
      // We assume sql.js is installed in node_modules/sql.js
      const extensionPath = vscode.extensions.getExtension('skillhub-vscode')?.extensionPath || '';
      // Actually, since we are compiling to extension, we might just rely on the default Node.js behavior 
      // of sql.js which embeds or finds the wasm if we don't pack it with webpack.
      // Wait, we are not using webpack, we are using tsc. So node_modules is accessible if we don't bundle.
      // But typically we should just use initSqlJs without locateFile in Node.js.
      
      const fileBuffer = fs.readFileSync(this.dbPath);
      const SQL = await initSqlJs();
      this.db = new SQL.Database(fileBuffer);
      return true;
    } catch (error) {
      console.error('Failed to initialize sql.js', error);
      vscode.window.showErrorMessage('Failed to connect to SkillHub database.');
      return false;
    }
  }

  public getSourceDirectories(): SourceDirectory[] {
    if (!this.db) return [];
    
    const stmt = this.db.prepare("SELECT id, path, label, source_type, is_default, icon, sort_order, is_protected, added_at FROM source_directories ORDER BY sort_order ASC");
    const dirs: SourceDirectory[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      dirs.push({
        id: row.id as string,
        path: row.path as string,
        label: row.label as string,
        source_type: row.source_type as string,
        is_default: row.is_default === 1,
        icon: row.icon as string | null,
        sort_order: row.sort_order as number,
        is_protected: row.is_protected === 1,
        is_missing: (row.path as string).startsWith('http') ? false : !fs.existsSync(row.path as string),
        added_at: row.added_at as string
      });
    }
    stmt.free();
    return dirs;
  }

  public getSkills(): Skill[] {
    if (!this.db) return [];

    const stmt = this.db.prepare("SELECT id, name, description, local_path, repo_id, source_dir_id, relative_path, source_type, installed_at, updated_at, is_active, category, tags, skill_scope, online_url, is_favorite, use_count FROM skills");
    const skills: Skill[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      skills.push({
        id: row.id as string,
        name: row.name as string,
        description: row.description as string,
        local_path: row.local_path as string,
        repo_id: row.repo_id as string | null,
        source_dir_id: row.source_dir_id as string,
        relative_path: row.relative_path as string,
        source_type: row.source_type as string,
        installed_at: row.installed_at as string,
        updated_at: row.updated_at as string,
        is_active: row.is_active === 1,
        category: row.category as string,
        tags: row.tags as string | null,
        skill_scope: (row.skill_scope as string) || 'repo',
        online_url: row.online_url as string | null,
        is_favorite: row.is_favorite === 1,
        use_count: row.use_count as number
      });
    }
    stmt.free();
    return skills;
  }

  public getGroupedRepos(): GroupedRepo[] {
    const skills = this.getSkills();
    const dirs = this.getSourceDirectories();
    const dirMap = new Map<string, SourceDirectory>();
    
    dirs.forEach(d => dirMap.set(d.id, d));
    const repoMap = new Map<string, GroupedRepo>();

    for (const skill of skills) {
      let repoName = skill.name;
      let repoPath = skill.local_path;
      const dir = dirMap.get(skill.source_dir_id);

      if (dir && skill.local_path.startsWith(dir.path)) {
        const relativePath = skill.local_path.substring(dir.path.length);
        const parts = relativePath.split(/[/\\]/).filter(s => s.length > 0);
        if (parts.length > 0) {
          repoName = parts[0];
          const sep = dir.path.includes('\\') ? '\\' : '/';
          const safeDir = dir.path.endsWith(sep) ? dir.path.slice(0, -1) : dir.path;
          repoPath = `${safeDir}${sep}${repoName}`;
        } else {
          repoPath = dir.path;
          repoName = dir.path.split(/[/\\]/).filter(s => s.length > 0).pop() || dir.path;
        }
      }

      if (!repoMap.has(repoPath)) {
        repoMap.set(repoPath, {
          id: repoPath,
          name: repoName,
          path: repoPath,
          source_type: skill.source_type,
          source_dir_id: skill.source_dir_id,
          installed_at: skill.installed_at,
          updated_at: skill.updated_at,
          skills: [],
          category: null,
          is_missing: repoPath.startsWith('http') ? false : !fs.existsSync(repoPath),
          repo_type: "single",
          author: null
        });
      }

      const repo = repoMap.get(repoPath)!;
      if (!repo.skills.find(s => s.id === skill.id)) {
        repo.skills.push(skill);
      }
    }

    const result = Array.from(repoMap.values());
    for (const repo of result) {
      const isOfficial = repo.skills.some(s => s.local_path.endsWith('SKILL.md') || s.local_path.endsWith('SKILL.mdx'));
      repo.category = isOfficial ? "正式技能" : "其他";
      repo.skills.sort((a, b) => a.name.localeCompare(b.name));
      repo.repo_type = repo.skills.length >= 2 ? "collection" : "single";
    }

    result.sort((a, b) => new Date(b.installed_at).getTime() - new Date(a.installed_at).getTime());
    return result;
  }

  public getPromptGroups(): import('../types').PromptGroup[] {
    if (!this.db) return [];
    
    const stmt = this.db.prepare("SELECT id, name, icon, color, sort_order, created_at FROM prompt_groups ORDER BY sort_order ASC");
    const groups: import('../types').PromptGroup[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      groups.push({
        id: row.id as string,
        name: row.name as string,
        icon: row.icon as string | null,
        color: row.color as string | null,
        sort_order: row.sort_order as number,
        created_at: row.created_at as string
      });
    }
    stmt.free();
    return groups;
  }

  public getPrompts(): import('../types').Prompt[] {
    if (!this.db) return [];
    
    // Join with prompt_groups to get group_name
    const stmt = this.db.prepare(`
      SELECT p.id, p.title, p.content, p.description, p.group_id, g.name as group_name, p.tags, p.is_favorite, p.use_count, p.variables, p.version, p.created_at, p.updated_at, p.deleted_at
      FROM prompts p
      LEFT JOIN prompt_groups g ON p.group_id = g.id
      WHERE p.deleted_at IS NULL
      ORDER BY p.updated_at DESC
    `);
    
    const prompts: import('../types').Prompt[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      prompts.push({
        id: row.id as string,
        title: row.title as string,
        content: row.content as string,
        description: row.description as string | null,
        group_id: row.group_id as string | null,
        group_name: row.group_name as string | null,
        tags: row.tags as string | null,
        is_favorite: row.is_favorite === 1,
        use_count: row.use_count as number,
        variables: row.variables as string | null,
        version: row.version as number,
        created_at: row.created_at as string,
        updated_at: row.updated_at as string,
        deleted_at: row.deleted_at as string | null
      });
    }
    stmt.free();
    return prompts;
  }
}
