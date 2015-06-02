var pipeline = require('../');
var thr = require('through2');
var concat = require('concat-stream');
var test = require('tape');

test(
    'splice(0), delete all',
    rbind(run, 0)
);

test(
    'splice(1), delete some',
    rbind(run, 1)
);

test(
    'splice(1, 0), no change',
    rbind(run, 1, 0)
);

test(
    'splice(1, 1), delete 1',
    rbind(run, 1, 1)
);

test(
    'splice(1, 0, tr), insert',
    rbind(run, 1, 0, thr.obj(), thr.obj())
);

test(
    'splice(1, 1, tr), insert and delete',
    rbind(run, 1, 1, thr.obj(), thr.obj())
);

test(
    'splice(-2, 0, tr), minus start',
    rbind(run, -2, 0, thr.obj(), thr.obj())
);

function run(t, start, removeLen) {
    t.plan(1);
    var a = { x: 1 };
    var b = { x: 2 };
    var c = { x: 3 };
    var expected = [a, b, c];

    var stream = pipeline.obj([ thr.obj(), thr.obj(), thr.obj() ]);
    stream.pipe(concat({ encoding: 'object' }, function (rows) {
        t.same(rows, expected);
    }));
    stream.splice.apply(stream, arrayify(arguments, 1));
    stream.write(a);
    stream.write(b);
    stream.write(c);
    stream.end();
}

function arrayify(o, from, to) {
    return Array.prototype.slice.call(o, from, to);
}

function rbind(fn) {
    var xargs = arrayify(arguments, 1);
    return function () {
        var args = arrayify(arguments, 0, 1).concat(xargs);
        return fn.apply(this, args);
    };
}
