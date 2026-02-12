from __future__ import annotations

DIGIT_TRANSLATION = str.maketrans(
    "۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩",
    "01234567890123456789",
)


def normalize_digits(value: str | None) -> str:
    if value is None:
        return ""
    return str(value).translate(DIGIT_TRANSLATION)
