// ── Shared Types for Lehkhabu Admin ──────────────────────────
export type BookStatus = 'approved' | 'pending' | 'rejected' | 'draft';
export type UserRole = 'user' | 'admin' | 'author';
export type UserStatus = 'active' | 'suspended';
export type OrderStatus = 'completed' | 'refunded' | 'pending';
export type ApplicationStatus = 'pending' | 'approved' | 'rejected';

export interface Book {
  id: string;
  title: string;
  author: string;
  authorId: string;
  genre: string;
  price: number;
  status: BookStatus;
  featured: boolean;
  coverUrl?: string;
  coverColor: string;
  pages: number;
  rating: number;
  reviews: number;
  sales: number;
  revenue: number;
  publishedAt?: string;
  submittedAt: string;
  description: string;
  language: string;
  isbn?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  avatar?: string;
  avatarColor: string;
  joinedAt: string;
  lastActive: string;
  booksOwned: number;
  totalSpent: number;
  country: string;
}

export interface Author {
  id: string;
  name: string;
  email: string;
  bio: string;
  avatarColor: string;
  totalBooks: number;
  totalSales: number;
  totalRevenue: number;
  rating: number;
  joinedAt: string;
  verified: boolean;
}

export interface Order {
  id: string;
  userId: string;
  userName: string;
  bookId: string;
  bookTitle: string;
  amount: number;
  status: OrderStatus;
  createdAt: string;
  paymentMethod: string;
}

export interface Announcement {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'update' | 'promo';
  active: boolean;
  targetAudience: 'all' | 'premium' | 'new';
  createdAt: string;
  expiresAt?: string;
}

export interface UISettings {
  heroBannerEnabled: boolean;
  featuredSectionTitle: string;
  homeHeroText: string;
  homeSubText: string;
  maintenanceMode: boolean;
  allowRegistrations: boolean;
  maxBooksPerUser: number;
  defaultCurrency: string;
  platformFeePercent: number;
  newBooksHighlight: boolean;
  announcementBannerText: string;
  announcementBannerActive: boolean;
}

export interface BookSubmission {
  id: string;
  title: string;
  description: string;
  genre: string;
  language: string;
  price: number;
  pages: number;
  coverColor: string;
  submittedAt: string;
}

export interface AuthorApplication {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  avatarColor: string;
  bio: string;
  status: ApplicationStatus;
  submittedAt: string;
  reviewedAt?: string;
  reviewNote?: string;
  books: BookSubmission[];
}
