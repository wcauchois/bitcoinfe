Web Frontend for the Bitcoin Daemon
===

Features
---

 - Displays basic information about your Bitcoin wallet: balance, recent transactions, and Bitcoin addresses.
 - Responsive layout works well on mobile. Click on a Bitcoin address to open a QR code for that address.
 - Send Bitcoin to another address via the web interface. Generate a new address with the click of a button.
 - Automatic USD to BTC conversion (currently based off Bitstamp but could be modified to support other exchanges).
 - Records various stats over time. Currently this includes disk usage and blockchain size.

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

Once you're configured, you should be able to launch Bitcoinfe:

    python main.py

Now, visit localhost:5000 to see the running instance.

**Setting up the remote service**

Bitcoinfe is designed to support running on a separate machine from your Bitcoin daemon.
However, one feature in particular -- monitoring disk usage -- requires a special remote
service to be running on your Bitcoin box. On the remote box, check-out Bitcoinfe and
execute `python remote.py` to start the service (there are no external dependencies for
this besides Python). Pass `--help` to see a list of options. You may want to provide
`--datadir` if your Bitcoin data directory is in a nonstandard path (the default is ~/.bitcoin).

**Tracking statistics over time**

Bitcoinfe has the ability to track disk usage and Blockchain stats over time. It stores this
data in an SQLite database, and can graph it for you using Google charts. To get started
using this feature, you must first migrate the SQLite database. To do so, run:

    invoke db.migrate

This will create a stats.db file in the current directory. To record stats, you must POST
to the /record\_stats endpoint whenever you want to store a data-point. To record stats
priodically, I use `cron` and `curl`. For example, the following entry in a crontab
will record statistics every 4 hours:

    0 */4 * * * curl -X POST http://localhost:5000/record_stats >/dev/null

