import sqlite3
import os

db_path = os.path.expanduser('~/Library/Application Support/com.skillhub.desktop/skillhub.sqlite')
conn = sqlite3.connect(db_path)
c = conn.cursor()
c.execute("SELECT id, path, source_type FROM source_directories")
print("Dirs:", c.fetchall())
