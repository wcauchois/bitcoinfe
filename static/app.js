
var templates = {};

$("script[type='text/template']").each(function(i, elem) {
  var $elem = $(elem);
  var templateContent = $elem.text();
  templates[$elem.data('name')] = function(opts) {
    return Mustache.render(templateContent, opts || {});
  };
});

$.when(
  $.getJSON('/get_balance'),
  $.getJSON('/get_exchange_rate')
).done(function(res1, res2) {
  var balance = res1[0].balance;
  var rate = res2[0].rate;
  var convertedBalance = balance * rate;
  $('.balanceContainer').html(templates.bitcoinBalance({
    bitcoins: balance,
    dollars: +convertedBalance.toFixed(6), // Round to 6 decimals
    exchangeRate: rate
  }));
});

var formatDate = (function(monthNames) {
  // Jan 21, 2014 [10:11 PM]
  return function(date) {
    var hours = date.getHours();
    var clampedHours = (hours > 12) ? (hours - 12) : hours;
    var clockPeriod = (hours >= 12) ? 'PM' : 'AM';
    return monthNames[date.getMonth()] + ' ' +
      date.getDate().toString() + ', ' +
      date.getFullYear().toString() + ' [' +
      clampedHours + ':' + date.getMinutes() +
      ' ' + clockPeriod + ']';
  };
})(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec']);

var humanReadableCategories = {
  'send': 'Sent bitcoin',
  'receive': 'Received bitcoin'
};

function augmentTxRecord(rec) {
  return _.extend({
    'timestring': rec['time'] && formatDate(new Date(rec['time'] * 1000.0)),
    'description': (humanReadableCategories[rec['category']] || rec['category']),
    'issend': rec['category'] === 'send',
    'isreceive': rec['category'] === 'receive',
    'amtpos': rec['amount'] >= 0.0
  }, rec);
}

function augmentAddressRecord(rec) {
  return _.extend({
    'txlist': rec['txids'] && rec['txids'].map(function(x) { return {'id': x}; })
  }, rec);
}

$.getJSON('/list_transactions', function(data) {
  $('.transactionListContainer').html(templates.transactionList({
    transactions: data.transactions.map(augmentTxRecord)
  }));
});

$.getJSON('/list_addresses', function(data) {
  $('.addressListContainer').html(templates.addressList({
    addresses: data.addresses.map(augmentAddressRecord)
  }));
});

