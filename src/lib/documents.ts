import { getCollection, type CollectionEntry } from 'astro:content';

export interface LogicalDocument {
  documentGroup: string;
  title: string;
  category: string;
  date: string | null;
  dateSuffix?: string;
  isUndated: boolean;
  place?: string;
  isVerbatim: boolean;
  pageCount: number;
  pages: CollectionEntry<'documents'>[]; // sorted by sequenceIndex
}

function groupIntoLogicalDocuments(
  pages: CollectionEntry<'documents'>[],
): LogicalDocument[] {
  const groups = new Map<string, CollectionEntry<'documents'>[]>();
  for (const doc of pages) {
    const key = doc.data.documentGroup;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(doc);
  }

  const logical: LogicalDocument[] = [];
  for (const [documentGroup, groupPages] of groups) {
    groupPages.sort((a, b) => a.data.sequenceIndex - b.data.sequenceIndex);
    const first = groupPages[0].data;
    logical.push({
      documentGroup,
      title: first.title,
      category: first.category,
      date: first.date,
      dateSuffix: first.dateSuffix,
      isUndated: first.isUndated,
      place: first.place,
      isVerbatim: first.isVerbatim,
      pageCount: first.pageCount,
      pages: groupPages,
    });
  }

  return logical.sort((a, b) => {
    if (a.date && b.date) {
      return (
        a.date.localeCompare(b.date) || (a.dateSuffix ?? '').localeCompare(b.dateSuffix ?? '')
      );
    }
    if (a.date) return -1;
    if (b.date) return 1;
    return a.title.localeCompare(b.title, 'de');
  });
}

export async function getDocumentsForCategory(categorySlug: string): Promise<LogicalDocument[]> {
  const all = await getCollection('documents', (d) => d.data.category === categorySlug);
  return groupIntoLogicalDocuments(all);
}

/** categorySlug -> its logical documents, for every category that has any. */
export async function getAllDocumentsByCategory(): Promise<Map<string, LogicalDocument[]>> {
  const all = await getCollection('documents');

  // Validate every document's `category` reference up front — fail the build
  // loudly on a frontmatter typo instead of silently dropping the document
  // from its listing page.
  const knownCategorySlugs = new Set((await getCollection('categories')).map((c) => c.data.slug));
  for (const doc of all) {
    if (!knownCategorySlugs.has(doc.data.category)) {
      throw new Error(
        `Document "${doc.id}" references unknown category "${doc.data.category}"`,
      );
    }
  }

  const bySlug = new Map<string, CollectionEntry<'documents'>[]>();
  for (const doc of all) {
    const key = doc.data.category;
    if (!bySlug.has(key)) bySlug.set(key, []);
    bySlug.get(key)!.push(doc);
  }

  const result = new Map<string, LogicalDocument[]>();
  for (const [categorySlug, pages] of bySlug) {
    result.set(categorySlug, groupIntoLogicalDocuments(pages));
  }
  return result;
}

/** Every logical document across the whole site, each tagged with its category slug. */
export async function getAllLogicalDocuments(): Promise<LogicalDocument[]> {
  const byCategory = await getAllDocumentsByCategory();
  return Array.from(byCategory.values()).flat();
}
