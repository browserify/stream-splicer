var isarray = require('isarray');
var Duplex = require('readable-stream').Duplex;
var Pass = require('readable-stream').PassThrough;
var inherits = require('inherits');

module.exports = Pipeline;
inherits(Pipeline, Duplex);

function Pipeline (streams, opts) {
    if (!(this instanceof Pipeline)) return new Pipeline(streams, opts);
    if (!opts) opts = {};
    Duplex.call(this, opts);
    
    var self = this;
    this._options = opts;
    this._streams = [];
    
    for (var i = 0; i < streams.length; i++) {
        this.push(streams[i]);
    }
    
    this.once('finish', function () {
        self._streams[0].end();
    });
}

Pipeline.prototype._read = function () {
    var self = this;
    if (this._streams.length === 0) {
        this._streams.push(new Pass(this._options));
    }
    var r = this._streams[this._streams.length-1];
    var buf, reads = 0;
    while ((buf = r.read()) !== null) {
        Duplex.prototype.push.call(this, buf);
        reads ++;
    }
    if (reads === 0) {
        var onreadable = function () {
            r.removeListener('readable', onreadable);
            self.removeListener('_mutate', onreadable);
            self._read()
        };
        r.once('readable', onreadable);
        self.once('_mutate', onreadable);
    }
};

Pipeline.prototype._write = function (buf, enc, next) {
    if (this._streams.length === 0) {
        this._streams.push(new Pass(this._options));
    }
    this._streams[0]._write(buf, enc, next);
};

Pipeline.prototype.push = function (stream) {
    var self = this;
    stream.on('error', function (err) {
        err.stream = this;
        self.emit('error', err);
    });
    stream = this._wrapStream(stream);
    
    if (this._streams.length > 0) {
        this._streams[this._streams.length-1].pipe(stream);
    }
    this._streams.push(stream);
    
    stream.once('end', function () {
        var ix = self._streams.indexOf(stream);
        if (ix === self._streams.length - 1) {
            Duplex.prototype.push.call(self, null);
        }
    });
    this.emit('_mutate', stream);
    
    return this;
};

Pipeline.prototype.pop = function () {
    var s = this._streams.pop();
    if (this._streams.length > 0) {
        this._streams[this._streams.length-1].unpipe(s);
    }
    return s;
};

Pipeline.prototype.indexOf = function (stream) {
    return this._streams.indexOf(stream);
};

Pipeline.prototype._wrapStream = function (stream) {
    if (typeof stream.read === 'function') return stream;
    var d = (new Duplex(this._options)).wrap(stream);
    d._write = function (buf, enc, next) {
        stream.write(buf);
        next();
    };
    return d;
}
