// ============================================
// AI Brainstorm - Conversation Lock Manager
// ============================================

/**
 * Conversation Lock Manager
 * 
 * Uses the Web Locks API to coordinate exclusive access to running conversations
 * across multiple browser tabs. Only one tab can control a conversation at a time.
 * 
 * Browser Support:
 * - Chrome 69+, Firefox 96+, Safari 15.4+, Edge 79+
 * - Falls back gracefully for unsupported browsers
 */

// Lock name prefix for conversation locks
const LOCK_PREFIX = 'brainstorm-conversation-';

// Store release callbacks for held locks
const heldLocks = new Map<string, () => void>();

// Store lock lost callbacks
const lockLostCallbacks = new Map<string, Set<() => void>>();

/**
 * Check if the Web Locks API is supported
 */
export function isWebLocksSupported(): boolean {
  return typeof navigator !== 'undefined' && 'locks' in navigator;
}

/**
 * Get the lock name for a conversation
 */
function getLockName(conversationId: string): string {
  return `${LOCK_PREFIX}${conversationId}`;
}

/**
 * Acquire an exclusive lock for a conversation
 * 
 * @param conversationId - The conversation to lock
 * @returns true if lock was acquired, false if already held by another tab
 */
export async function acquireLock(conversationId: string): Promise<boolean> {
  if (!isWebLocksSupported()) {
    // Fallback: always succeed if Web Locks not supported
    console.warn('[ConversationLock] Web Locks API not supported, skipping lock');
    return true;
  }

  const lockName = getLockName(conversationId);

  // Already holding this lock
  if (heldLocks.has(conversationId)) {
    console.log(`[ConversationLock] Already holding lock for ${conversationId}`);
    return true;
  }

  return new Promise((resolve) => {
    // Try to acquire lock without blocking
    navigator.locks.request(
      lockName,
      { mode: 'exclusive', ifAvailable: true },
      async (lock) => {
        if (!lock) {
          // Lock is held by another tab
          console.log(`[ConversationLock] Lock unavailable for ${conversationId} (held by another tab)`);
          resolve(false);
          return;
        }

        console.log(`[ConversationLock] Lock acquired for ${conversationId}`);
        resolve(true);

        // Keep the lock held until releaseLock is called
        // This promise stays pending until we resolve the releasePromise
        return new Promise<void>((releaseResolve) => {
          heldLocks.set(conversationId, releaseResolve);
        });
      }
    ).catch((error) => {
      console.error(`[ConversationLock] Failed to acquire lock:`, error);
      resolve(false);
    });
  });
}

/**
 * Release a held lock for a conversation
 * 
 * @param conversationId - The conversation to unlock
 */
export function releaseLock(conversationId: string): void {
  const releaseCallback = heldLocks.get(conversationId);
  if (releaseCallback) {
    console.log(`[ConversationLock] Releasing lock for ${conversationId}`);
    releaseCallback();
    heldLocks.delete(conversationId);
  }
}

/**
 * Check if a conversation is locked by ANY tab (including this one)
 * 
 * @param conversationId - The conversation to check
 * @returns true if the conversation is locked
 */
export async function isLocked(conversationId: string): Promise<boolean> {
  if (!isWebLocksSupported()) {
    return false;
  }

  const lockName = getLockName(conversationId);

  try {
    const state = await navigator.locks.query();
    return state.held?.some(lock => lock.name === lockName) ?? false;
  } catch (error) {
    console.error(`[ConversationLock] Failed to query lock status:`, error);
    return false;
  }
}

/**
 * Check if a conversation is locked by ANOTHER tab (not this one)
 * 
 * @param conversationId - The conversation to check
 * @returns true if the conversation is locked by another tab
 */
export async function isLockedByOtherTab(conversationId: string): Promise<boolean> {
  // If we hold the lock, it's not locked by another tab
  if (heldLocks.has(conversationId)) {
    return false;
  }

  // Otherwise check if any tab holds it
  return isLocked(conversationId);
}

/**
 * Check if this tab holds the lock for a conversation
 * 
 * @param conversationId - The conversation to check
 * @returns true if this tab holds the lock
 */
export function isHeldByThisTab(conversationId: string): boolean {
  return heldLocks.has(conversationId);
}

/**
 * Register a callback to be notified if a lock is lost
 * (For future "takeover" feature)
 * 
 * @param conversationId - The conversation to watch
 * @param callback - Function to call when lock is lost
 * @returns Cleanup function to remove the callback
 */
export function onLockLost(conversationId: string, callback: () => void): () => void {
  if (!lockLostCallbacks.has(conversationId)) {
    lockLostCallbacks.set(conversationId, new Set());
  }
  lockLostCallbacks.get(conversationId)!.add(callback);

  return () => {
    lockLostCallbacks.get(conversationId)?.delete(callback);
  };
}

/**
 * Release all locks held by this tab
 * Useful for cleanup on page unload
 */
export function releaseAllLocks(): void {
  for (const conversationId of heldLocks.keys()) {
    releaseLock(conversationId);
  }
}

/**
 * Get list of conversation IDs locked by this tab
 */
export function getHeldLockIds(): string[] {
  return Array.from(heldLocks.keys());
}

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    releaseAllLocks();
  });
}

