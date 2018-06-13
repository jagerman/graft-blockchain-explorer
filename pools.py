#!/usr/bin/python3

import psycopg2, psycopg2.extras
import json
import cgi

PG_CONNECT = { 'dbname': 'jgr' }

_pgsql = None

def pgsql():
    global _pgsql
    if _pgsql is not None:
        try:
            _pgsql.cursor().execute("SELECT 1")
            return _pgsql
        except Exception as e:
            pass

    _pgsql = psycopg2.connect(**PG_CONNECT, cursor_factory=psycopg2.extras.DictCursor)
    return _pgsql


def application(env, start_response):
    if env['PATH_INFO'] == '/stats':
        return pool_stats(env, start_response)
    elif env['PATH_INFO'] == '/find':
        return find_pool(env, start_response)

    start_response('404 Not Found', [('Content-Type', 'text/plain')])
    return [b'Not Found']


def pool_stats(env, start_response):
    pg = pgsql()
    cur = pg.cursor()

    cur.execute("SELECT * FROM pool_fetches ORDER BY time DESC LIMIT 1")

    data = dict(cur.fetchone())
    data['time'] = data['time'].timestamp()

    cur.execute("""
        SELECT id, name, url, blocks_url, location, height, blocks_found, hashrate, effort, miners, miners_paid, payments, fee, threshold, error,
               hashrate_1d AS hr1, hashrate_7d AS hr7
        FROM pools JOIN pool_stats ON pool = id JOIN pool_agg_stats ON pool_stats.pool = pool_agg_stats.pool
        WHERE pool_fetch = %s AND enabled
    """, (data['id'],))

    data['hashrate_synced'] = 0
    data['hashrate_desynced'] = 0

    data['pools'] = []
    pool_index = {}
    for pool in cur:

        p = dict(pool)
        pool_id = p['id']
        del p['id']
        pool_index[pool_id] = len(data['pools'])

        # Look for out-of-sync pools; this can happen in two ways: a pool could have desynched (or
        # not forked) and stalled, with height too low, or it could have desynched and run away,
        # with height too high.  On the other hand, it's normal to see pools 1-2 blocks out of sync
        # (i.e. the API scraping could occur around the same time a block is discovered), so we
        # allow up to ±3 from the local node.

        if 'height' in p and p['height'] is not None:
            p['desync'] = abs(data['height'] - p['height']) > 3

        # Some pools (e.g. MoneroOcean) don't expose node height, so just always assume they are synced.
        elif p['error'] is None:
            p['desync'] = False

        else:
            p['desync'] = True


        if p['hashrate'] is not None:
            data['hashrate_desynced' if p['desync'] else 'hashrate_synced'] += p['hashrate']

        data['pools'].append(p)

    cur.execute("SELECT pool, hashrate, hour FROM pool_hashrate_chart ORDER BY hour")
    data['hr_chart'] = []
    last_hour = None
    for row in cur:
        pool_id, hr, hour = row[0:3]
        if pool_id not in pool_index:
            continue
        if hour != last_hour:
            data['hr_chart'].append({'hour': hour.timestamp(), 'kh': [None] * len(data['pools']) })
            last_hour = hour
        chart = data['hr_chart'][-1]
        kh = None
        if hr is not None:
            kh = hr / 1000.
            kh = round(kh, 0 if kh >= 100 else 1 if kh >= 10 else 2 if kh >= 1 else 3)
        chart['kh'][pool_index[pool_id]] = kh

    del cur
    pg.commit()

    start_response('200 OK', [('Content-Type', 'application/json')])
    return [json.dumps(data).encode('utf-8')]

def find_pool(env, start_response):
    if env['REQUEST_METHOD'] == 'POST':
        size = int(env['CONTENT_LENGTH'])
        if size > 0:
            q = cgi.parse_qs(env['wsgi.input'].read(size).decode('utf-8'))
        else:
            q = {}
    else:
        q = cgi.parse_qs(env['QUERY_STRING'])

    blocks = {}
    find = q['block'] if 'block' in q else q['block[]'] if 'block[]' in q else None
    if find:
        pg = pgsql()
        cur = pg.cursor()
        cur.execute("SELECT name, blocks_url, height, hash FROM pool_blocks JOIN pools ON pool = id WHERE hash IN %s",
                (tuple(find),))
        for row in cur:
            blocks[row['hash']] = { 'pool': row['name'], 'height': row['height'], 'blocks_url': row['blocks_url'] }
        for h in find:
            if h not in blocks:
                blocks[h] = None
        del cur
        pg.commit()

    start_response('200 OK', [('Content-Type', 'application/json')])
    return [json.dumps(blocks).encode('utf-8')]
