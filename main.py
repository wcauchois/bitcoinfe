import os, sys

from bitcoinrpc.authproxy import AuthServiceProxy
from cStringIO import StringIO
import ConfigParser
from decimal import Decimal
from flask import Flask, render_template, request, g
from flask.ext.cache import Cache
import flask
import json
import requests

app = Flask(__name__)
cache = Cache(app, config={'CACHE_TYPE': 'simple'})

DEFAULT_CONFIGS = {
  'rpcuser': 'bitcoinrpc',
  'rpcport': '8322',
  'rpcconnect': '127.0.0.1'
}
REQUIRED_CONFIGS = ['rpcuser', 'rpcport', 'rpcconnect', 'rpcpassword']

@app.route('/')
def index():
  return render_template('index.html')

@cache.cached(timeout=3, key_prefix='get_bitcoin_info')
def get_bitcoin_info():
  return BtcClient.instance().getinfo()

@app.route('/get_balance')
def get_balance_json():
  info = get_bitcoin_info()
  return flask.jsonify({'balance': info['balance']})

@app.route('/list_transactions')
@cache.cached(timeout=5)
def list_transactions_json():
  tx_list = BtcClient.instance().listtransactions()
  tx_list.reverse() # Most recent TX at the top.
  return flask.jsonify({'transactions': tx_list})

@app.route('/list_addresses')
@cache.cached(timeout=5)
def list_addresses_json():
  addr_list = BtcClient.instance().listreceivedbyaddress(0, True)
  return flask.jsonify({'addresses': addr_list})

@app.route('/get_exchange_rate')
def get_exchange_rate_json():
  r = requests.get('https://api.bitcoinaverage.com/exchanges/USD')
  json = r.json()
  rate = json['bitstamp']['rates']['last']
  return flask.jsonify({'rate': rate})

def read_config():
  parser = ConfigParser.RawConfigParser(DEFAULT_CONFIGS)
  config_buf = StringIO()
  # We have to do some trickiness and write a bogus [DEFAULT] section header
  # to our buffer since Python's ConfigParser expects section headers.
  config_buf.write('[DEFAULT]\n')
  with open(os.path.expanduser('~/.bitcoinfe.conf')) as config_file:
    config_buf.write(config_file.read())
  config_buf.seek(0)
  parser.readfp(config_buf)
  items = parser.items('DEFAULT')
  missing_keys = list(set(REQUIRED_CONFIGS) - set(i[0] for i in items))
  if len(missing_keys) > 0:
    raise RuntimeException, 'Missing the following required config options: %s' % ', '.join(missing_keys)
  return dict(items)

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
  app.config.update(read_config())
  BtcClient.instance() # Initiate the bitcoin client

if __name__ == '__main__':
  app.debug = True
  app.run(host='0.0.0.0')

