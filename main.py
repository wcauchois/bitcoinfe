import os, sys, os.path
from bitcoinrpc.authproxy import AuthServiceProxy
from flask import Flask, render_template, request, g
from flask.ext.cache import Cache
from datetime import datetime
import time
import flask
import json
import requests
import yaml
import logging
import sqlite3
from helpers import *
import re
from json_service import JsonService

app = Flask(__name__)
cache = Cache(app, config={'CACHE_TYPE': 'simple'})

DEFAULT_CONFIGS = {
  'rpcuser': 'bitcoinrpc',
  'rpcport': '8332',
  'rpcconnect': '127.0.0.1'
}
REQUIRED_CONFIGS = ['rpcuser', 'rpcport', 'rpcconnect', 'rpcpassword']

@app.template_filter('format_number')
def format_number(value):
  return "{:,d}".format(value)

def relpath(p):
  return os.path.join(os.path.dirname(__file__), p)

@app.route('/')
def index():
  templates = yaml.load(open(relpath('client/templates.yaml'), 'r'))['templates']
  exchange_rate = get_exchange_rate()
  bitcoin_info = get_bitcoin_info()
  send_address = request.args.get('sendaddress', False)
  if send_address is not False:
    send_address = remove_bitcoin_prefix(send_address)

  return render_template('index.html',
    templates=templates,
    exchangeRate=exchange_rate,
    sendAddress=send_address,
    bitcoinInfo=bitcoin_info)

@cache.cached(timeout=10, key_prefix='get_exchange_rate')
def get_exchange_rate():
  r = requests.get('https://api.bitcoinaverage.com/exchanges/USD')
  json = r.json()
  return json['bitstamp']['rates']['ask']

@cache.cached(timeout=3, key_prefix='get_bitcoin_info')
def get_bitcoin_info():
  return btc_client.getinfo()

@app.route('/get_balance')
def API_get_balance():
  info = get_bitcoin_info()
  return flask.jsonify({'balance': info['balance']})

@app.route('/new_address')
def API_new_address():
  address = btc_client.getnewaddress()
  return flask.jsonify({'address': address})

@app.route('/list_transactions')
@cache.cached(timeout=5)
def API_list_transactions():
  tx_list = btc_client.listtransactions()
  tx_list.reverse() # Most recent TX at the top.
  return flask.jsonify({'transactions': tx_list})

@app.route('/list_addresses')
@cache.cached(timeout=5)
def API_list_addresses():
  addr_list = btc_client.listreceivedbyaddress(0, True)
  return flask.jsonify({'addresses': addr_list})

@app.route('/get_exchange_rate')
def API_get_exchange_rate(): # XXX
  return flask.jsonify({'rate': get_exchange_rate()})

@app.route('/send_bitcoin', methods=['POST'])
def API_send_bitcoin():
  address = request.form['address']
  if not check_bitcoin_address(address):
    return 'Bad Bitcoin address', 400
  try:
    amount = float(request.form['amount'])
  except ValueError:
    return 'Amount must be a number', 400
  record = SendHistoryItem(address, amount)
  fresh = send_history_buffer.check_maybe_add(record)
  if not fresh:
    return 'Tried to double-spend', 400
  else:
    btc_client.sendtoaddress(address, amount)
    return ''

@app.route('/record_stats', methods=['POST'])
def API_record_stats():
  storage_info = remote_service.get('/storage_info', timeout=5)
  bitcoin_info = get_bitcoin_info()
  conn = sqlite3.connect('stats.db')
  c = conn.cursor()
  c.execute('insert into stats values(?,?,?,?,?)',
    (time_seconds(),
    storage_info['total'],
    storage_info['used'],
    storage_info['free'],
    bitcoin_info['blocks']))
  conn.commit()
  c.close()
  conn.close()
  return flask.jsonify({'result': 'OK'})

@app.route('/time_series')
def API_time_series():
  length = parse_interval(request.args.get('length', '60d'))
  after = time_seconds() - length
  conn = sqlite3.connect('stats.db')
  rows = conn.execute('select * from stats where ts > ?', (after,))
  data = []
  for (ts, disk_total, disk_used, disk_free, blocks) in rows:
    point = {}
    point['ts'] = ts
    point['dt'] = datetime.fromtimestamp(ts).strftime('%Y-%m-%d %H:%M')
    point['disk_total'] = disk_total
    point['disk_used'] = disk_used
    point['disk_free'] = disk_free
    point['blocks'] = blocks
    data.append(point)
  conn.close()
  return flask.jsonify({'data': data})

@app.route('/storage_info')
def API_storage_info():
  return flask.jsonify(remote_service.get('/storage_info'))

@app.route('/validate_bitcoin_address')
def API_validate_bitcoin_address():
  address = request.args.get('address', '')
  return flask.jsonify({'result': check_bitcoin_address(address)})

class BtcClient(AuthServiceProxy):
  def build_service_url(self, config):
    return 'http://%s:%s@%s:%s' % (
      config['rpcuser'],
      config['rpcpassword'],
      config['rpcconnect'],
      config['rpcport']
    )

  def __init__(self, config):
    super(BtcClient, self).__init__(self.build_service_url(config))

  def __getattr__(self, key):
    oldfunc = super(BtcClient, self).__getattr__(key)
    def func(*args, **kwargs):
      readable_args = ' '.join(map(str, args))
      logging.debug('Invoking Bitcoin RPC: %s %s' % (key, readable_args))
      return cleanup_json(oldfunc(*args, **kwargs))
    return func

class SendHistoryItem(object):
  def __init__(self, to_address, amount):
    self.to_address = to_address
    self.amount = amount
    self.timestamp = time.time()

  def equals(self, other):
    return self.to_address == other.to_address and \
      approx_equal(self.amount, other.amount)

class SendHistoryBuffer(object):
  MAX_SECONDS = 3

  def __init__(self):
    self.items = []

  def _purge_stale_items(self):
    self.items = [i for i in self.items if \
      (time.time() - i.timestamp) <= self.MAX_SECONDS]

  def check_maybe_add(self, new_item):
    self._purge_stale_items()
    if any(i.equals(new_item) for i in self.items):
      return False
    else:
      self.items.append(new_item)
      return True

@app.before_first_request
def initialize():
  global remote_service, btc_client, user_config, send_history_buffer
  user_config = read_config(defaults=DEFAULT_CONFIGS, required=REQUIRED_CONFIGS)
  btc_client = BtcClient(user_config)
  remote_service = JsonService('%s:%s' % (user_config['rpcconnect'], 3270))
  send_history_buffer = SendHistoryBuffer()

if __name__ == '__main__':
  logging.basicConfig(level=logging.DEBUG)
  app.debug = True
  app.run(host='0.0.0.0')

