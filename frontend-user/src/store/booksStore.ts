import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Book, ShelfEntry, ReadingProgress } from '../services/books.service';
import {
  fetchAllBooks,
  fetchUserShelf,
  upsertShelfEntry,
  removeShelfEntry,
  fetchAllReadingProgress,
} from '../services/books.service';
import { fetchUserPurchases } from '../services/purchases.service';


interface BooksState {
  // All published books
  books: Book[];
  booksLoading: boolean;
  booksError: string | null;
  // Last time books were fetched (for cache staleness)
  booksCachedAt: number | null;

  // User-specific data
  shelf: ShelfEntry[];
  shelfLoading: boolean;
  purchases: string[]; // book IDs the user has purchased
  readingProgress: Record<string, ReadingProgress>;

  // Actions
  loadBooks: (opts?: { category?: string; search?: string; force?: boolean }) => Promise<void>;
  loadUserData: (userId: string) => Promise<void>;
  toggleWishlist: (userId: string, bookId: string) => Promise<void>;
  markReading: (userId: string, bookId: string) => Promise<void>;
  isInWishlist: (bookId: string) => boolean;
  isOwned: (bookId: string) => boolean;
}

/** Books are considered fresh for 5 minutes */
const BOOKS_CACHE_TTL = 5 * 60 * 1000;

export const useBooksStore = create<BooksState>()(
  persist(
    (set, get) => ({
      books: [],
      booksLoading: false,
      booksError: null,
      booksCachedAt: null,
      shelf: [],
      shelfLoading: false,
      purchases: [],
      readingProgress: {},

      loadBooks: async (opts = {}) => {
        const { books, booksCachedAt } = get();
        const force = opts.force ?? false;

        // Skip fetch if cache is fresh and no search/category filters
        if (
          !force &&
          !opts.category &&
          !opts.search &&
          books.length > 0 &&
          booksCachedAt &&
          Date.now() - booksCachedAt < BOOKS_CACHE_TTL
        ) {
          return;
        }

        set({ booksLoading: true, booksError: null });
        try {
          const fetched = await fetchAllBooks(opts);
          set({
            books: fetched,
            booksLoading: false,
            booksCachedAt: Date.now(),
          });
        } catch (e) {
          // On network failure, keep existing books (offline support)
          set({
            booksError: e instanceof Error ? e.message : 'Failed to load books',
            booksLoading: false,
          });
        }
      },

      loadUserData: async (userId: string) => {
        set({ shelfLoading: true });
        try {
          const [shelfData, purchasesData, progressData] = await Promise.all([
            fetchUserShelf(userId),
            fetchUserPurchases(userId),
            fetchAllReadingProgress(userId),
          ]);

          const purchasedBookIds = purchasesData.map(
            (p: { book_id: string }) => p.book_id
          );

          // Build readingProgress map keyed by book_id
          const progressMap: Record<string, ReadingProgress> = {};
          (progressData as ReadingProgress[]).forEach((rp) => {
            progressMap[rp.book_id] = rp;
          });

          set({
            shelf: shelfData as unknown as ShelfEntry[],
            purchases: purchasedBookIds,
            readingProgress: progressMap,
            shelfLoading: false,
          });
        } catch (e) {
          console.error('Failed to load user book data:', e);
          set({ shelfLoading: false });
        }
      },

      toggleWishlist: async (userId: string, bookId: string) => {
        const { shelf } = get();
        const existing = shelf.find((s) => s.book_id === bookId && s.shelf === 'WANT_TO_READ');

        if (existing) {
          // Optimistic remove
          set({ shelf: shelf.filter((s) => !(s.book_id === bookId && s.shelf === 'WANT_TO_READ')) });
          try { await removeShelfEntry(userId, bookId); }
          catch { set({ shelf }); } // rollback on error
        } else {
          // Optimistic add
          const tempEntry = { id: `temp-${bookId}`, user_id: userId, book_id: bookId, shelf: 'WANT_TO_READ', added_at: new Date().toISOString() } as ShelfEntry;
          set({ shelf: [...shelf.filter((s) => s.book_id !== bookId), tempEntry] });
          try {
            const newEntry = await upsertShelfEntry(userId, bookId, 'WANT_TO_READ') as unknown as ShelfEntry;
            set({ shelf: [...get().shelf.filter((s) => s.book_id !== bookId), newEntry] });
          } catch {
            set({ shelf }); // rollback on error
          }
        }
      },

      markReading: async (userId: string, bookId: string) => {
        const newEntry = await upsertShelfEntry(userId, bookId, 'READING') as unknown as ShelfEntry;
        const { shelf } = get();
        set({ shelf: [...shelf.filter((s) => s.book_id !== bookId), newEntry] });
      },

      isInWishlist: (bookId: string) => {
        return get().shelf.some((s) => s.book_id === bookId && s.shelf === 'WANT_TO_READ');
      },

      isOwned: (bookId: string) => {
        const { purchases, books } = get();
        const book = books.find((b) => b.id === bookId);
        return purchases.includes(bookId) || (book?.is_free ?? false);
      },
    }),
    {
      name: 'lehkhabu-books-cache',
      // Only persist the books list and cache timestamp — user data is session-specific
      partialize: (state) => ({
        books: state.books,
        booksCachedAt: state.booksCachedAt,
      }),
    }
  )
);
