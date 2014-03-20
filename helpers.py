import os, math
from collections import namedtuple
from decimal import Decimal
from hashlib import sha256
import time
import re
from cStringIO import StringIO
import ConfigParser

# http://stackoverflow.com/a/7285509
_ntuple_diskusage = namedtuple('diskusage', 'total used free')
def disk_usage(path):
  """Return disk usage statistics about the given path.

  Returned valus is a named tuple with attributes 'total', 'used' and
  'free', which are the amount of total, used and free space, in bytes.
  """
  st = os.statvfs(path)
  free = st.f_bavail * st.f_frsize
  total = st.f_blocks * st.f_frsize
  used = (st.f_blocks - st.f_bfree) * st.f_frsize
  return _ntuple_diskusage(total, used, free)

# http://stackoverflow.com/a/2510459
_storage_units = ['B', 'KB', 'MB', 'GB', 'TB']
def format_bytes(bites, precision=2):
  bites = max(bites, 0)
  power = math.floor((bites if bites == 0 else math.log(bites)) / math.log(1024))
  power = min(power, len(_storage_units) - 1)
  bites /= math.pow(1024, power)
  return (('%.' + str(precision) + 'f') % bites).rstrip('0.') + ' ' + _storage_units[int(power)]

def read_config(path='~/.bitcoinfe.conf', defaults={}, required=[]):
  parser = ConfigParser.RawConfigParser(defaults)
  config_buf = StringIO()
  # We have to do some trickiness and write a bogus [DEFAULT] section header
  # to our buffer since Python's ConfigParser expects section headers.
  config_buf.write('[DEFAULT]\n')
  with open(os.path.expanduser(path)) as config_file:
    config_buf.write(config_file.read())
  config_buf.seek(0)
  parser.readfp(config_buf)
  items = parser.items('DEFAULT')
  missing_keys = list(set(required) - set(i[0] for i in items))
  if len(missing_keys) > 0:
    raise RuntimeException, 'Missing the following required config options: %s' % ', '.join(missing_keys)
  return dict(items)

INTERVAL_RE = re.compile('(\d+[msdh])')

def parse_interval(i):
  """Parses a time duration like '1d8h' (1 day, 8 hours), and converts it to seconds."""
  parts = INTERVAL_RE.findall(i)
  if len(parts) > 0:
    total = 0
    for p in parts:
      n = int(''.join(c for c in p if c.isdigit()))
      if p.endswith('d'):
        total += n * 86400L
      elif p.endswith('h'):
        total += n * 3600L
      elif p.endswith('m'):
        total += n * 60L
      elif p.endswith('s'):
        total += long(n)
    return total
  else:
    return TypeError, 'Invalid interval'

def time_seconds():
  return int(time.time())

_btc_prefix_pattern = re.compile(r'^bitcoin:')
def remove_bitcoin_prefix(s):
  return _btc_prefix_pattern.sub('', s)

# Bitcoin validation: http://rosettacode.org/wiki/Bitcoin/address_validation#Python
_digits58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

def number_to_bytes(n, length):
  return bytearray([(n >> i * 8) & 0xff for i in reversed(range(length))])
 
def decode_base58(bc, length):
    n = 0
    for char in bc:
        n = n * 58 + _digits58.index(char)
    return number_to_bytes(n, length)
 
def check_bitcoin_address(bc):
    bcbytes = decode_base58(bc, 25)
    return bcbytes[-4:] == sha256(sha256(bcbytes[:-4]).digest()).digest()[:4]

def cleanup_json(json_in):
  if isinstance(json_in, dict):
    json_out = dict()
    for (key, val) in json_in.iteritems():
      json_out[key] = cleanup_json(val)
    return json_out
  elif isinstance(json_in, list):
    return map(cleanup_json, json_in)
  elif isinstance(json_in, Decimal):
    # flask.jsonify chokes on instances of Decimal.
    return float(json_in)
  else:
    return json_in

