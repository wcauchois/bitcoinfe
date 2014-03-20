import requests
import logging
import json

class CircuitBreakerException(Exception):
  pass

class CircuitBreaker(object):
  BACKOFF_TIME = 60 # Wait 1 minute before trying again

  def __init__(self):
    self.down = False
    self.down_timestamp = None

  def _get(self):
    raise NotImplementedError

  def _default(self):
    return None

  def get(self, *args, **kwargs):
    if not self.down or (time_seconds() - self.down_timestamp) > self.BACKOFF_TIME:
      try:
        result = self._get(*args, **kwargs)
        self.down = False
        return result
      except CircuitBreakerException:
        self.down = True
        self.down_timestamp = time_seconds()
        return self._default(*args, **kwargs)
    else:
      # We are down and we haven't waited long enough.
      return self._default(*args, **kwargs)

class JsonService(CircuitBreaker):
  REQUEST_TIMEOUT = 0.2

  def __init__(self, host):
    super(JsonService, self).__init__()
    self.basepath = 'http://%s' % host

  def _get(self, path):
    try:
      r = requests.get(self.basepath + path, timeout=self.REQUEST_TIMEOUT)
    except requests.exceptions.RequestException:
      raise CircuitBreakerException
    result_json = r.json()
    logging.debug('Returned JSON: %s' % json.dumps(result_json))
    return result_json

  def _default(self, *args):
    return {}

