import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Skill } from '../types';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import { translateText } from '../utils/translate';

export class SkillDetailPanel {
  public static currentPanel: SkillDetailPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, private skill: Skill) {
    this._panel = panel;
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    
    this._panel.webview.onDidReceiveMessage(
      message => {
        switch (message.command) {
          case 'installSkill':
            vscode.commands.executeCommand('skillhub.installSkill', message.skillData);
            return;
          case 'uninstallSkill':
            vscode.commands.executeCommand('skillhub.uninstallSkill', message.skillData);
            return;
          case 'copyPath':
            vscode.env.clipboard.writeText(message.path);
            vscode.window.setStatusBarMessage('已复制技能路径', 3000);
            return;
          case 'translate':
            vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "正在翻译..." }, async () => {
              try {
                const translated = await translateText(message.text, message.targetLang || 'zh-CN');
                
                // Re-render markdown
                if (translated.startsWith('---\n') || translated.startsWith('---\r\n')) {
                  var content = translated.replace(/^---\r?\n([\s\S]*?)\r?\n---/, '```yaml\n$1\n```');
                } else {
                  var content = translated;
                }
                
                const md = new MarkdownIt({
                  html: true,
                  linkify: true,
                  typographer: true,
                  highlight: function (str, lang) {
                    if (lang && hljs.getLanguage(lang)) {
                      try {
                        return hljs.highlight(str, { language: lang }).value;
                      } catch (__) {}
                    }
                    return '';
                  }
                });
                
                this._panel.webview.postMessage({ command: 'translatedContent', html: md.render(content), targetLang: message.targetLang });
              } catch (err: any) {
                vscode.window.showErrorMessage('翻译失败: ' + err.message);
              }
            });
            return;
        }
      },
      null,
      this._disposables
    );

    this._update();
  }

  public static createOrShow(skill: Skill, forceNewTab: boolean = false) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (!forceNewTab && SkillDetailPanel.currentPanel) {
      SkillDetailPanel.currentPanel._panel.reveal(column);
      SkillDetailPanel.currentPanel.skill = skill;
      SkillDetailPanel.currentPanel._update();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'skillhubDetail',
      'Skill Details',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    const detailPanel = new SkillDetailPanel(panel, skill);
    if (!forceNewTab) {
      SkillDetailPanel.currentPanel = detailPanel;
    }
  }

  public dispose() {
    if (SkillDetailPanel.currentPanel === this) {
      SkillDetailPanel.currentPanel = undefined;
    }
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private _update() {
    this._panel.title = this.skill.name;
    this._panel.webview.html = this._getHtmlForWebview();
  }

  private _getHtmlForWebview() {

    let isInstalled = false;
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
        const workspacePath = workspaceFolders[0].uri.fsPath;
        const agentsSkillsDir = path.join(workspacePath, '.agents', 'skills');
        const sourcePath = this.skill.local_path;
        if (sourcePath && fs.existsSync(sourcePath)) {
            let targetName = path.basename(sourcePath);
            const isDir = fs.statSync(sourcePath).isDirectory();
            if (!isDir || targetName === 'SKILL.md') {
                targetName = this.skill.name.replace(/[^a-zA-Z0-9_-]/g, '_');
            }
            const targetPath = path.join(agentsSkillsDir, targetName);
            if (fs.existsSync(targetPath)) {
                isInstalled = true;
            }
        }
    }

    let fileType = 'Unknown';
    let fileContent = '';

    if (this.skill.local_path && fs.existsSync(this.skill.local_path)) {
      const stat = fs.statSync(this.skill.local_path);
      if (stat.isFile()) {
        fileType = 'File';
        try {
          fileContent = fs.readFileSync(this.skill.local_path, 'utf8');
        } catch (e: any) {
          fileContent = `Error reading file: ${e.message}`;
        }
      } else if (stat.isDirectory()) {
        fileType = 'Directory';
        const mdPath = path.join(this.skill.local_path, 'SKILL.md');
        if (fs.existsSync(mdPath)) {
          fileContent = fs.readFileSync(mdPath, 'utf8');
        } else {
          fileContent = 'This is a directory. No SKILL.md found inside.';
        }
      }
    } else if (this.skill.source_type === 'online' || this.skill.local_path.startsWith('http')) {
      fileType = 'Online Resource';
      fileContent = `URL: ${this.skill.online_url || this.skill.local_path}`;
    }

    const isOnline = this.skill.local_path.startsWith('http') || this.skill.source_type === 'online';

    const escapeHtml = (unsafe: string) => {
        return unsafe
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
    };
    
    // Convert YAML frontmatter to a YAML code block for highlight.js
    if (fileContent.startsWith('---\n') || fileContent.startsWith('---\r\n')) {
      fileContent = fileContent.replace(/^---\r?\n([\s\S]*?)\r?\n---/, '```yaml\n$1\n```');
    }

    const md = new MarkdownIt({
      html: true,
      linkify: true,
      typographer: true,
      highlight: function (str, lang) {
        if (lang && hljs.getLanguage(lang)) {
          try {
            return hljs.highlight(str, { language: lang }).value;
          } catch (__) {}
        }
        return '';
      }
    });

    const renderedMarkdown = fileContent ? md.render(fileContent) : '<p>No content available.</p>';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.skill.name}</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
    <style>
        body { 
            font-family: var(--vscode-font-family); 
            padding: 20px; 
            color: var(--vscode-foreground); 
            background-color: var(--vscode-editor-background);
            line-height: 1.6;
        }
        h1, h2, h3, h4, h5, h6 { 
            margin-top: 1.5em; 
            margin-bottom: 0.5em;
            color: var(--vscode-editor-foreground);
        }
        h1 { margin: 0; border-bottom: none; padding-bottom: 0; }
        .header-container {
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 15px;
            border-bottom: 1px solid var(--vscode-editorWidget-border);
            padding-bottom: 15px;
            margin-bottom: 15px;
        }
        .title-row {
            display: flex;
            align-items: center;
            gap: 12px;
            flex-wrap: wrap;
        }
        .header-badges {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            align-items: center;
            margin: 0;
        }
        .badge {
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 500;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            border: 1px solid var(--vscode-widget-border, transparent);
        }
        .badge-outline {
            background: transparent;
            border: 1px solid var(--vscode-badge-background);
            color: var(--vscode-foreground);
        }
        .path-info {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .path-value {
            background: var(--vscode-textCodeBlock-background);
            padding: 2px 6px;
            border-radius: 4px;
            font-family: var(--vscode-editor-font-family);
            user-select: all;
        }
        .markdown-body {
            margin-top: 20px;
        }
        .markdown-body pre { 
            background: var(--vscode-editor-inactiveSelectionBackground); 
            padding: 15px; 
            border-radius: 6px; 
            overflow-x: auto; 
            border: 1px solid var(--vscode-editorWidget-border); 
        }
        .markdown-body code {
            font-family: var(--vscode-editor-font-family);
            background: var(--vscode-textCodeBlock-background);
            padding: 0.2em 0.4em;
            border-radius: 3px;
            font-size: 0.9em;
        }
        .markdown-body pre code {
            background: transparent;
            padding: 0;
            border-radius: 0;
        }
        .markdown-body blockquote {
            border-left: 4px solid var(--vscode-textBlockQuote-border);
            padding: 0 15px;
            color: var(--vscode-textBlockQuote-background);
            margin: 1em 0;
        }
        .markdown-body table {
            border-collapse: collapse;
            width: 100%;
            margin-bottom: 1em;
        }
        .markdown-body th, .markdown-body td {
            border: 1px solid var(--vscode-editorWidget-border);
            padding: 8px 12px;
        }
        .markdown-body th {
            background: var(--vscode-editor-inactiveSelectionBackground);
        }
        .markdown-body a {
            color: var(--vscode-textLink-foreground);
            text-decoration: none;
        }
        .markdown-body a:hover {
            text-decoration: underline;
        }
        .action-bar {
            display: flex;
            gap: 10px;
            margin: 0;
        }
        .btn-action {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }
        .btn-action:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        .btn-secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .btn-secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
        .translation-toolbar {
            display: flex;
            align-items: center;
            background: var(--vscode-editor-inactiveSelectionBackground);
            padding: 8px 15px;
            border-radius: 6px;
            margin-bottom: 15px;
            border: 1px solid var(--vscode-editorWidget-border);
        }
        .translation-controls {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .toolbar-label {
            font-size: 13px;
            color: var(--vscode-descriptionForeground);
        }
        .lang-select {
            background: var(--vscode-dropdown-background);
            color: var(--vscode-dropdown-foreground);
            border: 1px solid var(--vscode-dropdown-border);
            padding: 4px;
            border-radius: 4px;
            font-family: inherit;
        }
        .btn-small {
            padding: 4px 12px;
            font-size: 12px;
        }
        
        /* TOC Styles */
        .toc-container {
            position: fixed;
            right: 12px;
            top: 30%;
            transform: translateY(-50%);
            z-index: 1000;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
        }
        .toc-lines {
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 12px;
            padding: 12px 8px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-editorWidget-border);
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            transition: all 0.3s ease;
        }
        .toc-line {
            height: 2px;
            background: var(--vscode-scrollbarSlider-background);
            border-radius: 4px;
            transition: background 0.2s;
        }
        .toc-line.active {
            background: var(--vscode-foreground);
        }
        .toc-container:hover .toc-lines {
            display: none;
        }
        .toc-hover-menu {
            display: none;
            flex-direction: column;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-editorWidget-border);
            border-radius: 8px;
            padding: 12px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.15);
            max-height: 60vh;
            overflow-y: auto;
            width: 250px;
        }
        .toc-container:hover .toc-hover-menu {
            display: flex;
        }
        .toc-header {
            font-size: 11px;
            font-weight: 600;
            color: var(--vscode-descriptionForeground);
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 8px;
            padding: 0 4px;
        }
        .toc-item {
            background: transparent;
            border: none;
            color: var(--vscode-foreground);
            text-align: left;
            padding: 6px 8px;
            border-radius: 6px;
            font-size: 12px;
            cursor: pointer;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            transition: all 0.2s;
            font-family: inherit;
        }
        .toc-item:hover {
            background: var(--vscode-list-hoverBackground);
        }
        .toc-item.active {
            color: var(--vscode-foreground);
            background: var(--vscode-toolbar-hoverBackground);
            font-weight: 500;
        }
    </style>
