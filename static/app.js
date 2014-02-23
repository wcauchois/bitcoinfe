
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

