import flask
from storageutil import *
from flask import Flask

app = Flask(__name__)

@app.route('/storage_info')
def API_storage_info():
  usage = disk_usage('/')
  return flask.jsonify({
    'total': usage.total,
    'free': usage.free,
    'used': usage.used,
    'formattedTotal': format_bytes(usage.total),
    'formattedFree': format_bytes(usage.free),
    'formattedUsed': format_bytes(usage.used),
  })

if __name__ == '__main__':
  app.run(host='0.0.0.0', port=3270)

