
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

function getQRCodeURI(width, height, data) {
  // http://goqr.me/api/
  return 'https://api.qrserver.com/v1/create-qr-code/?size=' +
    width + 'x' + height + '&data=' + encodeURIComponent(data);
}

var HomePage = Backbone.View.extend({
  initialize: function(options) {
    this.exchangeService_ = new ExchangeService({
      exchangeRate: options.exchangeRate
    });
    this.walletService_ = new WalletService();

    this.bitcoinBalanceView_ = new BitcoinBalanceView({
      el: this.$el.find('.balanceContainer'),
      walletService: this.walletService_,
      exchangeService: this.exchangeService_
    });
    this.transactionListView_ = new TransactionListView({
      el: this.$el.find('.transactionListContainer')
    });
    this.addressListView_ = new AddressListView({
      el: this.$el.find('.addressListContainer')
    });
  }
}, {
  init: function(options) {
    window.currentPage = new HomePage(_.extend({
      el: $('body')
    }, options));
  }
});


var ExchangeService = function() {
  this.initialize.apply(this, arguments);
};

_.extend(ExchangeService.prototype, {
  initialize: function(options) {
    this.rate_ = options.exchangeRate;
    this.inverseRate_ = (1.0 / options.exchangeRate);
  },

  getRate: function() {
    return this.rate_;
  },

  dollarsToBtc: function(dollars) {
    return dollars * this.inverseRate_;
  },

  btcToDollars: function(btc) {
    return btc * this.rate_;
  }
});

var WalletService = function() {
  this.initialize.apply(this, arguments);
};

_.extend(WalletService.prototype, {
  initialize: function() {
    this.balancePromise_ = $.getJSON('/get_balance');
    this.balancePromise_.done(_.bind(function(data) {
      this.balance_ = data.balance;
    }, this));
  },

  getBalance: function() {
    return this.balance_;
  },

  getBalancePromise: function() {
    return this.balancePromise_;
  }
});

var BitcoinBalanceView = Backbone.View.extend({
  initialize: function(options) {
    this.exchangeService_ = options.exchangeService;
    this.walletService_ = options.walletService;
    this.walletService_.getBalancePromise().done(_.bind(this.render, this));
  },

  render: function() {
    var balance = this.walletService_.getBalance()
    this.$el.empty().append(templates.bitcoinBalance({
      bitcoins: balance,
      dollars: +this.exchangeService_.btcToDollars(balance).toFixed(6),
      exchangeRate: this.exchangeService_.getRate()
    }));
    return this;
  }
});

var TransactionListView = Backbone.View.extend({
  initialize: function(options) {
    $.getJSON('/list_transactions', _.bind(function(data) {
      this.transactions_ = data.transactions;
      this.render();
    }, this));
  },

  renderTransaction_: function(tx) {
    var complete = tx['confirmations'] && tx['confirmations'] > 6;
    return _.extend({
      'timestring': tx['time'] && formatDate(new Date(tx['time'] * 1000.0)),
      'description': (TransactionListView.humanReadableCategories[tx['category']] || tx['category']),
      'issend': tx['category'] === 'send',
      'isreceive': tx['category'] === 'receive',
      'amtpos': tx['amount'] >= 0.0,
      'statuscode': complete ? 'complete' : 'pending',
      'status': complete ? 'Complete' : 'Pending'
    }, tx);
  },

  render: function() {
    this.$el.empty().append(templates.transactionList({
      transactions: _.map(this.transactions_, this.renderTransaction_, this)
    }));
    return this;
  }
}, {
  humanReadableCategories: {
  'send': 'Sent bitcoin',
  'receive': 'Received bitcoin'
  }
});

var AddressListView = Backbone.View.extend({
  initialize: function(options) {
    $.getJSON('/list_addresses', _.bind(function(data) {
      this.addresses_ = data.addresses;
      this.render();
    }, this));
  },

  renderAddress_: function(address) {
    var elidedAddress = address['address'] &&
      (address['address'].substring(0, 20) + '...');
    return _.extend({
      'txlist': address['txids'] &&
        _.map(address['txids'], function(x) { return {'id': x}; }),
      'elidedAddress': elidedAddress
    }, address);
  },

  decorate: function() {
    this.$el.find('.addressLink').click(function(e) {
      var bitcoinAddress = $(e.target).data('address');
      var $addressModal = $(templates.addressModal({
        qrcodeUri: getQRCodeURI(200, 200, 'bitcoin:' + bitcoinAddress),
        address: bitcoinAddress
      }));
      $addressModal.modal();
    });
  },

  render: function() {
    this.$el.empty().append(templates.addressList({
      addresses: _.map(this.addresses_, this.renderAddress_, this)
    }));
    this.decorate();
    return this;
  }
});

