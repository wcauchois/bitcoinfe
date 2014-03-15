import os, math
from collections import namedtuple
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

def read_config(path='~/.bitcoinfe.conf', default={}, required=[]):
  parser = ConfigParser.RawConfigParser(DEFAULT_CONFIGS)
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

