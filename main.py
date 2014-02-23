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

def cleanup_json(json_in):
  json_out = dict()
  for (key, val) in json_in.iteritems():
    if isinstance(val, Decimal):
      # flask.jsonify chokes on Decimal instances.
      val = float(val)
    elif isinstance(val, dict):
      val = cleanup_json(val)
    json_out[key] = val
  return json_out

@app.route('/')
def index():
  return render_template('index.html')

@cache.cached(timeout=3)
def get_bitcoin_info():
  return cleanup_json(btc_client.getinfo())

@app.route('/get_balance')
def api_get_balance():
  info = get_bitcoin_info()
  return flask.jsonify({'balance': info['balance']})

@app.route('/get_exchange_rate')
def api_get_exchange_rate():
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

def build_service_url(config):
  return 'http://%s:%s@%s:%s' % (
    config['rpcuser'],
    config['rpcpassword'],
    config['rpcconnect'],
    config['rpcport']
  )

@app.before_first_request
def initialize():
  global config, btc_client
  config = read_config()
  btc_client = AuthServiceProxy(build_service_url(config))

if __name__ == '__main__':
  app.debug = True
  app.run(host='0.0.0.0')

