import { getCollection, type CollectionEntry } from 'astro:content';

export type LogicalDocument = CollectionEntry<'documents'>;

function sortDocuments(docs: LogicalDocument[]): LogicalDocument[] {
  return docs.slice().sort((a, b) => {
    if (a.data.date && b.data.date) {
      return (
        a.data.date.localeCompare(b.data.date) ||
        (a.data.dateSuffix ?? '').localeCompare(b.data.dateSuffix ?? '')
      );
    }
    if (a.data.date) return -1;
    if (b.data.date) return 1;
    return a.data.title.localeCompare(b.data.title, 'de');
  });
}

export async function getDocumentsForCategory(categorySlug: string): Promise<LogicalDocument[]> {
  const all = await getCollection('documents', (d) => d.data.category === categorySlug);
  return sortDocuments(all);
}

/** categorySlug -> its documents, for every category that has any. */
export async function getAllDocumentsByCategory(): Promise<Map<string, LogicalDocument[]>> {
  const all = await getCollection('documents');

  // Validate every document's `category` reference up front — fail the build
  // loudly on a frontmatter typo instead of silently dropping the document
  // from its listing page.
  const knownCategorySlugs = new Set((await getCollection('categories')).map((c) => c.data.slug));
  for (const doc of all) {
    if (!knownCategorySlugs.has(doc.data.category)) {
      throw new Error(`Document "${doc.id}" references unknown category "${doc.data.category}"`);
    }
  }

  const bySlug = new Map<string, CollectionEntry<'documents'>[]>();
  for (const doc of all) {
    const key = doc.data.category;
    if (!bySlug.has(key)) bySlug.set(key, []);
    bySlug.get(key)!.push(doc);
  }

  const result = new Map<string, LogicalDocument[]>();
  for (const [categorySlug, docs] of bySlug) {
    result.set(categorySlug, sortDocuments(docs));
  }
  return result;
}

/** Every document across the whole site. */
export async function getAllLogicalDocuments(): Promise<LogicalDocument[]> {
  const byCategory = await getAllDocumentsByCategory();
  return Array.from(byCategory.values()).flat();
}
