// SDR tracking enters through a same-origin Netlify proxy. Site identity is server-set.
const tracking = require('./track-event');
exports.handler = (event) => tracking.handler({ ...event, analyticsSite: 'sdr' });
