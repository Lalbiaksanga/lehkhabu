import { useNavigate } from 'react-router-dom';
import type { DisplayBook } from '../../types';
import BookCover from './BookCover';

interface BookCardProps {
  book: DisplayBook;
  showRating?: boolean;
  large?: boolean;
}

export default function BookCard({ book, showRating = true, large = false }: BookCardProps) {
  const navigate = useNavigate();
  // Support both rating fields
  const rating = book.average_rating ?? book.rating ?? 0;
  const authorText = book.author_name ?? book.author ?? '';

  return (
    <div
      className={`book-card ${large ? 'book-card-lg' : ''}`}
      onClick={() => navigate(`/book/${book.id}`)}
      role="button"
      tabIndex={0}
      aria-label={`View ${book.title}`}
      onKeyDown={(e) => e.key === 'Enter' && navigate(`/book/${book.id}`)}
    >
      <div className={`book-card-cover-wrap ${large ? 'book-card-cover-wrap-lg' : ''}`}>
        <BookCover book={book} className={`book-card-cover ${large ? 'book-card-cover-lg' : ''}`} />
      </div>
      <div className="book-card-title">{book.title}</div>
      {authorText && <div className="book-card-author">{authorText}</div>}
      {showRating && rating > 0 && (
        <div className="book-card-rating">
          <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          {rating.toFixed(1)}
        </div>
      )}
    </div>
  );
}
