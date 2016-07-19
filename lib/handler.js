'use strict'

const PATH = require('path');

const Webpack  = require('webpack');
const Validate = require('webpack-validator');
const MemoryFS = require('memory-fs');
const Rx       = require('rxjs/Rx');
const Boom     = require('boom');
const Joi      = require('joi');

const Package  = require('../package.json');

// TODO: Implement Caching

const FS = new MemoryFS();
let routeDeclared = false;

function onChunk (options, request, reply){
    const params = request.params;
    const chunk  = `${params.chunk}.${options.ext.target}`;
    if (!FS.data[params.path]) return reply(Boom.notFound());
    if (!FS.data[params.path][chunk]) return reply(Boom.notFound());
    reply(FS.data[params.path][chunk]).type('text/javascript');
}

module.exports = function (bundle$, request, reply, options){

    const route = `${options.route}/${options.ext.target}`;

    // Consolidate and/or validate configuration
    const config$ = bundle$.mergeMap(bundle => {
        bundle.basename = PATH.format({ name:`~${bundle.name}`, ext:this.path.ext });
        bundle.route = `${route}/${bundle.basename}`;
        bundle.conf = this.util
            .object({
                entry  : bundle.path, //TODO: Find a way to send bundle.body, instead.
                resolve: {
                    root       : this.path.root,
                    extensions : ['', this.path.ext]
                },
                output : {
                    path          : '/[hash]',
                    publicPath    : `${route}/[hash]/`,
                    chunkFilename : '[chunkhash].js',
                    filename      : bundle.basename
                }
            })
            .merge(options.engine);
        return Rx.Observable.create(observer => {
            const name = `plugin:${options._plugin}:engine`;
            // To avoid letting the request hanging, check if there are listeners first
            if (!this.events.listeners(name).length) {
                observer.next(bundle);
                observer.complete();
            }
            // Note: if the user doesn't use the callback, the request will hang.
            try {
                this.events.emit(name, bundle.conf, conf => {
                    if (this.util.is(conf).object()) bundle.conf = conf;
                    observer.next(bundle);
                    observer.complete();
                });
            } catch (err) {
                observer.error(err);
            }
        })
    });

    // If not in production, validate config.
    const validate$ = config$.do(bundle => {
        if (process.env.NODE_ENV === 'production') return;
        const validate = Validate(bundle.conf, {quiet:true, returnValidation:true});
        if (validate.error) throw validate.error;
    });

    // Compile via webpack
    const body$ = validate$.mergeMap(bundle => Rx.Observable.create(observer => {
        const webpack = Webpack(bundle.conf);
        webpack.outputFileSystem = FS;
        this.server.log([Package.name, 'compile»ini'], bundle.route);
        webpack.run((err, result) => {
            if (err) return observer.error(err);
            result = result.toJson();
            // soft errors & warnings
            if (result.errors.length) result.errors
                .forEach(err => this.server.log([Package.name, 'error'], err));
            if (result.warnings.length) result.warnings
                .forEach(warn => this.server.log([Package.name, 'warning'], warn));
            const path = ['', result.hash, bundle.basename].join(PATH.sep);
            bundle.body = FS.readFileSync(path);
            this.server.log([Package.name, 'compile»end'], `${path} (${result.time}ms)`);
            observer.next(bundle);
            observer.complete();
        })
    }))

    if (!routeDeclared){
        routeDeclared = true;
        // Enable chunk routing
        this.server.route({
            method  : 'GET',
            path    : `${route}/{path}/{chunk}.js`,
            handler : onChunk.bind(this, options),
            config  : {
                validate: { params: {
                    path  : Joi.string().hex(),
                    chunk : Joi.string().hex(),
                }}
            }
        });
    }

    body$.subscribe(
        bundle => reply(bundle.body).type('text/javascript'),
        error  => reply(Boom.wrap(error))
    );
};
