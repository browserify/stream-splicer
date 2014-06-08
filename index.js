var isarray = require('isarray');
var Duplex = require('readable-stream').Duplex;
var Pass = require('readable-stream').PassThrough;
var inherits = require('inherits');
var isArray = require('isarray');

module.exports = Pipeline;
inherits(Pipeline, Duplex);

module.exports.obj = function (streams, opts) {
    if (!opts && !isArray(streams)) {
        opts = streams;
        streams = [];
    }
    if (!streams) streams = [];
    if (!opts) opts = {};
    opts.objectMode = true;
    return new Pipeline(streams, opts);
};

function Pipeline (streams, opts) {
    if (!(this instanceof Pipeline)) return new Pipeline(streams, opts);
    if (!opts && !isArray(streams)) {
        opts = streams;
        streams = [];
    }
    if (!streams) streams = [];
    if (!opts) opts = {};
    Duplex.call(this, opts);
    
    var self = this;
    this._options = opts;
    this._wrapOptions = { objectMode: opts.objectMode !== false };
    this._streams = [];
    
    this.splice.apply(this, [ 0, 0 ].concat(streams));
    
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
    this.splice(this._streams.length, 0, stream);
    return this._streams.length;
};

Pipeline.prototype.pop = function () {
    var s = this._streams.pop();
    if (this._streams.length > 0) {
        this._streams[this._streams.length-1].unpipe(s);
    }
    this.emit('_mutate');
    return s;
};

Pipeline.prototype.shift = function () {
    var s = this._streams.shift();
    if (this._streams.length > 0) s.unpipe(this._streams[0]);
    this.emit('_mutate');
    return s;
};

Pipeline.prototype.unshift = function () {
    this.splice.apply(this, [0,0].concat([].slice.call(arguments)));
    return this._streams.length;
};

Pipeline.prototype.splice = function (start, removeLen) {
    var self = this;
    var len = this._streams.length;
    start = start < 0 ? len - start : start;
    if (removeLen === undefined) removeLen = len - start;
    removeLen = Math.max(0, Math.min(len - start, removeLen));
    
    for (var i = start; i < start + removeLen; i++) {
        if (self._streams[i-1]) {
            self._streams[i-1].unpipe(self._streams[i]);
        }
    }
    if (self._streams[i-1] && self._streams[i]) {
        self._streams[i-1].unpipe(self._streams[i]);
    }
    var end = i;
    
    var reps = [], args = arguments;
    for (var j = 2; j < args.length; j++) (function (stream) {
        stream.on('error', function (err) {
            err.stream = this;
            self.emit('error', err);
        });
        stream = self._wrapStream(stream);
        stream.once('end', function () {
            var ix = self._streams.indexOf(stream);
            if (ix >= 0 && ix === self._streams.length - 1) {
                Duplex.prototype.push.call(self, null);
            }
        });
        if (j < args.length - 1) stream.pipe(args[j+1]);
        reps.push(stream);
    })(arguments[j]);
    
    if (reps.length && self._streams[end]) {
        reps[reps.length-1].pipe(self._streams[end]);
    }
    if (self._streams[start-1]) {
        self._streams[start-1].pipe(reps[0]);
    }
    
    var sargs = [start,removeLen].concat(reps);
    var removed = self._streams.splice.apply(self._streams, sargs);
    
    this.emit('_mutate');
    return removed;
};

Pipeline.prototype.indexOf = function (stream) {
    return this._streams.indexOf(stream);
};

Pipeline.prototype._wrapStream = function (stream) {
    if (typeof stream.read === 'function') return stream;
    var d = (new Duplex(this._wrapOptions)).wrap(stream);
    d._write = function (buf, enc, next) {
        stream.write(buf);
        next();
    };
    d.once('finish', function () { stream.end() });
    return d;
}
