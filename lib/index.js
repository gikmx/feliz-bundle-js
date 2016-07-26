'use strict';

const Webpack  = require('webpack');
const Bundler  = require('feliz.bundler');
const MemoryFS = require('memory-fs');
const Boom     = require('boom');
const Joi      = require('joi');

const Handler  = require('./handler');
const Compiler = require('./compiler');
const Package  = require('../package.json');

module.exports = {
    Webpack,
    name: 'bundle_js',
    data: {
        register: function(server, options, next){
            next();
        }
    },
    when: { 'plugin:bundle_js': function(){
        if (!this.util.is(this.options.bundle_js).object())
            this.options.bundle_js = {};

        if (!this.util.is(this.options.bundle_js.internals).object())
            this.options.bundle_js.internals = {};

        const FS = new MemoryFS();
        const options = this.options.bundle_js = this.util
            .object({
                index    : 'index',
                ext      : { target   : 'js', source : 'js' },
                route    : '/static',
                callback : Handler,
                engine   : {
                    resolve: {
                        root      : this.path.root,
                        extensions: ['', '.js']
                    },
                    output : {
                        publicPath: '/static/js/+chunk/',
                        path      : '/',
                    }
                },
                internals: {
                    FS,
                    name   : module.exports.name,
                    route  : '/static/js',
                }
            })
            .merge(this.options.bundle_js);

        const internals = this.options.bundle_js.internals;

        // Enable default bundle routing
        Bundler.call(this, options);

        // Register the route for chunk handling.
        const route = `${internals.route}/+chunk/{filename}`;
        const pname = `${Package.name}_chunk`.replace(/-/g,'_');
        const handl = (filename, next) => {
            if (!FS.data[filename]) return next(true);
            return next(null, FS.data[filename]);
        }
        this.server.method(pname, handl, { cache: {
            expiresIn: 60 * 1000 * 60 * 24 * 365,
            generateTimeout: 500
        }});
        this.server.log([Package.name, 'route','add'], route);
        this.server.route({
            method  : 'GET',
            path    : route,
            handler : (request, reply) => this.server.methods[pname](
                request.params.filename,
                (error, body) => {
                    if (error) return reply(Boom.notFound());
                    let date = new Date();
                    date.setFullYear(date.getFullYear() - 1);
                    date = date.toUTCString();
                    reply(body)
                        .type('text/javascript')
                        .header('Last-Modified', date)
                }
            ),
            config  : {
                validate: { params: {
                    filename : Joi
                        .string()
                        .regex(/[a-z0-9-_~\/\.]+\.js/i),
                }}
            }
        });

        // Extra steps? no problemo, got you covered.
        this.events.emit(`plugin:${internals.name}:done`, Compiler.bind(this, FS));

    }}
};

// required by hapi
module.exports.data.register.attributes = { pkg: Package }

