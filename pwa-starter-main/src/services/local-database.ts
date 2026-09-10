export type ChatMessage = {
  id: number | string;
  author: string;
  text: string;
  time: string;
  own: boolean;
};

const databaseName = 'mingle-local';
const databaseVersion = 1;
const messageStore = 'messages';
const syncKey = 'mingle-local-sync';
type ChangeListener = () => void;

class LocalDatabase {
  private readonly channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(syncKey) : undefined;

  subscribe(listener: ChangeListener): () => void {
    const handleChange = () => listener();
    this.channel?.addEventListener('message', handleChange);
    window.addEventListener('storage', handleChange);
    return () => {
      this.channel?.removeEventListener('message', handleChange);
      window.removeEventListener('storage', handleChange);
    };
  }

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, databaseVersion);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(messageStore)) {
          database.createObjectStore(messageStore, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getMessages(): Promise<ChatMessage[]> {
    try {
      const database = await this.open();
      return await new Promise((resolve, reject) => {
        const request = database.transaction(messageStore, 'readonly').objectStore(messageStore).getAll();
        request.onsuccess = () => resolve((request.result as ChatMessage[]).sort((left, right) => String(left.id).localeCompare(String(right.id), undefined, { numeric: true })));
        request.onerror = () => reject(request.error);
      });
    } catch {
      return [];
    }
  }

  async saveMessage(message: ChatMessage): Promise<void> {
    try {
      const database = await this.open();
      await new Promise<void>((resolve, reject) => {
        const request = database.transaction(messageStore, 'readwrite').objectStore(messageStore).put(message);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
      this.channel?.postMessage({ type: 'message-saved', id: message.id });
      localStorage.setItem(syncKey, String(message.id));
    } catch {
      // The UI remains usable when IndexedDB is unavailable or blocked.
    }
  }

  async seedMessages(messages: ChatMessage[]): Promise<void> {
    if ((await this.getMessages()).length > 0) return;
    await Promise.all(messages.map((message) => this.saveMessage(message)));
  }
}

export const localDatabase = new LocalDatabase();
