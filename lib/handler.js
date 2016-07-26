'use strict'

const PATH = require('path');

const Webpack  = require('webpack');
const Validate = require('webpack-validator');
const Rx       = require('rxjs/Rx');
const Boom     = require('boom');

const Compiler = require('./compiler');
const Package  = require('../package.json');

module.exports = function (bundle$, request, reply, options){

    const internals = this.options.bundle_js.internals;

    // Consolidate and/or validate configuration
    bundle$ = bundle$
        // merge user conf with bundle-specific conf.
        .map(bundle => {
            bundle.filename = PATH.format({
                name : `~${bundle.name}`,
                ext  : this.path.ext
            });
            bundle.route = `${internals.route}/${bundle.filename}`;
            bundle.conf  = this.util
                .object(options.engine)
                .merge({
                    entry  : bundle.path,
                    output : {
                        filename      : bundle.filename,
                        chunkFilename : `[hash]-[name].js`,
                    }
                });
            if (!internals.FS.data[bundle.filename]) return bundle;
            bundle.body   = internals.FS.data[bundle.filename];
            bundle.exists = true;
            return bundle;
        });

    const rxCompile = source$ => source$
        // Allow poking into resulting configuration
        .mergeMap(bundle => Rx.Observable.create(observer => {
            const name = `plugin:${internals.name}:engine`;
            // To avoid letting the request hanging, check for listeners first
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
        }))
        // If not in production, validate config.
        .do(bundle => {
            if (process.env.NODE_ENV === 'production') return;
            const validate = Validate(bundle.conf, {quiet:true, returnValidation:true});
            if (validate.error) throw validate.error;
        })
        // Compile via webpack
        .mergeMap(bundle => Compiler
            .call(this, internals.FS, bundle.conf)
            .map(body => {
                bundle.body = body;
                return bundle;
            })
        );

    // is the request a new file? compile it!
    const result$ = bundle$
        .switchMap(bundle => bundle.exists? bundle$ : rxCompile(bundle$))

    result$.subscribe(
        bundle => {
            let response = reply(bundle.body).type('text/javascript');
            if (!bundle.exists) response = response
                .header('Last-Modified', (new Date()).toUTCString())
        },
        error  => reply(Boom.wrap(error))
    );
};
