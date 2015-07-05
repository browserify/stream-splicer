var Duplex = require('readable-stream').Duplex;
var Readable = require('readable-stream').Readable;
var Pass = require('readable-stream').PassThrough;
var inherits = require('inherits');
var isArray = require('isarray');
var indexof = require('indexof');
var wrap = require('readable-wrap');

var nextTick = typeof setImmediate !== 'undefined'
    ? setImmediate : process.nextTick
;

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
        self._notEmpty();
        self._streams[0].end();
    });
}

Pipeline.prototype._read = function () {
    var self = this;
    this._notEmpty();
    
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
    this._notEmpty();
    this._streams[0]._write(buf, enc, next);
};

Pipeline.prototype._notEmpty = function () {
    var self = this;
    if (this._streams.length > 0) return;
    var stream = new Pass(this._options);
    stream.once('end', function () {
        var ix = indexof(self._streams, stream);
        if (ix >= 0 && ix === self._streams.length - 1) {
            Duplex.prototype.push.call(self, null);
        }
    });
    this._streams.push(stream);
    this.length = this._streams.length;
};

Pipeline.prototype.push = function (stream) {
    var args = [ this._streams.length, 0 ].concat([].slice.call(arguments));
    this.splice.apply(this, args);
    return this._streams.length;
};

Pipeline.prototype.pop = function () {
    return this.splice(this._streams.length-1,1)[0];
};

Pipeline.prototype.shift = function () {
    return this.splice(0,1)[0];
};

Pipeline.prototype.unshift = function () {
    this.splice.apply(this, [0,0].concat([].slice.call(arguments)));
    return this._streams.length;
};

Pipeline.prototype.splice = function (start, removeLen) {
    var self = this;
    var reps = [], args = arguments;
    for (var j = 2; j < args.length; j++) (function (stream) {
        if (isArray(stream)) {
            stream = new Pipeline(stream, self._options);
        }
        stream.on('error', function (err) {
            err.stream = this;
            self.emit('error', err);
        });
        stream = self._wrapStream(stream);
        stream.once('end', function () {
            var ix = indexof(self._streams, stream);
            if (ix >= 0 && ix === self._streams.length - 1) {
                Duplex.prototype.push.call(self, null);
            }
        });
        reps.push(stream);
    })(arguments[j]);

    var flag = {};
    var sargs = [start, removeLen, flag].concat(reps);
    var removed = self._streams.splice.apply(self._streams, sargs);
    start = indexof(self._streams, flag);
    self._streams.splice(start, 1);

    // `start` is the position where the insertion starts
    // `end` is the position next to the place where the insertion ends
    var end = start + reps.length;
    var needInsert = end > start;

    removeLen = removed.length;
    if (removeLen) {
        // break the removed pipeline
        // after this, the original pipeline is broken if `self._streams[end]` exists
        for (var i = 1; i < removeLen; i++) {
            removed[i - 1].unpipe(removed[i]);
        }
        if (self._streams[start - 1]) {
            self._streams[start - 1].unpipe(removed[0]);
        }
        if (self._streams[end]) {
            removed[removeLen - 1].unpipe(self._streams[end]);
        }
    }

    if (needInsert) {
        // if nothing removed, we need to break the pipeline at `start` to insert
        // after this, the pipeline will be fixed
        if (!removeLen && self._streams[start - 1] && self._streams[end]) {
            self._streams[start - 1].unpipe(self._streams[end]);
        }
        for (var i = 1; i < end - start; i++) {
            reps[i - 1].pipe(reps[i]);
        }
        if (self._streams[start - 1]) {
            self._streams[start - 1].pipe(reps[0]);
        }
        if (self._streams[end]) {
            reps[end - start - 1].pipe(self._streams[end]);
        }
    }

    if (removeLen && !needInsert) {
        // streams removed and nothing inserted, the pipeline may be broken
        if (self._streams[start - 1] && self._streams[end]) {
            self._streams[start - 1].pipe(self._streams[end]);
        }
    }

    this.emit('_mutate');
    this.length = this._streams.length;
    return removed;
};

Pipeline.prototype.get = function () {
    if (arguments.length === 0) return undefined;
    
    var base = this;
    for (var i = 0; i < arguments.length; i++) {
        var index = arguments[i];
        if (index < 0) {
            base = base._streams[base._streams.length + index];
        }
        else {
            base = base._streams[index];
        }
        if (!base) return undefined;
    }
    return base;
};

Pipeline.prototype.indexOf = function (stream) {
    return indexof(this._streams, stream);
};

Pipeline.prototype._wrapStream = function (stream) {
    if (typeof stream.read === 'function') return stream;
    var w = wrap(stream, this._wrapOptions);
    w._write = function (buf, enc, next) {
        if (stream.write(buf) === false) {
            stream.once('drain', next);
        }
        else nextTick(next);
    };
    return w;
};
