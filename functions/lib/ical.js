const ical = require('node-ical');

module.exports.parseIcal = async function(data){
    let events = ical.sync.parseICS(data);
    return events
}