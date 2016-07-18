'use strict'

const PATH = require('path');

const Webpack  = require('webpack');
const Validate = require('webpack-validator');
const MemoryFS = require('memory-fs');
const Rx       = require('rxjs/Rx');
const Boom     = require('boom');
const Package  = require('../package.json');

const FS = new MemoryFS();

module.exports = function (bundle$, request, reply, opt){

    const rxCompiler = bundle => Rx.Observable.create(observer => {
        const basename = PATH.format({ name:`~${bundle.name}`, ext:this.path.ext });
        const config = this.util
            .object({
                entry  : bundle.path,
                resolve: {
                    root       : this.path.root,
                    extensions : ['', this.path.ext]
                },
                output : {
                    path     : bundle.root,
                    filename : basename,
                    publicPath : `${opt.route}/${opt.ext.target}/[hash]/`
                }
            })
            .merge(opt.engine);

        if (process.env.NODE_ENV !== 'production'){
            const validate = Validate(config, {quiet:true, returnValidation:true});
            if (validate.error) return observer.error(validate.error);
        }

        const webpack = Webpack(config);
        webpack.outputFileSystem = FS;
        webpack.run((err, stats) => {
            if (err) return observer.error(err);
            stats = stats.toJson();
            // soft errors & warnings
            if (stats.errors.length) stats.errors
                .forEach(err => this.server.log([Package.name, 'error'], err));
            if (stats.warnings.length) stats.warnings
                .forEach(warn => this.server.log([Package.name, 'warning'], warn));
            // read bundle from memory
            bundle.body = FS.readFileSync(PATH.join(bundle.root, basename));
            observer.next(bundle);
            observer.complete();
        })
    });

    const compile$ = bundle$.switchMap(bundle => rxCompiler(bundle));

    compile$.subscribe(
        bundle => reply(bundle.body).type('text/javascript'),
        error  => reply(Boom.wrap(error))
    );
};
