import { openDB, type IDBPDatabase } from 'idb';
import type { Conversation } from '../types/index.js';

export interface IStorageService {
  getConversations(): Promise<Conversation[]>;
  getConversation(id: string): Promise<Conversation | null>;
  saveConversation(conversation: Conversation): Promise<void>;
  deleteConversation(id: string): Promise<void>;
  clearAllConversations(): Promise<void>;
  searchConversations(query: string): Promise<Conversation[]>;
}

const DB_NAME = 'radox_ai_chat_db';
const DB_VERSION = 1;
const STORE_NAME = 'conversations';

class IndexedDBStorageService implements IStorageService {
  private dbPromise: Promise<IDBPDatabase> | null = null;
  private memoryFallback: Map<string, Conversation> = new Map();
  private useMemoryFallback = false;

  constructor() {
    // Check if indexedDB is available in the environment
    if (typeof indexedDB === 'undefined') {
      this.useMemoryFallback = true;
    }
  }

  private async getDB(): Promise<IDBPDatabase | null> {
    if (this.useMemoryFallback) return null;
    if (!this.dbPromise) {
      try {
        this.dbPromise = openDB(DB_NAME, DB_VERSION, {
          upgrade(db) {
            if (!db.objectStoreNames.contains(STORE_NAME)) {
              const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
              store.createIndex('updatedAt', 'updatedAt');
            }
          },
        });
      } catch (e) {
        console.warn('IndexedDB unavailable, falling back to in-memory storage', e);
        this.useMemoryFallback = true;
        return null;
      }
    }
    return this.dbPromise;
  }

  public async getConversations(): Promise<Conversation[]> {
    if (this.useMemoryFallback) {
      return Array.from(this.memoryFallback.values()).sort((a, b) => b.updatedAt - a.updatedAt);
    }
    try {
      const db = await this.getDB();
      if (!db) return Array.from(this.memoryFallback.values());
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const items = await store.getAll();
      return items.sort((a, b) => b.updatedAt - a.updatedAt);
    } catch (e) {
      console.error('Failed to read conversations from IndexedDB', e);
      return [];
    }
  }

  public async getConversation(id: string): Promise<Conversation | null> {
    if (this.useMemoryFallback) {
      return this.memoryFallback.get(id) || null;
    }
    try {
      const db = await this.getDB();
      if (!db) return this.memoryFallback.get(id) || null;
      const conversation = await db.get(STORE_NAME, id);
      return conversation || null;
    } catch (e) {
      console.error(`Failed to read conversation ${id} from IndexedDB`, e);
      return null;
    }
  }

  public async saveConversation(conversation: Conversation): Promise<void> {
    if (this.useMemoryFallback) {
      this.memoryFallback.set(conversation.id, conversation);
      return;
    }
    try {
      const db = await this.getDB();
      if (!db) {
        this.memoryFallback.set(conversation.id, conversation);
        return;
      }
      await db.put(STORE_NAME, conversation);
    } catch (e) {
      console.error(`Failed to save conversation ${conversation.id} to IndexedDB`, e);
      this.memoryFallback.set(conversation.id, conversation);
    }
  }

  public async deleteConversation(id: string): Promise<void> {
    if (this.useMemoryFallback) {
      this.memoryFallback.delete(id);
      return;
    }
    try {
      const db = await this.getDB();
      if (!db) {
        this.memoryFallback.delete(id);
        return;
      }
      await db.delete(STORE_NAME, id);
    } catch (e) {
      console.error(`Failed to delete conversation ${id} from IndexedDB`, e);
      this.memoryFallback.delete(id);
    }
  }

  public async clearAllConversations(): Promise<void> {
    if (this.useMemoryFallback) {
      this.memoryFallback.clear();
      return;
    }
    try {
      const db = await this.getDB();
      if (!db) {
        this.memoryFallback.clear();
        return;
      }
      await db.clear(STORE_NAME);
    } catch (e) {
      console.error('Failed to clear conversations from IndexedDB', e);
      this.memoryFallback.clear();
    }
  }

  public async searchConversations(query: string): Promise<Conversation[]> {
    const q = query.toLowerCase().trim();
    if (!q) return this.getConversations();

    const all = await this.getConversations();
    return all.filter((conv) => {
      if (conv.title.toLowerCase().includes(q)) return true;
      return conv.messages.some((msg) => msg.content.toLowerCase().includes(q));
    });
  }
}

export const storageService: IStorageService = new IndexedDBStorageService();
