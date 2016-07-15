'use strict'

const PATH = require('path');

const Webpack  = require('webpack');
const Validate = require('webpack-validator');
const MemoryFS = require('memory-fs');
const Rx       = require('rxjs/Rx');
const Boom     = require('boom');

const FS = new MemoryFS();

module.exports = function (file$, request, reply, opt){

    const rxCompiler = file => Rx.Observable.create(observer => {
        const basename = PATH.format({ name:`~${file.name}`, ext:this.path.ext });
        const config = this.util
            .object({
                entry  : file.path,
                resolve: {
                    root       : this.path.root,
                    extensions : ['', this.path.ext]
                },
                output : {
                    path     : file.root,
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
                .forEach(err => console.error('wabpack» error»', err));
            if (stats.warnings.length) stats.warnings
                .forEach(warn => console.log('webpack» warn»', warn));
            // read file from memory
            file.body = FS.readFileSync(PATH.join(file.root, basename));
            observer.next(file);
            observer.complete();
        })
    });

    const compile$ = file$.switchMap(file => rxCompiler(file));

    compile$.subscribe(
        file => reply(file.body).type('text/javascript'),
        err  => {
            if (!err.statusCode) throw err;
            reply(Boom.wrap(err, err.statusCode || 500))
        }
    );
};
