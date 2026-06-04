export type BookStatus = 'draft' | 'published';

export interface Book {
  id: string;
  title: string;
  author: string;
  description: string;
  price: number;
  status: BookStatus;
  coverUrl?: string;
  pdfUrl?: string;
  createdAt: string;
}
