var pipeline = require('../');
var through = require('through2');
var JSONStream = require('JSONStream');
var split = require('split');

var headerData = {};
var headers = through.obj(function (buf, enc, next) {
    var line = buf.toString('utf8');
    
    if (line === '') { // break on \n\n
        this.push(headerData);
        
        // replace header parsing with json row parsing
        outer.splice(0, 2, JSONStream.parse([ true ]));
    }
    else {
        var m = /^(\S+):(.+)/.exec(line);
        var key = m && m[1].trim();
        var value = m && m[2].trim();
        if (m) headerData[key] = value;
    }
    
    next();
});

var outer = pipeline([ split(), headers, JSONStream.stringify() ]);
process.stdin.pipe(outer).pipe(process.stdout);
