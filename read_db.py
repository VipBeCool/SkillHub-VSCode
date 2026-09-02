import sqlite3
import os

db_path = os.path.expanduser('~/Library/Application Support/com.skillhub.desktop/skillhub.sqlite')
if not os.path.exists(db_path):
    print("DB not found at", db_path)
else:
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    c.execute("SELECT name, source_type, online_url, local_path FROM skills WHERE name LIKE '%skill creator%'")
    print(c.fetchall())
