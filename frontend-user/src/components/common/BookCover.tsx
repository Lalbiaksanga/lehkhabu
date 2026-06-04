import type { DisplayBook } from '../../types';

interface BookCoverProps {
  book: DisplayBook;
  className?: string;
  style?: React.CSSProperties;
}

const FALLBACK_COLORS = ['#C17817', '#8B4513'];

export default function BookCover({ book, className = '', style }: BookCoverProps) {
  const coverImg = book.cover_image_url ?? book.coverImage ?? null;
  const primary = book.cover_color_primary ?? book.coverColors?.[0] ?? FALLBACK_COLORS[0];
  const secondary = book.cover_color_secondary ?? book.coverColors?.[1] ?? FALLBACK_COLORS[1];
  const textColor = book.coverTextColor ?? '#fff';
  const authorText = book.author_name ?? book.author ?? '';

  if (coverImg) {
    return (
      <div
        className={className}
        style={{
          ...style,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <img
          src={coverImg}
          alt={book.title}
          loading="lazy"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{
        ...style,
        background: `linear-gradient(135deg, ${primary}, ${secondary})`,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div className="book-cover-gradient" style={{ color: textColor }}>
        <span className="book-cover-title">{book.title}</span>
        {authorText && <span className="book-cover-author">{authorText}</span>}
      </div>
    </div>
  );
}
