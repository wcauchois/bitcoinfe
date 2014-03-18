"""Helper service to run on the box that's actually running Bitcoin.

Note that the only third-party requirement for this script is Flask."""
import flask
from helpers import *
from flask import Flask

app = Flask(__name__)

@app.route('/storage_info')
def API_storage_info():
  usage = disk_usage(app.config['datadir'])
  return flask.jsonify({
    'total': usage.total,
    'free': usage.free,
    'used': usage.used,
    'formattedTotal': format_bytes(usage.total),
    'formattedFree': format_bytes(usage.free),
    'formattedUsed': format_bytes(usage.used),
  })

@app.before_first_request
def initialize():
  app.config.update(read_config(defaults={'datadir': '/'}))

if __name__ == '__main__':
  app.debug = True
  app.run(host='0.0.0.0', port=3270)

