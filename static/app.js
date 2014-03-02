
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
  var complete = rec['confirmations'] && rec['confirmations'] > 6;
  return _.extend({
    'timestring': rec['time'] && formatDate(new Date(rec['time'] * 1000.0)),
    'description': (humanReadableCategories[rec['category']] || rec['category']),
    'issend': rec['category'] === 'send',
    'isreceive': rec['category'] === 'receive',
    'amtpos': rec['amount'] >= 0.0,
    'statuscode': complete ? 'complete' : 'pending',
    'status': complete ? 'Complete' : 'Pending'
  }, rec);
}

function augmentAddressRecord(rec) {
  var elidedAddress = rec['address'] && (rec['address'].substring(0, 20) + '...');
  return _.extend({
    'txlist': rec['txids'] && rec['txids'].map(function(x) { return {'id': x}; }),
    'elidedAddress': elidedAddress
  }, rec);
}

$.getJSON('/list_transactions', function(data) {
  $('.transactionListContainer').html(templates.transactionList({
    transactions: data.transactions.map(augmentTxRecord)
  }));
});

function getQRCodeURI(width, height, data) {
  // http://goqr.me/api/
  return 'https://api.qrserver.com/v1/create-qr-code/?size=' +
    width + 'x' + height + '&data=' + encodeURIComponent(data);
}

$.getJSON('/list_addresses', function(data) {
  var $addressList = $(templates.addressList({
    addresses: data.addresses.map(augmentAddressRecord)
  }));
  $addressList.find('.transactionLink').hover(function(e) {
    $('.transaction[data-txid=' + $(e.target).text() + ']').addClass('simHover');
  }, function(e) {
    $('.transaction[data-txid=' + $(e.target).text() + ']').removeClass('simHover');
  });
  $('.addressListContainer').append($addressList);

  $('.addressLink').click(function(e) {
    var bitcoinAddress = $(e.target).data('address');
    var $addressModal = $(templates.addressModal({
      qrcodeUri: getQRCodeURI(200, 200, 'bitcoin:' + bitcoinAddress),
      address: bitcoinAddress
    }));
    $addressModal.modal();
  });
});

/*
var $sendBitcoinForm = $('#sendBitcoinForm');

function revertSendBitcoinSubmit() {
  var $newSubmit = $(templates.confirmSendButton());
  $sendBitcoinForm.find('.submitContainer').empty().append($newSubmit);
}
revertSendBitcoinSubmit();
*/

