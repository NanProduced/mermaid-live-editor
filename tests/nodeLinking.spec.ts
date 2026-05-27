import { test, expect } from './test';
import { TID } from '$/constants';

/**
 * Helper: get the SVG g.node element for a given source node ID.
 * Mermaid renders node IDs as `flowchart-<ID>-<index>` in the SVG.
 */
function svgNodeSelector(nodeId: string) {
  return `g.node[id*="flowchart-${nodeId}"]`;
}

test.describe('Node linking: preview ↔ editor', () => {
  test.beforeEach(async ({ editPage }) => {
    // Wait for default diagram to render (contains "Christmas")
    await editPage.checkTextInView('Christmas');
  });

  test('clicking a preview node jumps the editor cursor to its definition', async ({
    editPage,
    page
  }) => {
    // Click node D (Laptop) in the preview
    const nodeD = page.locator(svgNodeSelector('D'));
    await expect(nodeD).toBeVisible({ timeout: 10_000 });
    await nodeD.click();

    // The editor should now contain a cursor-related visible line decoration.
    // Verify by checking the node-linked-glyph is present (editor highlight bar).
    const glyph = page.locator('.node-linked-glyph');
    await expect(glyph).toBeVisible({ timeout: 5_000 });
  });

  test('hovering a preview node highlights the corresponding editor line', async ({
    editPage,
    page
  }) => {
    const nodeA = page.locator(svgNodeSelector('A'));
    await expect(nodeA).toBeVisible({ timeout: 10_000 });

    // Hover over node A
    await nodeA.hover();

    // Editor should show the line highlight decoration
    const glyph = page.locator('.node-linked-glyph');
    await expect(glyph).toBeVisible({ timeout: 5_000 });

    // Move mouse away
    await page.locator('#view').hover({ position: { x: 5, y: 5 } });

    // Highlight should disappear
    await expect(glyph).not.toBeVisible({ timeout: 3_000 });
  });

  test('editor cursor on a node line highlights the preview node', async ({ editPage, page }) => {
    // Click inside the editor to focus it
    const editor = page.locator('.monaco-editor');
    await editor.click();

    // Go to the top of the editor
    await page.keyboard.press('Control+Home');

    // The default code line 2 is: "    A[Christmas] -->|Get money| B(Go shopping)"
    // Move down one line from line 1 (flowchart TD) to line 2 (where A is defined)
    await page.keyboard.press('ArrowDown');

    // Wait a moment for the reactive store to update
    await page.waitForTimeout(300);

    // Node A in the preview should have the highlight class
    const highlightedNode = page.locator('.node-linked-highlight');
    await expect(highlightedNode).toBeVisible({ timeout: 5_000 });
  });
});

test.describe('Node context menu', () => {
  test.beforeEach(async ({ editPage }) => {
    await editPage.checkTextInView('Christmas');
  });

  test('right-click shows context menu with rename, color, and delete options', async ({
    editPage,
    page
  }) => {
    const nodeA = page.locator(svgNodeSelector('A'));
    await expect(nodeA).toBeVisible({ timeout: 10_000 });

    // Right-click on node A
    await nodeA.click({ button: 'right' });

    // Context menu should appear
    const menu = page.getByTestId(TID.nodeContextMenu);
    await expect(menu).toBeVisible({ timeout: 3_000 });

    // Should have rename, color, and delete buttons
    await expect(page.getByTestId(TID.nodeMenuRename)).toBeVisible();
    await expect(page.getByTestId(TID.nodeMenuColor)).toBeVisible();
    await expect(page.getByTestId(TID.nodeMenuDelete)).toBeVisible();
  });

  test('renaming a node updates both source code and preview', async ({ editPage, page }) => {
    const nodeE = page.locator(svgNodeSelector('E'));
    await expect(nodeE).toBeVisible({ timeout: 10_000 });

    // Right-click on node E (iPhone)
    await nodeE.click({ button: 'right' });

    const menu = page.getByTestId(TID.nodeContextMenu);
    await expect(menu).toBeVisible({ timeout: 3_000 });

    // Click "Rename"
    await page.getByTestId(TID.nodeMenuRename).click();

    // Rename input should appear
    const renameInput = page.getByTestId(TID.nodeRenameInput);
    await expect(renameInput).toBeVisible();

    // Clear and type new name
    await renameInput.fill('Smartphone');

    // Click Save
    await page.getByTestId(TID.nodeRenameConfirm).click();

    // Preview should show "Smartphone" instead of "iPhone"
    await editPage.checkTextInView('Smartphone');
    await editPage.checkTextNotInView('iPhone');

    // Editor should also contain the new label
    await editPage.checkInEditor('Smartphone');
  });

  test('deleting a node removes it from both source code and preview', async ({
    editPage,
    page
  }) => {
    const nodeF = page.locator(svgNodeSelector('F'));
    await expect(nodeF).toBeVisible({ timeout: 10_000 });

    // Verify "Car" is initially visible
    await editPage.checkTextInView('Car');

    // Right-click on node F (Car)
    await nodeF.click({ button: 'right' });

    const menu = page.getByTestId(TID.nodeContextMenu);
    await expect(menu).toBeVisible({ timeout: 3_000 });

    // Click "Delete"
    await page.getByTestId(TID.nodeMenuDelete).click();

    // Context menu should close
    await expect(menu).not.toBeVisible({ timeout: 3_000 });

    // Preview should no longer show "Car"
    await editPage.checkTextNotInView('Car');

    // Editor should no longer contain F[fa:fa-car Car]
    await expect(editPage.editor).not.toContainText('fa:fa-car Car');
  });

  test('clicking outside closes the context menu', async ({ editPage, page }) => {
    const nodeA = page.locator(svgNodeSelector('A'));
    await expect(nodeA).toBeVisible({ timeout: 10_000 });

    // Right-click on node A
    await nodeA.click({ button: 'right' });

    const menu = page.getByTestId(TID.nodeContextMenu);
    await expect(menu).toBeVisible({ timeout: 3_000 });

    // Click somewhere else (the editor area)
    await page.locator('.monaco-editor').click({ position: { x: 50, y: 50 } });

    // Menu should be gone
    await expect(menu).not.toBeVisible({ timeout: 3_000 });
  });
});
