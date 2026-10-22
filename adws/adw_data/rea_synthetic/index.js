const { normalize } = require('./normalize');
exports.handle = function(input) { return { result: normalize(input) }; };
