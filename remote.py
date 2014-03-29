"""Helper service to run on the box that's actually running Bitcoin."""
import BaseHTTPServer
import argparse
from helpers import format_bytes, disk_usage
import json
from urlparse import urlparse
import logging
import os

class RequestHandler(BaseHTTPServer.BaseHTTPRequestHandler):
  def do_GET(self):
    parsed = urlparse(self.path)
    if parsed.path == '/storage_info':
      self.send_storage_info()
    else:
      self.send_404()

  def send_storage_info(self):
    usage = disk_usage(args.datadir)
    self.send_JSON({
      'total': usage.total,
      'free': usage.free,
      'used': usage.used,
      'formattedTotal': format_bytes(usage.total),
      'formattedFree': format_bytes(usage.free),
      'formattedUsed': format_bytes(usage.used),
    })

  def send_JSON(self, obj):
    self.send_response(200)
    self.send_header('Content-Type', 'application/json')
    self.end_headers()
    json.dump(obj, self.wfile, indent=2)
    self.wfile.write('\n')

  def send_404(self):
    self.send_response(404)
    self.send_header('Content-Type', 'text/plain')
    self.end_headers()
    self.wfile.write('Not Found\n')

if __name__ == '__main__':
  logging.basicConfig()

  parser = argparse.ArgumentParser(description='Remote service for Bitcoinfe')
  parser.add_argument('--datadir', help='Path to your Bitcoin data directory',
    default=os.path.expanduser('~/.bitcoin'))
  parser.add_argument('--port', help='Port to run the server on', default=3270)
  args = parser.parse_args()

  httpd = BaseHTTPServer.HTTPServer(('0.0.0.0', args.port), RequestHandler)
  print 'Listening on port %d' % args.port
  httpd.serve_forever()

