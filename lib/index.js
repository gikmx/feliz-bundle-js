'use strict';

const Bundler = require('feliz-bundler');
const Package = require('./package.json');
const Handler = require('./handler');

module.exports = {
    name: 'webpack',
    data: {
        register: function(server, options, next){
            next();
        }
    },
    when: { 'plugin:webpack': function(){

        if (!this.util.is(this.options.webpack).object()) this.options.webpack = {};
        const options = this.util
            .object({
                index: 'view',
                ext  : { target:'js', source:'js' },
                route: '/static',
                callback: Handler
            })
            .merge(this.options.webpack);
        Bundler.call(this, options);
    }}
};

// required by hapi
module.exports.data.register.attributes = { pkg: Package }

