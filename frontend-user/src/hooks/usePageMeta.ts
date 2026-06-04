import { useEffect } from 'react';

interface PageMetaOptions {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: 'website' | 'article' | 'book';
  /** JSON-LD structured data objects to inject */
  structuredData?: object | object[];
}

const DEFAULT_TITLE = 'Lehkhabu — Read, Discover, Collect';
const DEFAULT_DESC = 'Your AI-powered book marketplace. Discover, read, and collect your favourite books.';
const SITE_NAME = 'Lehkhabu';
const DEFAULT_IMAGE = 'https://lehkhabu.com/icons/icon-512.png';
const BASE_URL = 'https://lehkhabu.com';

function setMeta(name: string, content: string, attr: 'name' | 'property' = 'name') {
  let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setLink(rel: string, href: string) {
  let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

function injectStructuredData(data: object | object[], id: string) {
  const existing = document.getElementById(id);
  if (existing) existing.remove();

  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.id = id;
  script.textContent = JSON.stringify(Array.isArray(data) ? data : data);
  document.head.appendChild(script);
}

/**
 * Hook to dynamically update page meta tags for SEO and social sharing.
 * Call this at the top of any page component.
 */
export function usePageMeta(options: PageMetaOptions = {}) {
  useEffect(() => {
    const {
      title = DEFAULT_TITLE,
      description = DEFAULT_DESC,
      image = DEFAULT_IMAGE,
      url = BASE_URL + window.location.pathname,
      type = 'website',
      structuredData,
    } = options;

    // Title
    document.title = title.includes(SITE_NAME) ? title : `${title} — ${SITE_NAME}`;

    // Basic meta
    setMeta('description', description);

    // Canonical
    setLink('canonical', url);

    // Open Graph
    setMeta('og:title', document.title, 'property');
    setMeta('og:description', description, 'property');
    setMeta('og:image', image, 'property');
    setMeta('og:url', url, 'property');
    setMeta('og:type', type, 'property');
    setMeta('og:site_name', SITE_NAME, 'property');

    // Twitter
    setMeta('twitter:title', document.title);
    setMeta('twitter:description', description);
    setMeta('twitter:image', image);
    setMeta('twitter:card', 'summary_large_image');

    // Structured data
    if (structuredData) {
      injectStructuredData(structuredData, 'page-structured-data');
    }

    // Cleanup: restore defaults on unmount
    return () => {
      document.title = DEFAULT_TITLE;
      setMeta('description', DEFAULT_DESC);
      setMeta('og:title', DEFAULT_TITLE, 'property');
      setMeta('og:description', DEFAULT_DESC, 'property');
      setMeta('og:type', 'website', 'property');
      setMeta('og:url', BASE_URL, 'property');
      setLink('canonical', BASE_URL);
      const sd = document.getElementById('page-structured-data');
      if (sd) sd.remove();
    };
  // We intentionally run only when key values change, not on every render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    options.title,
    options.description,
    options.image,
    options.url,
    options.type,
  ]);
}
