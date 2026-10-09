import * as vscode from 'vscode';
import { SharedAnalysisCache } from './analyzer';
import { GlobalState } from '../state/globalState';

export const DIFF_SCHEME = 'vibecodeease-diff';

class VibeComment implements vscode.Comment {
    id: number;
    label: string | undefined;
    savedBody: string | vscode.MarkdownString;
    constructor(
        public body: string | vscode.MarkdownString,
        public mode: vscode.CommentMode,
        public author: vscode.CommentAuthorInformation
    ) {
        this.id = ++VibeComment.commentId;
        this.savedBody = this.body;
    }
    static commentId = 0;
}

export class DiffProvider implements vscode.TextDocumentContentProvider, vscode.Disposable {
    // TODO: [Next-Gen Architecture] Migrate to a dedicated Webview (Monaco Editor) or extend 
    // this provider to support the "AI Workspace only" view as per uiux_redesign_specification.md.
    // The current VS Code native Diff view (Left/Right) might be too intrusive. 
    // The long-term vision is a GitHub-like diff layout inside a dedicated Sidebar/Panel where 
    // only the AI-improved code is shown, with clickable highlight decorations for reasons and fixes.
    onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
    onDidChange = this.onDidChangeEmitter.event;

    private commentController: vscode.CommentController;
    private threads: Map<string, vscode.CommentThread[]> = new Map();

    constructor() {
        this.commentController = vscode.comments.createCommentController('vibecodeease.diffComments', 'vibeCodeEase AI Feedback');
        this.commentController.commentingRangeProvider = {
            provideCommentingRanges: (document: vscode.TextDocument, token: vscode.CancellationToken) => {
                if (document.uri.scheme === DIFF_SCHEME) {
                    return [new vscode.Range(0, 0, document.lineCount, 0)];
                }
                return undefined;
            }
        };
    }

    public update(uri: vscode.Uri) {
        this.onDidChangeEmitter.fire(uri);
    }

    provideTextDocumentContent(uri: vscode.Uri): string {
        // uri format: vibecodeease-diff://modified/path/to/file.ts
        const originalUri = vscode.Uri.file(uri.path);
        const document = vscode.workspace.textDocuments.find(doc => doc.uri.fsPath === originalUri.fsPath);
        if (!document) {
            return 'Document not found';
        }

        const results = SharedAnalysisCache.getInstance().getResults(document);
        let modifiedText = document.getText();
        
        const globalState = GlobalState.getInstance();
        const edits: { range: vscode.Range, text: string, message: string }[] = [];

        for (const result of results) {
            const level = globalState.getInterventionLevel(result.category);
            if (level === 'IGNORE') continue;

            for (const intervention of result.interventions) {
                if (intervention.replacementText) {
                    edits.push({
                        range: new vscode.Range(result.range.start.line, result.range.start.character, result.range.end.line, result.range.end.character),
                        text: intervention.replacementText,
                        message: intervention.message || 'AI提案があります。'
                    });
                }
            }
        }

        // To map comments correctly, we must apply edits top-to-bottom and track line shifts.
        // Wait, if we sort descending (bottom-up), it's easier to apply edits without shifting preceding edits, 
        // but we still need the final line numbers for the comments.
        // Let's sort top-to-bottom so we can track the accumulated line difference.
        edits.sort((a, b) => a.range.start.compareTo(b.range.start));

        const lines = modifiedText.split('\n');
        let lineShift = 0;
        
        // Clear old threads for this uri
        this.clearThreads(uri.toString());
        const newThreads: vscode.CommentThread[] = [];

        for (const edit of edits) {
            const startLine = edit.range.start.line;
            const endLine = edit.range.end.line;
            
            const originalLinesReplaced = endLine - startLine + 1;
            const replacementLines = edit.text.split('\n');
            const newLinesCount = replacementLines.length;
            
            // The new start line in the modified document
            const modifiedStartLine = startLine + lineShift;
            
            let before = lines[modifiedStartLine].substring(0, edit.range.start.character);
            let after = lines[modifiedStartLine + originalLinesReplaced - 1].substring(edit.range.end.character);
            
            replacementLines[0] = before + replacementLines[0];
            replacementLines[replacementLines.length - 1] += after;
            
            lines.splice(modifiedStartLine, originalLinesReplaced, ...replacementLines);
            
            // Create a comment thread on the modified start line
            const threadRange = new vscode.Range(modifiedStartLine, 0, modifiedStartLine, 0);
            
            const args = [originalUri, edit.range, edit.text];
            const encodedArgs = encodeURIComponent(JSON.stringify(args));
            const applyLink = `[✨ Apply Suggestion](command:vibecodeease.applyIntervention?${encodedArgs})`;
            
            const md = new vscode.MarkdownString();
            md.isTrusted = true;
            md.appendMarkdown(`${edit.message}\n\n---\n\n${applyLink}`);

            const comment = new VibeComment(
                md,
                vscode.CommentMode.Preview,
                { name: 'AI Reviewer', iconPath: vscode.Uri.parse('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><text x="0" y="12" font-size="12">🤖</text></svg>') }
            );
            const thread = this.commentController.createCommentThread(uri, threadRange, [comment]);
            thread.canReply = false;
            newThreads.push(thread);

            lineShift += (newLinesCount - originalLinesReplaced);
        }

        this.threads.set(uri.toString(), newThreads);

        return lines.join('\n');
    }
    
    private clearThreads(uriStr: string) {
        const existing = this.threads.get(uriStr);
        if (existing) {
            existing.forEach(t => t.dispose());
            this.threads.delete(uriStr);
        }
    }

    dispose() {
        this.threads.forEach(threadList => threadList.forEach(t => t.dispose()));
        this.threads.clear();
        this.commentController.dispose();
    }
}
