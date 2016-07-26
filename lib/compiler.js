'use strict';

const PATH    = require('path');
const Webpack = require('webpack');
const Rx      = require('rxjs');
const Package = require('../package.json');

module.exports = function(FS, conf) { return Rx.Observable.create(observer => {
    // Don't mess with the original config, make a copy.
    conf = this.util.object({}).merge(conf);
    let webpack;
    let path;
    try {
        webpack = Webpack(conf);
        webpack.outputFileSystem = FS;
        path = [conf.output.path.slice(1), conf.output.filename].join('/')
    } catch (error){
        return observer.error(error);
    }
    this.server.log([Package.name, 'compile»ini'], path);
    webpack.run((error, result) => {
        if (error) return observer.error(error);
        result = result.toJson();
        // soft errors & warnings
        if (result.errors.length) result.errors
            .forEach(error => this.server.log([Package.name, 'error'], error));
        if (result.warnings.length) result.warnings
            .forEach(warn => this.server.log([Package.name, 'warning'], warn));
        let body;
        try {
            body = FS.readFileSync(path);
        } catch(error){
            error = new Error(`${error.message} (${path})`);
            return observer.error(error);
        }
        this.server.log([Package.name, 'compile»end'], `${path} (${result.time}ms)`);
        observer.next(body);
        observer.complete();
    })
})}
