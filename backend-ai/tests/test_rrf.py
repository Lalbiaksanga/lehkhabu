"""Unit tests for Reciprocal Rank Fusion scoring."""
from app.retrieval.search import _rrf_score


def test_rrf_score_none_rank_returns_zero():
    assert _rrf_score(None) == 0.0


def test_rrf_score_rank_one():
    assert _rrf_score(1) == 1 / 61


def test_rrf_score_rank_twenty():
    assert _rrf_score(20) == 1 / 80


def test_rrf_fusion_adds_both_lists():
    """Chunk in both vector rank 1 and FTS rank 1 gets double score."""
    combined = _rrf_score(1) + _rrf_score(1)
    single = _rrf_score(1)
    assert combined == 2 * single
    assert combined > _rrf_score(20) + _rrf_score(20)
