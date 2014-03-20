import os, sys
from bitcoinrpc.authproxy import AuthServiceProxy
from decimal import Decimal
from flask import Flask, render_template, request, g
from flask.ext.cache import Cache
from datetime import datetime
import flask
import json
import requests
import yaml
import time
import logging
import sqlite3
from helpers import *
from hashlib import sha256
import re
from json_service import JsonService

app = Flask(__name__)
cache = Cache(app, config={'CACHE_TYPE': 'simple'})

DEFAULT_CONFIGS = {
  'rpcuser': 'bitcoinrpc',
  'rpcport': '8322',
  'rpcconnect': '127.0.0.1'
}
REQUIRED_CONFIGS = ['rpcuser', 'rpcport', 'rpcconnect', 'rpcpassword']

@app.template_filter('format_number')
def format_number(value):
  return "{:,d}".format(value)

def time_seconds():
  return int(time.time())

btc_prefix_pattern = re.compile(r'^bitcoin:')
def remove_bitcoin_prefix(s):
  return btc_prefix_pattern.sub('', s)

@app.route('/')
def index():
  templates = yaml.load(open('client/templates.yaml', 'r'))['templates']
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
  return BtcClient.instance().getinfo()

@app.route('/get_balance')
def API_get_balance():
  info = get_bitcoin_info()
  return flask.jsonify({'balance': info['balance']})

@app.route('/new_address')
def API_new_address():
  address = BtcClient.instance().getnewaddress()
  return flask.jsonify({'address': address})

@app.route('/list_transactions')
@cache.cached(timeout=5)
def API_list_transactions():
  tx_list = BtcClient.instance().listtransactions()
  tx_list.reverse() # Most recent TX at the top.
  return flask.jsonify({'transactions': tx_list})

@app.route('/list_addresses')
@cache.cached(timeout=5)
def API_list_addresses():
  addr_list = BtcClient.instance().listreceivedbyaddress(0, True)
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
  BtcClient.instance().sendtoaddress(address, amount)
  return ''

@app.route('/record_stats', methods=['POST'])
def API_record_stats():
  storage_info = remote_service.get('/storage_info')
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

digits58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

# Bitcoin validation: http://rosettacode.org/wiki/Bitcoin/address_validation#Python
def number_to_bytes(n, length):
  return bytearray([(n >> i * 8) & 0xff for i in reversed(range(length))])
 
def decode_base58(bc, length):
    n = 0
    for char in bc:
        n = n * 58 + digits58.index(char)
    return number_to_bytes(n, length)
 
def check_bitcoin_address(bc):
    bcbytes = decode_base58(bc, 25)
    return bcbytes[-4:] == sha256(sha256(bcbytes[:-4]).digest()).digest()[:4]

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

  def cleanup_json(self, json_in):
    if isinstance(json_in, dict):
      json_out = dict()
      for (key, val) in json_in.iteritems():
        json_out[key] = self.cleanup_json(val)
      return json_out
    elif isinstance(json_in, list):
      return map(self.cleanup_json, json_in)
    elif isinstance(json_in, Decimal):
      # flask.jsonify chokes on instances of Decimal.
      return float(json_in)
    else:
      return json_in

  def __init__(self, config):
    super(BtcClient, self).__init__(self.build_service_url(config))

  def __getattr__(self, key):
    oldfunc = super(BtcClient, self).__getattr__(key)
    def func(*args, **kwargs):
      return self.cleanup_json(oldfunc(*args, **kwargs))
    return func

  @classmethod
  def instance(cls):
    if not hasattr(cls, '__instance'):
      cls.__instance = BtcClient(app.config)
    return cls.__instance

@app.before_first_request
def initialize():
  global remote_service
  app.config.update(read_config(defaults=DEFAULT_CONFIGS, required=REQUIRED_CONFIGS))
  BtcClient.instance() # Initiate the bitcoin client
  remote_service = JsonService('%s:%s' % (app.config['rpcconnect'], 3270))

if __name__ == '__main__':
  logging.basicConfig(level=logging.DEBUG)
  app.debug = True
  app.run(host='0.0.0.0')

