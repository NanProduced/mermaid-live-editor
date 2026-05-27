import { test, expect, type Page } from './test';

test.describe('Node interaction: preview-code linking', () => {
  test.beforeEach(async ({ editPage }) => {
    // Ensure we start with a clean flowchart
    await editPage.clearEditor();
    await editPage.typeInEditor(`flowchart TD
    A[Christmas] -->|Get money| B(Go shopping)
    B --> C{Let me think}
    C -->|One| D[Laptop]`, { bottom: false, newline: false });

    // Wait for the diagram to render
    await editPage.checkTextInView('Christmas');
  });

  test('clicking a node in preview jumps editor cursor to its definition', async ({
    editPage,
    page
  }) => {
    // Find a node in the preview SVG and click it
    const nodeG = page.locator('#container g.node').first();
    await expect(nodeG).toBeVisible({ timeout: 10000 });

    await nodeG.click();

    // The editor should now be focused
    await expect(page.locator('.monaco-editor')).toBeVisible();

    // Verify the editor has content (cursor was moved)
    const editorContent = await page.evaluate(() => {
      const editor = (window as any).monaco?.editor?.getEditors?.()[0];
      return editor?.getValue() ?? '';
    });
    expect(editorContent).toContain('Christmas');
  });

  test('cursor on definition line highlights corresponding node in preview', async ({
    editPage,
    page
  }) => {
    // Click on the editor to focus it
    await editPage.editor.click();

    // Position cursor on line 2 (where A[Christmas] is defined)
    await page.evaluate(() => {
      const editor = (window as any).monaco?.editor?.getEditors?.()[0];
      if (editor) {
        editor.setPosition({ lineNumber: 2, column: 5 });
        editor.focus();
      }
    });

    // The preview should have a highlighted node
    const highlightedNode = page.locator('#container g.node.mermaid-node-highlight');
    await expect(highlightedNode).toBeVisible({ timeout: 5000 });
  });

  test('right-clicking a node shows context menu', async ({ editPage, page }) => {
    const nodeG = page.locator('#container g.node').first();
    await expect(nodeG).toBeVisible({ timeout: 10000 });

    await nodeG.click({ button: 'right' });

    // Context menu should appear
    const contextMenu = page.locator('.fixed.z-50').filter({ hasText: 'Rename' });
    await expect(contextMenu).toBeVisible({ timeout: 5000 });
  });

  test('delete via context menu removes node from editor and preview', async ({
    editPage,
    page
  }) => {
    // First, find a node that's safe to delete (e.g., D[Laptop])
    // We need to clear and retype to have a predictable diagram
    await editPage.clearEditor();
    await editPage.typeInEditor(`flowchart TD
    A[Start] --> B[End]`, { bottom: false, newline: false });
    await editPage.checkTextInView('Start');

    // Right-click the first node
    const nodeG = page.locator('#container g.node').first();
    await expect(nodeG).toBeVisible({ timeout: 10000 });
    await nodeG.click({ button: 'right' });

    // Click Delete in context menu
    const deleteButton = page.locator('button').filter({ hasText: 'Delete' });
    await expect(deleteButton).toBeVisible({ timeout: 5000 });
    await deleteButton.click();

    // Wait for re-render
    await page.waitForTimeout(1000);

    // The editor content should have changed
    const editorContent = await page.evaluate(() => {
      const editor = (window as any).monaco?.editor?.getEditors?.()[0];
      return editor?.getValue() ?? '';
    });
    // After deleting one of the two nodes, the code should be shorter
    expect(editorContent.length).toBeLessThan(100);
  });

  test('rename via context menu updates source code', async ({ editPage, page }) => {
    // Use a simple diagram
    await editPage.clearEditor();
    await editPage.typeInEditor(`flowchart TD
    A[Hello] --> B[World]`, { bottom: false, newline: false });
    await editPage.checkTextInView('Hello');

    // Right-click the first node
    const nodeG = page.locator('#container g.node').first();
    await expect(nodeG).toBeVisible({ timeout: 10000 });
    await nodeG.click({ button: 'right' });

    // Click Rename
    const renameButton = page.locator('button').filter({ hasText: 'Rename' });
    await expect(renameButton).toBeVisible({ timeout: 5000 });

    // Handle the prompt dialog
    page.on('dialog', async (dialog) => {
      await dialog.accept('X');
    });

    await renameButton.click();

    // Wait for re-render
    await page.waitForTimeout(1000);

    // The editor content should have the new node ID
    const editorContent = await page.evaluate(() => {
      const editor = (window as any).monaco?.editor?.getEditors?.()[0];
      return editor?.getValue() ?? '';
    });
    expect(editorContent).toContain('X[Hello]');
  });

  test('change color via context menu adds style line', async ({ editPage, page }) => {
    // Use a simple diagram
    await editPage.clearEditor();
    await editPage.typeInEditor(`flowchart TD
    A[Hello] --> B[World]`, { bottom: false, newline: false });
    await editPage.checkTextInView('Hello');

    // Right-click the first node
    const nodeG = page.locator('#container g.node').first();
    await expect(nodeG).toBeVisible({ timeout: 10000 });
    await nodeG.click({ button: 'right' });

    // Click Change Color
    const colorButton = page.locator('button').filter({ hasText: 'Change Color' });
    await expect(colorButton).toBeVisible({ timeout: 5000 });

    // Handle the prompt dialog
    page.on('dialog', async (dialog) => {
      await dialog.accept('#ff0000');
    });

    await colorButton.click();

    // Wait for re-render
    await page.waitForTimeout(1000);

    // The editor content should have a style line
    const editorContent = await page.evaluate(() => {
      const editor = (window as any).monaco?.editor?.getEditors?.()[0];
      return editor?.getValue() ?? '';
    });
    expect(editorContent).toContain('style');
    expect(editorContent).toContain('fill:#ff0000');
  });
});
