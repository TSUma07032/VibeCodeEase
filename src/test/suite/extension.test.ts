import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('recordAccept Command correctly modifies editor text', async () => {
		// 1. Create a temporary file
		const tempFilePath = path.join(os.tmpdir(), 'vibeCodeEase-test-file.txt');
		fs.writeFileSync(tempFilePath, 'console.log("old code");\n');
		
		const uri = vscode.Uri.file(tempFilePath);
		const document = await vscode.workspace.openTextDocument(uri);
		const editor = await vscode.window.showTextDocument(document);

		// 2. Wait for editor to be active
		assert.strictEqual(editor.document.getText(), 'console.log("old code");\n');

		// 3. Prepare the mock proposal
		const proposal = {
			id: '123',
			originalText: 'console.log("old code");\n',
			proposedText: 'console.log("new code");\n',
			explanation: 'Test edit',
			documentUri: uri.toString(),
			isAiPush: true
		};

		// 4. Trigger the recordAccept command
		await vscode.commands.executeCommand('vibecodeease.recordAccept', proposal);

		// 5. Assert the document text is updated
		// Since edit is async, we wait briefly
		await new Promise(resolve => setTimeout(resolve, 500));
		
		assert.strictEqual(editor.document.getText(), 'console.log("new code");\n');

		// Cleanup
		fs.unlinkSync(tempFilePath);
	});
});
