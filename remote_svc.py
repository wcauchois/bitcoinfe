"""Helper service to run on the box that's actually running Bitcoin."""
import flask
import util
from flask import Flask

app = Flask(__name__)

@app.route('/storage_info')
def API_storage_info():
  usage = util.disk_usage(app.config['datadir'])
  return flask.jsonify({
    'total': usage.total,
    'free': usage.free,
    'used': usage.used,
    'formattedTotal': util.format_bytes(usage.total),
    'formattedFree': util.format_bytes(usage.free),
    'formattedUsed': util.format_bytes(usage.used),
  })

@app.before_first_request
def initialize():
  app.config.update(util.read_config(default={'datadir': '~/.bitcoin'}))

if __name__ == '__main__':
  app.run(host='0.0.0.0', port=3270)

