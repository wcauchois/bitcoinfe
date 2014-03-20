Web Frontend for the Bitcoin Daemon
===

Features
---

 - Displays basic information about your Bitcoin wallet: balance, recent transactions, and Bitcoin addresses.
 - Responsive layout works well on mobile. Click on a Bitcoin address to open a QR code for that address.
 - Send Bitcoin to another address via the web interface. Generate a new address with the click of a button.
 - Automatic USD to BTC conversion (currently based off Bitstamp but could be modified to support other exchanges).
 - Records various stats over time [experimental]. Currently this includes disk usage and blockchain size.

Setup
---

The recommended setup uses [virtualenv](https://pypi.python.org/pypi/virtualenv). This should get your environment ready:

    mkdir -p ~/virtualenvs
    virtualenv ~/virtualenvs/bitcoinfe
    source ~/virtualenvs/bitcoinfe/bin/activate
    pip install -r requirements.txt

It is necessary to configure Bitcoinfe to talk to your local (or remote) Bitcoin daemon. The format and parameters in the configuration file mirror [those of Bitcoin itself](https://en.bitcoin.it/wiki/Running_Bitcoin), and it should be called ~/.bitcoinfe.conf. Here is an example configuration:

    rpcuser=bitcoinrpc # optional
    rpcport=8322 # optional
    rpcconnect=127.0.0.1 # optional
    rpcpassword=your_bitcoin_PW_here # required

Once you're configurated, you should be able to launch Bitcoinfe:

    python main.py

Now, visit localhost:5000 to see the running instance.

**Advanced: Setting up the remote service**

Bitcoinfe is designed to support running on a separate machine from your Bitcoin daemon. However, one feature in particular -- monitoring disk usage -- requires a special remote service to be running on your Bitcoin box. On the remote box, install flask (you can do this either in a virtualenv or globally), and execute `python remote.py` to start the remote service. This service is used only to monitor disk usage on that box.