</head>
<body>
    <div class="header-container">
        <div class="title-row">
            <h1>${escapeHtml(this.skill.name)}</h1>
            <div class="header-badges">
                ${this.skill.tags ? this.skill.tags.split(',').map(t => `<span class="badge badge-outline">#${escapeHtml(t.trim())}</span>`).join('') : ''}
            </div>
        </div>
        
        <div class="action-bar">
            ${!isOnline ? `
            <button id="installBtn" class="btn-action" data-installed="${isInstalled}">
                ${isInstalled ? '从当前工作区移除' : '安装到当前工作区'}
            </button>
            ` : ''}
            <button id="copyPathBtn" class="btn-action btn-secondary">
                复制技能路径
            </button>
            <button id="copyContentBtn" class="btn-action btn-secondary">
                复制 SKILL.md 内容
            </button>
        </div>
    </div>
    
    <div class="path-info">
        <span>Path:</span>
        <span class="path-value">${escapeHtml(this.skill.local_path)}</span>
    </div>
    
    <div class="translation-toolbar">
        <div class="translation-controls">
            <span class="toolbar-label" style="font-size: 14px;" title="目标语言">🌐</span>
            <select id="targetLangSelect" class="lang-select">
                <option value="zh-CN" selected>中文</option>
                <option value="en">English</option>
                <option value="ja">日本語</option>
                <option value="ko">한국어</option>
                <option value="fr">Français</option>
                <option value="es">Español</option>
                <option value="ru">Русский</option>
            </select>
            <button id="translateBtn" class="btn-action btn-small">翻译</button>
            <button id="restoreBtn" class="btn-action btn-small" style="display: none;">恢复原文</button>
        </div>
    </div>
    
    <div class="markdown-body">
        ${renderedMarkdown}
    </div>
    
    <div class="toc-container" id="tocContainer" style="display: none;"></div>

    <script>
        const vscode = acquireVsCodeApi();
        // 存储原始和翻译的 markdown html
        const rawMarkdown = ${JSON.stringify(fileContent)};
        const originalHtml = ${JSON.stringify(renderedMarkdown)};
        let translations = {}; // cache translations by lang
        let currentMode = 'original';

        // TOC 生成与滚动联动
        function generateTOC() {
            const markdownBody = document.querySelector('.markdown-body');
            const headings = Array.from(markdownBody.querySelectorAll('h1, h2, h3, h4, h5, h6'));
            const tocContainer = document.getElementById('tocContainer');
            
            if (headings.length === 0) {
                tocContainer.style.display = 'none';
                return;
            }
            tocContainer.style.display = 'flex';
            
            let tocHTML = '<div class="toc-lines">';
            let hoverMenuHTML = '<div class="toc-hover-menu"><div class="toc-header">大纲导航</div>';
            
            headings.forEach((h, i) => {
                if (!h.id) {
                    let baseId = encodeURIComponent(h.innerText.trim().toLowerCase().replace(/\\s+/g, '-'));
                    if (!baseId) baseId = 'heading';
                    let id = baseId;
                    let count = 1;
                    while (document.getElementById(id)) {
                        id = baseId + '-' + count;
                        count++;
                    }
                    h.id = id;
                }
                
                const level = parseInt(h.tagName.substring(1));
                const lineWidth = level === 1 ? 20 : level === 2 ? 16 : level === 3 ? 12 : 8;
                const paddingLeft = (level - 1) * 12 + 8;
                
                tocHTML += \`<div class="toc-line level-\${level}" data-id="\${h.id}" style="width: \${lineWidth}px;"></div>\`;
                hoverMenuHTML += \`<button class="toc-item" data-id="\${h.id}" style="padding-left: \${paddingLeft}px">\${h.innerText}</button>\`;
            });
            
            tocHTML += '</div>';
            hoverMenuHTML += '</div>';
            tocContainer.innerHTML = tocHTML + hoverMenuHTML;
            
            // Add click events
            tocContainer.querySelectorAll('.toc-item').forEach(btn => {
                btn.addEventListener('click', () => {
                    const el = document.getElementById(btn.getAttribute('data-id'));
                    if (el) {
                        const y = el.getBoundingClientRect().top + window.pageYOffset - 20;
                        window.scrollTo({top: y, behavior: 'smooth'});
                    }
                });
            });
            
            updateActiveHeading();
        }
        
        function updateActiveHeading() {
            const headings = Array.from(document.querySelectorAll('.markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4, .markdown-body h5, .markdown-body h6'));
            if (headings.length === 0) return;
            
            let activeId = headings[0].id;
            const threshold = 80;
            
            for (const h of headings) {
                if (h.getBoundingClientRect().top <= threshold) {
                    activeId = h.id;
                } else {
                    break;
                }
            }
            
            document.querySelectorAll('.toc-line, .toc-item').forEach(el => {
                if (el.getAttribute('data-id') === activeId) {
                    el.classList.add('active');
                } else {
                    el.classList.remove('active');
                }
            });
        }
        
        window.addEventListener('scroll', updateActiveHeading);
        
        // 初始化 TOC
        generateTOC();

        ${!isOnline ? `
        const installBtn = document.getElementById('installBtn');
        if (installBtn) {
            installBtn.addEventListener('click', () => {
                const isInstalled = installBtn.getAttribute('data-installed') === 'true';
                if (isInstalled) {
                    vscode.postMessage({
                        command: 'uninstallSkill',
                        skillData: ${JSON.stringify(this.skill)}
                    });
                    installBtn.textContent = '安装到当前工作区';
                    installBtn.setAttribute('data-installed', 'false');
                } else {
                    vscode.postMessage({
                        command: 'installSkill',
                        skillData: ${JSON.stringify(this.skill)}
                    });
                    installBtn.textContent = '从当前工作区移除';
                    installBtn.setAttribute('data-installed', 'true');
                }
            });
        }
        ` : ''}
        
        document.getElementById('copyPathBtn').addEventListener('click', () => {
            vscode.postMessage({
                command: 'copyPath',
                path: ${JSON.stringify(this.skill.local_path)}
            });
        });

        document.getElementById('copyContentBtn').addEventListener('click', () => {
            vscode.postMessage({
                command: 'copyContent'
            });
        });

        document.getElementById('translateBtn').addEventListener('click', () => {
            const lang = document.getElementById('targetLangSelect').value;
            if (translations[lang]) {
                // Use cached translation
                document.querySelector('.markdown-body').innerHTML = translations[lang];
                document.getElementById('translateBtn').style.display = 'none';
                document.getElementById('restoreBtn').style.display = 'inline-flex';
                currentMode = 'translated';
                generateTOC();
                return;
            }
            
            document.getElementById('translateBtn').innerText = '翻译中...';
            document.getElementById('translateBtn').disabled = true;
            
            vscode.postMessage({
                command: 'translate',
                text: rawMarkdown,
                targetLang: lang
            });
        });
        
        document.getElementById('restoreBtn').addEventListener('click', () => {
            document.querySelector('.markdown-body').innerHTML = originalHtml;
            document.getElementById('restoreBtn').style.display = 'none';
            const tBtn = document.getElementById('translateBtn');
            tBtn.style.display = 'inline-flex';
            tBtn.innerText = '翻译';
            tBtn.disabled = false;
            currentMode = 'original';
            generateTOC();
        });

        // If user changes language while translated, reset the button state
        document.getElementById('targetLangSelect').addEventListener('change', () => {
            if (currentMode === 'translated') {
                const lang = document.getElementById('targetLangSelect').value;
                if (translations[lang]) {
                    document.querySelector('.markdown-body').innerHTML = translations[lang];
                    generateTOC();
                } else {
                    document.querySelector('.markdown-body').innerHTML = originalHtml;
                    document.getElementById('restoreBtn').style.display = 'none';
                    const tBtn = document.getElementById('translateBtn');
                    tBtn.style.display = 'inline-flex';
                    tBtn.innerText = '翻译';
                    tBtn.disabled = false;
                    currentMode = 'original';
                    generateTOC();
                }
            }
        });

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'translatedContent') {
                translations[message.targetLang] = message.html;
                
                const mdBody = document.querySelector('.markdown-body');
                if (mdBody) {
                    mdBody.innerHTML = message.html;
                }
                document.getElementById('translateBtn').style.display = 'none';
                document.getElementById('restoreBtn').style.display = 'inline-flex';
                currentMode = 'translated';
                generateTOC();
            }
        });
    </script>
</body>
</html>`;
  }
}
