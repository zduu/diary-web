export const MAX_ENTRY_IMAGES_COUNT = 20;
export const MAX_ENTRY_IMAGE_URL_LENGTH = 2048;
export const MAX_ENTRY_IMAGE_DATA_URL_LENGTH = 12 * 1024 * 1024;

const imageUrlBase = 'https://diary.local';
const allowedImageProtocols = new Set(['http:', 'https:']);
const imageDataUrlPattern = /^data:image\/[a-z0-9.+-]+;base64,([a-z0-9+/=]+)$/i;
const base64PayloadPattern = /^(?:[a-z0-9+/]{4})*(?:[a-z0-9+/]{2}==|[a-z0-9+/]{3}=|[a-z0-9+/]{2,3})?$/i;
const dataImagePrefix = 'data:image/';

function hasControlCharacter(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const charCode = value.charCodeAt(index);
    if (charCode <= 31 || charCode === 127) {
      return true;
    }
  }

  return false;
}

export function isValidBase64Payload(value: string) {
  return value.length > 0
    && value.length % 4 !== 1
    && base64PayloadPattern.test(value);
}

export function isValidImageSource(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return false;
  }

  // 大体积 data URL 只做前缀切片判断，避免整串 toLowerCase 复制；
  // imageDataUrlPattern 的字符类本身已排除控制字符，无需再单独扫描
  if (trimmedValue.slice(0, dataImagePrefix.length).toLowerCase() === dataImagePrefix) {
    const dataUrlMatch = trimmedValue.length <= MAX_ENTRY_IMAGE_DATA_URL_LENGTH
      ? trimmedValue.match(imageDataUrlPattern)
      : null;
    return dataUrlMatch !== null && isValidBase64Payload(dataUrlMatch[1] || '');
  }

  if (trimmedValue.length > MAX_ENTRY_IMAGE_URL_LENGTH || hasControlCharacter(trimmedValue)) {
    return false;
  }

  try {
    const parsedUrl = new URL(trimmedValue, imageUrlBase);
    return allowedImageProtocols.has(parsedUrl.protocol);
  } catch {
    return false;
  }
}

export function isValidImageSourceArray(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.length <= MAX_ENTRY_IMAGES_COUNT
    && value.every(isValidImageSource);
}
