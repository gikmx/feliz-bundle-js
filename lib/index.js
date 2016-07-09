'use strict';

const Bundler = require('feliz.bundler');
const Handler = require('./handler');
const Package = require('../package.json');

module.exports = {
    name: 'bundle_js',
    data: {
        register: function(server, options, next){
            next();
        }
    },
    when: { 'plugin:bundle_js': function(){

        if (!this.util.is(this.options.bundle_js).object()) this.options.bundle_js = {};
        const options = this.util
            .object({
                index    :  'index',
                ext      :  { target:'js', source:'js' },
                route    :  '/static',
                callback :  Handler
            })
            .merge(this.options.bundle_js);
        Bundler.call(this, options);
    }}
};

// required by hapi
module.exports.data.register.attributes = { pkg: Package }

