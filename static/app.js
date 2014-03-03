
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

// http://goqr.me/api/
function getQRCodeURI(width, height, data) {
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

    this.$el.find('#sendBitcoinButton').click(_.bind(function() {
      this.openSendDialog_();
    }, this));

    if (options.sendAddress) {
      this.openSendDialog_(options.sendAddress);
    }

    // Remove query parameters from the URL
    window.history.replaceState({}, 'state',
      window.location.href.replace(/\?.*/, ''));
  },

  openSendDialog_: function(address) {
    new SendBitcoinModal({
      walletService: this.walletService_,
      exchangeService: this.exchangeService_,
      sendAddress: address
    }).render().on('send-success', _.bind(function(data) {
      $('.alerts').append($(templates.sendBitcoinSuccess(
        _.pick(data, 'address', 'amount')
      )).alert());
    }, this)).on('send-failure', _.bind(function() {
      $('.alerts').append($(templates.sendBitcoinFailure()).alert());
    }, this));
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

var SendBitcoinModal = Backbone.View.extend({
  initialize: function(options) {
    this.walletService_ = options.walletService;
    this.exchangeService_ = options.exchangeService;
    this.prefillAddress_ = options.sendAddress;
    this.validating_ = false;
  },

  decorate: function() {
    this.$btcAmount_ = this.$el.find('#btcAmount');
    this.$dollarAmount_ = this.$el.find('#dollarAmount');
    this.$bitcoinAddress_ = this.$el.find('#sendToAddress');
    this.$sendButton_ = this.$el.find('#sendButton');

    this.$el.find('.amountContainer .currencyDesignator').click(function(e) {
      var $target = $(e.target);
      $target.siblings('input').focus().select();
    });
    var oppositeInput = {
      'btc': this.$dollarAmount_,
      'usd': this.$btcAmount_
    };
    $([
      this.$btcAmount_.get(0),
      this.$dollarAmount_.get(0)
    ]).keyup(_.bind(function(e) {
      var $target = $(e.target), currencyType = $target.data('currencytype');
      // Update the input field for the other currency.
      var amount = parseFloat($target.val()), converted;
      if (amount === NaN) return;
      switch (currencyType) {
      case 'usd':
        converted = this.exchangeService_.dollarsToBtc(amount);
        break;
      case 'btc':
        converted = this.exchangeService_.btcToDollars(amount);
        break;
      }
      oppositeInput[currencyType].val(+converted.toFixed(4));
    }, this));

    this.$el.find('input').focus(function(e) {
      var $formGroup = $($(e.target).parents('.form-group').get(0));
      $formGroup.find('.validation.failure').hide();
    }).blur(_.bind(this.validate, this));

    this.on('validation-failure', _.bind(function() {
      this.$sendButton_.prop('disabled', true);
    }, this));
    this.on('validation-success', _.bind(function() {
      this.$sendButton_.prop('disabled', false);
      this.$el.find('.validation.failure').hide();
    }, this));

    this.$sendButton_.click(_.bind(this.trySend_, this));

    if (this.prefillAddress_) {
      this.$bitcoinAddress_.val(this.prefillAddress_);
      this.validate();
    }

    return this;
  },

  trySend_: function() {
    this.$sendButton_.prop('disabled', true); // Disable the button while we submit.
    this.once('validation-success', _.bind(function() {
      var data = {
        address: this.$bitcoinAddress_.val(),
        amount: this.$btcAmount_.val()
      };
      $.post('/send_bitcoin', data, _.bind(function() {
        this.$el.modal('hide');
        this.trigger('send-success', data);
      }, this)).fail(_.bind(function() {
        this.$el.modal('hide');
        this.trigger('send-failure', data);
      }, this));
    }, this));
    this.validate();
  },

  getBitcoinAddress: function() {
    return this.$bitcoinAddress_.val();
  },

  getBitcoinAmount: function() {
    if (this.$btcAmount_.val().trim().length === 0) {
      return 0.0;
    } else {
      return parseFloat(this.$btcAmount_.val());
    }
  },

  maybeFinish_: function(result, failureEl) {
    if (!this.validating_) return;
    this.failed_ = this.failed_ || !result;
    failureEl.toggle(!result);
    this.completed_++;
    if (this.completed_ === 2) {
      if (this.failed_) {
        this.trigger('validation-failure');
      } else {
        this.trigger('validation-success');
      }
      _.delay(_.bind(function() { this.validating_ = false; }, this), 50);
    }
  },

  validate: function() {
    if (this.validating_) return;
    this.validating_ = true;
    this.failed_ = false;
    this.completed_ = 0;

    this.maybeFinish_(
      this.getBitcoinAmount() <= this.walletService_.getBalance(),
      this.$el.find('.notEnoughFunds'));

    $.getJSON('/validate_bitcoin_address', {
      address: this.getBitcoinAddress()
    }, _.bind(function(data) {
      this.maybeFinish_(data.result, this.$el.find('.invalidAddress'));
    }, this));
  },

  render: function() {
    this.setElement($(templates.sendBitcoin()));
    this.$el.modal();
    // Remove from DOM when the modal is closed
    this.$el.on('hidden.bs.modal', _.bind(this.remove, this));
    return this.decorate();
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
    return this;
  },

  render: function() {
    this.$el.empty().append(templates.addressList({
      addresses: _.map(this.addresses_, this.renderAddress_, this)
    }));
    return this.decorate();
  }
});

