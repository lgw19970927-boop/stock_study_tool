import sqlite3
from pathlib import Path

if __name__ != "__main__":
    import pytest

    pytest.skip("Manual sqlite inspection script (not part of automated pytest suite).", allow_module_level=True)


ROOT = Path(__file__).resolve().parents[1]


def _dump_table_counts(db_path: Path, label_prefix: str = "") -> None:
    if not db_path.is_file():
        print(f"Database not found: {db_path}")
        return

    conn = sqlite3.connect(str(db_path))
    try:
        tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
        for table_name, in tables:
            count = conn.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()[0]
            print(f"{label_prefix}{table_name}: {count} rows")
    finally:
        conn.close()


if __name__ == "__main__":
    _dump_table_counts(ROOT / "reference/extracted/backend/data/market_data.db")
    _dump_table_counts(ROOT / "reference/extracted/backend/data/user_data.db", label_prefix="[user_data] ")
