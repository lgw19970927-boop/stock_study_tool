import sqlite3

db = "reference/extracted/backend/data/market_data.db"
conn = sqlite3.connect(db)
tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
for t in tables:
    name = t[0]
    count = conn.execute(f"SELECT COUNT(*) FROM {name}").fetchone()[0]
    print(f"{name}: {count} rows")
conn.close()

db2 = "reference/extracted/backend/data/user_data.db"
conn2 = sqlite3.connect(db2)
tables2 = conn2.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
for t in tables2:
    name = t[0]
    count = conn2.execute(f"SELECT COUNT(*) FROM {name}").fetchone()[0]
    print(f"[user_data] {name}: {count} rows")
conn2.close()
