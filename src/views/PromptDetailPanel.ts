import * as vscode from 'vscode';
import { Prompt } from '../types';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import { translateText } from '../utils/translate';

export class PromptDetailPanel {
  public static currentPanel: PromptDetailPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, private prompt: Prompt) {
    this._panel = panel;
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    
    this._panel.webview.onDidReceiveMessage(
      message => {
        switch (message.command) {
          case 'copyPrompt':
            vscode.env.clipboard.writeText(this.prompt.content);
            vscode.window.setStatusBarMessage('已复制提示词内容', 3000);
            return;
          case 'translate':
            vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "正在翻译..." }, async () => {
              try {
                const translated = await translateText(message.text, message.targetLang || 'zh-CN');
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
                
                this._panel.webview.postMessage({ command: 'translatedContent', html: md.render(translated), targetLang: message.targetLang });
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

  public static createOrShow(prompt: Prompt, forceNewTab: boolean = false) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (!forceNewTab && PromptDetailPanel.currentPanel) {
      PromptDetailPanel.currentPanel._panel.reveal(column);
      PromptDetailPanel.currentPanel.prompt = prompt;
      PromptDetailPanel.currentPanel._update();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'skillhubPromptDetail',
      'Prompt Details',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    const detailPanel = new PromptDetailPanel(panel, prompt);
    if (!forceNewTab) {
      PromptDetailPanel.currentPanel = detailPanel;
    }
  }

  public dispose() {
    if (PromptDetailPanel.currentPanel === this) {
      PromptDetailPanel.currentPanel = undefined;
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
    this._panel.title = this.prompt.title;
    this._panel.webview.html = this._getHtmlForWebview();
  }

  private _getHtmlForWebview() {
    const escapeHtml = (unsafe: string) => {
        return unsafe
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
    };

    let content = this.prompt.content || '';
    
    // Process variables {{var}}
    content = content.replace(/\{\{([^}]+)\}\}/g, '`<span class="prompt-variable">{{$1}}</span>`');

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

    const renderedMarkdown = content ? md.render(content) : '<p>No content available.</p>';
    
    const safeJsonStringify = (data: any) => {
        return JSON.stringify(data)
            .replace(/</g, '\\u003c')
            .replace(/>/g, '\\u003e')
            .replace(/&/g, '\\u0026');
    };

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(this.prompt.title)}</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
    <style>
        body { 
            font-family: var(--vscode-font-family); 
            margin: 0;
            padding: 0; 
            color: var(--vscode-foreground); 
            background-color: var(--vscode-editor-background);
            line-height: 1.6;
            overflow-x: hidden;
        }
        .page-container {
            width: 100%;
            margin: 0;
            padding: 24px 100px 180px 100px;
            box-sizing: border-box;
        }
        @media (max-width: 640px) {
            .page-container {
                padding: 20px 24px 120px;
            }
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
        .prompt-variable {
            color: var(--vscode-charts-orange);
            font-weight: bold;
        }
        .action-bar {
            display: flex;
            gap: 10px;
            margin: 0;
        }
        .btn-copy {
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
        .btn-copy:hover {
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

        /* TOC Styles - 对标桌面版不带卡片背景的轻量细小横线及展开大纲 */
        .toc-container {
            position: fixed;
            right: 20px;
            top: 130px;
            bottom: 30px;
            z-index: 1000;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            justify-content: flex-start;
            pointer-events: none;
        }
        .toc-lines {
            pointer-events: auto;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 10px;
            padding: 8px 4px;
            background: transparent;
            border: none;
            box-shadow: none;
            cursor: pointer;
            max-height: 100%;
            overflow-y: auto;
            scrollbar-width: none;
            -ms-overflow-style: none;
        }
        .toc-lines::-webkit-scrollbar {
            display: none;
        }
        .toc-line {
            height: 2px;
            background: var(--vscode-editor-foreground, #888888);
            opacity: 0.4;
            border-radius: 9999px;
            transition: all 0.2s ease;
        }
        .toc-line.active {
            opacity: 1;
            background: var(--vscode-focusBorder, #007acc);
            box-shadow: none;
            height: 2.5px;
            transform: scaleX(1.15);
            transform-origin: right;
        }
        .toc-container:hover .toc-lines {
            display: none;
        }
        .toc-hover-menu {
            pointer-events: auto;
            display: none;
            flex-direction: column;
            background: var(--vscode-editorWidget-background, var(--vscode-editor-background));
            border: 1px solid var(--vscode-editorWidget-border);
            border-radius: 12px;
            padding: 12px;
            box-shadow: 0 8px 28px rgba(0, 0, 0, 0.22);
            backdrop-filter: blur(12px);
            max-height: 100%;
            overflow-y: auto;
            overflow-x: hidden;
            width: 288px;
            box-sizing: border-box;
            animation: tocFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes tocFadeIn {
            from { opacity: 0; transform: translateY(-4px) scale(0.98); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .toc-container:hover .toc-hover-menu {
            display: flex;
        }
        .toc-header {
            font-size: 11px;
            font-weight: 600;
            color: var(--vscode-descriptionForeground);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 8px;
            padding: 0 6px;
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
            transition: all 0.15s ease;
            font-family: inherit;
            width: 100%;
            box-sizing: border-box;
        }
        .toc-item:hover {
            background: var(--vscode-list-hoverBackground, rgba(128, 128, 128, 0.1));
            color: var(--vscode-foreground);
        }
        .toc-item.active {
            background: var(--vscode-list-activeSelectionBackground, rgba(128, 128, 128, 0.16));
            color: var(--vscode-list-activeSelectionForeground, var(--vscode-foreground));
            font-weight: 600;
        }
        .toc-hover-menu::-webkit-scrollbar {
            width: 4px;
        }
        .toc-hover-menu::-webkit-scrollbar-thumb {
            background: rgba(128, 128, 128, 0.2);
            border-radius: 4px;
        }
        .toc-hover-menu::-webkit-scrollbar-thumb:hover {
            background: rgba(128, 128, 128, 0.4);
        }
    </style>
</head>
<body>
    <div class="page-container">
        <div class="header-container">
            <div class="title-row">
                <h1>${escapeHtml(this.prompt.title)}</h1>
                <div class="header-badges">
                    <span class="badge">${escapeHtml(this.prompt.group_name || '未分组')}</span>
                    <span class="badge badge-outline">v${this.prompt.version}</span>
                    ${this.prompt.tags ? this.prompt.tags.split(',').filter(t => t.trim()).map(t => `<span class="badge badge-outline">#${escapeHtml(t.trim())}</span>`).join('') : ''}
                </div>
            </div>
            
            <div class="action-bar">
                <button id="copyBtn" class="btn-copy">
                    复制提示词内容
                </button>
            </div>
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
    </div>

    <div class="toc-container" id="tocContainer" style="display: none;"></div>

    <script>
        const vscode = acquireVsCodeApi();
        const rawContent = ${safeJsonStringify(content)};
        const originalHtml = ${safeJsonStringify(content ? md.render(content) : '<p>No content available.</p>')};
        let translations = {};
        let currentMode = 'original';
        let isClickScrolling = false;

        // TOC 生成与滚动联动
        function generateTOC() {
            const markdownBody = document.querySelector('.markdown-body');
            if (!markdownBody) return;
            const headings = Array.from(markdownBody.querySelectorAll('h1, h2, h3, h4, h5, h6'));
            const tocContainer = document.getElementById('tocContainer');
            
            if (!tocContainer) return;
            if (headings.length === 0) {
                tocContainer.style.display = 'none';
                return;
            }
            tocContainer.style.display = 'flex';
            
            const gap = headings.length > 60 ? 4 : (headings.length > 35 ? 6 : 10);
            let tocHTML = '<div class="toc-lines" style="gap: ' + gap + 'px;">';
            let hoverMenuHTML = '<div class="toc-hover-menu"><div class="toc-header" style="display:flex;justify-content:space-between;align-items:center;"><span>大纲导航</span><span style="font-size:10px;opacity:0.7;font-weight:normal;">' + headings.length + ' 节</span></div>';
            
            headings.forEach((h, i) => {
                if (!h.id) {
                    let baseId = encodeURIComponent(h.innerText.trim().toLowerCase().replace(/\s+/g, '-'));
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
                const lineWidth = level === 1 ? 20 : level === 2 ? 16 : level === 3 ? 12 : 10;
                const paddingLeft = (level - 1) * 12 + 8;
                const titleText = (h.innerText || '').trim().replace(/"/g, '&quot;');
                
                tocHTML += '<div class="toc-line level-' + level + '" data-id="' + h.id + '" title="' + titleText + '" style="width: ' + lineWidth + 'px;"></div>';
                hoverMenuHTML += '<button class="toc-item" data-id="' + h.id + '" style="padding-left: ' + paddingLeft + 'px">' + h.innerText + '</button>';
            });
            
            tocHTML += '</div>';
            hoverMenuHTML += '</div>';
            tocContainer.innerHTML = tocHTML + hoverMenuHTML;

            tocContainer.querySelectorAll('.toc-item').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.getAttribute('data-id');
                    const el = document.getElementById(id);
                    if (el) {
                        isClickScrolling = true;
                        setActiveHeading(id);
                        const y = el.getBoundingClientRect().top + window.pageYOffset - 20;
                        window.scrollTo({top: y, behavior: 'smooth'});
                        setTimeout(() => { isClickScrolling = false; }, 650);
                    }
                });
            });
            
            updateActiveHeading();
        }

        function setActiveHeading(activeId) {
            document.querySelectorAll('.toc-line, .toc-item').forEach(el => {
                if (el.getAttribute('data-id') === activeId) {
                    el.classList.add('active');
                } else {
                    el.classList.remove('active');
                }
            });
        }
        
        function updateActiveHeading() {
            if (isClickScrolling) return;
            const headings = Array.from(document.querySelectorAll('.markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4, .markdown-body h5, .markdown-body h6'));
            if (headings.length === 0) return;

            // 1. 触底检测（页面滚动到底部时，逆序寻找视口内已出现的最后一个标题）
            const scrollY = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
            const windowH = window.innerHeight || document.documentElement.clientHeight;
            const docH = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
            const scrollBottom = docH - scrollY - windowH;

            if (scrollBottom < 45) {
                for (let i = headings.length - 1; i >= 0; i--) {
                    const rect = headings[i].getBoundingClientRect();
                    if (rect.top < windowH - 30) {
                        setActiveHeading(headings[i].id);
                        return;
                    }
                }
                setActiveHeading(headings[headings.length - 1].id);
                return;
            }
            
            let activeId = headings[0].id;
            const threshold = 140;
            
            for (const h of headings) {
                if (h.getBoundingClientRect().top <= threshold) {
                    activeId = h.id;
                } else {
                    break;
                }
            }
            
            setActiveHeading(activeId);
        }
        
        window.addEventListener('scroll', updateActiveHeading, { passive: true });
        document.addEventListener('scroll', updateActiveHeading, { passive: true, capture: true });
        generateTOC();
        window.addEventListener('DOMContentLoaded', generateTOC);
        setTimeout(generateTOC, 150);
        setTimeout(generateTOC, 500);
        
        document.getElementById('copyBtn').addEventListener('click', () => {
            vscode.postMessage({
                command: 'copyPrompt'
            });
        });

        document.getElementById('translateBtn').addEventListener('click', () => {
            const lang = document.getElementById('targetLangSelect').value;
            if (translations[lang]) {
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
                text: rawContent,
                targetLang: lang
            });
        });
        
        document.getElementById('restoreBtn').addEventListener('click', () => {
            document.querySelector('.markdown-body').innerHTML = originalHtml;
            document.getElementById('restoreBtn').style.display = 'none';
            const tBtn = document.getElementById('translateBtn');
            tBtn.style.display = 'inline-flex';
            tBtn.innerText = '翻译内容';
            tBtn.disabled = false;
            currentMode = 'original';
            generateTOC();
        });

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
                    tBtn.innerText = '翻译内容';
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
