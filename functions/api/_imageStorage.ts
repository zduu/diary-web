import type { Env } from './_shared.ts';

const IMAGE_ROUTE_PREFIX = '/api/images/';
const IMAGE_KEY_PATTERN = /^(?:[a-zA-Z0-9][a-zA-Z0-9._-]*)(?:\/[a-zA-Z0-9][a-zA-Z0-9._-]*)*$/;

function parseStoredStringArray(value: unknown): string[] {
  if (typeof value !== 'string') {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string') ? parsed : [];
  } catch {
    return [];
  }
}

export function decodeManagedImageKey(rawKey: string | null | undefined): string | null {
  if (!rawKey) {
    return null;
  }

  try {
    const decodedKey = decodeURIComponent(rawKey).trim().replace(/^\/+/, '');
    return decodedKey && IMAGE_KEY_PATTERN.test(decodedKey) ? decodedKey : null;
  } catch {
    return null;
  }
}

export function extractManagedImageKeys(
  imageUrls: string[] | null | undefined,
  request: Request
): string[] {
  const keys = new Set<string>();
  const requestOrigin = new URL(request.url).origin;

  for (const imageUrl of imageUrls ?? []) {
    if (typeof imageUrl !== 'string' || !imageUrl.trim()) {
      continue;
    }

    let rawKey: string | null = null;

    if (imageUrl.startsWith(IMAGE_ROUTE_PREFIX)) {
      rawKey = imageUrl.slice(IMAGE_ROUTE_PREFIX.length).split(/[?#]/, 1)[0] ?? null;
    } else {
      try {
        const parsedUrl = new URL(imageUrl, request.url);
        if (parsedUrl.origin !== requestOrigin || !parsedUrl.pathname.startsWith(IMAGE_ROUTE_PREFIX)) {
          continue;
        }

        rawKey = parsedUrl.pathname.slice(IMAGE_ROUTE_PREFIX.length);
      } catch {
        continue;
      }
    }

    const decodedKey = decodeManagedImageKey(rawKey);
    if (decodedKey) {
      keys.add(decodedKey);
    }
  }

  return [...keys];
}

async function collectReferencedManagedImageKeys(
  env: Env,
  request: Request,
  excludingEntryId: number
): Promise<Set<string>> {
  const result = await env.DB.prepare('SELECT images FROM diary_entries WHERE id != ? AND deleted_at IS NULL')
    .bind(excludingEntryId)
    .all<Record<string, unknown>>();
  const referencedKeys = new Set<string>();

  for (const row of result.results ?? []) {
    const imageUrls = parseStoredStringArray(row.images);
    for (const key of extractManagedImageKeys(imageUrls, request)) {
      referencedKeys.add(key);
    }
  }

  return referencedKeys;
}

export async function deleteManagedImagesIfUnreferenced(options: {
  env: Env;
  request: Request;
  imageUrls: string[] | null | undefined;
  excludingEntryId: number;
}) {
  const { env, request, imageUrls, excludingEntryId } = options;

  if (!env.IMAGES_BUCKET) {
    return {
      deletedKeys: [] as string[],
      failedKeys: [] as string[],
      retainedKeys: [] as string[],
    };
  }

  const candidateKeys = extractManagedImageKeys(imageUrls, request);
  if (candidateKeys.length === 0) {
    return {
      deletedKeys: [] as string[],
      failedKeys: [] as string[],
      retainedKeys: [] as string[],
    };
  }

  const referencedKeys = await collectReferencedManagedImageKeys(env, request, excludingEntryId);
  const keysToDelete = candidateKeys.filter((key) => !referencedKeys.has(key));
  const retainedKeys = candidateKeys.filter((key) => referencedKeys.has(key));

  const deletionResults = await Promise.allSettled(
    keysToDelete.map(async (key) => {
      await env.IMAGES_BUCKET!.delete(key);
      return key;
    })
  );

  const deletedKeys: string[] = [];
  const failedKeys: string[] = [];

  deletionResults.forEach((result, index) => {
    const key = keysToDelete[index];
    if (!key) {
      return;
    }

    if (result.status === 'fulfilled') {
      deletedKeys.push(key);
      return;
    }

    failedKeys.push(key);
  });

  return {
    deletedKeys,
    failedKeys,
    retainedKeys,
  };
}
