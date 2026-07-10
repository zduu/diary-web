/**
 * Cloudflare D1 数据库一致性工具函数
 * 
 * D1是分布式数据库，写操作可能需要时间同步到所有边缘节点
 * 这些工具函数帮助处理一致性问题
 */

export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
  signal?: AbortSignal;
}

function createAbortError() {
  return new DOMException('操作已取消', 'AbortError');
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

function waitForRetry(delayMs: number, signal?: AbortSignal) {
  throwIfAborted(signal);

  return new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      signal?.removeEventListener('abort', handleAbort);
      resolve();
    }, delayMs);

    const handleAbort = () => {
      clearTimeout(timeoutId);
      reject(createAbortError());
    };

    signal?.addEventListener('abort', handleAbort, { once: true });
  });
}

/**
 * 带重试的异步操作
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelay = 100,
    maxDelay = 2000,
    backoffFactor = 2,
    signal
  } = options;

  let lastError: Error;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    throwIfAborted(signal);

    try {
      return await operation();
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }

      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt === maxRetries) {
        break;
      }
      
      // 计算延迟时间（指数退避）
      const delay = Math.min(baseDelay * Math.pow(backoffFactor, attempt), maxDelay);
      await waitForRetry(delay, signal);
    }
  }
  
  throw lastError!;
}

/**
 * 验证删除操作是否成功
 */
export async function verifyDeletion(
  checkFunction: () => Promise<boolean>,
  options: RetryOptions = {}
): Promise<boolean> {
  const {
    maxRetries = 5,
    baseDelay = 200,
    maxDelay = 1000,
    backoffFactor = 1.5,
    signal
  } = options;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    throwIfAborted(signal);

    const delay = Math.min(baseDelay * Math.pow(backoffFactor, attempt), maxDelay);
    await waitForRetry(delay, signal);
    
    try {
      const isDeleted = await checkFunction();
      if (isDeleted) {
        return true;
      }
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }

      // 如果检查函数抛出错误（比如404），可能意味着删除成功
      if (error instanceof Error && error.message.includes('不存在')) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * 用于显示用户友好的错误消息
 */
export function getConsistencyErrorMessage(error: Error): string {
  if (error.message.includes('同步')) {
    return '数据正在同步中，请稍后刷新页面查看最新状态';
  }
  
  if (error.message.includes('网络')) {
    return '网络连接问题，请检查网络后重试';
  }
  
  if (error.message.includes('不存在')) {
    return '数据不存在或已被删除';
  }
  
  return error.message || '操作失败，请重试';
}
