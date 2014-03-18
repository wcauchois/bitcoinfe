
google.load('visualization', '1.0', {'packages': ['corechart']});

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
    this.bitcoinInfo_ = options.bitcoinInfo;

    this.bitcoinBalanceView_ = new BitcoinBalanceView({
      el: this.$el.find('.balanceContainer'),
      currentBalance: this.bitcoinInfo_.balance,
      exchangeService: this.exchangeService_
    }).render();
    this.transactionListView_ = new TransactionListView({
      el: this.$el.find('.transactionListContainer')
    });
    this.addressSectionView = new AddressSectionView({
      el: this.$el.find('.addressSection')
    });

    this.$el.find('#sendBitcoinButton').click(_.bind(function() {
      this.openSendDialog_();
    }, this));

    this.$el.find('#bitcoinBlocksLink').click(function() {
      new ChartDialog().open();
    });

    if (options.sendAddress) {
      this.openSendDialog_(options.sendAddress);
    }

    // Remove query parameters from the URL
    window.history.replaceState({}, 'state',
      window.location.href.replace(/\?.*/, ''));

    if (navigator.registerProtocolHandler) {
      navigator.registerProtocolHandler('bitcoin',
        'http://' + window.location.host + '/?sendaddress=%s', 'Bitcoin Wallet');
    }

    $.getJSON('/storage_info', _.bind(function(data) {
      var $storageInfo = $(templates.storageInfo(data));
      $storageInfo.find('span').tooltip();
      this.$el.find('#storageInfo').empty().append($storageInfo);
    }, this));
  },

  openSendDialog_: function(address) {
    new SendBitcoinModal({
      currentBalance: this.bitcoinInfo_.balance,
      exchangeService: this.exchangeService_,
      sendAddress: address
    }).open().on('success', function(data) {
      this.showAlert(templates.sendBitcoinSuccess(data));
    }, this).on('failure', function() {
      this.showAlert(templates.sendBitcoinFailure());
    }, this);
  },

  showAlert: function(content) {
    $('.alerts').append($(content).alert());
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

var BitcoinBalanceView = Backbone.View.extend({
  initialize: function(options) {
    this.exchangeService_ = options.exchangeService;
    this.currentBalance_ = options.currentBalance;
  },

  render: function() {
    var balance = this.currentBalance_;
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

var DialogView = Backbone.View.extend({
  renderTemplate_: function() {
    throw new Error("Abstract method");
  },

  decorate: function() { return this; },

  // Just an alias for render()
  open: function() { return this.render(); },

  render: function() {
    this.setElement($(this.renderTemplate_()));
    this.$el.modal();
    // Remove from DOM when the modal is closed
    this.$el.on('hidden.bs.modal', _.bind(this.remove, this));
    return this.decorate();
  }
});

var ChartDialog = DialogView.extend({
  initialize: function(options) {
    ChartDialog.__super__.initialize.call(this, options);
    $.getJSON('/time_series', _.bind(this.receiveData_, this));
  },

  renderTemplate_: function() {
    return templates.chartDialog();
  },

  receiveData_: function(response) {
    var data = new google.visualization.DataTable();
    data.addColumn('datetime', 'Date');
    data.addColumn('number', 'Blockchain Size');
    data.addRows(_.map(response.data, function(point) {
      return [
        new Date(point.ts * 1000),
        point.blocks
      ];
    }));

    var chartOptions = {
      title: 'Blockchain Size',
      fontName: 'Sans-Serif',
      fontSize: 14,
      legend: {position: 'none'},
      chartArea:{left: 100, top: 50, width: 700, height: 300},
      width: 800,
      height: 400,
      hAxis: {slantedText: true}
    };

    var chart = new google.visualization.LineChart(this.$el.find('.chart').get(0));
    chart.draw(data, chartOptions);
  }
});

var SendBitcoinModal = DialogView.extend({
  initialize: function(options) {
    this.currentBalance_ = options.currentBalance;
    this.exchangeService_ = options.exchangeService;
    this.prefillAddress_ = options.sendAddress;

    this.validating_ = false;
    this.validators_ = [
      _.bind(this.validateFunds_, this),
      _.bind(this.validateAddress_, this)
    ];
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
    ]).on('keyup blur', _.bind(function(e) {
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

    this.on('validation-failure', function() {
      this.$sendButton_.prop('disabled', true);
    }, this);
    this.on('validation-success', function() {
      this.$sendButton_.prop('disabled', false);
      this.$el.find('.validation.failure').hide();
    }, this);

    this.$sendButton_.click(_.bind(this.trySend_, this));

    if (this.prefillAddress_) {
      this.$bitcoinAddress_.val(this.prefillAddress_);
      this.validate();
    }

    return this;
  },

  trySend_: function() {
    this.$sendButton_.prop('disabled', true); // Disable the button while we submit.
    this.once('validation-success', this.reallySend_, this);
    this.once('validation-failure', function() {
      this.off('validation-success', this.reallySend_);
    }, this);
    this.validate();
  },

  reallySend_: function() {
    var data = {
      address: this.$bitcoinAddress_.val(),
      amount: this.$btcAmount_.val()
    };
    $.post('/send_bitcoin', data, _.bind(function() {
      this.$el.modal('hide');
      this.trigger('success', data);
    }, this)).fail(_.bind(function() {
      this.$el.modal('hide');
      this.trigger('failure', data);
    }, this));
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

  aggregateResults_: function(result, failureMessageSelector) {
    if (!this.validating_) return;
    this.failed_ = this.failed_ || !result;
    this.$el.find(failureMessageSelector).toggle(!result);
    this.completed_++;
    if (this.completed_ === this.validators_.length) {
      this.trigger(this.failed_ ? 'validation-failure' : 'validation-success');
      _.delay(_.bind(function() { this.validating_ = false; }, this), 50);
    }
  },

  validate: function() {
    if (this.validating_) return;
    this.validating_ = true;
    this.failed_ = false;
    this.completed_ = 0;

    _.each(this.validators_, function(test) {
      test(_.bind(this.aggregateResults_, this));
    }, this);
  },

  validateFunds_: function(callback) {
    if (this.getBitcoinAmount() <= 0.0) {
      callback(false, '.zeroAmount');
    } else if (this.currentBalance_ < this.getBitcoinAmount()) {
      callback(false, '.notEnoughFunds');
    } else callback(true);
  },

  validateAddress_: function(callback) {
    $.getJSON('/validate_bitcoin_address', {
      address: this.getBitcoinAddress()
    }, _.bind(function(data) {
      callback(data.result, '.invalidAddress');
    }, this));
  },

  renderTemplate_: function() {
    return templates.sendBitcoin();
  }
});

var AddressSectionView = Backbone.View.extend({
  initialize: function(options) {
    this.addressListView_ = new AddressListView({
      el: this.$el.find('.addressListContainer')
    });
    this.$getNewAddressButton_ = this.$el.find('.getNewAddressButton');
    this.$getNewAddressButton_.click(_.bind(this.getNewAddress_, this));
  },

  getNewAddress_: function() {
    this.$getNewAddressButton_.prop('disabled', true);
    $.getJSON('/new_address', _.bind(function() {
      _.delay(_.bind(function() {
        this.$getNewAddressButton_.prop('disabled', false);
        this.addressListView_.refresh();
      }, this), 150);
    }, this));
  }
});

var AddressListView = Backbone.View.extend({
  initialize: function(options) {
    this.refresh();
  },

  refresh: function() {
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

