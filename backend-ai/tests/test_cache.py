"""Unit tests for cache key generation."""
from app.generation.cache import _make_cache_key


def test_cache_key_is_deterministic():
    k1 = _make_cache_key("qa", "book-1", "What is Rust?")
    k2 = _make_cache_key("qa", "book-1", "What is Rust?")
    assert k1 == k2


def test_cache_key_normalizes_case_and_whitespace():
    k1 = _make_cache_key("qa", "book-1", "  What is Rust?  ")
    k2 = _make_cache_key("qa", "book-1", "what is rust?")
    assert k1 == k2


def test_cache_key_differs_by_book_and_prefix():
    base = _make_cache_key("qa", "book-1", "hello")
    assert base != _make_cache_key("qa", "book-2", "hello")
    assert base != _make_cache_key("summary", "book-1", "hello")
