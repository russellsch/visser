"""Reproduce the teaching scenarios in disposable SQLite databases."""
import sqlite3
import tempfile
from pathlib import Path

print('SQLite', sqlite3.sqlite_version)
print('Separate connections; WAL; explicit transactions; timeout=0; no shared cache.')

def setup(root, name):
    path = Path(root) / (name + '.db')
    a, b, c = [sqlite3.connect(path, isolation_level=None, timeout=0) for _ in range(3)]
    assert a.execute('PRAGMA journal_mode=WAL').fetchone()[0] == 'wal'
    a.execute('CREATE TABLE counter(value INTEGER NOT NULL)')
    a.execute('INSERT INTO counter VALUES (100)')
    return a, b, c

def read(con):
    return con.execute('SELECT value FROM counter').fetchone()[0]

def failure(con, sql, expected):
    try:
        con.execute(sql)
    except sqlite3.OperationalError as e:
        assert e.sqlite_errorname == expected, (e.sqlite_errorname, expected)
        return e.sqlite_errorname
    raise AssertionError('Expected ' + expected)

with tempfile.TemporaryDirectory(prefix='visser-sqlite-') as root:
    for order in ['AC', 'CA']:
        a,b,c = setup(root, 'snapshot-'+order)
        a.execute('BEGIN')
        assert read(a) == 100
        b.execute('BEGIN IMMEDIATE')
        b.execute('UPDATE counter SET value=80')
        b.execute('COMMIT')
        values = {name:read(a if name=='A' else c) for name in order}
        assert values == {'A':100, 'C':80}
        print('Snapshot, SELECT order '+order+': A first read=100; B commits 80; A='+str(values['A'])+'; C='+str(values['C']))
        err = failure(a, 'UPDATE counter SET value=70', 'SQLITE_BUSY_SNAPSHOT')
        print('A tries UPDATE in old transaction:', err)
        a.execute('ROLLBACK')
        a.execute('BEGIN')
        assert read(a) == 80
        print('A ends old transaction and reads in new one: 80')
        a.execute('ROLLBACK')
        for con in [a,b,c]: con.close()
    a,b,c = setup(root, 'delayed-read')
    a.execute('BEGIN')
    b.execute('UPDATE counter SET value=80')
    assert read(a) == 80
    print('Delayed first read: A BEGIN; B autocommit UPDATE=80; A first SELECT=80')
    a.execute('ROLLBACK')
    for con in [a,b,c]: con.close()
    a,b,c = setup(root, 'immediate')
    a.execute('BEGIN IMMEDIATE')
    assert read(a)==100
    err = failure(b, 'UPDATE counter SET value=80', 'SQLITE_BUSY')
    assert read(c)==100
    print('A BEGIN IMMEDIATE: B UPDATE='+err+'; C SELECT=100')
    a.execute('UPDATE counter SET value=70')
    a.execute('COMMIT')
    assert read(c)==70
    print('A commits 70: C next autocommit SELECT=70')
    for con in [a,b,c]: con.close()
print('All assertions passed. Temporary databases removed.')
