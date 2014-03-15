from invoke import *
import sqlite3
import os
import re
import glob

MIGRATION_NUMBER_RE = re.compile(r"_(\d+).sql")

@task
def migrate_db(db='stats'):
  conn = sqlite3.connect('%s.db' % db)
  current_version = conn.execute('pragma user_version').next()[0]
  print 'Database at version %d' % current_version
  migrations = glob.glob('./migrations/%s_*.sql' % db)
  migration_numbers = [(m, int(MIGRATION_NUMBER_RE.findall(m)[0])) for m in migrations]
  needed_migrations = [m for (m, i) in migration_numbers if i > current_version]

  if len(needed_migrations) == 0:
    print 'Nothing to do.'
    return

  c = conn.cursor()
  try:
    for m in needed_migrations:
      print 'Running migration: %s' % m
      with open(m, 'r') as migrationfile:
        c.executescript(migrationfile.read())
    new_version = max(i for (m, i) in migration_numbers)
    c.execute('pragma user_version=%s' % new_version)
    conn.commit()
  except:
    conn.rollback()
    print 'Migration failed.'
    raise
  finally:
    c.close()
  print 'Database at version %s' % new_version

@task
def nuke_db(db='stats'):
  try:
    os.unlink('%s.db' % db)
  except OSError:
    pass

db_collection = Collection()
db_collection.add_task(migrate_db, 'migrate')
db_collection.add_task(nuke_db, 'nuke')

ns = Collection()
ns.add_collection(db_collection, 'db')

