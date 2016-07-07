'use strict'

const Rx   = require('rxjs/Rx');
const Boom = require('boom');

module.exports = function (file$, request, reply, options){

    file$.subscribe(
        file => reply(file.body).type('text/javascript'),
        err  => {
            this.server.log('error',  err.message);
            reply(Boom.wrap(err, err.statusCode || 500))
        }
    )
}
