"""Shared pytest fixtures."""
import pytest
from unittest.mock import MagicMock


@pytest.fixture(autouse=True)
def mock_tiktoken(monkeypatch):
    """Avoid network download of cl100k_base.tiktoken during tests."""
    mock_enc = MagicMock()
    # ~4 chars per token for rough sizing in chunker tests
    mock_enc.encode.side_effect = lambda text: list(range(max(1, len(text) // 4)))
    monkeypatch.setattr(
        "app.ingestion.chunker.tiktoken.get_encoding",
        lambda _name: mock_enc,
    )
