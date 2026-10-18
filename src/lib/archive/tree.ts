import type { ArchiveEntry } from "./open";

export interface TreeNode {
  name: string;
  path: string;
  /** Bytes, summed over everything beneath a folder. */
  size: number;
  /** Present on folders only. */
  children?: TreeNode[];
  files: number;
}

export interface TreeRow {
  node: TreeNode;
  depth: number;
}

/** `page2` before `page10`, the way a person numbers things. */
export const naturalCompare = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" }).compare;

export function buildTree(entries: ArchiveEntry[]): TreeNode {
  const root: TreeNode = { name: "", path: "", size: 0, children: [], files: 0 };
  const folders = new Map<string, TreeNode>([["", root]]);

  const folder = (path: string): TreeNode => {
    const existing = folders.get(path);
    if (existing) return existing;
    const cut = path.lastIndexOf("/");
    const parent = folder(cut < 0 ? "" : path.slice(0, cut));
    const node: TreeNode = { name: path.slice(cut + 1), path, size: 0, children: [], files: 0 };
    parent.children!.push(node);
    folders.set(path, node);
    return node;
  };

  for (const entry of entries) {
    const cut = entry.path.lastIndexOf("/");
    const parent = folder(cut < 0 ? "" : entry.path.slice(0, cut));
    parent.children!.push({ name: entry.path.slice(cut + 1), path: entry.path, size: entry.size, files: 1 });
  }

  const settle = (node: TreeNode) => {
    if (!node.children) return;
    node.children.forEach(settle);
    node.children.sort((a, b) => Number(!a.children) - Number(!b.children) || naturalCompare(a.name, b.name));
    node.size = node.children.reduce((sum, child) => sum + child.size, 0);
    node.files = node.children.reduce((sum, child) => sum + child.files, 0);
  };
  settle(root);
  return root;
}

export function visibleRows(root: TreeNode, expanded: ReadonlySet<string>): TreeRow[] {
  const rows: TreeRow[] = [];
  const walk = (node: TreeNode, depth: number) => {
    for (const child of node.children ?? []) {
      rows.push({ node: child, depth });
      if (child.children && expanded.has(child.path)) walk(child, depth + 1);
    }
  };
  walk(root, 0);
  return rows;
}

/** Folders opened at first: a lone top-level folder, and any lone folder inside it. */
export function initiallyExpanded(root: TreeNode): Set<string> {
  const open = new Set<string>();
  let node = root;
  while (node.children?.length === 1 && node.children[0].children) {
    node = node.children[0];
    open.add(node.path);
  }
  return open;
}
