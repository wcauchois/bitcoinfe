import os, math
from collections import namedtuple

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

