import { getCollection, type CollectionEntry } from 'astro:content';

export interface NavNode {
  slug: string;
  title: string;
  navLabel: string;
  order: number;
  path: string; // full URL path built by walking parents, e.g. "nachlaesse/scholl-mathilde"
  showInNav: boolean;
  children: NavNode[];
}

export async function buildNavTree(): Promise<NavNode[]> {
  const cats = await getCollection('categories');
  const bySlug = new Map(cats.map((c) => [c.data.slug, c]));

  function pathFor(slug: string): string {
    const cat = bySlug.get(slug);
    if (!cat) throw new Error(`Unknown category slug referenced as parent: ${slug}`);
    return cat.data.parent ? `${pathFor(cat.data.parent)}/${cat.data.slug}` : cat.data.slug;
  }

  function toNode(cat: CollectionEntry<'categories'>): NavNode {
    const children = cats
      .filter((c) => c.data.parent === cat.data.slug)
      .sort((a, b) => a.data.order - b.data.order)
      .map(toNode);
    return {
      slug: cat.data.slug,
      title: cat.data.title,
      navLabel: cat.data.navLabel ?? cat.data.title,
      order: cat.data.order,
      path: pathFor(cat.data.slug),
      showInNav: cat.data.showInNav,
      children,
    };
  }

  // Validate every `parent` reference up front, before building the tree,
  // so a typo'd slug fails the build loudly instead of silently vanishing.
  for (const cat of cats) {
    if (cat.data.parent !== null && !bySlug.has(cat.data.parent)) {
      throw new Error(
        `Category "${cat.data.slug}" references unknown parent "${cat.data.parent}"`,
      );
    }
  }

  return cats
    .filter((c) => c.data.parent === null)
    .sort((a, b) => a.data.order - b.data.order)
    .map(toNode);
}

/** Flattens the tree for getStaticPaths()-style consumers. */
export async function flattenNavTree(): Promise<NavNode[]> {
  const roots = await buildNavTree();
  const out: NavNode[] = [];
  const walk = (n: NavNode) => {
    out.push(n);
    n.children.forEach(walk);
  };
  roots.forEach(walk);
  return out;
}

/** Finds a single nav node by its full URL path (e.g. "nachlaesse/scholl-mathilde"). */
export async function findNavNodeByPath(path: string): Promise<NavNode | undefined> {
  const flat = await flattenNavTree();
  return flat.find((n) => n.path === path);
}

/** Finds a single nav node by its (globally unique) category slug. */
export async function findNavNodeBySlug(slug: string): Promise<NavNode | undefined> {
  const flat = await flattenNavTree();
  return flat.find((n) => n.slug === slug);
}

/** Breadcrumb trail from root down to (and including) the given node. */
export async function breadcrumbsFor(path: string): Promise<NavNode[]> {
  const flat = await flattenNavTree();
  const bySlug = new Map(flat.map((n) => [n.slug, n]));
  const node = flat.find((n) => n.path === path);
  if (!node) return [];

  const trail: NavNode[] = [];
  const cats = await getCollection('categories');
  const catBySlug = new Map(cats.map((c) => [c.data.slug, c]));

  let current: NavNode | undefined = node;
  while (current) {
    trail.unshift(current);
    const parentSlug: string | null = catBySlug.get(current.slug)?.data.parent ?? null;
    current = parentSlug ? bySlug.get(parentSlug) : undefined;
  }
  return trail;
}
