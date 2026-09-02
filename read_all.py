import sqlite3
import os

db_path = os.path.expanduser('~/Library/Application Support/com.skillhub.desktop/skillhub.sqlite')
conn = sqlite3.connect(db_path)
c = conn.cursor()
c.execute("SELECT name, local_path, source_type, online_url FROM skills")
res = c.fetchall()
for r in res:
    if 'creator' in r[0].lower() or 'ppt' in r[0].lower():
        print(r)
