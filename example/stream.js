var pipeline = require('../');
var through = require('through2');
var stringify = require('JSONStream').stringify;
var split = require('split');

var a = split();
var b = through.obj(function (row, enc, next) {
    this.push(JSON.parse(row));
    next();
});
var c = through.obj(function (row, enc, next) { this.push(row.x); next() });
var d = through.obj(function (x, enc, next) { this.push(x * 111); next() });
var e = stringify();

var stream = pipeline([ a, b, c, d, e ], { objectMode: true });
process.stdin.pipe(stream).pipe(process.stdout);
