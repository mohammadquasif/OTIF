import re
from typing import Tuple, Dict, List

# Regular expression patterns for common academic citation and reference formats
CITATION_PATTERNS = [
    # DOIs: e.g. 10.1016/j.jbi.2023.104402 or https://doi.org/10.1016/...
    r'(?:https?://(?:dx\.)?doi\.org/)?10\.\d{4,9}/[-._;()/:A-Za-z0-9]+',
    # APA / Harvard parenthetical citations: e.g. (Smith et al., 2023; Johnson & Lee, 2021)
    r'\([A-Z][A-Za-z\s\-,&.]+(?:et al\.)?,\s*\d{4}[a-z]?(?:\s*;\s*[A-Z][A-Za-z\s\-,&.]+(?:et al\.)?,\s*\d{4}[a-z]?)*\)',
    # IEEE / Numerical bracket citations: e.g. [1], [1, 2], [3-5]
    r'\[\s*\d+(?:\s*[,–-]\s*\d+)*\s*\]',
    # Explicit URL citations
    r'https?://[^\s()<>]+'
]

COMBINED_PATTERN = re.compile('|'.join(CITATION_PATTERNS))


def lock_citations(text: str) -> Tuple[str, Dict[str, str]]:
    """
    Extracts citations, DOIs, and reference marks into immutable placeholder tokens
    before submitting text to syntactic revision models.
    Returns:
        locked_text: text with placeholders like [[CIT_LOCK_0]]
        lock_map: dictionary mapping placeholder tokens to exact original byte strings
    """
    lock_map: Dict[str, str] = {}
    counter = 0

    def replace_match(match: re.Match) -> str:
        nonlocal counter
        original = match.group(0)
        token = f"[[CIT_LOCK_{counter}]]"
        lock_map[token] = original
        counter += 1
        return token

    locked_text = COMBINED_PATTERN.sub(replace_match, text)
    return locked_text, lock_map


def unlock_citations(revised_text: str, lock_map: Dict[str, str]) -> Tuple[str, bool, List[str]]:
    """
    Restores exact byte-identical citations from placeholder tokens.
    Verifies that no citations were omitted or corrupted during revision.
    Returns:
        restored_text: text with exact original citations restored
        all_restored: boolean flag indicating 100% successful byte restoration
        missing_tokens: list of tokens that were omitted by the revision engine
    """
    restored_text = revised_text
    missing_tokens: List[str] = []

    for token, original in lock_map.items():
        if token in restored_text:
            restored_text = restored_text.replace(token, original)
        else:
            missing_tokens.append(original)
            # If the model accidentally dropped a citation token, append it to preserve integrity
            restored_text += f" {original}"

    all_restored = len(missing_tokens) == 0
    return restored_text.strip(), all_restored, missing_tokens
