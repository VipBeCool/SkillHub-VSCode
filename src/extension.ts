import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "skillhub-vscode" is now active!');

    const disposable = vscode.commands.registerCommand('skillhub.helloWorld', () => {
        vscode.window.showInformationMessage('Hello World from SkillHub!');
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}
